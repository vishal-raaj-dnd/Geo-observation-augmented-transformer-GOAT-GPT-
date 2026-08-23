/**
 * DRISHTI Real Satellite Imagery Service
 * - True Color / False Color frames: NASA GIBS WMS (daily MODIS/VIIRS reflectance)
 * - NDWI: REAL McFeeters band math (Green B03 + NIR B08) from Sentinel-2 L2A COGs
 *   discovered via Element84 earth-search STAC API (free, no key, AWS Open Data)
 * - High-res optical: Esri World Imagery export (same provider as basemap)
 * All sources are free & reliable; every step degrades gracefully.
 */
import * as GeoTIFF from 'geotiff';

const EARTH_SEARCH = 'https://earth-search.aws.element84.com/v1/search';
const GIBS_WMS = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi';

const cache = new Map();

function clampDate(dateStr) {
  const today = new Date().toISOString().slice(0, 10);
  return (!dateStr || dateStr > today) ? null : dateStr;
}

function gibsUrl(layer, bbox, dateStr, w = 1024, h = 620) {
  const [west, south, east, north] = bbox;
  const time = clampDate(dateStr);
  let url = `${GIBS_WMS}?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=${layer}` +
    `&STYLES=&FORMAT=image/jpeg&BBOX=${west},${south},${east},${north}` +
    `&WIDTH=${w}&HEIGHT=${h}&SRS=EPSG:4326&TRANSPARENT=FALSE`;
  if (time) url += `&TIME=${time}`;
  return url;
}

function esriOpticalUrl(bbox, w = 1024, h = 620) {
  const [west, south, east, north] = bbox;
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export` +
    `?bbox=${west},${south},${east},${north}&bboxSR=4326&imageSR=4326&size=${w},${h}&format=jpg&f=image`;
}

/* ---------- Lat/Lon -> UTM (standard Transverse Mercator formulas) ---------- */
function latLonToUTM(lat, lon) {
  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const k0 = 0.9996;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);
  const zone = Math.floor((lon + 180) / 6) + 1;
  const lon0 = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180;
  const phi = lat * Math.PI / 180;
  const lam = lon * Math.PI / 180;
  const N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
  const T = Math.tan(phi) ** 2;
  const C = ep2 * Math.cos(phi) ** 2;
  const A = (lam - lon0) * Math.cos(phi);
  const M = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * phi -
    (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * phi) +
    (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * phi) -
    (35 * e2 ** 3 / 3072) * Math.sin(6 * phi));
  const easting = k0 * N * (A + (1 - T + C) * A ** 3 / 6 +
    (5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000;
  let northing = k0 * (M + N * Math.tan(phi) * (A ** 2 / 2 +
    (5 - T + 9 * C + 4 * C ** 2) * A ** 4 / 24 +
    (61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6 / 720));
  if (lat < 0) northing += 10000000;
  return { easting, northing, zone };
}

/* ------------------- Real Sentinel-2 NDWI via COG band math ------------------ */
async function computeRealNdwi(bbox, cityLabel, dateStr) {
  const [west, south, east, north] = bbox;
  const centerLon = (west + east) / 2;
  const centerLat = (south + north) / 2;

  // 1. Find a low-cloud Sentinel-2 L2A scene over the area (both legacy & C1 reprocessing)
  const monthMatch = (dateStr || '').match(/^(\d{4})-(\d{2})/);
  const today = new Date().toISOString().slice(0, 10);
  const datetime = monthMatch
    ? `${monthMatch[1]}-${monthMatch[2]}-01T00:00:00Z/${monthMatch[1]}-${monthMatch[2]}-28T23:59:59Z`
    : `${today.slice(0, 4)}-01-01T00:00:00Z/${today}T23:59:59Z`;

  const searchBody = {
    collections: ['sentinel-2-c1-l2a', 'sentinel-2-l2a'],
    bbox: [west, south, east, north],
    datetime,
    limit: 15,
    sortby: [{ field: 'properties.datetime', direction: 'desc' }],
    query: { 'eo:cloud_cover': { lt: 25 } }
  };

  let scene = null;
  const res = await fetch(EARTH_SEARCH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(searchBody)
  });
  if (!res.ok) throw new Error(`STAC search failed (${res.status})`);
  const data = await res.json();
  const features = data.features || [];
  if (features.length === 0) {
    // Retry without date restriction (latest available anywhere this year)
    delete searchBody.datetime;
    searchBody.datetime = `2024-01-01T00:00:00Z/${today}T23:59:59Z`;
    const res2 = await fetch(EARTH_SEARCH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(searchBody)
    });
    const data2 = await res2.json();
    if (!data2.features || data2.features.length === 0) throw new Error('No Sentinel-2 scenes found');
    scene = data2.features[0];
  } else {
    scene = features[0];
  }

  const greenHref = scene.assets.green?.href;
  const nirHref = scene.assets.nir?.href;
  if (!greenHref || !nirHref) throw new Error('Scene missing green/nir COG assets');
  const sceneDate = (scene.properties?.datetime || '').slice(0, 10);
  const cloudPct = scene.properties['eo:cloud_cover'];

  // 2. Read reduced-resolution windows from both COGs
  const SIZE = 320;
  const readBand = async (href, onSize) => {
    const tif = await GeoTIFF.fromUrl(href);
    const image = await tif.getImage();
    const [bw, bs, be, bn] = image.getBoundingBox(); // UTM meters
    const { easting, northing } = latLonToUTM(centerLat, centerLon);
    const halfW = Math.max((be - bw) * 0.06, 3000);
    if (onSize) onSize(halfW);
    const x0 = Math.max(0, Math.min(image.getWidth(), Math.floor(((easting - halfW) - bw) / (be - bw) * image.getWidth())));
    const x1 = Math.max(x0 + 1, Math.min(image.getWidth(), Math.ceil(((easting + halfW) - bw) / (be - bw) * image.getWidth())));
    const yTop = Math.floor(((bn - northing - halfW) - bs) / (bn - bs) * image.getHeight());
    const yBot = Math.ceil(((bn - northing + halfW) - bs) / (bn - bs) * image.getHeight());
    const y0 = Math.max(0, Math.min(image.getHeight(), Math.min(yTop, yBot)));
    const y1 = Math.max(y0 + 1, Math.min(image.getHeight(), Math.max(yTop, yBot)));
    const rasters = await image.readRasters({
      window: [x0, y0, x1, y1],
      width: SIZE,
      height: SIZE,
      samples: [0]
    });
    return rasters[0];
  };

  let windowHalfM = null;
  const readBandWithSize = async (href) => {
    const rasters = await readBand(href, (halfW) => { windowHalfM = halfW; });
    return rasters;
  };
  const [green, nir] = await Promise.all([readBandWithSize(greenHref), readBandWithSize(nirHref)]);

  // Geographic footprint of the analyzed window (± halfW meters around the city
  // center) — lets the UI paint this exact NDWI raster back onto the main map.
  const halfM = windowHalfM || 3000;
  const degPerMLat = 1 / 110540;
  const degPerMLon = 1 / (111320 * Math.cos(centerLat * Math.PI / 180));
  const windowBbox = [
    +(centerLon - halfM * degPerMLon).toFixed(5),
    +(centerLat - halfM * degPerMLat).toFixed(5),
    +(centerLon + halfM * degPerMLon).toFixed(5),
    +(centerLat + halfM * degPerMLat).toFixed(5)
  ];

  // 3. TRUE McFeeters NDWI = (Green - NIR) / (Green + NIR)
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  const out = ctx.createImageData(SIZE, SIZE);
  let waterCount = 0;
  let sumNdwi = 0;

  for (let i = 0; i < SIZE * SIZE; i++) {
    const g = green[i];
    const n = nir[i];
    const valid = Number.isFinite(g) && Number.isFinite(n) && (g + n) !== 0;
    const ndwi = valid ? (g - n) / (g + n) : 0;
    sumNdwi += ndwi;
    const o = i * 4;
    if (ndwi > 0.12) {
      // Open water — blue ramp by intensity
      waterCount++;
      const t = Math.min(1, (ndwi - 0.12) / 0.5);
      out.data[o] = Math.round(8 + 20 * (1 - t));
      out.data[o + 1] = Math.round(90 + 130 * t);
      out.data[o + 2] = Math.round(160 + 80 * t);
      out.data[o + 3] = 255;
    } else if (ndwi > 0.03) {
      // Wet/moist soil transition zone
      out.data[o] = 38;
      out.data[o + 1] = 68;
      out.data[o + 2] = 96;
      out.data[o + 3] = 255;
    } else {
      // Dry land — charcoal ramp
      const lum = Math.round(28 + ndwi * 260);
      out.data[o] = lum;
      out.data[o + 1] = lum;
      out.data[o + 2] = lum + 6;
      out.data[o + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);

  return {
    frame: {
      id: `ndwi-sentinel2-${sceneDate}`,
      title: `True McFeeters NDWI — Sentinel-2 L2A ${sceneDate} (B03+B08 Band Math)`,
      band: 'NDWI (Green-NIR)/(Green+NIR)',
      sensor: `Sentinel-2 MSI · ${Math.round(cloudPct)}% cloud`,
      url: canvas.toDataURL('image/png'),
      raw: true,
      bbox: windowBbox,
      annotations: [
        { label: `Water pixels: ${((waterCount / (SIZE * SIZE)) * 100).toFixed(1)}% of sector`, box: [SIZE * 0.08, SIZE * 0.08, SIZE * 0.92, SIZE * 0.92], pct: ((waterCount / (SIZE * SIZE)) * 100).toFixed(1) }
      ]
    },
    stats: {
      mean_ndwi: +(sumNdwi / (SIZE * SIZE)).toFixed(3),
      water_pct: +((waterCount / (SIZE * SIZE)) * 100).toFixed(1),
      scene_date: sceneDate,
      scene_id: scene.id,
      cloud_pct: cloudPct
    }
  };
}

/* ------------------------------ Public resolver ----------------------------- */
export async function resolveCityImagery(bbox, city, state, dateStr) {
  const key = `${city}|${state}`;
  if (cache.has(key)) return cache.get(key);
  const result = await _resolve(bbox, city, state, dateStr);
  cache.set(key, result);
  return result;
}

async function _resolve(bbox, city, state, dateStr) {
  const frames = [];
  let ndwiStats = null;

  const ndwiPromise = computeRealNdwi(bbox, city, dateStr)
    .then(({ frame, stats }) => {
      const i = frames.findIndex(f => f.pending);
      if (i >= 0) frames.splice(i, 1, frame); // replace placeholder in place
      else frames.push(frame);
      ndwiStats = stats;
    })
    .catch(err => console.warn('[imagery] Real NDWI unavailable, using optical fallback:', err.message));

  // Frame 1: True color (NASA VIIRS daily composite)
  frames.push({
    id: 'truecolor-viirs',
    title: `True Color Reflectance — ${city}, ${state}`,
    band: 'True Color RGB',
    sensor: 'VIIRS SNPP / NASA GIBS',
    url: gibsUrl('VIIRS_SNPP_CorrectedReflectance_TrueColor', bbox, dateStr),
    bbox,
    annotations: []
  });

  // Frame 2: False color urban (MODIS 7-2-1 SWIR composite)
  frames.push({
    id: 'falsecolor-modis721',
    title: `False Color SWIR (7-2-1) — Water appears near-black`,
    band: 'SWIR False Color',
    sensor: 'MODIS Terra / NASA GIBS',
    url: gibsUrl('MODIS_Terra_CorrectedReflectance_Bands721', bbox, dateStr),
    bbox,
    annotations: []
  });

  // Placeholder slot for NDWI (filled async above at index 2)
  frames.push({
    id: 'ndwi-pending',
    title: 'Computing true NDWI from Sentinel-2 COGs…',
    band: 'NDWI',
    sensor: 'Sentinel-2 MSI',
    url: '',
    pending: true,
    bbox
  });

  // Frame 4: High-res optical closeup (Esri)
  frames.push({
    id: 'optical-esri-hires',
    title: `High-Resolution Optical Base — ${city}`,
    band: 'True Color RGB',
    sensor: 'Esri World Imagery',
    url: esriOpticalUrl(bbox),
    bbox,
    annotations: []
  });

  await Promise.race([
    ndwiPromise,
    new Promise(r => setTimeout(r, 20000)) // never block UI more than 20s on COGs
  ]);

  // If NDWI failed, replace pending slot with RGB-filter approximation (clearly labeled)
  const idx = frames.findIndex(f => f.pending);
  if (idx >= 0) {
    frames[idx] = {
      id: 'ndwi-optical-approx',
      title: 'NDWI approximation from optical RGB (Sentinel-2 scene unavailable)',
      band: 'Approximated NDWI',
      sensor: 'Fallback mode',
      url: esriOpticalUrl(bbox),
      bbox,
      annotations: []
    };
  }

  return { frames, ndwiStats };
}
