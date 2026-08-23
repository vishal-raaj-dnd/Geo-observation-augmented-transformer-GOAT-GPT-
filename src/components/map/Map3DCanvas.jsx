import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { Compass, Layers, MapPin, X, Eye, EyeOff } from 'lucide-react';
import { boundarySlug } from '../../data/cities';
import { stitchOuterRings } from '../../utils/geometry';

const DARK_STYLE = {
  version: 8,
  sources: {
    'carto-dark': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'
      ],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap &copy; CARTO'
    }
  },
  layers: [
    {
      id: 'carto-dark-layer',
      type: 'raster',
      source: 'carto-dark',
      minzoom: 0,
      maxzoom: 19
    }
  ]
};

const SATELLITE_STYLE = {
  version: 8,
  sources: {
    'esri-satellite': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
      ],
      tileSize: 256,
      attribution: 'Tiles &copy; Esri'
    }
  },
  layers: [
    {
      id: 'esri-satellite-layer',
      type: 'raster',
      source: 'esri-satellite',
      minzoom: 0,
      maxzoom: 19
    }
  ]
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
];

// Some OSM entries have no polygon under their common name — use verified admin-boundary names.
// Cities listed here merge ALL matched districts into one combined highlight.
const CITY_NAME_VARIANTS = {
  Mumbai: ['Mumbai Suburban district', 'Mumbai City district'],
  Mangaluru: ['Mangalore', 'Mangaluru taluk']
};

/* One highlight color PER STATE — border + interior share the same hue.
   fill = translucent interior, border = brighter shade of the same family. */
export const STATE_COLORS = {
  'Tamil Nadu':      { fill: '#3b82f6', border: '#93c5fd' },
  'Kerala':          { fill: '#06b6d4', border: '#67e8f9' },
  'Maharashtra':     { fill: '#f59e0b', border: '#fcd34d' },
  'West Bengal':     { fill: '#a855f7', border: '#d8b4fe' },
  'Bihar':           { fill: '#f97316', border: '#fdba74' },
  'Karnataka':       { fill: '#22c55e', border: '#86efac' },
  'Assam':           { fill: '#ec4899', border: '#f9a8d4' },
  'Odisha':          { fill: '#14b8a6', border: '#5eead4' },
  'Punjab':          { fill: '#84cc16', border: '#bef264' },
  'Uttar Pradesh':   { fill: '#e11d48', border: '#fda4af' },
  'Andhra Pradesh':  { fill: '#0ea5e9', border: '#7dd3fc' },
  'Telangana':       { fill: '#ef4444', border: '#fca5a5' },
  'Gujarat':         { fill: '#eab308', border: '#fde047' },
  'Rajasthan':       { fill: '#d946ef', border: '#f0abfc' },
  'Madhya Pradesh':  { fill: '#10b981', border: '#6ee7b7' },
  'Delhi':           { fill: '#9ca3af', border: '#e5e7eb' },
  'Jammu and Kashmir': { fill: '#6366f1', border: '#a5b4fc' },
  'Uttarakhand':     { fill: '#8b5cf6', border: '#c4b5fd' }
};
const DEFAULT_COLORS = { fill: '#3b82f6', border: '#93c5fd' };
export function getStateColors(stateName) {
  return STATE_COLORS[stateName] || DEFAULT_COLORS;
}

/* ---- session cache: survives page reloads, protects APIs from hammering ---- */
const CACHE_PREFIX = 'goat_boundary_v1_';
function cacheGet(key) {
  try {
    const raw = sessionStorage.getItem(`${CACHE_PREFIX}${key}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function cacheSet(key, geojson) {
  try { sessionStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(geojson)); } catch {}
}

/* ---- Retain 100% full coordinate fidelity matching basemap district borders ---- */
function decimateGeojson(g) {
  return g;
}

function mergeToMultiPolygon(list) {
  const coords = [];
  list.forEach(g => {
    if (!g) return;
    if (g.type === 'Polygon') coords.push(g.coordinates);
    else if (g.type === 'MultiPolygon') g.coordinates.forEach(p => coords.push(p));
  });
  return { type: 'MultiPolygon', coordinates: coords };
}

// Resolve the EXACT administrative border polygon of a city.
// Sources: local pre-built dataset (instant, pixel-accurate) -> Overpass -> Nominatim.
export async function fetchBoundaryGeojson(cityName, stateName, approxCoords) {
  const key = `${cityName}|${stateName}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  // ---- Primary: pre-built offline dataset (public/boundaries, OSM-exact) ----
  // Local file = a few ms, zero API dependency, borders match the basemap exactly.
  try {
    const r = await fetch(`/boundaries/${boundarySlug(stateName, cityName)}`);
    if (r.ok) {
      const payload = await r.json();
      const gj = payload?.geometry;
      if (gj && (gj.type === 'Polygon' || gj.type === 'MultiPolygon')) {
        cacheSet(key, gj);
        return gj;
      }
    }
  } catch { /* dataset entry missing — fall through to live sources */ }

  const variants = CITY_NAME_VARIANTS[cityName] || [];
  const wantMerge = cityName === 'Mumbai'; // Greater Mumbai = City District + Suburban District

  /* Cities match MANY OSM admin relations (wards, mandals, taluks, metro region).
     Score candidates: nearest to the geocoded city centre AND a plausible
     city/district-sized extent — never blindly take the first relation. */
  const scoreOuterWays = (outers) => {
    let w = 180, s = 90, e = -180, n = -90;
    for (const way of outers) {
      for (const p of way.geometry) {
        if (p.lon < w) w = p.lon;
        if (p.lon > e) e = p.lon;
        if (p.lat < s) s = p.lat;
        if (p.lat > n) n = p.lat;
      }
    }
    return {
      dist: approxCoords ? Math.hypot((w + e) / 2 - approxCoords[0], (s + n) / 2 - approxCoords[1]) : 0,
      diag: Math.hypot(e - w, n - s)
    };
  };

  // ---- Primary: Overpass mirrors (exact OSM admin relation geometry) ----
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      // Match "<City>" OR "<City> district" — never the enclosing state/region
      const query = `[out:json][timeout:25];relation["name"~"^${cityName}( district)?$"]["boundary"="administrative"];out geom;`;
      const ctrl = new AbortController();
      const timeoutId = setTimeout(() => ctrl.abort(), 20000);
      const r = await fetch(`${endpoint}?data=${encodeURIComponent(query)}`, { signal: ctrl.signal });
      clearTimeout(timeoutId);
      if (!r.ok) continue;
      const data = await r.json();
      const scored = [];
      for (const rel of data.elements || []) {
        if (rel.type !== 'relation' || !rel.members) continue;
        const outers = (rel.members || []).filter(m => m.type === 'way' && m.role === 'outer' && m.geometry);
        if (outers.length === 0) continue;
        const { dist, diag } = scoreOuterWays(outers);
        // A city/district polygon is between ~1 km and ~6 deg across; reject slivers & regions
        if (diag < 0.01 || diag > 6) continue;
        // Strongly prefer district-level admin relations (India: 5=district, 6=sub-district, 7=city)
        const level = parseInt(rel.tags?.admin_level || '99', 10);
        const levelPenalty = [5, 6, 7].includes(level) ? 0 : 4;
        scored.push({ outers, score: dist + levelPenalty });
      }
      scored.sort((a, b) => a.score - b.score);
      if (scored.length > 0) {
        // Stitch split outer way segments into proper closed rings —
        // treating each segment as its own polygon breaks the fill & border.
        const rings = stitchOuterRings(scored[0].outers.map(w => w.geometry.map(p => [p.lon, p.lat])))
          .map(r => decimateRing(r))
          .filter(r => r.length >= 4);
        if (rings.length === 0) continue;
        const geojson = rings.length === 1
          ? { type: 'Polygon', coordinates: [rings[0]] }
          : { type: 'MultiPolygon', coordinates: rings.map(r => [r]) };
        cacheSet(key, geojson);
        return geojson;
      }
    } catch (err) {
      console.warn(`Overpass (${endpoint}) failed:`, err);
    }
  }

  // ---- Secondary: Nominatim with retries (may be rate-limited at times) ----
  const queries = [
    ...variants.map(v => `${v}, ${stateName}, India`),
    `${cityName}, ${stateName}, India`,
    `${cityName}, India`
  ];

  const collected = [];

  for (const q of queries) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&polygon_geojson=1&polygon_threshold=0.0015&limit=8`;
        const r = await fetch(url);
        if (r.status === 403 || r.status === 429) { await sleep(1600 * (attempt + 1)); continue; }
        const data = await r.json();
        // Only polygon candidates that actually mention the city — never accept
        // the enclosing STATE polygon (e.g. all of Kerala for Alappuzha).
        const cityRe = new RegExp(cityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        const candidates = (data || []).filter(d =>
          d.geojson && (d.geojson.type === 'Polygon' || d.geojson.type === 'MultiPolygon')
        );
        const named = candidates.filter(d => cityRe.test(d.display_name || ''));
        const pool = named.length > 0 ? named : candidates;
        // Most specific (smallest extent) wins — district beats state
        pool.sort((a, b) => {
          const ext = (d) => {
            const bb = d.boundingbox; // [south, north, west, east]
            return bb ? (parseFloat(bb[1]) - parseFloat(bb[0])) * (parseFloat(bb[3]) - parseFloat(bb[2])) : 999;
          };
          return ext(a) - ext(b);
        });
        const match = pool[0];
        if (match) {
          if (wantMerge) {
            collected.push(match.geojson);
            if (collected.length < 2) break; // keep scanning next query for the second district
          } else {
            const gj = decimateGeojson(match.geojson);
            cacheSet(key, gj);
            return gj;
          }
        }
        break;
      } catch (err) {
        console.warn('Nominatim boundary attempt failed:', err);
        await sleep(900);
      }
    }
  }

  if (wantMerge && collected.length > 0) {
    const merged = decimateGeojson(mergeToMultiPolygon(collected));
    cacheSet(key, merged);
    return merged;
  }

  return null;
}

export default function Map3DCanvas({
  selectedCity,
  selectedState,
  selectedCityCoords,
  isSatellite,
  setIsSatellite,
  isMinimized,
  isIntro,
  onGetStarted,
  mapCommand,
  fitPadding
}) {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const animationFrameRef = useRef(null);
  const isFirstFlightRef = useRef(true);
  const savedGeojsonRef = useRef(null);
  const prevSatelliteRef = useRef(isSatellite);
  const overlaysRef = useRef(new Map()); // id -> {sourceId, layerId, title, opacity}
  const markersRef = useRef([]);
  const [activeOverlays, setActiveOverlays] = useState([]);
  const [cityNameLabel, setCityNameLabel] = useState('');

  /* ---------------- Chat → Map command bridge ---------------- */
  // Runs fn once the style is ready (commands can arrive before/after load).
  const runWhenReady = (fn) => {
    const map = mapRef.current;
    if (!map) return;
    let tries = 50;
    const tryNow = () => {
      if (!mapRef.current) return;
      if (map.isStyleLoaded()) { fn(map); return; }
      if (tries-- > 0) setTimeout(tryNow, 200);
    };
    tryNow();
  };

  const applyImageOverlay = (map, { id, url, bounds, title, opacity = 0.82 }) => {
    if (!url || !Array.isArray(bounds) || bounds.length !== 4) return;
    const sourceId = `img-overlay-${id}`;
    const layerId = `${sourceId}-layer`;
    try {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
      const [w, s, e, n] = bounds;
      map.addSource(sourceId, {
        type: 'image',
        url,
        coordinates: [[w, n], [e, n], [e, s], [w, s]]
      });
      map.addLayer({
        id: layerId,
        type: 'raster',
        source: sourceId,
        paint: { 'raster-opacity': opacity, 'raster-fade-duration': 150 }
      });
      overlaysRef.current.set(id, { sourceId, layerId, title: title || id, opacity });
      setActiveOverlays(Array.from(overlaysRef.current.entries()).map(([oid, o]) => ({ id: oid, ...o })));
    } catch (err) {
      console.warn('Overlay application failed:', err);
    }
  };

  const removeImageOverlay = (map, id) => {
    const entry = overlaysRef.current.get(id);
    if (!entry) return;
    try {
      if (map.getLayer(entry.layerId)) map.removeLayer(entry.layerId);
      if (map.getSource(entry.sourceId)) map.removeSource(entry.sourceId);
    } catch {}
    overlaysRef.current.delete(id);
    setActiveOverlays(Array.from(overlaysRef.current.entries()).map(([oid, o]) => ({ id: oid, ...o })));
  };

  const setOverlayOpacityById = (map, id, opacity) => {
    const entry = overlaysRef.current.get(id);
    if (!entry) return;
    try { map.setPaintProperty(entry.layerId, 'raster-opacity', opacity); } catch {}
    entry.opacity = opacity;
    setActiveOverlays(Array.from(overlaysRef.current.entries()).map(([oid, o]) => ({ id: oid, ...o })));
  };

  const clearAllMarkers = () => {
    markersRef.current.forEach(m => { try { m.remove(); } catch {} });
    markersRef.current = [];
  };

  useEffect(() => {
    if (!mapCommand) return;
    const { type, payload } = mapCommand;

    switch (type) {
      case 'overlayImage':
        runWhenReady(map => {
          if (payload) {
            applyImageOverlay(map, payload);
          }
        });
        break;

      case 'flyTo':
        runWhenReady(map => map.flyTo({
          center: payload.center,
          zoom: payload.zoom ?? 10.8,
          pitch: payload.pitch ?? 45,
          bearing: payload.bearing ?? -12,
          duration: payload.duration ?? 1600,
          essential: true
        }));
        break;

      case 'clearOverlays':
        runWhenReady(map => Array.from(overlaysRef.current.keys()).forEach(id => removeImageOverlay(map, id)));
        clearAllMarkers();
        break;

      case 'pulseBoundary':
        runWhenReady(map => {
          const layerId = 'city-boundary-fill-layer';
          if (!map.getLayer(layerId)) return;
          let i = 0;
          const iv = setInterval(() => {
            i += 1;
            try {
              map.setPaintProperty(layerId, 'fill-opacity', i % 2 === 1 ? 0.68 : 0.22);
              if (i >= 6) {
                clearInterval(iv);
                map.setPaintProperty(layerId, 'fill-opacity', 0.35);
              }
            } catch {}
          }, 260);
        });
        break;

      default:
        break;
    }
  }, [mapCommand]);
  /* ------------------------------------------------------------- */

  // Compute geographic bbox from any GeoJSON Polygon / MultiPolygon
  const geojsonBbox = (geometry) => {
    let w = 180, s = 90, e = -180, n = -90;
    const walk = (coords) => {
      if (typeof coords[0] === 'number') {
        if (coords[0] < w) w = coords[0];
        if (coords[0] > e) e = coords[0];
        if (coords[1] < s) s = coords[1];
        if (coords[1] > n) n = coords[1];
        return;
      }
      coords.forEach(walk);
    };
    walk(geometry.coordinates);
    return [[w, s], [e, n]];
  };

  const applyBoundaryLayers = (map, geojson, cityName, colors) => {
    if (!map || !geojson) return;
    const sourceId = 'city-admin-boundary-source';
    const palette = colors || DEFAULT_COLORS;

    try {
      ['city-boundary-fill-layer', 'city-boundary-line-layer'].forEach(id => {
        if (map.getLayer(id)) map.removeLayer(id);
      });
      if (map.getSource(sourceId)) map.removeSource(sourceId);

      map.addSource(sourceId, {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: geojson,
          properties: { name: cityName }
        }
      });

      // Translucent interior fill in the state's color
      map.addLayer({
        id: 'city-boundary-fill-layer',
        type: 'fill',
        source: sourceId,
        paint: {
          'fill-color': palette.fill,
          'fill-opacity': 0.35
        }
      });

      // Smooth solid border in a brighter shade of the same state color
      map.addLayer({
        id: 'city-boundary-line-layer',
        type: 'line',
        source: sourceId,
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': palette.border,
          'line-width': 2.5,
          'line-opacity': 1.0
        }
      });
    } catch (err) {
      console.warn("Boundary layer application:", err);
    }
  };

  useEffect(() => {
    if (!mapContainer.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: isSatellite ? SATELLITE_STYLE : DARK_STYLE,
      // Start over INDIA — the intro flight then dives into the selected city
      center: [78.9629, 22.5937],
      zoom: 3.2,
      pitch: 0,
      bearing: 0,
      antialias: true,
      attributionControl: false
    });

    mapRef.current = map;
    if (typeof window !== 'undefined') {
      window.__drishtiMaps = window.__drishtiMaps || [];
      window.__drishtiMaps.push(map);
    }

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (typeof window !== 'undefined' && window.__drishtiMaps) {
        const i = window.__drishtiMaps.indexOf(map);
        if (i >= 0) window.__drishtiMaps.splice(i, 1);
      }
      map.remove();
    };
  }, []);

  // Basemap switch: ONLY on a real Dark Vector <-> Satellite change.
  // (Previously this ran on mount and on every savedGeojson update, wiping the
  // freshly-applied hologram layers via a redundant full style rebuild.)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (prevSatelliteRef.current === isSatellite) return;
    prevSatelliteRef.current = isSatellite;

    const restoreLayers = () => {
      const gj = savedGeojsonRef.current;
      if (gj && mapRef.current) {
        const cityName = typeof selectedCity === 'string' ? selectedCity : selectedCity?.name || 'Chennai';
        // Re-apply with the CURRENT state color so the fill survives basemap switches
        applyBoundaryLayers(mapRef.current, gj, cityName, getStateColors(selectedState));
      }
    };

    map.once('style.load', restoreLayers);
    map.setStyle(isSatellite ? SATELLITE_STYLE : DARK_STYLE);
  }, [isSatellite]);

  // Exact OSM city border highlight + smooth camera flight (queued until map style is ready)
  useEffect(() => {
    if (!mapRef.current || isIntro) return;

    const cityName = typeof selectedCity === 'string' ? selectedCity : selectedCity?.name || 'Chennai';
    const stateName = selectedState || 'Tamil Nadu';

    setCityNameLabel(`${cityName.toUpperCase()} SECTOR (${stateName.toUpperCase()})`);

    let cancelled = false;

    // INSTANT camera response: never wait for data. Fly to the geocoded city
    // point immediately; the exact polygon fit refines the view when it lands
    // (local dataset = same frame in practice, live APIs = user still sees the city).
    if (Array.isArray(selectedCityCoords) && selectedCityCoords.length === 2 && !isMinimized) {
      const [lng, lat] = selectedCityCoords;
      const easeToCity = () => {
        if (mapRef.current) {
          mapRef.current.easeTo({ center: [lng, lat], zoom: 10.6, pitch: 40, bearing: -12, duration: 1500 });
        }
      };
      if (isFirstFlightRef.current) {
        // First flight: brief India overview beat, then dive toward the city
        isFirstFlightRef.current = false;
        setTimeout(easeToCity, 250);
      } else {
        easeToCity();
      }
    }

    // NOTE: no early-return guard here — React StrictMode remounts effects in dev,
    // which previously cancelled the only in-flight fetch. Module-level boundaryCache
    // already de-duplicates network calls safely.
    fetchBoundaryGeojson(cityName, stateName, selectedCityCoords).then(geojson => {
      if (cancelled || !geojson || !mapRef.current) return;
      if (geojson.type !== 'Polygon' && geojson.type !== 'MultiPolygon') return;

      savedGeojsonRef.current = geojson;

      const applyAndFit = () => {
        if (cancelled || !mapRef.current) return;
        applyBoundaryLayers(mapRef.current, geojson, cityName, getStateColors(stateName));
        // Refine camera to the EXACT polygon bbox (fast, smooth — no second long flight).
        // Padding adapts to whichever side panels are open so the city stays centered
        // in the visible map area between them.
        if (!isMinimized) {
          mapRef.current.fitBounds(geojsonBbox(geojson), {
            padding: {
              top: 100,
              bottom: 120,
              left: (fitPadding && fitPadding.left) || 60,
              right: (fitPadding && fitPadding.right) || 80
            },
            pitch: 35,
            bearing: -8,
            duration: 900,
            essential: true,
            curve: 1.42,
            maxZoom: isSatellite ? 14.5 : 13.0
          });
        }
      };

      // Deterministic wait for style readiness (immune to missed map events)
      let tries = 60;
      const waitForStyle = () => {
        if (cancelled || !mapRef.current) return;
        if (mapRef.current.isStyleLoaded()) { applyAndFit(); return; }
        if (tries-- > 0) setTimeout(waitForStyle, 250);
      };
      waitForStyle();
    });

    return () => { cancelled = true; };
  }, [selectedCity, selectedState, isIntro]);

  // Re-fit camera when side panels toggle so the city re-centers in the free space
  useEffect(() => {
    const map = mapRef.current;
    const gj = savedGeojsonRef.current;
    if (!map || !gj || isIntro || isMinimized) return;
    map.fitBounds(geojsonBbox(gj), {
      padding: {
        top: 110,
        bottom: 150,
        left: (fitPadding && fitPadding.left) || 60,
        right: (fitPadding && fitPadding.right) || 80
      },
      pitch: 40,
      bearing: -12,
      duration: 700,
      essential: true,
      curve: 1.42,
      maxZoom: 11.5
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitPadding && fitPadding.left, fitPadding && fitPadding.right]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

      {/* Prominent Illuminated City Name Badge */}
      {!isIntro && !isMinimized && cityNameLabel && (
        <div style={{
          position: 'absolute',
          top: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 20,
          backgroundColor: 'rgba(24, 24, 27, 0.92)',
          backdropFilter: 'blur(16px)',
          border: '1.5px solid #3f3f46',
          borderRadius: 30,
          padding: '8px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)'
        }}>
          <div style={{ padding: 6, borderRadius: '50%', backgroundColor: 'rgba(255, 255, 255, 0.08)' }}>
            <MapPin size={16} style={{ color: '#e4e4e7' }} />
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Illuminated Administrative Footprint
            </div>
            <div style={{ fontSize: 15, fontWeight: 900, color: '#ffffff', letterSpacing: '0.5px' }}>
              {cityNameLabel}
            </div>
          </div>
        </div>
      )}

      {/* Active Overlay Chips — visibility & removal for chat-dispatched layers */}
      {!isIntro && !isMinimized && activeOverlays.length > 0 && (
        <div style={{
          position: 'absolute',
          bottom: 20,
          right: 20,
          zIndex: 29,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          alignItems: 'flex-end'
        }}>
          {activeOverlays.map(ov => (
            <div key={ov.id} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              backgroundColor: 'rgba(24, 24, 27, 0.94)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              borderRadius: 8,
              padding: '5px 8px 5px 12px',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.55)'
            }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#e2e8f0', maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {ov.title}
              </span>
              <button
                onClick={() => runWhenReady(map => setOverlayOpacityById(map, ov.id, ov.opacity > 0.15 ? 0.08 : 0.82))}
                title={ov.opacity > 0.15 ? 'Hide overlay' : 'Show overlay'}
                style={{ background: 'none', border: 'none', color: ov.opacity > 0.15 ? '#38bdf8' : '#71717a', cursor: 'pointer', padding: 2, display: 'flex' }}
              >
                {ov.opacity > 0.15 ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
              <button
                onClick={() => runWhenReady(map => removeImageOverlay(map, ov.id))}
                title="Remove overlay"
                style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: 2, display: 'flex' }}
              >
                <X size={13} />
              </button>
            </div>
          ))}
          {/* spacer so chips never collide with the HUD buttons below */}
          <div style={{ height: 84 }} />
        </div>
      )}

      {/* Map HUD Controls */}
      {!isIntro && !isMinimized && (
        <div style={{
          position: 'absolute',
          bottom: 20,
          right: 20,
          zIndex: 30,
          display: 'flex',
          flexDirection: 'column',
          gap: 8
        }}>
          <button
            onClick={() => setIsSatellite(!isSatellite)}
            className="btn-secondary"
            title="Toggle Dark Vector / Satellite Basemap"
            style={{ padding: '8px 14px' }}
          >
            <Layers size={14} />
            {isSatellite ? 'Satellite 3D' : 'Dark Vector'}
          </button>

          <button
            onClick={() => {
              if (mapRef.current) {
                mapRef.current.easeTo({ pitch: 55, bearing: -12, duration: 1200 });
              }
            }}
            className="btn-secondary"
            title="Reset 3D Pitch"
            style={{ padding: '8px 14px' }}
          >
            <Compass size={14} />
            3D Pitch
          </button>
        </div>
      )}
    </div>
  );
}
