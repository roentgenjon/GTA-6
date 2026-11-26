// Glatte, organische Charaktermodelle (Skinned Mesh mit weichen Gelenk-Übergängen)
// Rumpf, Arme, Beine, Hände, Schuhe, Kopf mit Gesicht, Haare, Hüte, Kleidung – alles aus gelofteten Röhren und Ellipsoiden.
import * as THREE from 'three';
import { rgb } from './builder.js';

const TAU = Math.PI * 2;
export const BONE = { hips: 0, spine: 1, head: 2, shL: 3, elL: 4, shR: 5, elR: 6, thL: 7, knL: 8, thR: 9, knR: 10 };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sm = (x, a, b) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = (c1, c2, t) => [c1[0] + (c2[0] - c1[0]) * t, c1[1] + (c2[1] - c1[1]) * t, c1[2] + (c2[2] - c1[2]) * t];
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const hash = (a, b = 0, c = 0) => { let n = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return n - Math.floor(n); };
const lerp = (a, b, t) => a + (b - a) * t;
// Tabelle [[y, ...werte]] linear interpolieren (y aufsteigend oder absteigend)
function interp(tbl, y) {
  const asc = tbl[0][0] < tbl[tbl.length - 1][0];
  for (let i = 0; i < tbl.length - 1; i++) {
    const a = tbl[i], b = tbl[i + 1];
    if (asc ? (y >= a[0] && y <= b[0]) : (y <= a[0] && y >= b[0])) { const t = (y - a[0]) / (b[0] - a[0] || 1), s = t * t * (3 - 2 * t), tt = lerp(t, s, 0.5); return a.slice(1).map((v, k) => lerp(v, b[k + 1], tt)); }
  }
  const e = (asc ? y < tbl[0][0] : y > tbl[0][0]) ? tbl[0] : tbl[tbl.length - 1]; return e.slice(1);
}

class Acc {
  constructor() { this.p = []; this.c = []; this.si = []; this.sw = []; this.idx = []; this.n = 0; }
  vert(x, y, z, col, w) {
    this.p.push(x, y, z); this.c.push(col[0], col[1], col[2]);
    const ww = w.length > 4 ? w.slice(0, 4) : w; let s = 0; for (const q of ww) s += q[1];
    for (let i = 0; i < 4; i++) { const q = ww[i]; this.si.push(q ? q[0] : 0); this.sw.push(q ? q[1] / (s || 1) : 0); }
    return this.n++;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeVertexNormals(); g.computeBoundingSphere(); return g;
  }
}
const colOf = (R, a, k) => (typeof R.col === 'function' ? R.col(a, k) : R.col);
const wOf = (R, a, k) => (typeof R.w === 'function' ? R.w(a, k) : R.w);

// Röhre aus elliptischen Ringen. Winkel a=0 zeigt nach vorn (+z), wächst Richtung +x (links der Figur).
function loft(A, rings, seg, opt = {}) {
  const base = A.n, flip = !!opt.flip;
  for (const R of rings) for (let k = 0; k < seg; k++) {
    const a = (k / seg) * TAU, m = R.shape ? R.shape(a) : 1;
    A.vert(R.cx + Math.sin(a) * R.rx * m, R.y, R.cz + Math.cos(a) * R.rz * m, colOf(R, a, k), wOf(R, a, k));
  }
  for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < seg; k++) {
    const k2 = (k + 1) % seg, a = base + i * seg + k, b = base + i * seg + k2, c = base + (i + 1) * seg + k2, d = base + (i + 1) * seg + k;
    if (!flip) { A.tri(a, b, c); A.tri(a, c, d); } else { A.tri(a, c, b); A.tri(a, d, c); }
  }
  const cap = (R, ri, forward) => {
    const ci = A.vert(R.cx, R.y, R.cz, colOf(R, 0, 0), wOf(R, 0, 0)), off = base + ri * seg;
    for (let k = 0; k < seg; k++) { const k2 = (k + 1) % seg; const fw = forward !== flip; if (fw) A.tri(off + k, off + k2, ci); else A.tri(off + k2, off + k, ci); }
  };
  if (opt.capEnd) cap(rings[rings.length - 1], rings.length - 1, true);
  if (opt.capStart) cap(rings[0], 0, false);
}
// Ellipsoid (Gesichtsmerkmale, Hände, Schuhe, Haarknoten …)
function ellipsoid(A, c, r, col, w, opt = {}) {
  const lat = opt.lat || 5, lon = opt.lon || 8, base = A.n;
  const q = opt.rot ? new THREE.Quaternion().setFromEuler(new THREE.Euler(opt.rot[0], opt.rot[1], opt.rot[2])) : null, v = new THREE.Vector3();
  for (let i = 0; i <= lat; i++) for (let j = 0; j < lon; j++) {
    const th = (i / lat) * Math.PI, ph = (j / lon) * TAU, jit = opt.jitter ? 1 + (hash(i, j, opt.seed || 1) - 0.5) * opt.jitter : 1;
    v.set(Math.sin(th) * Math.sin(ph) * r[0] * jit, Math.cos(th) * r[1] * jit, Math.sin(th) * Math.cos(ph) * r[2] * jit);
    if (q) v.applyQuaternion(q);
    const cc = typeof col === 'function' ? col(v.x, v.y, v.z) : col;
    A.vert(c[0] + v.x, c[1] + v.y, c[2] + v.z, cc, w);
  }
  for (let i = 0; i < lat; i++) for (let j = 0; j < lon; j++) {
    const j2 = (j + 1) % lon, a = base + i * lon + j, b = base + i * lon + j2, cc = base + (i + 1) * lon + j2, d = base + (i + 1) * lon + j;
    A.tri(a, cc, b); A.tri(a, d, cc);
  }
}
const W1 = (b) => [[b, 1]];
const blendW = (t, a, b) => (t <= 0.001 ? [[a, 1]] : t >= 0.999 ? [[b, 1]] : [[a, 1 - t], [b, t]]);

// Kopfprofil: [y, rx, rz, cz]
const HEAD = [[1.575, 0.018, 0.022, 0.050], [1.590, 0.040, 0.050, 0.040], [1.615, 0.066, 0.078, 0.020], [1.650, 0.076, 0.092, 0.010], [1.690, 0.079, 0.098, 0.005], [1.730, 0.078, 0.099, 0.0], [1.770, 0.072, 0.094, -0.004], [1.805, 0.058, 0.080, -0.006], [1.830, 0.034, 0.052, -0.006], [1.846, 0.008, 0.016, -0.004]];
const headAt = (y) => interp(HEAD, y);

export function buildBody(look, level = 2) {
  if (level === true) level = 1; if (level === false) level = 2;
  const lite = level < 2, far = level === 0;
  const A = new Acc();
  const fem = !!look.female, F = look.fat || 1, Fl = 0.9 + 0.1 * F;
  const skin = rgb(look.skin), skinSh = mul(skin, 0.86), skinHi = mix(skin, [1, 0.9, 0.85], 0.12);
  const top = rgb(look.topColor), bottom = rgb(look.bottomColor), shoe = rgb(look.shoeColor), shirt = rgb(look.shirt || 0xffffff), tie = rgb(look.tieColor || 0xb0123f);
  const hairC = rgb(look.hairColor), eyeC = rgb(look.eye || 0x3f2c1c), hatC = rgb(look.hatColor != null ? look.hatColor : look.topColor);
  const T = look.top, B = look.bottom, S = look.shoe;
  const SEG = far ? 8 : lite ? 12 : 22, SEGL = far ? 5 : lite ? 7 : 10, SEGH = far ? 8 : lite ? 12 : 20;
  const thin = (arr, keep) => (lite ? arr.filter((v, i) => i === 0 || i === arr.length - 1 || keep(v) || i % (far ? 5 : 2) === 0) : arr);
  const shadeNoise = (k, y) => 0.94 + 0.12 * hash(k, Math.round(y * 200), 7);
  const sleeveLen = { 0: 1.31, 3: 9, 6: 1.30 }; // Kurzarm: Ärmelende (y); 9 = kein Ärmel
  const longSleeve = T === 1 || T === 2 || T === 4 || T === 5;

  // ---------------- Rumpf ----------------
  const TORSO = fem
    ? [[0.84, 0.138, 0.098, 0], [0.90, 0.168, 0.108, 0], [0.97, 0.172, 0.108, 0], [1.05, 0.138, 0.092, 0], [1.10, 0.128, 0.088, 0.002], [1.17, 0.138, 0.095, 0.006], [1.25, 0.150, 0.106, 0.012], [1.32, 0.158, 0.110, 0.012], [1.39, 0.161, 0.098, 0.004], [1.45, 0.152, 0.088, -0.002], [1.49, 0.118, 0.072, -0.004], [1.53, 0.068, 0.056, 0], [1.60, 0.052, 0.048, 0]]
    : [[0.84, 0.150, 0.104, 0], [0.90, 0.172, 0.112, 0], [0.97, 0.176, 0.113, 0], [1.05, 0.160, 0.100, 0], [1.10, 0.157, 0.098, 0], [1.17, 0.166, 0.106, 0.005], [1.25, 0.178, 0.114, 0.010], [1.32, 0.190, 0.118, 0.012], [1.39, 0.196, 0.108, 0.005], [1.45, 0.184, 0.094, -0.002], [1.49, 0.140, 0.076, -0.004], [1.53, 0.075, 0.060, 0], [1.60, 0.056, 0.051, 0]];
  const hem = (T === 4 || T === 5) ? 0.905 : 0.972;
  const neckY = (a) => {
    const fr = Math.max(0, Math.cos(a)), sx = Math.abs(Math.sin(a));
    if (T === 6) return 1.505 - 0.19 * fr * clamp(1 - sx * 3.2, 0, 1);       // offener Kragen
    if (T === 3) return 1.505 - 0.10 * fr;                                   // Tank
    if (T === 2) return 1.52 - 0.012 * fr;                                   // Hemd geschlossen
    if (T === 4) return 1.51 - 0.24 * fr * clamp(1 - sx * 3.0, 0, 1);        // Anzug V
    if (T === 5) return 1.515 - 0.03 * fr;
    return 1.505 - 0.045 * fr;                                               // Rundhals
  };
  const torsoCol = (y, a, k, rxr = 0.16) => {
    const nz = shadeNoise(k, y), fr = Math.cos(a), sx = Math.sin(a), xa = Math.abs(sx) * rxr;
    if (y < hem) { const c = mul(bottom, 0.96 * nz); if (y > hem - 0.07 && (T === 4)) return mul(c, 0.9); return c; }
    if (y > 1.545) return mul(skinSh, 1.0);
    if (y > neckY(a) && xa < (T === 4 || T === 6 ? 0.13 : 0.088)) return mul(skin, y > 1.5 ? 0.97 : 1);
    if (T === 3) { if (Math.abs(sx) > 0.62 && y > 1.36) return skin; return mul(top, nz); }
    if (T === 4) { // Jacke mit Hemd und Krawatte im V-Ausschnitt
      const half = lerp(0.014, 0.085, sm(y, 1.12, 1.48));
      if (fr > 0 && Math.abs(sx * 0.19) < half) { if (Math.abs(sx * 0.19) < 0.012 && y < 1.46 && y > 1.10) return mix(tie, mul(tie, 0.7), hash(k, 3)); return mul(shirt, 0.96 + 0.04 * nz); }
      return mul(top, nz);
    }
    if (T === 5) return mul(top, nz * (y < hem + 0.025 ? 0.7 : 1));
    if (T === 6) { // Blumenmuster
      const f = hash(Math.floor(a * 3.2), Math.floor(y * 9), 5) > 0.7 || (Math.sin(y * 52 + a * 11) * Math.sin(y * 31 - a * 7) > 0.7);
      return f ? mix(top, [1, 0.95, 0.6], 0.8) : mul(top, nz);
    }
    if (T === 2) { if (fr > 0 && Math.abs(sx) < 0.03) return mul(top, 0.92); return mul(top, nz); }
    if (T === 1 && fr > 0.2 && y < 1.2 && y > 1.07 && Math.abs(sx) < 0.55) return mul(top, 0.86 * nz); // Känguru-Tasche
    return mul(top, nz);
  };
  const torsoRings = [];
  const dedupe = (arr, desc) => { const a = arr.slice().sort((p, q) => (desc ? q - p : p - q)); return a.filter((v, i) => i === 0 || Math.abs(v - a[i - 1]) > 0.0009); };
  const ys = dedupe(thin([0.84, 0.90, 0.945, hem - 0.002, hem + 0.002, 1.02, 1.06, 1.10, 1.15, 1.20, 1.25, 1.30, 1.34, 1.38, 1.42, 1.455, 1.485, 1.51, 1.535, 1.57, 1.60].filter((v) => v > 0.835), (v) => Math.abs(v - hem) < 0.01 || v > 1.48), false);
  for (const y of ys) {
    const [rx, rz, cz] = interp(TORSO, y), cloth = y >= hem + 0.001 && y <= 1.52;
    const grow = cloth ? 1.0 + (T === 1 ? 0.045 : T === 4 || T === 5 ? 0.03 : 0.012) : 1;
    torsoRings.push({
      y, cx: 0, cz: cz * (cloth ? 1.0 : 1), rx: rx * F * grow, rz: rz * (0.9 + 0.1 * F) * grow, col: (a, k) => torsoCol(y, a, k, rx * F * grow),
      w: (() => { const t1 = sm(y, 0.94, 1.12), t2 = sm(y, 1.52, 1.60); return t2 > 0 ? blendW(t2, BONE.spine, BONE.head) : blendW(t1, BONE.hips, BONE.spine); })(),
    });
  }
  loft(A, torsoRings, SEG, { capStart: true });
  // Brust (weiblich)
  if (fem && level >= 1) for (const s of [-1, 1]) ellipsoid(A, [s * 0.072, 1.315, 0.086], [0.058, 0.05, 0.047], (x, y, z) => torsoCol(1.32, Math.atan2(s * 0.072 + x, 0.086 + z), 3, 0.15), W1(BONE.spine), { lat: lite ? 4 : 7, lon: lite ? 8 : 14, rot: [0.12, 0, 0] });
  // Hoodie-Kapuze und Kordeln
  if (T === 1 && level >= 1) { ellipsoid(A, [0, 1.525, -0.065], [0.098, 0.05, 0.06], mul(top, 0.92), W1(BONE.spine), { lat: 5, lon: 10 }); for (const s of [-1, 1]) ellipsoid(A, [s * 0.03, 1.42, 0.11], [0.007, 0.07, 0.007], [0.9, 0.9, 0.9], W1(BONE.spine), { lat: 3, lon: 5 }); }
  // Lederjacke/Hemd: Kragen
  if ((T === 5 || T === 2) && level === 2) for (const s of [-1, 1]) ellipsoid(A, [s * 0.036, 1.52, 0.04], [0.03, 0.011, 0.034], mul(top, 0.95), W1(BONE.spine), { lat: 4, lon: 10, rot: [0.25, s * 0.45, 0] });

  const frontZ = (y, grow) => { const [rx, rz, cz] = interp(TORSO, y); return cz + rz * (0.9 + 0.1 * F) * grow + 0.001; };
  if (T === 2 && level === 2) for (const by of [1.14, 1.23, 1.32, 1.41]) ellipsoid(A, [0, by, frontZ(by, 1.012)], [0.0075, 0.0075, 0.0035], [0.95, 0.95, 0.9], W1(BONE.spine), { lat: 3, lon: 8 });
  if (T === 5 && level === 2) { for (let i = 0; i < 9; i++) { const zy = 1.46 - i * 0.045; ellipsoid(A, [0, zy, frontZ(zy, 1.03)], [0.004, 0.024, 0.0025], [0.62, 0.62, 0.64], W1(BONE.spine), { lat: 2, lon: 6 }); } }
  if (T === 4 && level >= 1) { ellipsoid(A, [0, 1.435, frontZ(1.435, 1.0) - 0.004], [0.0125, 0.014, 0.008], tie, W1(BONE.spine), { lat: 4, lon: 8 }); ellipsoid(A, [0, 1.33, frontZ(1.33, 1.0) - 0.006], [0.016, 0.105, 0.0055], tie, W1(BONE.spine), { lat: 5, lon: 8 });
    for (const sg of [-1, 1]) ellipsoid(A, [sg * 0.03, 1.40, frontZ(1.40, 1.03) - 0.003], [0.026, 0.07, 0.006], mul(top, 0.96), W1(BONE.spine), { lat: 5, lon: 8, rot: [0, 0, sg * 0.42] }); }

  // ---------------- Arme ----------------
  const sleeveEnd = longSleeve ? 0.905 : (sleeveLen[T] != null ? sleeveLen[T] : 1.31);
  for (const s of [1, -1]) {
    const shB = s > 0 ? BONE.shL : BONE.shR, elB = s > 0 ? BONE.elL : BONE.elR;
    const ARM = [[1.516, 0.200, 0.016, 0.016], [1.506, 0.209, 0.034, 0.032], [1.492, 0.219, 0.049, 0.047], [1.470, 0.227, 0.057, 0.055], [1.440, 0.232, 0.057, 0.055], [1.380, 0.240, 0.053, 0.051], [1.300, 0.247, 0.048, 0.046], [1.220, 0.253, 0.043, 0.042], [1.170, 0.256, 0.041, 0.041], [1.100, 0.259, 0.043, 0.041], [1.020, 0.263, 0.038, 0.035], [0.940, 0.267, 0.031, 0.028], [0.890, 0.269, 0.027, 0.025]];
    const yy = dedupe(thin([1.516, 1.506, 1.492, 1.47, 1.44, 1.40, 1.36, 1.34, 1.22, 1.17, 1.12, 1.07, 1.02, 0.97, 0.93, 0.895, sleeveEnd + 0.003, sleeveEnd - 0.003].filter((v) => v <= 1.516 && v >= 0.89), (v) => Math.abs(v - sleeveEnd) < 0.01 || v > 1.49 || v < 0.9), true);
    const rings = [];
    for (const y of yy) {
      const [cx, rx, rz] = interp(ARM, y), cloth = (T !== 3 || false) && y >= sleeveEnd + 0.001 && y < 1.5 && !(T === 3), tank = T === 3;
      const clothed = tank ? false : y >= sleeveEnd + 0.001;
      const g = clothed ? (T === 1 ? 1.13 : 1.055) : 1;
      const col = (a, k) => (clothed ? mul(top, (y < sleeveEnd + 0.02 ? 0.82 : 0.97) * shadeNoise(k, y)) : (tank && y > 1.43 ? mul(skin, 0.97) : mul(skin, 0.97 + 0.04 * Math.cos(a))));
      rings.push({ y, cx: s * cx, cz: 0, rx: rx * Fl * g, rz: rz * Fl * g, col, w: (() => { const tE = sm(1.22 - y, 0, 0.10), tS = 0.55 * sm(y, 1.40, 1.50); const base = tE > 0.001 ? blendW(tE, shB, elB) : [[shB, 1]]; if (tS > 0.01 && tE <= 0.001) return [[shB, 1 - tS], [BONE.spine, tS]]; return base; })() });
    }
    loft(A, rings, SEGL, { flip: true, capStart: true });
    // Hand: Handfläche, Finger, Daumen
    const hx = s * 0.272;
    if (lite) ellipsoid(A, [hx, 0.8, 0.006], [0.033, 0.082, 0.017], mul(skin, 0.98), W1(elB), { lat: far ? 3 : 4, lon: far ? 5 : 6 });
    else {
      ellipsoid(A, [hx, 0.835, 0.004], [0.034, 0.058, 0.019], mul(skin, 0.98), W1(elB), { lat: 6, lon: 9 });
      ellipsoid(A, [hx, 0.755, 0.008], [0.031, 0.045, 0.014], skinHi, W1(elB), { lat: 5, lon: 8 });
      ellipsoid(A, [hx - s * 0.034, 0.84, 0.032], [0.011, 0.034, 0.012], skin, W1(elB), { lat: 3, lon: 6, rot: [0.2, 0, s * -0.25] });
    }
  }

  // ---------------- Beine & Schuhe ----------------
  const LEG = [[0.935, 0.088, 0.098, 0.098], [0.87, 0.090, 0.094, 0.096], [0.78, 0.090, 0.086, 0.088], [0.69, 0.088, 0.076, 0.078], [0.60, 0.086, 0.066, 0.068], [0.52, 0.085, 0.058, 0.062], [0.47, 0.085, 0.055, 0.060], [0.42, 0.085, 0.056, 0.062], [0.35, 0.084, 0.061, 0.065], [0.28, 0.083, 0.054, 0.057], [0.20, 0.082, 0.042, 0.045], [0.12, 0.081, 0.036, 0.039], [0.075, 0.081, 0.034, 0.037]];
  const shortsEnd = B === 1 ? 0.60 : B === 4 ? -1 : 0;     // ab hier Haut (Shorts)
  const bootTop = S === 1 ? 0.24 : 0;
  for (const s of [1, -1]) {
    const thB = s > 0 ? BONE.thL : BONE.thR, knB = s > 0 ? BONE.knL : BONE.knR;
    const ylist = dedupe(thin([0.935, 0.90, 0.85, 0.78, 0.70, 0.66, 0.60, 0.55, 0.50, 0.47, 0.43, 0.38, 0.33, 0.28, 0.245, 0.20, 0.17, 0.12, 0.075].concat(B === 1 ? [0.603, 0.597] : [], bootTop ? [bootTop + 0.003, bootTop - 0.003] : []), (v) => Math.abs(v - 0.6) < 0.01 || (bootTop > 0 && Math.abs(v - bootTop) < 0.01) || (v < 0.53 && v > 0.42) || v > 0.93 || v < 0.08), true);
    const rings = [];
    for (const y of ylist) {
      const [cx, rx, rz] = interp(LEG, y);
      const skinLeg = B === 4 || (B === 1 && y < shortsEnd + 0.001) || false;
      const boot = bootTop > 0 && y <= bootTop - 0.001;
      const sneakerCuff = false;
      const pantsC = (a, k) => { const nz = shadeNoise(k, y); let c = mul(bottom, nz); if (B === 0 && y > 0.5 && y < 0.62 && Math.cos(a) > 0.3) c = mul(c, 1.14); if (B === 2) c = mul(c, 0.92 + 0.12 * Math.abs(Math.cos(a * 2))); if (B === 3 && y < 0.14) c = mul(bottom, 0.8); return c; };
      const col = boot ? ((a, k) => mul(shoe, 0.9 * shadeNoise(k, y))) : skinLeg ? ((a, k) => mul(skin, 0.97 + 0.04 * Math.cos(a))) : pantsC;
      const cloth = !skinLeg || boot;
      const g = cloth ? (B === 3 ? 1.07 : B === 2 ? 1.05 : 1.045) : 1;
      const tK = sm(0.52 - y, 0, 0.09), tH = sm(y, 0.84, 0.95) * 0.55;
      const w = (() => { let base = tK > 0.001 ? blendW(tK, thB, knB) : [[thB, 1]]; if (tH > 0.01 && tK <= 0.001) return [[thB, 1 - tH], [BONE.hips, tH]]; return base; })();
      rings.push({ y, cx: s * cx, cz: 0, rx: rx * Fl * g, rz: rz * Fl * g, col, w });
    }
    loft(A, rings, SEGL, { flip: true, capStart: true });
    // Schuh
    const fx = s * 0.081;
    const shoeCol = S === 3 ? skin : (S === 2 ? mul(shoe, 0.8) : S === 1 ? mul(shoe, 0.85) : shoe);
    const sole = S === 0 ? [0.93, 0.93, 0.9] : S === 3 ? mul(shoe, 0.9) : [0.08, 0.08, 0.08];
    const lat = lite ? 4 : 6, lon = lite ? 7 : 10;
    if (far) { ellipsoid(A, [fx, 0.04, 0.05], [0.047, 0.04, 0.125], S === 3 ? skin : shoeCol, W1(knB), { lat: 3, lon: 6 }); ellipsoid(A, [fx, 0.012, 0.035], [0.05, 0.014, 0.148], sole, W1(knB), { lat: 2, lon: 6 }); }
    else if (S === 3) { // Flip-Flops: nackter Fuß + Sohle + Riemen
      ellipsoid(A, [fx, 0.05, 0.035], [0.042, 0.03, 0.105], skin, W1(knB), { lat, lon });
      ellipsoid(A, [fx, 0.012, 0.045], [0.048, 0.01, 0.125], sole, W1(knB), { lat: 3, lon });
      ellipsoid(A, [fx, 0.068, 0.04], [0.045, 0.006, 0.012], mul(shoe, 1.1), W1(knB), { lat: 3, lon: 6, rot: [0, 0, 0] });
    } else {
      ellipsoid(A, [fx, 0.058, -0.012], [0.045, 0.052, 0.078], shoeCol, W1(knB), { lat, lon });                // Ferse/Knöchel
      ellipsoid(A, [fx, 0.038, 0.085], [0.047, 0.036, S === 2 ? 0.125 : 0.108], shoeCol, W1(knB), { lat, lon }); // Vorderfuß
      ellipsoid(A, [fx, 0.012, 0.035], [0.05, 0.014, 0.148], sole, W1(knB), { lat: 3, lon });                    // Sohle
      if (S === 0) ellipsoid(A, [fx, 0.082, 0.05], [0.026, 0.008, 0.04], [0.9, 0.9, 0.9], W1(knB), { lat: 3, lon: 6 }); // Schnürung
      if (S === 1) ellipsoid(A, [fx, 0.012, -0.045], [0.048, 0.02, 0.03], [0.1, 0.1, 0.1], W1(knB), { lat: 3, lon: 6 });  // Absatz
    }
  }
  // Rock
  if (B === 4) {
    const rings = [];
    for (const [y, rx, rz] of [[1.02, 0.176, 0.12], [0.96, 0.185, 0.125], [0.86, 0.215, 0.16], [0.74, 0.235, 0.19], [0.62, 0.25, 0.21], [0.60, 0.25, 0.21]]) rings.push({ y, cx: 0, cz: 0, rx: rx * F, rz, col: (a, k) => mul(bottom, shadeNoise(k, y)), w: [[BONE.hips, 0.75], [BONE.thL, 0.125], [BONE.thR, 0.125]] });
    loft(A, rings, SEG, { flip: true });
  }

  // ---------------- Kopf ----------------
  const stubble = !fem && look.hair !== 0 && hash(look.skin, look.hairColor, 9) > 0.55;
  const headRings = HEAD.map(([y, rx, rz, cz]) => ({ y, cx: 0, cz, rx, rz, col: (a, k) => { const fr = Math.max(0, Math.cos(a)); let c = mul(skin, 0.98 + 0.03 * Math.cos(a)); if (stubble && y < 1.645 && y > 1.585 && fr > 0.05) c = mix(c, hairC, 0.2 * sm(1.645 - y, 0, 0.03)); if (y > 1.6 && y < 1.68 && fr > 0.5) c = mix(c, [0.9, 0.5, 0.45], 0.06 * (fem ? 1.6 : 0.8)); if (!fem && y < 1.63 && fr > 0.3) c = mul(c, 0.97); return c; }, w: W1(BONE.head) }));
  loft(A, headRings, SEGH, { capStart: true, capEnd: true });
  const HEADW = W1(BONE.head);
  // Augen, Brauen, Nase, Mund, Ohren
  if (level === 2) {
  for (const s of [-1, 1]) {
    ellipsoid(A, [s * 0.031, 1.705, 0.084], [0.0145, 0.0105, 0.011], [0.93, 0.93, 0.92], HEADW, { lat: 4, lon: 8 });
    ellipsoid(A, [s * 0.031, 1.705, 0.0935], [0.0078, 0.0078, 0.0045], eyeC, HEADW, { lat: 3, lon: 8 });
    ellipsoid(A, [s * 0.031, 1.705, 0.0975], [0.0036, 0.0036, 0.002], [0.02, 0.02, 0.02], HEADW, { lat: 2, lon: 6 });
    ellipsoid(A, [s * 0.034, 1.735, 0.09], [0.024, 0.0055, 0.009], fem ? mul(hairC, 0.8) : mul(hairC, 0.75), HEADW, { lat: 3, lon: 6, rot: [0, 0, s * -0.12] });
    ellipsoid(A, [s * 0.0765, 1.683, -0.004], [0.0075, 0.026, 0.017], mul(skin, 0.93), HEADW, { lat: 4, lon: 7 });
    if (fem) ellipsoid(A, [s * 0.031, 1.72, 0.092], [0.016, 0.0028, 0.006], [0.03, 0.03, 0.03], HEADW, { lat: 2, lon: 6 });
  }
  ellipsoid(A, [0, 1.692, 0.097], [0.0075, 0.025, 0.011], mul(skin, 0.99), HEADW, { lat: 3, lon: 7 });
  ellipsoid(A, [0, 1.670, 0.108], [0.0125, 0.014, 0.0145], mul(skin, 0.96), HEADW, { lat: 4, lon: 8 });
  for (const s of [-1, 1]) ellipsoid(A, [s * 0.009, 1.664, 0.113], [0.0045, 0.004, 0.004], [0.2, 0.1, 0.1], HEADW, { lat: 2, lon: 5 });
  const lipC = fem ? [0.62, 0.13, 0.17] : mix(skin, [0.62, 0.3, 0.3], 0.5);
  ellipsoid(A, [0, 1.6375, 0.0935], [0.0215, 0.0055, 0.0085], lipC, HEADW, { lat: 3, lon: 8 });
  ellipsoid(A, [0, 1.628, 0.0925], [0.0185, 0.0058, 0.0085], mul(lipC, 1.1), HEADW, { lat: 3, lon: 8 });
  ellipsoid(A, [0, 1.6325, 0.0965], [0.0195, 0.0013, 0.004], [0.12, 0.04, 0.05], HEADW, { lat: 2, lon: 8 });

  } else if (level === 1) {
    for (const s of [-1, 1]) ellipsoid(A, [s * 0.031, 1.705, 0.092], [0.011, 0.009, 0.008], [0.06, 0.05, 0.05], HEADW, { lat: 2, lon: 6 });
    ellipsoid(A, [0, 1.670, 0.108], [0.0125, 0.014, 0.0145], mul(skin, 0.96), HEADW, { lat: 3, lon: 6 });
  }
  // ---------------- Haare ----------------
  const hairStyle = (look.hat && look.hair === 6) ? 1 : (look.hat && look.hair === 5) ? 2 : look.hair, hcol = (k, y, dark = 1) => mul(hairC, (0.84 + 0.3 * hash(k, Math.round(y * 160), 11)) * dark);
  const shell = (yBottomBack, yBottomFront, grow, dark = 1, yTop0 = 1.848) => {
    const yTop = look.hat ? Math.min(yTop0, 1.775) : yTop0;
    const rings = [], n = lite ? 7 : 10;
    for (let i = 0; i <= n; i++) {
      const y = lerp(yBottomBack, yTop, i / n), [rx, rz, cz] = headAt(Math.min(y, 1.845));
      rings.push({
        y, cx: 0, cz, rx: rx * grow + 0.003, rz: rz * grow + 0.003, w: HEADW, col: (a, k) => hcol(k, y, dark),
        shape: (a) => { const fr = Math.cos(a), hl = lerp(yBottomBack + 0.012, yBottomFront, sm(fr, 0.15, 0.95)); return 0.86 + (1 - 0.86 / 1) * 0.0 + (1.0 - 0.86) * sm(y, hl - 0.012, hl + 0.014); },
      });
    }
    loft(A, rings, lite ? 14 : 26, { capEnd: true });
  };
  if (hairStyle === 1) shell(1.665, 1.782, 1.045);
  else if (hairStyle === 2) shell(1.69, 1.775, 1.012, 0.8);
  else if (hairStyle === 3) { // lang
    shell(1.53, 1.782, 1.05);
    const rings = [];
    for (const [y, rx, rz, cz] of [[1.72, 0.088, 0.03, -0.086], [1.62, 0.105, 0.04, -0.092], [1.50, 0.12, 0.048, -0.094], [1.38, 0.125, 0.05, -0.088], [1.28, 0.112, 0.045, -0.078]]) rings.push({ y, cx: 0, cz, rx, rz, w: [[BONE.head, y > 1.5 ? 1 : 0.5], [BONE.spine, y > 1.5 ? 0 : 0.5]], col: (a, k) => hcol(k, y, 0.95) });
    loft(A, rings, lite ? 10 : 18, { flip: true, capStart: true, capEnd: true });
    for (const s of [-1, 1]) { const rr = []; for (const [y, cx, cz, r] of [[1.745, s * 0.083, 0.02, 0.016], [1.69, s * 0.086, 0.016, 0.02], [1.62, s * 0.089, 0.01, 0.022], [1.55, s * 0.09, 0.002, 0.02], [1.49, s * 0.088, -0.008, 0.013], [1.45, s * 0.087, -0.012, 0.004]]) rr.push({ y, cx, cz, rx: r, rz: r * 1.2, w: HEADW, col: (a, k) => hcol(k, y, 1.0) }); loft(A, rr, 10, { flip: true, capEnd: true }); }
  } else if (hairStyle === 4) { // Pferdeschwanz
    shell(1.665, 1.782, 1.045);
    const rr = []; for (const [y, cz, r] of [[1.775, -0.092, 0.03], [1.74, -0.125, 0.034], [1.66, -0.15, 0.036], [1.56, -0.155, 0.03], [1.47, -0.15, 0.018], [1.43, -0.148, 0.006]]) rr.push({ y, cx: 0, cz, rx: r, rz: r, w: [[BONE.head, y > 1.6 ? 1 : 0.6], [BONE.spine, y > 1.6 ? 0 : 0.4]], col: (a, k) => hcol(k, y, 0.95) });
    loft(A, rr, 8, { flip: true, capStart: true, capEnd: true });
    ellipsoid(A, [0, 1.775, -0.098], [0.022, 0.014, 0.022], mul(hairC, 0.5), HEADW, { lat: 3, lon: 7 });
  } else if (hairStyle === 5) { // Irokese
    shell(1.70, 1.78, 1.012, 0.7);
    for (let i = 0; i < 7; i++) { const t = i / 6; ellipsoid(A, [0, lerp(1.83, 1.835, Math.sin(t * 3.14)) + 0.025, lerp(0.07, -0.085, t)], [0.011, 0.045 - 0.012 * Math.abs(t - 0.45), 0.026], hcol(i, 1.9, 1.1), HEADW, { lat: 3, lon: 6 }); }
  } else if (hairStyle === 6) { // Afro
    ellipsoid(A, [0, 1.795, -0.012], [0.138, 0.128, 0.142], (x, y, z) => hcol(Math.floor(x * 80 + z * 53), 1.8 + y, 1), HEADW, { lat: lite ? 6 : 9, lon: lite ? 10 : 16, jitter: 0.07, seed: 3 });
  } else if (hairStyle === 7) { // Dutt
    shell(1.665, 1.782, 1.045);
    ellipsoid(A, [0, 1.855, -0.065], [0.048, 0.044, 0.048], hcol(2, 1.85, 0.95), HEADW, { lat: 5, lon: 9, jitter: 0.06 });
  }

  // ---------------- Kopfbedeckung ----------------
  const hatDome = (y0, y1, grow, col, shape = (t) => 1 - t * t) => {
    const rings = [], n = lite ? 5 : 8;
    for (let i = 0; i <= n; i++) { const t = i / n, y = lerp(y0, y1, t), [rx, rz, cz] = headAt(Math.min(y, 1.844)); const m = Math.max(0.12, shape(t)); rings.push({ y, cx: 0, cz, rx: (rx * grow + 0.004) * m + 0.002, rz: (rz * grow + 0.004) * m + 0.002, w: HEADW, col: (a, k) => mul(col, 0.94 + 0.08 * hash(k, i, 4)) }); }
    loft(A, rings, lite ? 12 : 18, { capEnd: true });
  };
  if (look.hat === 1) { hatDome(1.762, 1.866, 1.11, hatC, (t) => Math.sqrt(1 - t * t * 0.9)); ellipsoid(A, [0, 1.77, 0.112], [0.071, 0.0035, 0.06], mul(hatC, 0.9), HEADW, { lat: 3, lon: 12, rot: [0.14, 0, 0] }); ellipsoid(A, [0, 1.868, 0], [0.008, 0.006, 0.008], mul(hatC, 0.8), HEADW, { lat: 3, lon: 6 }); if (look.hatColor === 0x1d2c4a) ellipsoid(A, [0, 1.8, 0.1], [0.012, 0.01, 0.003], [0.9, 0.75, 0.2], HEADW, { lat: 3, lon: 6 }); }
  else if (look.hat === 2) { hatDome(1.742, 1.872, 1.12, hatC, (t) => Math.sqrt(1 - t * t)); ellipsoid(A, [0, 1.75, -0.005], [0.093, 0.016, 0.109], mul(hatC, 0.85), HEADW, { lat: 3, lon: 14 }); }
  else if (look.hat === 3) { hatDome(1.775, 1.89, 1.1, [0.23, 0.17, 0.11], (t) => 1 - 0.5 * t * t - (t > 0.8 ? 0.15 : 0)); ellipsoid(A, [0, 1.776, 0], [0.165, 0.005, 0.178], [0.2, 0.15, 0.1], HEADW, { lat: 3, lon: 16 }); ellipsoid(A, [0, 1.796, 0], [0.087, 0.009, 0.1], [0.07, 0.05, 0.04], HEADW, { lat: 3, lon: 14 }); }
  else if (look.hat === 4) { hatDome(1.715, 1.885, 1.2, hatC, (t) => Math.sqrt(1 - t * t * 0.95)); ellipsoid(A, [0, 1.73, 0.05], [0.1, 0.012, 0.12], mul(hatC, 0.75), HEADW, { lat: 3, lon: 12 }); }
  if (look.glasses && level >= 1) {
    for (const s of [-1, 1]) { ellipsoid(A, [s * 0.031, 1.705, 0.1], [0.0205, 0.0135, 0.004], [0.02, 0.02, 0.025], HEADW, { lat: 4, lon: 14 }); ellipsoid(A, [s * 0.0775, 1.703, 0.045], [0.003, 0.004, 0.05], [0.04, 0.04, 0.04], HEADW, { lat: 2, lon: 5 }); }
    ellipsoid(A, [0, 1.71, 0.101], [0.008, 0.003, 0.003], [0.04, 0.04, 0.04], HEADW, { lat: 2, lon: 5 });
  }
  return A.build();
}
