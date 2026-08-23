// Shared geometry utilities: OSM ring assembly + simplification + measurement.
// Used by the boundary dataset generator AND the runtime Overpass fallback.

export const pointKey = (p) => `${p[0].toFixed(7)},${p[1].toFixed(7)}`;

// OSM relations store their outer ring as MANY open way segments.
// Chain them end-to-end (forward or reversed) into proper closed rings.
export function stitchOuterRings(ways) {
  const rings = [];
  const pool = ways.map(w => w.map(p => [p[0], p[1]]));
  while (pool.length > 0) {
    let ring = pool.shift();
    let guard = 20000;
    while (guard-- > 0) {
      if (pointKey(ring[0]) === pointKey(ring[ring.length - 1])) { rings.push(ring); break; }
      const start = ring[0], end = ring[ring.length - 1];

      let i = pool.findIndex(w => pointKey(w[0]) === pointKey(end));
      if (i >= 0) { ring = ring.concat(pool.splice(i, 1)[0].slice(1)); continue; }
      i = pool.findIndex(w => pointKey(w[w.length - 1]) === pointKey(end));
      if (i >= 0) { ring = ring.concat(pool.splice(i, 1)[0].reverse().slice(1)); continue; }
      i = pool.findIndex(w => pointKey(w[w.length - 1]) === pointKey(start));
      if (i >= 0) { ring = pool.splice(i, 1)[0].concat(ring.slice(1)); continue; }
      i = pool.findIndex(w => pointKey(w[0]) === pointKey(start));
      if (i >= 0) { ring = pool.splice(i, 1)[0].reverse().concat(ring.slice(1)); continue; }

      ring.push(ring[0]); // stuck: force-close what we assembled
      rings.push(ring);
      break;
    }
  }
  return rings;
}

// Douglas-Peucker line simplification (planar approx is fine at district scale)
export function simplifyRing(points, tol) {
  if (points.length < 3) return points;
  const keep = new Array(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [a, b] = stack.pop();
    if (b - a < 2) continue;
    const A = points[a], B = points[b];
    const dx = B[0] - A[0], dy = B[1] - A[1];
    const len2 = dx * dx + dy * dy;
    let maxD = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const P = points[i];
      let d;
      if (len2 === 0) d = Math.hypot(P[0] - A[0], P[1] - A[1]);
      else {
        let t = ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        d = Math.hypot(P[0] - A[0] - t * dx, P[1] - A[1] - t * dy);
      }
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol && idx > 0) { keep[idx] = true; stack.push([a, idx], [idx, b]); }
  }
  const out = points.filter((_, i) => keep[i]);
  if (out.length > 1 && pointKey(out[0]) !== pointKey(out[out.length - 1])) out.push(out[0]);
  return out;
}

export function ringStats(points) {
  let w = 180, s = 90, e = -180, n = -90;
  for (const p of points) {
    if (p[0] < w) w = p[0];
    if (p[0] > e) e = p[0];
    if (p[1] < s) s = p[1];
    if (p[1] > n) n = p[1];
  }
  return { w, s, e, n, cx: (w + e) / 2, cy: (s + n) / 2, diag: Math.hypot(e - w, n - s) };
}
