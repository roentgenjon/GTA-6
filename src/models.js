// Prozedurale Fahrzeugmodelle
import * as THREE from 'three';
import { Builder, rgb } from './builder.js';
import { M } from './materials.js';
import { ExtrudeGeometry } from 'three';
import * as T from './textures.js';

const wheelCache = new Map();
function wheelGeom(r, w, rimCol = 0xc9ccd1) {
  const key = r.toFixed(2) + w.toFixed(2) + rimCol;
  if (wheelCache.has(key)) return wheelCache.get(key);
  const b = new Builder();
  b.cylX(0, 0, 0, r, w, 14, 0x141414);
  b.cylX(0, 0, 0, r * 0.62, w + 0.02, 10, rimCol);
  b.cylX(0, 0, 0, r * 0.2, w + 0.04, 6, 0x555a60);
  for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; b.box(0, Math.cos(a) * r * 0.32, Math.sin(a) * r * 0.32, w + 0.03, 0.05, r * 0.5, rimCol); }
  const g = b.build();
  wheelCache.set(key, g); return g;
}
const bodyCache = new Map();

function paintAttr(geo, c1, c2, belt) {
  const pos = geo.attributes.position, n = pos.count, col = new Float32Array(n * 3);
  const a = rgb(c1), b = c2 != null ? rgb(c2) : a;
  for (let i = 0; i < n; i++) { const hi = pos.getY(i) > belt; const c = hi ? b : a; col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2]; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}
function poly(B, pts, z, col = 0x0a1016) {
  for (let k = 1; k < pts.length - 1; k++) { B.tri([pts[0][0], pts[0][1], z], [pts[k][0], pts[k][1], z], [pts[k + 1][0], pts[k + 1][1], z], col); }
}
function lightBox(B, x, y, z, w, h, d, col) { B.box(x, y, z, w, h, d, col); }

// ---------- PKW-Karosserie ----------
function carBody(s, opts) {
  const [f1, f2, f3, f4, yT, yH, yN, yR0] = s.prof, L = s.L, W = s.W, cl = s.cl;
  const X = (f) => (f - 0.5) * L;
  const open = !!s.flags.open;
  const hs = s.H / s.prof[7];
  const yTT = yT * hs, yHH = yH * hs, yNN = yN * hs;
  const yR = open ? yHH + 0.22 : yR0 * hs;
  const nose = 0.06 + Math.max(0, yHH - yNN) * 0.4;
  const pts = [[X(0), cl], [X(0), yTT], [X(f1), yTT + 0.02], [X(f2), yR], [X(f3), yR], [X(f4), yHH + 0.03], [X(1) - nose, yHH], [X(1), yNN], [X(1), cl]];
  const bt = 0.07;
  const shape = new THREE.Shape(); shape.moveTo(pts[0][0] * 1 + 0.0, pts[0][1]);
  for (let k = 1; k < pts.length; k++) shape.lineTo(pts[k][0], pts[k][1]);
  const geo = new ExtrudeGeometry(shape, { depth: W - bt * 2, bevelEnabled: true, bevelThickness: bt, bevelSize: 0.06, bevelOffset: -0.06, bevelSegments: 2, curveSegments: 1, steps: 1 });
  geo.translate(0, 0, -(W - bt * 2) / 2);
  geo.rotateY(-Math.PI / 2);
  geo.computeVertexNormals();
  // Glas
  const G = new Builder();
  const belt = Math.max(yTT, yHH) + 0.04;
  const sw = W / 2 + 0.012;
  if (!open) {
    const rb = X(f1) + (X(f2) - X(f1)) * 0.0 + 0.28, fb = X(f4) - 0.12;
    const pillar = X((f2 + f3) / 2);
    const rTop = yR - 0.08, ex = 0.04;
    const rear = [[rb, belt], [X(f2) + 0.12, rTop], [pillar - 0.035, rTop], [pillar - 0.035, belt]];
    const front = [[pillar + 0.035, belt], [pillar + 0.035, rTop], [X(f3) - 0.02, rTop], [fb, belt]];
    if (f2 - f1 < 0.06) { rear[0][0] = X(f1) + 0.12; }
    for (const side of [1, -1]) { poly(G, rear, side * sw); poly(G, front, side * sw); }
    // Windschutz & Heckscheibe
    const wsA = [X(f3) + 0.02, yR - 0.04], wsB = [X(f4) + 0.045, yHH + 0.05];
    const nx = (wsA[1] - wsB[1]), ny = -(wsA[0] - wsB[0]); const nl = Math.hypot(nx, ny) || 1; const off = 0.1;
    const ox = nx / nl * off, oy = ny / nl * off;
    const ww = W * 0.43;
    G.quad([wsB[0] + ox, wsB[1] + oy, -ww - 0.04], [wsB[0] + ox, wsB[1] + oy, ww + 0.04], [wsA[0] + ox, wsA[1] + oy, ww], [wsA[0] + ox, wsA[1] + oy, -ww], 0x0a1016);
    const raA = [X(f2) - 0.01, yR - 0.04], raB = [X(f1) + 0.03, yTT + 0.06];
    const rx = (raB[1] - raA[1]), ry = -(raB[0] - raA[0]); const rl = Math.hypot(rx, ry) || 1;
    const rox = -rx / rl * 0.1 * Math.sign(1), roy = -ry / rl * 0.1;
    G.quad([raB[0] - 0.1, raB[1] + 0.0, ww + 0.04], [raB[0] - 0.1, raB[1] + 0.0, -ww - 0.04], [raA[0] - 0.1, raA[1], -ww], [raA[0] - 0.1, raA[1], ww], 0x0a1016);
  } else {
    // offene Karosserie: Windschutz + Sitze
    const wsA = [X(f3) - 0.1, yR], wsB = [X(f4) + 0.02, yHH + 0.05];
    G.quad([wsB[0], wsB[1], -W * 0.42], [wsB[0], wsB[1], W * 0.42], [wsA[0], wsA[1], W * 0.42], [wsA[0], wsA[1], -W * 0.42], 0x0a1016);
  }
  const glass = G.build(); glass.rotateY(-Math.PI / 2);
  // Details (Scheinwerfer, Rücklichter, Grill, Spiegel, Spoiler, Kennzeichen)
  const D = new Builder();
  const lx = W / 2 - 0.3;
  D.box(0, yNN * 0.7 + 0.12, L / 2 + 0.02, W * 0.5, 0.17, 0.05, 0x101214); // Grill
  D.box(0, cl + 0.12, L / 2 + 0.01, W * 0.8, 0.12, 0.06, 0x1a1c20); // Frontspoilerlippe
  D.box(0, cl + 0.1, -L / 2 - 0.01, W * 0.8, 0.12, 0.06, 0x1a1c20);
  for (const m of [-1, 1]) { D.box(m * (W / 2 + 0.1), belt + 0.1, X(f4) - 0.1, 0.12, 0.1, 0.18, opts.c1); }
  if (s.cls === 'super' || s.cls === 'sport' && (s.seed % 3 === 0)) { D.box(0, yTT + 0.28, -L / 2 + 0.2, W * 0.88, 0.05, 0.3, 0x111111); for (const m of [-1, 1]) D.box(m * W * 0.36, yTT + 0.14, -L / 2 + 0.22, 0.05, 0.26, 0.2, 0x111111); }
  if (s.cls === 'muscle') D.box(0, yHH + 0.03, X(0.78), 0.5, 0.1, 0.8, 0x1a1a1a); // Hutze
  if (s.cls === 'suv' || s.cls === 'pickup') { D.box(0, yR + 0.04, 0, W * 0.8, 0.05, L * 0.4, 0x15171a); D.box(0, cl + 0.22, L / 2 + 0.05, W * 0.9, 0.2, 0.1, 0x222426); }
  { const wbb = L * 0.6; for (const zz of [wbb / 2, -wbb / 2]) for (const mm of [-1, 1]) D.cylX(mm * (W / 2 + 0.012), s.wr, zz, s.wr + 0.08, 0.03, 12, 0x0a0a0a); }
  { const mid = X((f2 + f3) / 2), sd = 0x2b2b2f, by = belt - 0.36;
    for (const sx of [-0.4, 0.4]) { D.box(sx, by, mid, 0.46, 0.14, 0.5, sd); D.box(sx, belt - 0.06, mid - 0.24, 0.46, 0.55, 0.1, sd); }
    D.box(0, by, X(f2) + 0.45, W - 0.6, 0.14, 0.5, sd); D.box(0, belt - 0.06, X(f2) + 0.22, W - 0.6, 0.5, 0.1, sd);
    D.box(0, belt - 0.14, X(f4) - 0.12, W - 0.4, 0.16, 0.42, 0x18181a); D.box(0.4, belt + 0.0, X(f4) - 0.42, 0.34, 0.05, 0.3, 0x0e0e0e); D.box(0.4, belt - 0.12, X(f4) - 0.36, 0.05, 0.22, 0.05, 0x222); }
  // Türfugen
  for (const m of [-1, 1]) { D.box(m * (W / 2 + 0.005), (cl + belt) / 2 + 0.05, X((f2 + f3) / 2), 0.01, belt - cl - 0.1, 0.012, 0x0d0d0d); D.box(m * (W / 2 + 0.005), belt - 0.12, X((f2 + f3) / 2) + 0.25, 0.012, 0.03, 0.2, 0x303030); }
  // Pickup-Ladefläche
  if (s.cls === 'pickup') {
    const bx = X(f1 / 2), bl = L * f1 - 0.2;
    D.box(0, yTT + 0.02, bx, W - 0.3, 0.04, bl, 0x16181b);
    for (const m of [-1, 1]) D.box(m * (W / 2 - 0.06), yTT + 0.22, bx, 0.1, 0.4, bl, opts.c1);
    D.box(0, yTT + 0.22, -L / 2 + 0.05, W - 0.1, 0.4, 0.1, opts.c1);
    D.box(0, yTT + 0.22, X(f1) - 0.05, W - 0.2, 0.4, 0.08, opts.c1);
  }
  if (s.special === 'taxi') { D.box(0, yR + 0.14, X((f2 + f3) / 2), 0.55, 0.2, 0.22, 0xfff0a0); }
  const detail = D.build();
  const lights = new Builder();
  // Lichter: x quer, z längs
  const headY = yNN * 0.85 + 0.12;
  for (const m of [-1, 1]) { lights.box(m * lx, headY, L / 2 - 0.02, 0.3, 0.12, 0.08, 0xffffff); }
  const tail = new Builder();
  for (const m of [-1, 1]) { tail.box(m * lx, yTT - 0.08, -L / 2 + 0.01, 0.34, 0.1, 0.06, 0xff2020); }
  tail.box(0, yTT - 0.08, -L / 2 + 0.01, W - 0.9, 0.04, 0.05, 0xaa1010);
  return { geo, glass, detail, lights: lights.build(), tail: tail.build(), belt, yR, extra: null, headY, yTT, yHH, topY: yR, lx };
}

// ---------- Kasten-/Schwerfahrzeuge ----------
function heavyBody(s, opts) {
  const L = s.L, W = s.W, H = s.H, cl = s.cl;
  const B = new Builder(), Gb = new Builder(), D = new Builder();
  const c1 = opts.c1, c2 = opts.c2 != null ? opts.c2 : opts.c1;
  const glass = 0x0a1016;
  if (s.cls === 'bus') {
    const dd = !!s.flags.dd, bh = dd ? 4.1 : 3.2;
    B.box(0, cl + (bh - cl) / 2, 0, W, bh - cl, L, c1); B.box(0, cl + 0.5, 0, W + 0.05, 0.5, L - 0.2, c2);
    const rows = dd ? [1.5, 3.0] : [1.9];
    for (const y of rows) for (const m of [-1, 1]) Gb.box(m * (W / 2 + 0.01), y + 0.35, 0.3, 0.02, 0.9, L - 2.2, glass);
    Gb.box(0, 1.9, L / 2 + 0.01, W - 0.3, 1.2, 0.02, glass);
    for (const m of [-1, 1]) D.box(m * (W / 2 + 0.02), 1.2, L / 2 - 1.6, 0.03, 2.0, 1.1, 0x222a30);
    D.box(0, bh + 0.08, 0, W - 0.3, 0.16, L - 1, 0xcfd3d6);
  } else {
    // Fahrerhaus vorn
    const cabL = s.id === 'firetruck' ? 2.4 : 2.1, cabH = H * (s.id === 'firetruck' ? 0.72 : 0.78);
    const cz = L / 2 - cabL / 2;
    B.box(0, cl + (cabH - cl) / 2 + 0.2, cz, W, cabH - cl - 0.2, cabL, c1);
    B.box(0, cl + 0.5, L / 2 - 0.3, W - 0.1, 0.6, 0.6, c1);
    Gb.box(0, cabH - 0.6, L / 2 - 0.02, W - 0.25, 0.9, 0.02, glass);
    for (const m of [-1, 1]) Gb.box(m * (W / 2 + 0.01), cabH - 0.6, cz + 0.1, 0.02, 0.85, cabL - 0.5, glass);
    // Chassis
    B.box(0, cl + 0.2, -0.5, W - 0.5, 0.4, L - cabL - 0.3, 0x2b2d31);
    const rl = L - cabL - 0.3, rz = -L / 2 + rl / 2;
    const f = s.flags;
    if (s.id === 'firetruck') { B.box(0, cl + 1.3, rz, W - 0.1, 1.9, rl, c1); B.box(0, cl + 2.35, rz, 0.5, 0.2, rl - 0.5, 0xdddddd); for (const m of [-1, 1]) D.box(m * (W / 2 + 0.02), cl + 1.2, rz, 0.03, 1.1, rl - 0.8, 0xd8d8d8); D.box(0, cabH + 0.1, cz - 0.1, 1.4, 0.18, 0.3, 0xff2020); }
    else if (s.id === 'army') { B.box(0, cl + 1.55, rz, W - 0.1, 2.2, rl, 0x4b5a3a); B.box(0, cl + 2.75, rz, W - 0.5, 0.2, rl - 0.2, 0x3e4b30); }
    else if (f.tank) { B.cylZ(0, cl + 1.6, rz, 1.15, rl, 14, 0xcfd2d6); }
    else if (f.flat) { B.box(0, cl + 0.55, rz, W, 0.2, rl, 0x6a5a48); for (let k = 0; k < 3; k++) B.box(0, cl + 1.0, rz - 1.6 + k * 1.6, 1.8, 0.8, 1.2, [0x8a5a2a, 0xa0522d, 0x5d6d7e][k]); }
    else if (s.id === 'truck_4' || s.name.startsWith('Garbage')) { B.box(0, cl + 1.4, rz, W - 0.1, 1.8, rl, 0x2d7a3a); D.box(0, cl + 2.35, rz, 1.0, 0.2, rl, 0x1d4f26); }
    else { B.box(0, cl + 1.55, rz, W - 0.05, 2.5, rl, f.box === false ? c2 : 0xf0f0ee); B.box(0, cl + 2.85, rz, W - 0.05, 0.08, rl, 0xdddddd); D.box(0, cl + 1.55, rz, W + 0.02, 0.5, rl - 0.1, c2 !== c1 ? c2 : 0x2a6fd0); }
  }
  const geo = B.build(); const glassG = Gb.build();
  const lights = new Builder(), tail = new Builder();
  for (const m of [-1, 1]) { lights.box(m * (W / 2 - 0.35), cl + 0.8, L / 2 + 0.02, 0.4, 0.2, 0.05, 0xffffff); tail.box(m * (W / 2 - 0.3), cl + 0.8, -L / 2 - 0.01, 0.35, 0.2, 0.05, 0xff2020); }
  return { geo, glass: glassG, detail: D.build(), lights: lights.build(), tail: tail.build(), belt: 1, yR: H, topY: H, headY: cl + 0.8, lx: W / 2 - 0.35, baked: true };
}

// ---------- Motorrad ----------
function bikeModel(s, opts, root) {
  const B = new Builder(), c1 = opts.c1, f = s.flags;
  const wr = s.wr, L = s.L;
  const fz = L / 2 - wr, rz = -L / 2 + wr;
  B.box(0, 0.62, 0.05, 0.14, 0.12, 0.7, 0x2a2a2e); // Rahmen
  B.box(0, 0.78, 0.18, 0.26, 0.24, 0.5, c1); // Tank
  B.box(0, 0.74, -0.38, 0.22, 0.1, 0.7, 0x1b1b1b); // Sitz
  B.box(0, 0.5, 0.0, 0.3, 0.3, 0.4, 0x555a60); // Motor
  B.box(0, 0.58, rz + 0.2, 0.12, 0.12, 0.6, 0x2a2a2e);
  if (f.scooter) { B.box(0, 0.4, 0.0, 0.3, 0.1, 0.9, c1); B.box(0, 0.8, fz - 0.15, 0.3, 0.5, 0.18, c1); B.box(0, 0.62, -0.55, 0.35, 0.3, 0.5, c1); }
  else { B.box(0, 0.42, rz + 0.1, 0.14, 0.2, 0.5, c1); B.box(0, 0.3, -0.15, 0.1, 0.12, 0.5, 0x888d93); }
  const fork = new Builder();
  fork.box(0, wr + 0.12, 0.0, 0.1, 0.62, 0.08, 0xb0b4ba);
  fork.box(0, wr + 0.5, 0.0, 0.8, 0.05, 0.06, 0x222222);
  fork.box(0, wr + 0.62, 0.1, 0.26, 0.22, 0.14, 0xffffff); // Scheinwerfer
  fork.box(0, wr + 0.5, 0.06, 0.3, 0.1, 0.12, c1);
  const tail = new Builder(); tail.box(0, 0.72, rz - 0.12, 0.2, 0.06, 0.06, 0xff2020);
  const body = new THREE.Mesh(B.build(), M.car(0xffffff)); body.castShadow = true;
  const forkM = new THREE.Mesh(fork.build(), M.shiny); forkM.position.set(0, 0, fz); forkM.castShadow = true;
  return { body, fork: forkM, tailGeo: tail.build(), fz, rz };
}

// ---------- Boote ----------
function loftHull(B, stations, col, colDeck) {
  // stations: {z, w (halbe Breite), top, keel}
  for (let k = 0; k < stations.length - 1; k++) {
    const a = stations[k], b = stations[k + 1];
    // Bord links/rechts
    for (const m of [-1, 1]) {
      const A1 = [m * a.w, a.top, a.z], A2 = [m * a.w * 0.62, a.keel, a.z], B1 = [m * b.w, b.top, b.z], B2 = [m * b.w * 0.62, b.keel, b.z];
      if (m > 0) B.quad(A2, B2, B1, A1, col); else B.quad(B2, A2, A1, B1, col);
      // Unterboden
    }
    B.quad([-a.w * 0.62, a.keel, a.z], [-b.w * 0.62, b.keel, b.z], [b.w * 0.62, b.keel, b.z], [a.w * 0.62, a.keel, a.z], 0x20242a);
    B.quad([-a.w, a.top, a.z], [a.w, a.top, a.z], [b.w, b.top, b.z], [-b.w, b.top, b.z], colDeck);
  }
  const l = stations[0];
  B.quad([-l.w * 0.62, l.keel, l.z], [l.w * 0.62, l.keel, l.z], [l.w, l.top, l.z], [-l.w, l.top, l.z], col);
}
function boatModel(s, opts) {
  const B = new Builder(), G = new Builder(), L = s.L, W = s.W, c1 = opts.c1, f = s.flags;
  const h = s.cls === 'yacht' ? 1.6 : s.cls === 'sail' ? 1.0 : 0.9;
  const st = [{ z: -L / 2, w: W * 0.45, top: h, keel: -0.2 }, { z: -L * 0.3, w: W / 2, top: h, keel: -0.5 }, { z: 0, w: W / 2, top: h, keel: -0.55 }, { z: L * 0.25, w: W * 0.42, top: h + 0.1, keel: -0.4 }, { z: L * 0.42, w: W * 0.2, top: h + 0.25, keel: -0.1 }, { z: L / 2, w: 0.04, top: h + 0.35, keel: 0.15 }];
  if (s.cls === 'jetski') { st.forEach((q) => { q.top *= 0.6; q.keel *= 0.5; }); }
  loftHull(B, st, c1, 0xe8e8e8);
  if (s.cls === 'boat') {
    B.box(0, h + 0.25, -L * 0.12, W * 0.62, 0.5, L * 0.28, 0xf2f2f2); B.box(0, h + 0.55, -L * 0.12, W * 0.66, 0.06, L * 0.3, 0xdddddd);
    G.box(0, h + 0.28, -L * 0.12 + L * 0.14 + 0.01, W * 0.54, 0.34, 0.02, 0x0a1016);
    B.box(0, h + 0.1, -L * 0.42, W * 0.5, 0.25, 0.6, 0x15171a); // Außenborder
    B.box(0, h + 0.12, L * 0.1, 0.8, 0.12, 0.7, 0x2a2a2e);
    if (f.top > 100) B.box(0, h + 0.15, -L * 0.45, W * 0.9, 0.12, 0.35, 0x111111);
  } else if (s.cls === 'jetski') {
    B.box(0, 0.55, -0.4, 0.3, 0.14, 0.9, 0x1a1a1e); B.box(0, 0.78, 0.4, 0.5, 0.06, 0.12, 0x222); B.box(0, 0.7, 0.35, 0.1, 0.3, 0.1, 0x777);
  } else if (s.cls === 'yacht') {
    B.box(0, h + 0.75, -0.5, W * 0.82, 1.5, L * 0.55, 0xf4f4f4); B.box(0, h + 1.9, -0.8, W * 0.66, 0.9, L * 0.36, 0xf4f4f4);
    B.box(0, h + 2.55, -1.0, W * 0.5, 0.2, L * 0.28, 0xdddddd); G.box(0, h + 0.9, -0.5 + L * 0.275 + 0.01, W * 0.7, 0.6, 0.02, 0x0a1016);
    G.box(0, h + 1.9, -0.8 + L * 0.18 + 0.01, W * 0.58, 0.5, 0.02, 0x0a1016);
    for (const m of [-1, 1]) G.box(m * (W * 0.41 + 0.01), h + 0.9, -0.5, 0.02, 0.5, L * 0.5, 0x0a1016);
    B.box(0, h + 2.9, -1.0, 0.1, 1.4, 0.1, 0xcccccc);
  } else if (s.cls === 'sail') {
    B.box(0, h + 0.3, -0.5, W * 0.5, 0.5, 1.8, 0xf2f2f2);
    B.cyl(0, h + 4, 0.8, 0.07, 0.05, 8, 6, 0xcfd2d6, false);
    const sail = new Builder(); const sc = 0xfafafa;
    sail.quad([0, h + 7.8, 0.85], [0, h + 7.8, 0.85], [0, h + 1.2, -L * 0.28], [0, h + 1.2, 0.85], sc); sail.quad([0, h + 1.2, 0.85], [0, h + 1.2, -L * 0.28], [0, h + 7.8, 0.85], [0, h + 7.8, 0.85], sc);
    sail.quad([0, h + 6.5, 1.0], [0, h + 1.5, 1.0], [0, h + 1.5, L * 0.46], [0, h + 6.5, 1.0], sc); sail.quad([0, h + 6.5, 1.0], [0, h + 1.5, L * 0.46], [0, h + 1.5, 1.0], [0, h + 6.5, 1.0], sc);
    B.box(0, h + 1.6, -0.3, 0.1, 0.1, L * 0.5, 0xcccccc);
    return { geo: B.build(), glass: G.build(), extra: new THREE.Mesh(sail.build(), new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 })), headY: 1, lx: 0.6, baked: true, detail: null, lights: new Builder().build(), tail: new Builder().build(), topY: 9 };
  }
  const lights = new Builder(); lights.box(0, h + 0.4, L / 2 - 0.3, 0.2, 0.1, 0.1, 0xffffff);
  const tail = new Builder(); tail.box(0, h + 0.2, -L / 2 + 0.05, 0.3, 0.1, 0.05, 0xff2020);
  return { geo: B.build(), glass: G.build(), lights: lights.build(), tail: tail.build(), detail: null, baked: true, headY: h, lx: 0, topY: h + 2 };
}

// ---------- Flugzeuge & Hubschrauber ----------
function fuselage(B, L, R, col, nose = 0.35, tailTaper = 0.2) {
  const N = 8, st = [];
  for (let k = 0; k <= 8; k++) {
    const t = k / 8, z = -L / 2 + t * L;
    let r = R;
    if (t < 0.5) r = R * (0.25 + 0.75 * Math.pow(t / 0.5, 0.6) * 0.6 + 0.0); if (t < 0.3) r = R * (0.5 + 0.5 * t / 0.3 * 0.8);
    r = t < 0.55 ? R * (0.6 + 0.4 * Math.min(1, t / 0.2)) : R * (1 - (t - 0.55) / 0.45 * (1 - tailTaper));
    if (t > 0.9) r *= 1 - (t - 0.9) * (nose);
    st.push({ z, r });
  }
  const ring = (z, r, cy = 0) => { const pts = []; for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2; pts.push([Math.cos(a) * r, Math.sin(a) * r * 0.9 + cy, z]); } return pts; };
  for (let k = 0; k < st.length - 1; k++) {
    const A = ring(st[k].z, st[k].r), Bq = ring(st[k + 1].z, st[k + 1].r);
    for (let i = 0; i < N; i++) { const j = (i + 1) % N; B.quad(A[j], A[i], Bq[i], Bq[j], col, undefined, 0.8 + 0.2 * Math.cos(i / N * 6.283)); }
  }
}
function planeModel(s, opts) {
  const B = new Builder(), G = new Builder(), L = s.L, W = s.W, c1 = opts.c1, f = s.flags;
  const R = s.cls === 'plane' && f.jet ? 0.7 : f.stunt ? 0.55 : 0.65 * (W > 14 ? 1.7 : 1);
  fuselage(B, L, R, c1, 0.5, 0.25);
  const wingY = f.biplane ? -0.1 : 0.15;
  const wings = (y, span, chord, col) => { B.box(0, y, 0.3, span, 0.1, chord, col); };
  if (f.jet) { // Pfeilflügel
    for (const m of [-1, 1]) B.quad([m * 0.6, 0, 0.8], [m * W / 2, 0.1, -1.4], [m * W / 2, 0.1, -2.0], [m * 0.6, 0, -1.6], 0xe8e8e8), B.quad([m * 0.6, -0.02, -1.6], [m * W / 2, 0.08, -2.0], [m * W / 2, 0.08, -1.4], [m * 0.6, -0.02, 0.8], 0xcccccc);
    for (const m of [-1, 1]) B.cyl(m * 1.1, 0.0, -2.2, 0.35, 0.3, 2.2, 8, 0x888d93, true);
  } else if (f.biplane) { wings(-0.2, W, 1.6, c1); wings(1.4, W * 0.95, 1.5, c1); for (const m of [-1, 1]) for (const k of [0.3, 0.7]) B.box(m * W / 2 * k, 0.6, 0.45, 0.06, 1.7, 0.06, 0x333333); }
  else { wings(wingY, W, f.stunt ? 1.3 : 1.7, 0xf0f0f0); if (f.twin) for (const m of [-1, 1]) { B.cyl(m * W * 0.22, 0.05, 0.9, 0.3, 0.3, 1.8, 8, 0x555a60, true); } }
  // Leitwerk
  B.box(0, 0.95, -L / 2 + 0.45, 0.1, 1.5, 1.1, c1);
  B.box(0, 0.2, -L / 2 + 0.4, W * 0.34, 0.08, 0.9, 0xf0f0f0);
  // Cockpit
  G.box(0, R * 0.62, 0.55, R * 1.3, 0.55, 1.4, 0x0a1016);
  // Fahrwerk
  const gear = []; // als Räder
  const lights = new Builder(); lights.box(0, 0, L / 2 + 0.02, 0.1, 0.1, 0.1, 0xffffff);
  const tail = new Builder(); tail.box(0, 0.9, -L / 2 - 0.05, 0.1, 0.1, 0.1, 0xff2020);
  B.box(-1.2, -0.45, 0.6, 0.1, 0.9, 0.1, 0x444); B.box(1.2, -0.45, 0.6, 0.1, 0.9, 0.1, 0x444); B.box(0, -0.45, L / 2 - 1.4, 0.1, 0.8, 0.1, 0x444);
  return { geo: B.build(), glass: G.build(), lights: lights.build(), tail: tail.build(), detail: null, baked: true, headY: 0, lx: 0, topY: 2.5, propZ: L / 2, twinProp: f.twin, jet: f.jet, wheelPos: [[-1.2, -0.9, 0.6], [1.2, -0.9, 0.6], [0, -0.85, L / 2 - 1.4]] };
}
function heliModel(s, opts) {
  const B = new Builder(), G = new Builder(), c1 = opts.c1, L = s.L, police = s.flags.police;
  const cc = police ? 0x15191f : c1;
  // Rumpf: abgerundet via Box+Blob
  B.box(0, 0.9, 0.5, 1.9, 1.5, 3.2, cc); B.box(0, 0.5, 2.1, 1.5, 1.0, 1.3, cc); B.box(0, 0.8, -1.7, 1.0, 1.0, 1.8, cc);
  B.box(0, 1.1, -4.4, 0.3, 0.5, 4.4, cc); B.box(0, 1.9, -6.5, 0.1, 1.5, 0.9, cc);
  if (police) { B.box(0, 1.0, 0.5, 1.95, 0.25, 3.0, 0xf2f2f2); }
  G.box(0, 1.3, 1.9, 1.7, 1.0, 1.4, 0x0a1016); G.box(0, 1.1, 0.5, 1.95, 0.8, 1.6, 0x0a1016);
  // Kufen
  for (const m of [-1, 1]) { B.box(m * 0.85, -0.25, 0.4, 0.1, 0.08, 4.0, 0x2a2a2e); B.box(m * 0.8, 0.05, 1.4, 0.08, 0.6, 0.08, 0x2a2a2e); B.box(m * 0.8, 0.05, -0.5, 0.08, 0.6, 0.08, 0x2a2a2e); }
  B.cyl(0, 1.85, 0.2, 0.15, 0.15, 0.5, 6, 0x333333, true);
  const lights = new Builder(); lights.box(0, 0.6, 2.8, 0.3, 0.2, 0.1, 0xffffff);
  const tail = new Builder(); tail.box(0, 2.6, -6.6, 0.12, 0.12, 0.12, 0xff2020);
  return { geo: B.build(), glass: G.build(), lights: lights.build(), tail: tail.build(), detail: null, baked: true, headY: 0.6, lx: 0, topY: 3, heli: true };
}

// ---------- Hauptfunktion ----------
export function buildModel(spec, c1, c2) {
  const root = new THREE.Group();
  const opts = { c1, c2 };
  const out = { root, wheels: [], steerWheels: [], spec };
  const kind = spec.kind;
  const specialPaint = spec.special === 'police' && kind === 'car';
  const mat = M.car(0xffffff);
  mat.vertexColors = true;
  if (kind === 'car' || kind === 'bike') { const bl = new THREE.Mesh(new THREE.PlaneGeometry(spec.W * 1.45, spec.L * 1.2), M.blob); bl.rotation.x = -Math.PI / 2; bl.position.y = 0.035; bl.renderOrder = 1; root.add(bl); }
  let parts;
  if (kind === 'car') {
    if (spec.cls === 'truck' || spec.cls === 'bus') parts = heavyBody(spec, opts);
    else {
      const key = spec.id;
      parts = carBody(spec, opts);
    }
  } else if (kind === 'bike') {
    const b = bikeModel(spec, opts, root);
    const bodyMat = M.car(c1); bodyMat.vertexColors = true;
    b.body.material = bodyMat; root.add(b.body); root.add(b.fork);
    out.body = b.body; out.bodyGeo = b.body.geometry; out.bodyMat = bodyMat;
    const wg = wheelGeom(spec.wr, 0.14);
    const fw = new THREE.Mesh(wg, M.shiny); fw.position.set(0, spec.wr, b.fz - 0.0); b.fork.add(fw); fw.position.set(0, spec.wr, 0); out.wheels.push(fw);
    const rw = new THREE.Mesh(wg, M.shiny); rw.position.set(0, spec.wr, b.rz); root.add(rw); out.wheels.push(rw);
    out.steerNode = b.fork; out.fork = b.fork;
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.04), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })); hl.position.set(0, spec.wr + 0.62, 0.18); b.fork.add(hl); out.headMats = [hl.material];
    const tl = new THREE.Mesh(b.tailGeo, new THREE.MeshBasicMaterial({ color: 0x551111, toneMapped: false })); root.add(tl); out.tailMats = [tl.material];
    out.topY = 1.4; out.radius = 0.55; out.hasRider = true;
    return out;
  } else if (kind === 'boat') parts = boatModel(spec, opts);
  else if (kind === 'plane') parts = planeModel(spec, opts);
  else parts = heliModel(spec, opts);

  // Körper
  let bodyGeo = parts.geo;
  if (kind === 'car' && !parts.baked) {
    bodyGeo = parts.geo.clone();
    const two = c2 != null && c2 !== c1;
    paintAttr(bodyGeo, c1, two ? c2 : c1, two ? parts.belt - 0.03 : 99);
  }
  const bodyMat = kind === 'car' ? M.car(0xffffff) : (kind === 'plane' || kind === 'heli' || kind === 'boat' ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.5 }) : M.car(0xffffff));
  if (kind === 'car') bodyMat.vertexColors = true;
  if (parts.baked && kind === 'car') bodyMat.vertexColors = true;
  const body = new THREE.Mesh(bodyGeo, bodyMat); body.castShadow = true; body.receiveShadow = true;
  root.add(body); out.body = body; out.bodyGeo = bodyGeo; out.bodyMat = bodyMat; out.belt = parts.belt;
  if (parts.glass) { const gm = new THREE.Mesh(parts.glass, M.carGlass); M.carGlass.side = THREE.DoubleSide; root.add(gm); out.glass = gm; }
  if (parts.detail) { const dm = new THREE.Mesh(parts.detail, M.flat); dm.castShadow = true; root.add(dm); }
  if (parts.extra) { root.add(parts.extra); }
  // Lichter
  const headMat = new THREE.MeshBasicMaterial({ color: 0x889099, toneMapped: false }), tailMat = new THREE.MeshBasicMaterial({ color: 0x4a1010, toneMapped: false });
  const hm = new THREE.Mesh(parts.lights, new THREE.MeshBasicMaterial({ vertexColors: false, color: 0xffffff, toneMapped: false })); hm.material = headMat;
  const tm = new THREE.Mesh(parts.tail, tailMat); root.add(hm); root.add(tm);
  out.headMats = [headMat]; out.tailMats = [tailMat]; out.topY = parts.topY || spec.H;
  out.radius = spec.W / 2;
  if (kind === 'car') {
    const wr = spec.wr, wx = spec.W / 2 - 0.06, wb = spec.L * 0.6, fzp = spec.L * 0.5 - (spec.L - wb) / 2 - (spec.cls === 'truck' || spec.cls === 'bus' ? 0.1 : 0) * 0;
    let fzz = wb / 2, rzz = -wb / 2;
    if (spec.cls === 'bus') { fzz = spec.L * 0.32; rzz = -spec.L * 0.3; }
    if (spec.cls === 'truck') { fzz = spec.L * 0.34; rzz = -spec.L * 0.32; }
    const wg = wheelGeom(wr, spec.cls === 'super' ? 0.3 : spec.cls === 'truck' || spec.cls === 'bus' ? 0.32 : 0.24);
    const wheelMat = M.shiny;
    const pos = [[wx, fzz, true], [-wx, fzz, true], [wx, rzz, false], [-wx, rzz, false]];
    if (spec.cls === 'truck') pos.push([wx, rzz - 1.3, false], [-wx, rzz - 1.3, false]);
    if (spec.cls === 'bus' && spec.flags.dd) { /* nichts */ }
    for (const [x, z, steer] of pos) {
      const holder = new THREE.Group(); holder.position.set(x, wr, z);
      const w = new THREE.Mesh(wg, wheelMat); w.castShadow = true; if (x < 0) w.rotation.y = Math.PI;
      holder.add(w); root.add(holder); out.wheels.push(w); if (steer) out.steerWheels.push(holder);
      if (!steer) out.wheels.push; // noop
    }
    out.wb = fzz - rzz; out.fzz = fzz; out.rzz = rzz; out.wx = wx;
    // Polizei-Leuchtbalken
    if (spec.special === 'police' || spec.special === 'ambulance' || spec.special === 'fire' || spec.special === 'swat') {
      const lb = new Builder(); const y = (parts.yR || spec.H) + 0.05, z = parts.yR ? (spec.L * ((spec.prof[1] + spec.prof[2]) / 2 - 0.5)) : 0;
      lb.box(-0.3, y, z, 0.5, 0.12, 0.3, 0xff2020); lb.box(0.3, y, z, 0.5, 0.12, 0.3, 0x2f6bff);
      const lm = new THREE.Mesh(lb.build(), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })); root.add(lm); out.siren = lm;
      if (spec.special !== 'police' && spec.special !== 'swat') lm.material.color.set(0xff3030);
      lm.position.y = 0;
    }
    // Kennzeichen
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.12), new THREE.MeshBasicMaterial({ map: T.plateTexture('VC' + String(spec.seed % 900 + 100) + 'X'), toneMapped: false }));
    plate.position.set(0, spec.cl + 0.28, -spec.L / 2 - 0.09); plate.rotation.y = Math.PI; root.add(plate);
  }
  if (kind === 'plane') {
    const pw = new THREE.Group();
    const bl = new Builder(); bl.box(0, 0, 0, 0.1, 2.2, 0.04, 0x222222); bl.box(0, 0, 0, 2.2, 0.1, 0.04, 0x222222); bl.cyl(0, 0, 0.05, 0.2, 0.2, 0.2, 8, c1, true);
    const bg = bl.build(); bg.rotateX(Math.PI / 2);
    const props = [];
    const mk = (x, z) => { if (parts.jet) return; const p = new THREE.Mesh(new Builder().build ? bl.build() : bg, M.flat); p.position.set(x, 0, z); root.add(p); props.push(p); };
    const bl2 = new Builder(); bl2.box(0, 0, 0, 0.12, 2.2, 0.03, 0x222222); bl2.cyl(0, 0, 0, 0.0, 0.0, 0, 3, 0x000000, false);
    const pg = new Builder(); pg.box(0, 0, 0, 0.12, 2.2, 0.03, 0x1a1a1a); pg.box(0, 0, 0.1, 0.25, 0.25, 0.25, 0xb0b4ba);
    if (!parts.jet) {
      if (parts.twinProp) { for (const m of [-1, 1]) { const p = new THREE.Mesh(pg.build(), M.flat); p.position.set(m * spec.W * 0.22, 0.05, 1.8); root.add(p); props.push(p); } }
      else { const p = new THREE.Mesh(pg.build(), M.flat); p.position.set(0, 0, spec.L / 2 + 0.05); root.add(p); props.push(p); }
    }
    out.props = props;
    const wg = wheelGeom(0.28, 0.14);
    for (const [x, y, z] of parts.wheelPos) { const w = new THREE.Mesh(wg, M.shiny); w.position.set(x, y + 0.05, z); root.add(w); out.wheels.push(w); }
    out.wheelsOnly = true;
  }
  if (kind === 'heli') {
    const rg = new Builder(); rg.box(0, 0, 0, 9.5, 0.04, 0.3, 0x222222); rg.box(0, 0, 0, 0.3, 0.04, 9.5, 0x222222);
    const rotor = new THREE.Mesh(rg.build(), M.flat); rotor.position.set(0, 2.15, 0.2); root.add(rotor); out.rotor = rotor;
    const tr = new Builder(); tr.box(0, 0, 0, 0.04, 1.4, 0.1, 0x222222);
    const trot = new THREE.Mesh(tr.build(), M.flat); trot.position.set(0.2, 1.9, -6.6); root.add(trot); out.tailRotor = trot;
    if (spec.flags.police) { const sl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.3), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })); sl.position.set(0, -0.1, 2.2); root.add(sl); out.spot = sl; }
  }
  return out;
}

export function paintVehicleColors(out, c1, c2) {
  if (!out.bodyGeo || out.spec.kind !== 'car' || out.spec.cls === 'truck' || out.spec.cls === 'bus') return;
  paintAttr(out.bodyGeo, c1, c2 != null ? c2 : c1, c2 != null && c2 !== c1 ? out.belt - 0.03 : 99);
}
