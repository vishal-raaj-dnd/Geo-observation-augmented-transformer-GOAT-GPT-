import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATE_CITIES, boundarySlug } from '../src/data/cities.js';
import { simplifyRing } from '../src/utils/geometry.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'public', 'boundaries');
mkdirSync(OUT_DIR, { recursive: true });

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const QUERY_OVERRIDES = {
  'Chennai': ['Chennai Corporation, Tamil Nadu, India', 'Chennai, Tamil Nadu, India'],
  'Mumbai': ['Mumbai, Maharashtra, India', 'Mumbai Suburban, Maharashtra, India'],
  'Bengaluru': ['BBMP, Bengaluru, Karnataka, India', 'Bengaluru Urban, Karnataka, India'],
  'Mangaluru': ['Mangaluru Municipal Corporation, Karnataka, India', 'Mangalore, Karnataka, India', 'Mangaluru, Karnataka, India'],
  'Belagavi': ['Belagavi Municipal Corporation, Karnataka, India', 'Belgaum, Karnataka, India'],
  'Hyderabad': ['Greater Hyderabad Municipal Corporation, Telangana, India', 'Hyderabad, Telangana, India'],
  'Kolkata': ['Kolkata Municipal Corporation, West Bengal, India', 'Kolkata, West Bengal, India'],
  'Kochi': ['Kochi, Kerala, India', 'Ernakulam, Kerala, India'],
  'New Delhi': ['New Delhi, Delhi, India', 'Delhi, India'],
  'Pune': ['Pune Municipal Corporation, Maharashtra, India', 'Pune, Maharashtra, India'],
  'Ahmedabad': ['Ahmedabad Municipal Corporation, Gujarat, India', 'Ahmedabad, Gujarat, India'],
  'Surat': ['Surat Municipal Corporation, Gujarat, India', 'Surat, Gujarat, India'],
  'Visakhapatnam': ['Greater Visakhapatnam Municipal Corporation, Andhra Pradesh, India', 'Visakhapatnam, Andhra Pradesh, India'],
  'Vijayawada': ['Vijayawada Municipal Corporation, Andhra Pradesh, India', 'Vijayawada, Andhra Pradesh, India'],
  'Lucknow': ['Lucknow Municipal Corporation, Uttar Pradesh, India', 'Lucknow, Uttar Pradesh, India'],
  'Varanasi': ['Varanasi Municipal Corporation, Uttar Pradesh, India', 'Varanasi, Uttar Pradesh, India'],
  'Bhopal': ['Bhopal Municipal Corporation, Madhya Pradesh, India', 'Bhopal, Madhya Pradesh, India'],
  'Indore': ['Indore Municipal Corporation, Madhya Pradesh, India', 'Indore, Madhya Pradesh, India'],
  'Guwahati': ['Guwahati Municipal Corporation, Assam, India', 'Kamrup Metropolitan, Assam, India'],
  'Patna': ['Patna Municipal Corporation, Bihar, India', 'Patna, Bihar, India'],
  'Cuttack': ['Cuttack Municipal Corporation, Odisha, India', 'Cuttack, Odisha, India'],
  'Bhubaneswar': ['Bhubaneswar Municipal Corporation, Odisha, India', 'Bhubaneswar, Odisha, India'],
  'Ludhiana': ['Ludhiana Municipal Corporation, Punjab, India', 'Ludhiana, Punjab, India'],
  'Amritsar': ['Amritsar Municipal Corporation, Punjab, India', 'Amritsar, Punjab, India'],
  'Jaipur': ['Jaipur Municipal Corporation, Rajasthan, India', 'Jaipur, Rajasthan, India'],
  'Srinagar': ['Srinagar Municipal Corporation, Jammu and Kashmir, India', 'Srinagar, Jammu and Kashmir, India']
};

async function fetchOsmPolygon(query) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=jsonv2&polygon_geojson=1&limit=5`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'DRISHTI-EO-Boundary-Fetcher/2.0 (contact@drishti-eo.in)'
      }
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const polygonItems = data.filter(d =>
      d.geojson && (d.geojson.type === 'Polygon' || d.geojson.type === 'MultiPolygon')
    );

    if (polygonItems.length === 0) return null;

    polygonItems.sort((a, b) => {
      const aName = (a.display_name || '').toLowerCase();
      const bName = (b.display_name || '').toLowerCase();
      const aScore = aName.includes('corporation') || aName.includes('district') ? 2 : 1;
      const bScore = bName.includes('corporation') || bName.includes('district') ? 2 : 1;
      return bScore - aScore;
    });

    return polygonItems[0].geojson;
  } catch (err) {
    console.warn(`Fetch failed for query [${query}]:`, err.message);
    return null;
  }
}

function processCoordinates(geojson) {
  let polys = [];
  if (geojson.type === 'Polygon') {
    polys = [geojson.coordinates];
  } else if (geojson.type === 'MultiPolygon') {
    polys = geojson.coordinates;
  }

  const processed = polys
    .map(poly => poly.map((ring, idx) => {
      const simplified = simplifyRing(ring, idx === 0 ? 0.0002 : 0.0004);
      return simplified.length >= 4 ? simplified : ring;
    }))
    .filter(poly => poly.every(r => r.length >= 4));

  if (processed.length === 0) return null;

  return processed.length === 1
    ? { type: 'Polygon', coordinates: processed[0] }
    : { type: 'MultiPolygon', coordinates: processed };
}

async function run() {
  const jobs = Object.entries(STATE_CITIES).flatMap(([state, cities]) =>
    cities.map(city => ({ state, city }))
  );

  console.log(`Starting precise boundary coordinate fetch for ${jobs.length} cities across India...\n`);
  let successCount = 0;
  let failCount = 0;

  for (const { state, city } of jobs) {
    const filename = boundarySlug(state, city);
    const targetFile = path.join(OUT_DIR, filename);

    const queryList = QUERY_OVERRIDES[city] || [
      `${city} Municipal Corporation, ${state}, India`,
      `${city}, ${state}, India`,
      `${city}, India`
    ];

    let rawGeojson = null;
    for (const q of queryList) {
      rawGeojson = await fetchOsmPolygon(q);
      if (rawGeojson) break;
      await sleep(1000);
    }

    if (!rawGeojson) {
      console.log(`FAIL ${city} (${state}) — Failed to acquire OSM polygon`);
      failCount++;
      await sleep(1100);
      continue;
    }

    const processedGeojson = processCoordinates(rawGeojson);
    if (!processedGeojson) {
      console.log(`FAIL ${city} (${state}) — Geometry processing resulted in empty rings`);
      failCount++;
      await sleep(1100);
      continue;
    }

    const payload = {
      city,
      state,
      source: 'OpenStreetMap Nominatim Live Exact Admin Boundary',
      generated_at: new Date().toISOString(),
      geometry: processedGeojson
    };

    writeFileSync(targetFile, JSON.stringify(payload));
    console.log(`OK ${city} (${state}) -> saved ${filename}`);
    successCount++;

    await sleep(1200);
  }

  console.log(`\n==========================================`);
  console.log(`Fetch Complete: ${successCount} successful, ${failCount} failed.`);
  console.log(`==========================================`);
}

run();
