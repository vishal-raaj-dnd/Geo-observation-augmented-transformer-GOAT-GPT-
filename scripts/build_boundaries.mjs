// DRISHTI boundary dataset generator.
// Builds public/boundaries/<slug>.json for every catalog city from the
// geoBoundaries IND ADM2 (districts) dataset — one download, no API hammering.
// Matching: alias table -> exact name -> point-in-polygon via Nominatim geocode.
//
// Usage:  node scripts/build_boundaries.mjs

import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { STATE_CITIES, boundarySlug } from '../src/data/cities.js';
import { simplifyRing, ringStats } from '../src/utils/geometry.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'public', 'boundaries');
const CACHE_DIR = path.join(ROOT, 'scripts', '.cache');
const ADM2_URL = 'https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/IND/ADM2/geoBoundaries-IND-ADM2_simplified.geojson';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Catalog name -> ADM2 shapeName (2011-census spellings)
const ALIASES = {
  'Kochi': ['Ernakulam'],
  'Howrah': ['Haora'],
  'Durgapur': ['Paschim Barddhaman'],
  'Siliguri': ['Darjiling'],
  'Bengaluru': ['Bangalore'],
  'Mysuru': ['Mysore'],
  'Mangaluru': ['Dakshina Kannada'],
  'Belagavi': ['Belgaum'],
  'Guwahati': ['Kamrup Metropolitan'],
  'Silchar': ['Cachar'],
  'Bhubaneswar': ['Khordha'],
  'Prayagraj': ['Allahabad'],
  'Kanpur': ['Kanpur Nagar'],
  'Vijayawada': ['Krishna'],
  'Warangal': ['Warangal (U)', 'Warangal (R)'],
  'Ahmedabad': ['Ahmadabad'],
  'Haridwar': ['Hardwar'],
  // Multi-district cities: merged into one combined highlight
  'Mumbai': ['Mumbai', 'Mumbai Suburban']
};

/* ---------- geometry ---------- */

function pointInRing(pt, ring) {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

function featureContainsPoint(feature, pt) {
  const g = feature.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  for (const poly of polys) {
    if (poly.length > 0 && pointInRing(pt, poly[0])) return true;
  }
  return false;
}

async function ensureAdm2() {
  mkdirSync(CACHE_DIR, { recursive: true });
  const cacheFile = path.join(CACHE_DIR, 'ind_adm2.geojson');
  if (existsSync(cacheFile)) {
    console.log('Using cached ADM2 dataset.');
    return JSON.parse(readFileSync(cacheFile, 'utf8'));
  }
  console.log('Downloading geoBoundaries IND ADM2 (~8MB, one-time)...');
  const r = await fetch(ADM2_URL);
  if (!r.ok) throw new Error(`ADM2 download failed: ${r.status}`);
  const text = await r.text();
  writeFileSync(cacheFile, text);
  return JSON.parse(text);
}

async function geocodePoint(city, state) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(`${city}, ${state}, India`)}&format=json&limit=1`;
    const r = await fetch(url, { headers: { 'User-Agent': 'drishti-boundary-builder/1.0' } });
    if (!r.ok) return null;
    const data = await r.json();
    if (!data?.length) return null;
    return [parseFloat(data[0].lon), parseFloat(data[0].lat)];
  } catch { return null; }
}

/* ---------- main ---------- */

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const adm2 = await ensureAdm2();
  const byName = new Map(adm2.features.map(f => [f.properties.shapeName.toLowerCase(), f]));

  const jobs = Object.entries(STATE_CITIES).flatMap(([state, cities]) =>
    cities.map(city => ({ state, city }))
  );
  console.log(`Building boundary dataset for ${jobs.length} cities...\n`);

  const report = [];
  let ok = 0, fail = 0;

  for (const { state, city } of jobs) {
    process.stdout.write(`- ${city} (${state}) ... `);

    // 1. alias / exact-name match
    let features = [];
    for (const alias of (ALIASES[city] || [city])) {
      const f = byName.get(alias.toLowerCase());
      if (f) features.push(f);
    }

    // 2. fallback: point-in-polygon using the geocoded city point
    if (features.length === 0) {
      const pt = await geocodePoint(city, state);
      await sleep(1100); // Nominatim 1 req/s policy
      if (pt) {
        features = adm2.features.filter(f => featureContainsPoint(f, pt));
        if (features.length > 1) {
          // smallest containing district wins
          features.sort((a, b) => ringStats(a.geometry.coordinates.flat()).diag - ringStats(b.geometry.coordinates.flat()).diag);
        }
      }
    }

    if (features.length === 0) {
      console.log('FAIL (no district match)');
      report.push({ city, state, ok: false, reason: 'no_match' });
      fail++;
      continue;
    }

    // Merge all matched districts (Mumbai = City + Suburban)
    const polys = [];
    for (const f of features) {
      const g = f.geometry;
      if (g.type === 'Polygon') polys.push(g.coordinates);
      else if (g.type === 'MultiPolygon') polys.push(...g.coordinates);
    }

    const simplified = polys
      .map(poly => poly.map((ring, idx) => simplifyRing(ring, idx === 0 ? 0.0005 : 0.001)))
      .filter(poly => poly.every(r => r.length >= 4));

    if (simplified.length === 0) {
      console.log('FAIL (empty geometry)');
      report.push({ city, state, ok: false, reason: 'empty_geometry' });
      fail++;
      continue;
    }

    const stats = ringStats(simplified.flat(2));
    const pt = await geocodePoint(city, state);
    let flag = '';
    if (pt) {
      const dist = Math.hypot(stats.cx - pt[0], stats.cy - pt[1]);
      if (dist > 0.75) flag = `FLAG: centroid ${dist.toFixed(2)}deg from geocoded point`;
    }
    await sleep(1100);

    const geometry = simplified.length === 1
      ? { type: 'Polygon', coordinates: simplified[0] }
      : { type: 'MultiPolygon', coordinates: simplified };

    const payload = {
      city,
      state,
      source: 'geoBoundaries gbOpen IND ADM2 (simplified)',
      matched_districts: features.map(f => f.properties.shapeName),
      generated_at: new Date().toISOString(),
      points: simplified.reduce((n, poly) => n + poly.reduce((m, r) => m + r.length, 0), 0),
      geometry
    };

    writeFileSync(path.join(OUT_DIR, boundarySlug(state, city)), JSON.stringify(payload));
    console.log(`ok (${payload.matched_districts.join(' + ')}, ${payload.points} pts${flag ? `, ${flag}` : ''})`);
    report.push({ city, state, ok: true, districts: payload.matched_districts, flag: flag || null });
    ok++;
  }

  writeFileSync(path.join(OUT_DIR, '_report.json'), JSON.stringify(report, null, 2));
  console.log(`\nDone: ${ok} ok, ${fail} failed. Report: public/boundaries/_report.json`);
  if (fail > 0) process.exitCode = 1;
}

main();
