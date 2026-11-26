// Weltgeometrie-Daten ohne THREE: Raster, Küste, Höhenfunktion, Kollisionen, Straßengraph
import { clamp, smoothstep, fbm, lerp, mulberry32 } from './util.js';

export const P = 96;          // Blockabstand
export const R = 14;          // Straßenbreite
export const SW = 4;          // Gehsteigbreite
export const K = 12;          // Straßenlinien -K..K
export const WATER = -1.0;    // Wasserspiegel
export const HALF = 3500;     // halbe Weltgröße (Terrain)
export const AIRPORT = { x0: -2300, x1: -1350, z0: -600, z1: 850, rwX: -1950, rwZ0: -480, rwZ1: 720, rwW: 46 };
export const BAY = { x0: 330, x1: 540, z0: 850 };
export const HIGHWAY = { x0: -1700, x1: -1100, z0: 160, z1: 225 };
export const CITY = { x0: -1170, z0: -1170 };

export const coastE = (z) => 1255 + 40 * Math.sin(z / 230) + 25 * Math.sin(z / 90 + 1);
export const coastS = (x) => 1255 + 40 * Math.sin(x / 260 + 1) + 20 * Math.sin(x / 80);

function rectDist(x, z, r) {
  const dx = Math.max(r.x0 - x, 0, x - r.x1), dz = Math.max(r.z0 - z, 0, z - r.z1);
  return Math.hypot(dx, dz);
}
const ISLAND = { x: 2150, z: 1750, r: 190 };
export const ISLAND_POS = ISLAND;

// Gelände-Höhe (ohne Rampen)
export function terrainHeight(x, z) {
  const dCity = Math.max(CITY.x0 - x, CITY.z0 - z, 0);
  const dAir = rectDist(x, z, AIRPORT);
  const dHwy = rectDist(x, z, HIGHWAY);
  const d = Math.min(dCity, dAir, dHwy);
  let h = 0;
  if (d > 0) {
    const amp = 7 + 230 * smoothstep(500, 2300, d);
    const mask = smoothstep(0, 380, d);
    const n = fbm(x / 420 + 11, z / 420 + 7, 5);
    const ridge = Math.abs(fbm(x / 900 + 3, z / 900 + 9, 3) - 0.5) * 2;
    h = (n * amp + (1 - ridge) * amp * 0.5) * mask;
  }
  // Küsten- und Meeresboden
  const sE = x - coastE(z), sS = z - coastS(x);
  let s = Math.max(sE, sS);
  if (x > BAY.x0 && x < BAY.x1 && z > BAY.z0) {
    const sb = Math.min(x - BAY.x0, BAY.x1 - x, z - BAY.z0 + 40);
    s = Math.max(s, sb * 0.35 + 2);
  }
  if (sE > -300 && sE < 0) h *= 1 - smoothstep(-300, 0, sE);
  if (sS > -300 && sS < 0) h *= 1 - smoothstep(-300, 0, sS);
  if (s > 0) h = -Math.min(s * 0.06 + 0.2 * Math.min(s, 3), 70);
  // Insel
  const di = Math.hypot(x - ISLAND.x, z - ISLAND.z);
  if (di < ISLAND.r * 1.9) { const b = smoothstep(ISLAND.r * 1.9, ISLAND.r * 0.35, di); h = Math.max(h, -45 + b * 52 + fbm(x / 40, z / 40, 3) * 3 * b); }
  return h;
}

// Rampen (Stunt) - Keile
export const ramps = [];
export function addRamp(r) { ramps.push(r); }
function rampHeight(x, z) {
  let best = -1e9;
  for (const r of ramps) {
    const dx = x - r.x, dz = z - r.z, c = Math.cos(r.yaw), s = Math.sin(r.yaw);
    // lokal: forward = (sin yaw, cos yaw)
    const lf = dx * s + dz * c, ll = dx * c - dz * s;
    if (Math.abs(ll) < r.w / 2 && lf > -r.len / 2 && lf < r.len / 2) {
      const t = (lf + r.len / 2) / r.len;
      best = Math.max(best, t * r.h);
    }
  }
  return best;
}
export function groundHeight(x, z) {
  const t = terrainHeight(x, z);
  if (ramps.length) { const rh = rampHeight(x, z); if (rh > t) return rh; }
  return t;
}
export const isWater = (x, z) => terrainHeight(x, z) < WATER - 0.2;

// ---------- Raster ----------
export const lineX = (k) => k * P;
export function nodeExists(k, l) {
  if (k < -K || k > K || l < -K || l > K) return false;
  const x = k * P, z = l * P;
  if (x > BAY.x0 - 6 && x < BAY.x1 + 6 && z > BAY.z0 - 10) return false;
  return true;
}
export function blockExists(i, j) {
  if (i < -K || i >= K || j < -K || j >= K) return false;
  const cx = (i + 0.5) * P, cz = (j + 0.5) * P;
  if (cx > BAY.x0 && cx < BAY.x1 && cz > BAY.z0) return false;
  return true;
}
export function districtOf(i, j) {
  const cx = i + 0.5, cz = j + 0.5, d = Math.max(Math.abs(cx), Math.abs(cz));
  if (d < 2.6) return 'downtown';
  if (cx > 2.5 && cz < -3.5) return 'villas';
  if (cx > 6.5) return 'beach';
  if (cz > 5.5 && cx > 1.5) return 'harbor';
  if (cz > 5.5 && cx < 1.5) return 'industrial';
  if (d < 5.6) return 'midtown';
  if (cx < -2.5) return 'residential';
  return 'suburb';
}
export const DISTRICT_NAMES = {
  downtown: 'Vice Downtown', midtown: 'Neon District', beach: 'Marina Shores', villas: 'Palm Estates',
  harbor: 'Port Maria', industrial: 'Rust Yards', residential: 'Sunset Heights', suburb: 'Pine Suburbs',
  airport: 'Aeropuerto Internacional', hills: 'Cabo Verde Hills', sea: 'Offene See', farm: 'Cabo Verde Farmland', island: 'Isla Corazón',
};
export function districtAt(x, z) {
  if (x > AIRPORT.x0 && x < AIRPORT.x1 && z > AIRPORT.z0 && z < AIRPORT.z1) return 'airport';
  if (Math.hypot(x - ISLAND.x, z - ISLAND.z) < ISLAND.r * 1.3) return 'island';
  if (terrainHeight(x, z) < WATER - 0.3) return 'sea';
  if (x > -1170 && z > -1170 && x < 1260 && z < 1260) {
    const i = Math.floor(x / P), j = Math.floor(z / P);
    return districtOf(clamp(i, -K, K - 1), clamp(j, -K, K - 1));
  }
  if (terrainHeight(x, z) > 60) return 'hills';
  return 'farm';
}
export const AVENUES = ['Calle Alta', 'Orchid Ave', 'Lagoon St', 'Mango Ave', 'Sunrise Blvd', 'Flamingo Dr', 'Coral Way', 'Palm Ave', 'Harbor St', 'Neon Blvd', 'Magnolia Ave', 'Bayview Rd', 'Vice Boulevard', 'Marlin St', 'Hibiscus Ave', 'Caribe Way', 'Pelican St', 'Starfish Ave', 'Jasmine Dr', 'Lime Street', 'Tropic Blvd', 'Mirage Ave', 'Sandpiper Rd', 'Ocean Drive', 'Seabreeze Ave'];
export const STREETS = ['North Beach Rd', 'Rosewood St', 'Cypress St', 'Banyan Ave', 'Tulip Way', 'Mercado St', 'Cuban Alley', 'Main Street', 'Liberty Ave', 'Federal St', 'Opal St', 'Ruby Rd', 'Central Avenue', 'Sapphire St', 'Topaz Ave', 'Amber Way', 'Emerald St', 'Jade Ave', 'Onyx Blvd', 'Pearl Street', 'Coral Reef Rd', 'Dock Street', 'Anchor Ave', 'Cargo Way', 'South Pier Rd'];
export function streetAt(x, z) {
  const ax = Math.abs(x / P - Math.round(x / P)), az = Math.abs(z / P - Math.round(z / P));
  const dx = ax * P, dz = az * P;
  if (Math.min(dx, dz) > R / 2 + 1) return null;
  if (x < -1180 && z > HIGHWAY.z0 && z < HIGHWAY.z1) return 'Airport Highway';
  if (Math.abs(x) > 1250 || Math.abs(z) > 1250) return null;
  if (dx < dz) return AVENUES[clamp(Math.round(x / P) + K, 0, 24)];
  return STREETS[clamp(Math.round(z / P) + K, 0, 24)];
}

// ---------- Kollisionen (Gitter) ----------
const CELL = 48;
const grid = new Map();
const key = (cx, cz) => cx * 73856093 ^ cz * 19349663;
export const boxes = [];
export const circles = [];
function cellAdd(cx, cz, o) { const k = key(cx, cz); let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(o); }
export function addBox(x0, z0, x1, z1, h = 20, tag = null) {
  const o = { t: 0, x0, x1, z0, z1, h, tag };
  boxes.push(o);
  for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) cellAdd(cx, cz, o);
  return o;
}
export function addCircle(x, z, r, h = 6) {
  const o = { t: 1, x, z, r, h };
  circles.push(o);
  cellAdd(Math.floor(x / CELL), Math.floor(z / CELL), o);
  return o;
}
const _seen = new Set();
export function nearby(x, z, rad, out = []) {
  out.length = 0; _seen.clear();
  for (let cx = Math.floor((x - rad) / CELL); cx <= Math.floor((x + rad) / CELL); cx++)
    for (let cz = Math.floor((z - rad) / CELL); cz <= Math.floor((z + rad) / CELL); cz++) {
      const a = grid.get(key(cx, cz)); if (!a) continue;
      for (const o of a) if (!_seen.has(o)) { _seen.add(o); out.push(o); }
    }
  return out;
}
const _q = [];
// Kreis gegen Statik; schreibt Korrektur in res {nx,nz,pen}; gibt true bei Kontakt
export function resolveCircle(pos, r, y = 0, res = null) {
  let hit = false, nx = 0, nz = 0, maxPen = 0;
  const L = nearby(pos.x, pos.z, r + 2, _q);
  for (const o of L) {
    if (o.t === 0) {
      if (y > o.h) continue;
      const cx = clamp(pos.x, o.x0, o.x1), cz = clamp(pos.z, o.z0, o.z1);
      let dx = pos.x - cx, dz = pos.z - cz, d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        let d = Math.sqrt(d2), pen;
        if (d < 1e-5) { // Mittelpunkt innerhalb: herausschieben über kürzeste Kante
          const l = pos.x - o.x0, rr = o.x1 - pos.x, t = pos.z - o.z0, b = o.z1 - pos.z, m = Math.min(l, rr, t, b);
          if (m === l) { dx = -1; dz = 0; } else if (m === rr) { dx = 1; dz = 0; } else if (m === t) { dx = 0; dz = -1; } else { dx = 0; dz = 1; }
          pen = m + r; d = 1;
        } else { dx /= d; dz /= d; pen = r - d; }
        pos.x += dx * pen; pos.z += dz * pen; hit = true; nx = dx; nz = dz; maxPen = Math.max(maxPen, pen);
      }
    } else {
      if (y > o.h) continue;
      const dx = pos.x - o.x, dz = pos.z - o.z, rr = r + o.r, d2 = dx * dx + dz * dz;
      if (d2 < rr * rr) {
        const d = Math.sqrt(d2) || 1e-4, pen = rr - d;
        pos.x += dx / d * pen; pos.z += dz / d * pen; hit = true; nx = dx / d; nz = dz / d; maxPen = Math.max(maxPen, pen);
      }
    }
  }
  if (res) { res.nx = nx; res.nz = nz; res.pen = maxPen; }
  return hit;
}
// Strahl gegen Statik (xz-Ebene + Höhe). liefert Distanz oder Infinity
export function rayStatic(ox, oy, oz, dx, dy, dz, maxD) {
  let best = Infinity;
  const steps = Math.ceil(maxD / CELL) * 2 + 1;
  const seen = new Set();
  for (let s = 0; s <= steps; s++) {
    const t = Math.min(maxD, s * CELL * 0.5);
    const cx = Math.floor((ox + dx * t) / CELL), cz = Math.floor((oz + dz * t) / CELL);
    const a = grid.get(key(cx, cz)); if (!a) continue;
    for (const o of a) {
      if (seen.has(o)) continue; seen.add(o);
      if (o.t === 0) {
        let t0 = 0, t1 = maxD;
        const ax = [[ox, dx, o.x0, o.x1], [oz, dz, o.z0, o.z1], [oy, dy, 0, o.h]];
        let ok = true;
        for (const [p, d, lo, hi] of ax) {
          if (Math.abs(d) < 1e-8) { if (p < lo || p > hi) { ok = false; break; } }
          else { let a1 = (lo - p) / d, a2 = (hi - p) / d; if (a1 > a2) [a1, a2] = [a2, a1]; t0 = Math.max(t0, a1); t1 = Math.min(t1, a2); if (t0 > t1) { ok = false; break; } }
        }
        if (ok && t0 < best) best = t0;
      } else {
        const px = o.x - ox, pz = o.z - oz, tt = px * dx + pz * dz;
        if (tt > 0 && tt < maxD) { const cx2 = px - dx * tt, cz2 = pz - dz * tt; if (cx2 * cx2 + cz2 * cz2 < o.r * o.r) { const yy = oy + dy * tt; if (yy < o.h && yy > 0) best = Math.min(best, tt); } }
      }
    }
  }
  const gt = terrainHeight(ox + dx * Math.min(maxD, best), oz + dz * Math.min(maxD, best));
  return best;
}

// ---------- Straßengraph ----------
export const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // O, S, W, N  (x,z)
export function edgeExists(k, l, d) {
  const [dx, dz] = DIRS[d];
  return nodeExists(k, l) && nodeExists(k + dx, l + dz);
}
// Ampelphase: gibt 0 = NS grün, 1 = NS gelb, 2 = EW grün, 3 = EW gelb
export const CYCLE = 26;
export function lightPhase(k, l, t) {
  const p = (t + ((k * 7 + l * 3) % CYCLE + CYCLE)) % CYCLE;
  if (p < 10) return 0; if (p < 13) return 1; if (p < 23) return 2; return 3;
}
// Kann Fahrzeug in Richtung d (0..3) in Kreuzung (k,l) einfahren?
export function canEnter(k, l, d, t) {
  const ph = lightPhase(k, l, t);
  const ns = d === 1 || d === 3;
  if (ns) return ph === 0; // bei Gelb stoppen
  return ph === 2;
}
// A* über Raster. gibt Liste [x,z]
export function routeBetween(ax, az, bx, bz) {
  const sk = clamp(Math.round(ax / P), -K, K), sl = clamp(Math.round(az / P), -K, K);
  const ek = clamp(Math.round(bx / P), -K, K), el = clamp(Math.round(bz / P), -K, K);
  const id = (k, l) => (k + K) * 40 + (l + K);
  const open = [[Math.abs(ek - sk) + Math.abs(el - sl), 0, sk, sl]];
  const g = new Map([[id(sk, sl), 0]]), from = new Map();
  let found = false;
  while (open.length) {
    open.sort((a, b) => a[0] - b[0]);
    const [, gc, k, l] = open.shift();
    if (k === ek && l === el) { found = true; break; }
    for (let d = 0; d < 4; d++) {
      if (!edgeExists(k, l, d)) continue;
      const nk = k + DIRS[d][0], nl = l + DIRS[d][1], ng = gc + 1;
      if (!g.has(id(nk, nl)) || ng < g.get(id(nk, nl))) {
        g.set(id(nk, nl), ng); from.set(id(nk, nl), [k, l]);
        open.push([ng + Math.abs(ek - nk) + Math.abs(el - nl), ng, nk, nl]);
      }
    }
  }
  const pts = [[bx, bz]];
  if (found) { let c = [ek, el]; while (!(c[0] === sk && c[1] === sl)) { pts.push([c[0] * P, c[1] * P]); c = from.get(id(c[0], c[1])); } pts.push([sk * P, sl * P]); }
  pts.push([ax, az]);
  return pts.reverse();
}

export const worldRand = mulberry32(20261126);
