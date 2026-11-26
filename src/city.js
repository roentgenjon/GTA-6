// Stadtgenerierung: Straßen, Blöcke, Gebäude, Props, Orte
import * as THREE from 'three';
import { Builder, rgb } from './builder.js?v=20261126142831-8986ff1';
import { M } from './materials.js?v=20261126142831-8986ff1';
import { P, R, K, blockExists, nodeExists, districtOf, addBox, addCircle, edgeExists, DIRS, coastE, coastS, groundHeight } from './terrain.js?v=20261126142831-8986ff1';
import { SITES } from './sites.js?v=20261126142831-8986ff1';
import { mulberry32 } from './util.js?v=20261126142831-8986ff1';
import { G } from './game.js?v=20261126142831-8986ff1';
import * as T from './textures.js?v=20261126142831-8986ff1';

const BAY = 3.6, FH = 3.5, TOP = 0.06;
const PASTEL = [0xf4b6c2, 0x9ad9d0, 0xf6e3a1, 0xbcd3f2, 0xf2a07b, 0xf7f3ea, 0xe8d5f5, 0xcdeac0, 0xffd1a6, 0xa7e3f2];
const GLASS = [0xaad4f5, 0x8fc2e6, 0xb9d8d0, 0xc9b8e8, 0xf1c6d8, 0xe8e0c8, 0x9fb3c8, 0xd0e4f2];
const NEON = [0xff2fd6, 0x2ff7ff, 0xffe14d, 0x7cff6b, 0xff6b3d, 0xa56bff];
const ROOF = [0x7a7a78, 0x8a8782, 0x6e6f73, 0x9a948a];
const TILE = [0xb5533c, 0x9c4a35, 0xc4663f, 0x6f7479, 0x4f545b, 0x7d6b5a];

const chunks = new Map();
function chunk(i, j) {
  const ci = Math.floor((i + K) / 4), cj = Math.floor((j + K) / 4), key = ci * 100 + cj;
  let c = chunks.get(key);
  if (!c) { c = { ci, cj, B: { curtain: new Builder(), office: new Builder(), resid: new Builder(), flat: new Builder(), shiny: new Builder(), neon: new Builder(), road: new Builder(), plain: new Builder(), slab: new Builder() } }; chunks.set(key, c); }
  return c.B;
}

export const city = { pois: [], lamps: [], signs: [], tlInst: null, tlList: [], sites: {}, group: new THREE.Group(), parkSpots: [], dealerSpots: [] };

function facade(B, kind, cx, cz, w, d, h, col, r, base = TOP) {
  w = Math.max(2, Math.round(w / BAY)) * BAY; d = Math.max(2, Math.round(d / BAY)) * BAY;
  const fl = Math.max(1, Math.round(h / FH)); h = fl * FH;
  const tex = { bw: BAY, fh: FH, ou: Math.floor(r() * 8) / 8, ov: Math.floor(r() * 8) / 8 };
  B[kind].box(cx, base + h / 2, cz, w, h, d, col, { tex, noTop: true, noBottom: true });
  B.flat.box(cx, base + 0.5, cz, w + 0.35, 1.0, d + 0.35, 0x55534f, { noTop: true, noBottom: true });
  if (kind !== 'curtain') B.flat.box(cx, base + 4.3, cz, w + 0.5, 0.3, d + 0.5, 0xd8d3c6, { noTop: false, noBottom: true });
  B.flat.box(cx, base + h + 0.25, cz, w + 0.5, 0.5, d + 0.5, ROOF[(r() * ROOF.length) | 0], { noBottom: true });
  const n0 = 1 + ((r() * 3) | 0), lite = !!(G.quality && G.quality.lite);
  for (let k = 0; k < n0; k++) { const q1 = r(), q2 = r(), q3 = r(), q4 = r(); if (!lite) B.flat.box(cx + (q1 - 0.5) * (w - 4), base + h + 1.2, cz + (q2 - 0.5) * (d - 4), 1.5 + q3 * 2, 1.4, 1.5 + q4 * 2, 0x9a9a9a); }
  return { w, d, h };
}
const colB = (r, arr) => arr[(r() * arr.length) | 0];

function treeAt(list, x, z, s = 1) { list.push([x, z, s]); addCircle(x, z, 0.45 * s, 6); }

function tower(B, cx, cz, w, d, h, r, pal, collide = true) {
  const col = colB(r, pal);
  const pod = 8 + Math.floor(r() * 3) * 3.5;
  facade(B, 'office', cx, cz, w, d, pod, 0xd8d2c4, r);
  const w1 = w * 0.82, d1 = d * 0.82, h1 = h * 0.62;
  const f1 = facade(B, 'curtain', cx, cz, w1, d1, h1, col, r, TOP + pod + 0.5);
  let top = TOP + pod + 0.5 + f1.h;
  if (h > 70) {
    const f2 = facade(B, 'curtain', cx, cz, w * 0.58, d * 0.58, h * 0.3, colB(r, pal), r, top + 0.5);
    top += 0.5 + f2.h;
  }
  if (h > 110) { B.flat.cyl(cx, top + 8, cz, 0.35, 0.1, 16, 5, 0xcccccc); B.neon.box(cx, top + 15, cz, 0.6, 0.6, 0.6, 0xff2a2a); }
  const nc = colB(r, NEON);
  if (h > 60) B.neon.box(cx, top - 1.5, cz, w * 0.6 + 0.5, 0.7, d * 0.6 + 0.5, nc, { noTop: true, noBottom: true });
  if (collide) addBox(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, top + 10, 'bld');
  return top;
}

function house(B, trees, cx, cz, r, style = 0) {
  const w = 9 + r() * 3, d = 10 + r() * 3, fl = 1 + ((r() * 2) | 0), h = fl * 3.4;
  const wall = colB(r, PASTEL);
  const f = facade(B, 'resid', cx, cz, w, d, h, wall, r);
  // Dach (Giebel) statt Flachdach: Flachdach-Platte liegt darunter
  const alongX = r() < 0.5;
  B.flat.gable(cx, TOP + f.h + 0.5, cz, f.w, f.d, 2.6, colB(r, TILE), alongX, 0.5);
  // Tür + Garage
  B.flat.box(cx, TOP + 1.1, cz + f.d / 2 + 0.05, 1.1, 2.2, 0.15, 0x4a3426);
  B.flat.box(cx + f.w / 2 - 2.5, TOP + 1.2, cz + f.d / 2 + 0.06, 3.6, 2.4, 0.15, 0xe9e9e4);
  // Zaun / Rasen
  B.flat.box(cx, TOP + 0.04, cz, 26, 0.08, 28, 0x58944a, { noBottom: true });
  addBox(cx - f.w / 2, cz - f.d / 2, cx + f.w / 2, cz + f.d / 2, h + 5, 'bld');
  if (r() < 0.8) treeAt(trees, cx + (r() < 0.5 ? -9 : 9), cz + 9 + r() * 3, 0.9 + r() * 0.4);
}

function villa(B, trees, palms, cx, cz, r, big = false) {
  const w = big ? 30 : 22, d = big ? 20 : 16;
  const white = 0xf7f4ec;
  B.flat.box(cx, TOP + 0.05, cz, 66, 0.1, 66, 0x5fa24f, { noBottom: true });
  B.flat.box(cx - 2, TOP + 3.2, cz - 6, w, 6.4, d, white);
  B.flat.box(cx + 6, TOP + 7.5, cz - 8, w * 0.6, 3.2, d * 0.8, 0xe4e0d6);
  B.shiny.box(cx - 2, TOP + 3.0, cz - 6 + d / 2 + 0.06, w - 3, 3.6, 0.12, 0x1a2c3d);
  B.shiny.box(cx + 6, TOP + 7.4, cz - 8 + d * 0.4 + 0.06, w * 0.6 - 3, 2.4, 0.12, 0x1a2c3d);
  B.flat.box(cx - 2, TOP + 6.5, cz - 6, w + 1.5, 0.35, d + 1.5, 0xcfc9bc);
  // Pool
  B.flat.box(cx - 2, TOP + 0.12, cz + 12, 16, 0.2, 7, 0xefece2);
  B.shiny.box(cx - 2, TOP + 0.24, cz + 12, 14.6, 0.05, 5.6, 0x28c7d9);
  B.neon.box(cx - 2, TOP + 0.22, cz + 12, 14.2, 0.02, 5.2, 0x1ab8d0, { noBottom: true });
  addBox(cx - 2 - w / 2, cz - 6 - d / 2, cx - 2 + w / 2, cz - 6 + d / 2, 12, 'bld');
  for (let k = 0; k < 4; k++) palms.push([cx - 28 + k * 18 + r() * 4, cz + 26 + r() * 3, 0.9 + r() * 0.5]);
  palms.push([cx + 24, cz + 4, 1.1]); palms.push([cx - 26, cz - 2, 1.0]);
  for (const p of palms.slice(-6)) addCircle(p[0], p[1], 0.4, 8);
  // Mauer
  B.flat.box(cx, TOP + 0.9, cz - 33, 66, 1.8, 0.5, 0xe9e5da); addBox(cx - 33, cz - 33.3, cx + 33, cz - 32.7, 2, 'wall');
}

function warehouse(B, cx, cz, w, d, r) {
  const h = 8 + r() * 5, col = colB(r, [0x7f8c96, 0x93a1a8, 0xa89f8f, 0x6f7f8d, 0x8d6e63]);
  B.flat.box(cx, TOP + h / 2, cz, w, h, d, col);
  B.flat.gable(cx, TOP + h, cz, w, d, 2.2, 0x667078, w > d, 0.1);
  for (let k = 0; k < 3; k++) B.flat.box(cx - w / 3 + k * (w / 3), TOP + 2.2, cz + d / 2 + 0.06, 4.2, 4.4, 0.15, 0x3c4650);
  addBox(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, h + 3, 'bld');
}
const CONT = [0xc0392b, 0x2980b9, 0xe67e22, 0x27ae60, 0xf1c40f, 0x8e44ad, 0x16a085, 0xecf0f1, 0x7f8c8d];
function containers(B, cx, cz, nx, nz, r) {
  for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) {
    const stack = 1 + ((r() * 3) | 0), col = colB(r, CONT);
    for (let s = 0; s < stack; s++) B.flat.box(cx + a * 3.2, TOP + 1.3 + s * 2.65, cz + b * 12.6, 2.5, 2.6, 12.2, col);
    addBox(cx + a * 3.2 - 1.3, cz + b * 12.6 - 6.2, cx + a * 3.2 + 1.3, cz + b * 12.6 + 6.2, stack * 2.7, 'cont');
  }
}

function lawn(B, cx, cz, w, d, col = 0x58944a) { B.flat.box(cx, TOP + 0.04, cz, w, 0.08, d, col, { noBottom: true }); }

function park(B, trees, palms, cx, cz, r) {
  lawn(B, cx, cz, 74, 74, 0x4f9444);
  B.flat.box(cx, TOP + 0.1, cz, 3, 0.04, 74, 0xd9cfae); B.flat.box(cx, TOP + 0.1, cz, 74, 0.04, 3, 0xd9cfae);
  B.shiny.box(cx + 18, TOP + 0.16, cz + 18, 18, 0.1, 14, 0x3aa6c8);
  B.flat.cyl(cx, TOP + 0.9, cz, 2.4, 1.8, 1.4, 12, 0xbdb7a8); B.shiny.cyl(cx, TOP + 1.7, cz, 1.6, 1.6, 0.2, 12, 0x5bc6e8);
  addCircle(cx, cz, 2.5, 3);
  for (let k = 0; k < 22; k++) { const x = cx + (r() - 0.5) * 66, z = cz + (r() - 0.5) * 66; if (Math.hypot(x - cx - 18, z - cz - 18) < 11 || Math.abs(x - cx) < 3 || Math.abs(z - cz) < 3) continue; (r() < 0.35 ? palms : trees).push([x, z, 0.9 + r() * 0.6]); addCircle(x, z, 0.5, 8); }
  for (let k = 0; k < 4; k++) { B.flat.box(cx + 6 + k * 8, TOP + 0.45, cz + 3.2, 1.8, 0.1, 0.5, 0x6b4a2f); B.flat.box(cx + 6 + k * 8, TOP + 0.8, cz + 3.5, 1.8, 0.5, 0.1, 0x6b4a2f); }
}

// -------------------------------------------------------------------
function buildStandard(B, props, i, j, r) {
  const cx = (i + 0.5) * P, cz = (j + 0.5) * P, dist = districtOf(i, j);
  const L = 33; // halbe Nutzfläche
  const trees = props.trees, palms = props.palms;
  const park_ = r() < 0.07 && dist !== 'downtown' && dist !== 'industrial' && dist !== 'harbor';
  if (park_) { park(B, trees, palms, cx, cz, r); return; }
  if (dist === 'downtown') {
    const dc = Math.max(Math.abs(i + 0.5), Math.abs(j + 0.5)), big = 1 - dc / 2.6;
    if (r() < 0.55) { const w = 44 + r() * 14, d = 44 + r() * 14, h = 90 + big * 190 * (0.45 + r() * 0.55); tower(B, cx, cz, w, d, h, r, GLASS); }
    else for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const h = 50 + big * 110 * r(); tower(B, cx + sx * 18, cz + sz * 18, 26 + r() * 4, 26 + r() * 4, h, r, GLASS); }
  } else if (dist === 'midtown') {
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const w = 26 + r() * 6, d = 26 + r() * 6, h = 22 + r() * 48, col = colB(r, PASTEL);
      const kind = r() < 0.35 ? 'curtain' : r() < 0.5 ? 'office' : 'resid';
      const x = cx + sx * 18, z = cz + sz * 18;
      const f = facade(B, kind, x, z, w, d, h, kind === 'curtain' ? colB(r, GLASS) : col, r);
      addBox(x - f.w / 2, z - f.d / 2, x + f.w / 2, z + f.d / 2, h + 6, 'bld');
      if (r() < 0.5) { B.flat.box(x, TOP + 3.6, z + f.d / 2 + 1.1, f.w * 0.7, 0.3, 2.4, colB(r, [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12])); }
      if (r() < 0.45) B.neon.box(x, TOP + h + 1.6, z + f.d / 2 - 0.2, Math.min(f.w - 4, 14), 2.2, 0.3, colB(r, NEON));
    }
  } else if (dist === 'beach') {
    // Art-Deco Hotels & Läden
    const n = 2 + ((r() * 2) | 0);
    for (let k = 0; k < n; k++) {
      const z = cz - 24 + k * (48 / Math.max(1, n - 1)) * (n > 1 ? 1 : 0), w = 30 + r() * 12, d = 26 + r() * 8, h = 12 + r() * 30;
      const x = cx + (r() - 0.5) * 8;
      const f = facade(B, 'resid', x, z, w, d, h, colB(r, PASTEL), r);
      B.neon.box(x, TOP + h - 0.8, z + f.d / 2 + 0.1, f.w, 0.4, 0.15, colB(r, NEON));
      B.neon.box(x, TOP + 0.9, z + f.d / 2 + 0.1, f.w * 0.5, 0.35, 0.15, colB(r, NEON));
      addBox(x - f.w / 2, z - f.d / 2, x + f.w / 2, z + f.d / 2, h + 5, 'bld');
    }
    for (let k = 0; k < 6; k++) palms.push([cx - 34 + k * 13.5, cz + 36, 1.0 + r() * 0.5]);
  } else if (dist === 'villas') {
    villa(B, trees, palms, cx, cz, r, r() < 0.5);
  } else if (dist === 'industrial' || dist === 'harbor') {
    if (r() < 0.5) { warehouse(B, cx - 16, cz - 14, 36, 30, r); containers(B, cx + 12, cz - 28, 4, 2, r); warehouse(B, cx - 16, cz + 22, 34, 22, r); }
    else { containers(B, cx - 28, cz - 30, 8, 5, r); }
    if (r() < 0.35) { B.flat.cyl(cx + 22, TOP + 6, cz + 20, 6, 6, 12, 10, 0xcfcfcf); addCircle(cx + 22, cz + 20, 6, 14); B.flat.cyl(cx + 22, TOP + 12.2, cz + 20, 6, 4, 0.8, 10, 0xaaaaaa); }
    if (dist === 'harbor' && r() < 0.5) { // Kran
      B.flat.box(cx + 28, TOP + 13, cz + 5, 1.2, 26, 1.2, 0xf2b01e); B.flat.box(cx + 28, TOP + 26, cz - 6, 1.4, 1.4, 28, 0xf2b01e); addBox(cx + 27.4, cz + 4.4, cx + 28.6, cz + 5.6, 26, 'crane');
    }
  } else { // residential, suburb
    for (let a = 0; a < 3; a++) for (let b = 0; b < 2; b++) {
      const x = cx - 24 + a * 24, z = cz - 17 + b * 36;
      house(B, trees, x, z, r);
    }
    if (r() < 0.6) palms.push([cx, cz, 1]);
  }
}

// -------------------------------------------------------------------
function signMesh(text, col, w, h, x, y, z, rotY, glowCol) {
  const tex = T.signTexture(text.toUpperCase(), col);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide }));
  m.position.set(x, y, z); m.rotation.y = rotY; m.userData.sign = true;
  city.group.add(m); city.signs.push(m);
  return m;
}

function buildSite(B, props, S) {
  const r = mulberry32(S.i * 131 + S.j * 17 + 5);
  const cx = (S.i + 0.5) * P, cz = (S.j + 0.5) * P;
  const fv = { S: [0, 1], N: [0, -1], E: [1, 0], W: [-1, 0] }[S.side], rotY = Math.atan2(fv[0], fv[1]);
  const sideV = [-fv[1], fv[0]];
  const along = fv[0] !== 0 ? 'z' : 'x';
  // Gebäude-Ausrichtung: w entlang Front, d in Tiefe
  const bw = S.w, bd = S.d;
  const ex = fv[0] !== 0 ? bd : bw, ez = fv[0] !== 0 ? bw : bd; // Ausdehnung in x/z
  const bx = cx - fv[0] * 4, bz = cz - fv[1] * 4;
  const t = S.type;
  let h = S.h, kind = S.tex;
  if (t === 'hoops') {
    B.flat.box(cx, TOP + 0.06, cz, ex, 0.1, ez, 0x2f7d4f, { noBottom: true });
    B.flat.box(cx, TOP + 0.12, cz, ex - 4, 0.04, ez - 4, 0xd9743a, { noBottom: true });
    // Hoops an Kurzseiten
    for (const s of [-1, 1]) {
      const hx = cx + (fv[0] !== 0 ? 0 : 0), hz = cz;
      const px = fv[0] !== 0 ? cx + s * 0 : cx, pz = fv[0] !== 0 ? cz + s * (ez / 2 - 3) : cz + s * (ez / 2 - 3);
      const ax = fv[0] !== 0 ? cx : cx + s * (ex / 2 - 3), az = fv[0] !== 0 ? cz + s * (ez / 2 - 3) : cz;
      B.flat.cyl(ax, TOP + 2, az, 0.1, 0.1, 4, 6, 0x333333);
      B.flat.box(ax, TOP + 4, az, fv[0] !== 0 ? 1.8 : 0.1, 1.1, fv[0] !== 0 ? 0.1 : 1.8, 0xffffff);
      city.hoopPos = city.hoopPos || []; city.hoopPos.push([ax, az]);
      addCircle(ax, az, 0.3, 5);
    }
  } else {
    // Hauptbaukörper
    const colr = S.color;
    if (t === 'gas') {
      // Tankstelle: Dach + Säulen + Zapfsäulen + Shop
      B.flat.box(cx, TOP + 5.4, cz, 22, 0.6, 16, 0xeeeeee); B.neon.box(cx, TOP + 5.15, cz + 8.1, 22, 0.5, 0.2, 0x33ff66, { noTop: true });
      for (const sx of [-8, 8]) for (const sz of [-5, 5]) { B.flat.cyl(cx + sx, TOP + 2.7, cz + sz, 0.3, 0.3, 5.4, 6, 0xbbbbbb); }
      for (const sx of [-4, 4]) B.flat.box(cx + sx, TOP + 0.9, cz, 0.7, 1.8, 1.2, 0xd7263d);
      facade(B, 'resid', cx, cz - 18, 18, 8, 4.5, 0xe5e5e5, r);
      addBox(cx - 9, cz - 22, cx + 9, cz - 14, 6, 'bld');
      props.gas = props.gas || []; props.gas.push([cx, cz]);
    } else if (t === 'dealer') {
      const f = facade(B, 'curtain', bx, bz, ex, ez, 8, 0xdde7ee, r);
      B.neon.box(bx, TOP + 8.6, bz + ez / 2 + 0.05, ex * 0.8, 1.2, 0.2, 0xff2d55);
      addBox(bx - f.w / 2, bz - f.d / 2, bx + f.w / 2, bz + f.d / 2, 10, 'bld');
      for (let k = -1; k <= 1; k++) city.dealerSpots.push({ x: bx + k * 9, z: cz + 30, yaw: 0 });
    } else if (t === 'villa' || (t === 'property' && S.tex === 'curtain' && h <= 15)) {
      villa(B, props.trees, props.palms, cx, cz, r, S.garage > 6);
    } else if (t === 'property' && h <= 9) {
      house(B, props.trees, bx, bz, r);
    } else {
      const f = facade(B, kind, bx, bz, ex, ez, h, colr, r);
      addBox(bx - f.w / 2, bz - f.d / 2, bx + f.w / 2, bz + f.d / 2, h + 8, 'bld');
      // Tür/Vordach
      B.flat.box(bx + fv[0] * (f.w * 0 + (fv[0] !== 0 ? f.w / 2 : 0)), TOP + 1.5, bz + fv[1] * (fv[1] !== 0 ? f.d / 2 : 0), 3, 3, 0.2, 0x222222);
      if (t === 'bank') for (let k = -3; k <= 3; k++) B.flat.cyl(bx + k * 6, TOP + 5, bz + ez / 2 + 2.5, 0.6, 0.6, 10, 8, 0xece6d6);
      if (t === 'hospital') { B.neon.box(bx, TOP + h + 4, bz, 2, 7, 1, 0xff2d2d); B.neon.box(bx, TOP + h + 4, bz, 7, 2, 1, 0xff2d2d); B.flat.cyl(bx + 15, TOP + h + 0.7, bz - 8, 8, 8, 0.4, 16, 0x3c4a60); B.neon.box(bx + 15, TOP + h + 1, bz - 8, 4, 0.05, 0.8, 0xffffff); }
      if (t === 'police') { B.neon.box(bx - 6, TOP + h + 1.2, bz, 3, 1.2, 1.2, 0x2f7bff); B.neon.box(bx + 6, TOP + h + 1.2, bz, 3, 1.2, 1.2, 0xff2d2d); }
      if (t === 'fire') for (let k = -1; k <= 1; k++) B.flat.box(bx + k * (f.w / 3.4) * (fv[0] !== 0 ? 0 : 1) + (fv[0] !== 0 ? 0 : 0), TOP + 2.5, bz + ez / 2 + 0.1, 6, 5, 0.2, 0xeeeeee);
      if (t === 'casino') {
        B.neon.box(bx, TOP + h + 5, bz, 3, 10, 3, 0xff2fa8); B.neon.box(bx, TOP + h * 0.5, bz + ez / 2 + 0.2, f.w + 1, 0.8, 0.3, 0xffe14d); B.neon.box(bx, TOP + 3, bz + ez / 2 + 0.2, f.w + 1, 0.8, 0.3, 0x2ff7ff);
        for (let k = 0; k < 8; k++) props.palms.push([cx - 34 + k * 9.5, cz + 36, 1.2]);
      }
      if (t === 'tuning') for (let k = -1; k <= 1; k++) B.flat.box(bx + k * 12, TOP + 2.3, bz + ez / 2 + 0.1, 8, 4.6, 0.2, 0x151a22);
    }
    // Kollision für Villa/Haus ist intern.
  }
  const sx = bx + fv[0] * (fv[0] !== 0 ? ex / 2 + 0.3 : 0), sz = bz + fv[1] * (fv[1] !== 0 ? ez / 2 + 0.3 : 0);
  const sh = Math.max(h, 8);
  if (t !== 'gas' && t !== 'hoops') signMesh(S.name, S.sign, Math.min(24, Math.max(14, S.w * 0.6)), 4.4, fv[0] !== 0 ? bx + fv[0] * (ex / 2 + 0.4) : bx, TOP + Math.min(sh, 14) - 1.4, fv[1] !== 0 ? bz + fv[1] * (ez / 2 + 0.4) : bz, fv[0] !== 0 ? (fv[0] > 0 ? Math.PI / 2 : -Math.PI / 2) : (fv[1] > 0 ? 0 : Math.PI), null);
  else if (t === 'gas') signMesh('GAS & GO', '#33ff66', 8, 1.6, cx, TOP + 7, cz + 8.3, 0, null);
  else signMesh(S.name, S.sign, 16, 3.4, cx, TOP + 6, cz + (fv[0] !== 0 ? 0 : fv[1] * ez / 2), 0, null);
  // POI
  const door = { x: cx + fv[0] * 38.5, z: cz + fv[1] * 38.5 };
  const poi = { id: S.id, type: S.type, name: S.name, x: door.x, z: door.z, site: S, fv, bx, bz };
  // Garagenplätze
  if (S.garage) {
    S.spots = [];
    const per = 6;
    for (let n = 0; n < S.garage; n++) {
      const row = Math.floor(n / per), col = n % per;
      const lat = (col - (per - 1) / 2) * 6.4, dep = 24 + row * 8;
      S.spots.push({ x: cx + fv[0] * dep + sideV[0] * lat, z: cz + fv[1] * dep + sideV[1] * lat, yaw: rotY + Math.PI / 2 });
    }
  }
  city.pois.push(poi); city.sites[S.id] = poi;
}

// -------------------------------------------------------------------
export function buildCity(scene) {
  chunks.clear();
  const props = { trees: [], palms: [], lamps: [], tl: [] };
  const siteMap = new Map(SITES.map((s) => [s.i + ',' + s.j, s]));
  const cityRand = mulberry32(777);
  for (let i = -K; i < K; i++) for (let j = -K; j < K; j++) {
    if (!blockExists(i, j)) continue;
    const B = chunk(i, j), cx = (i + 0.5) * P, cz = (j + 0.5) * P, r = mulberry32(i * 7919 + j * 104729 + 13);
    const dist = districtOf(i, j);
    // Sockel (Gehsteig): oben UV gekachelt
    const hw = (P - R) / 2, u = (P - R) / 4;
    const slabCol = dist === 'downtown' ? 0xcfcac0 : 0xffffff;
    B.slab.box(cx, TOP - 0.18, cz, P - R, 0.36, P - R, slabCol, { noBottom: true, topUV: [0, u, u, u, u, 0, 0, 0] });
    const site = siteMap.get(i + ',' + j);
    if (site) buildSite(B, props, site); else buildStandard(B, props, i, j, r);
    { const o = (r() - 0.5) * 50, Bf = B.flat, y0 = TOP; streetHydrant(Bf, cx + o, cz + hw - 0.8, y0); if (r() < 0.8) streetBin(Bf, cx + o + 3 + r() * 6, cz + hw - 0.9, y0); const lt = !!(G.quality && G.quality.lite); const p1 = r() < 0.45, p2 = r() < 0.5, o2 = (r() - 0.5) * 40, p3 = r() < 0.12, o3 = (r() - 0.5) * 30, p4 = r() < 0.5; if (!lt) { if (p1) streetBench(Bf, cx - o * 0.6, cz - hw + 1.0, y0); if (p2) streetMail(Bf, cx + hw - 0.9, cz + o2, y0); if (p3) streetShelter(Bf, cx + o3, cz + hw - 1.6, y0); if (p4) streetSign(Bf, cx - hw + 1.0, cz - hw + 1.0, y0); } }
    // Straßenlaternen + Straßenbäume
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) props.lamps.push([cx + sx * (hw - 1.2), cz + sz * (hw - 1.2), Math.atan2(sx, sz) + Math.PI]);
    for (const m of [-1, 1]) { props.lamps.push([cx + m * (hw - 1.2), cz, m > 0 ? Math.PI / 2 : -Math.PI / 2]); props.lamps.push([cx, cz + m * (hw - 1.2), m > 0 ? 0 : Math.PI]); }
    if (dist !== 'industrial' && dist !== 'harbor' && cityRand() < 0.9) {
      const pal = (dist === 'beach' || dist === 'downtown' || dist === 'villas') ? props.palms : props.trees;
      for (let k = -2; k <= 2; k++) { if (cityRand() < 0.4) continue; const o = k * 14 + 7 * (k > 0 ? -1 : 1) * 0; pal.push([cx + o, cz - hw + 1.6, 0.9 + cityRand() * 0.3]); if (cityRand() < 0.6) pal.push([cx + o, cz + hw - 1.6, 0.9 + cityRand() * 0.3]); }
    }
  }
  // Straßen
  for (let l = -K; l <= K; l++) for (let k = -K; k <= K; k++) {
    if (!nodeExists(k, l)) continue;
    const B = chunk(Math.min(k, K - 1), Math.min(l, K - 1));
    B.plain.quad([k * P - R / 2, 0.012, l * P - R / 2], [k * P - R / 2, 0.012, l * P + R / 2], [k * P + R / 2, 0.012, l * P + R / 2], [k * P + R / 2, 0.012, l * P - R / 2], 0xffffff, [0, 0, 0, 1, 1, 1, 1, 0]);
    // Ampeln (4 Ecken)
    for (const [sx, sz, d] of [[-1, 1, 0], [1, -1, 2], [1, 1, 3], [-1, -1, 1]]) {
      if (!edgeExists(k, l, (d + 2) % 4)) continue; // Anfahrt kommt aus Gegenrichtung
      props.tl.push({ x: k * P + sx * (R / 2 + 1.2), z: l * P + sz * (R / 2 + 1.2), d, k, l });
    }
  }
  for (let l = -K; l <= K; l++) for (let k = -K; k < K; k++) { // Ost-West
    if (!edgeExists(k, l, 0)) continue;
    const B = chunk(k, Math.min(l, K - 1)), xa = k * P + R / 2, xb = (k + 1) * P - R / 2, zc = l * P;
    B.road.quad([xa, 0.01, zc - R / 2], [xa, 0.01, zc + R / 2], [xb, 0.01, zc + R / 2], [xb, 0.01, zc - R / 2], 0xffffff, [0, 0, 1, 0, 1, 1, 0, 1]);
  }
  for (let k = -K; k <= K; k++) for (let l = -K; l < K; l++) { // Nord-Süd
    if (!edgeExists(k, l, 1)) continue;
    const B = chunk(Math.min(k, K - 1), l), za = l * P + R / 2, zb = (l + 1) * P - R / 2, xc = k * P;
    B.road.quad([xc - R / 2, 0.01, za], [xc - R / 2, 0.01, zb], [xc + R / 2, 0.01, zb], [xc + R / 2, 0.01, za], 0xffffff, [0, 0, 0, 1, 1, 1, 1, 0]);
  }
  // Chunks zu Meshes
  const mats = { curtain: M.curtain, office: M.office, resid: M.resid, flat: M.flat, shiny: M.shiny, neon: M.neon, road: M.road, plain: M.plain, slab: M.slab };
  for (const c of chunks.values()) {
    for (const [name, b] of Object.entries(c.B)) {
      if (b.empty) continue;
      const mesh = new THREE.Mesh(b.build(), mats[name]);
      mesh.castShadow = !['road', 'plain', 'neon'].includes(name); mesh.receiveShadow = true;
      city.group.add(mesh);
    }
  }
  chunks.clear();
  buildInstances(props);
  scene.add(city.group);
  return city;
}

// -------------------------------------------------------------------
function treeGeom() {
  const b = new Builder(), lite = !!(G.quality && G.quality.lite), R = lite ? 3 : 5, S = lite ? 7 : 10;
  b.cyl(0, 1.4, 0, 0.22, 0.14, 2.8, lite ? 5 : 7, 0x6a4a30, false);
  b.sphere(0, 4.0, 0, 2.3, 2.0, 2.3, 0x3f8f3a, R, S, 0.2, 1); b.sphere(0.6, 5.2, 0.2, 1.6, 1.4, 1.6, 0x4aa044, R, S, 0.2, 2); b.sphere(-0.7, 3.4, -0.4, 1.5, 1.3, 1.5, 0x358232, R, S, 0.2, 3);
  return b.build();
}
function palmGeom() {
  const b = new Builder(), segs = 4;
  let px = 0, py = 0;
  for (let s = 0; s < segs; s++) { const t = s / segs, x = t * t * 1.6, y = s * 1.7 + 0.8; b.cyl(x, y, 0, 0.26 - t * 0.1, 0.22 - t * 0.1, 1.8, (G.quality && G.quality.lite) ? 5 : 8, s % 2 ? 0x8a6a48 : 0x7c5e3f, false); px = x; py = y + 0.9; }
  for (let f = 0; f < 7; f++) {
    const a = (f / 7) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a), nx = -dz, nz = dx;
    const L = 3.6, col = f % 2 ? 0x3a9a44 : 0x2a7d34;
    const p1 = [px + dx * L * 0.5, py + 0.9, dz * L * 0.5], p2 = [px + dx * L, py - 0.3, dz * L], wd = 0.55;
    b.quad([px + nx * 0.1, py, nz * 0.1], [p1[0] + nx * wd, p1[1], p1[2] + nz * wd], [p1[0] - nx * wd, p1[1], p1[2] - nz * wd], [px - nx * 0.1, py, -nz * 0.1], col);
    b.tri([p1[0] + nx * wd, p1[1], p1[2] + nz * wd], p2, [p1[0] - nx * wd, p1[1], p1[2] - nz * wd], col);
  }
  return b.build();
}
export function pineGeom() {
  const b = new Builder();
  b.cyl(0, 1.2, 0, 0.3, 0.2, 2.4, 5, 0x5a3f2a, false);
  for (let k = 0; k < 3; k++) b.cyl(0, 3.2 + k * 2.6, 0, 2.7 - k * 0.7, 0.05, 3.6, 5, k % 2 ? 0x25613a : 0x2d7044, true);
  return b.build();
}
function lampGeom() {
  const b = new Builder();
  b.cyl(0, 3.8, 0, 0.1, 0.07, 7.6, 6, 0x303338, false);
  b.box(0, 7.6, 1.0, 0.12, 0.12, 2.1, 0x303338);
  return b.build();
}
function tlGeom() {
  const b = new Builder();
  b.cyl(0, 2.2, 0, 0.09, 0.08, 4.4, 6, 0x2a2d31, false);
  b.box(0, 4.2, 0, 0.4, 1.1, 0.4, 0x15171a);
  return b.build();
}

function streetHydrant(B, x, z, y) { B.cyl(x, y + 0.35, z, 0.13, 0.11, 0.7, 8, 0xc8261f, false); B.cyl(x, y + 0.75, z, 0.14, 0.1, 0.1, 8, 0xc8261f); B.box(x + 0.15, y + 0.5, z, 0.12, 0.1, 0.1, 0xb0b0b0); B.box(x - 0.15, y + 0.5, z, 0.12, 0.1, 0.1, 0xb0b0b0); }
function streetBin(B, x, z, y) { B.cyl(x, y + 0.45, z, 0.3, 0.27, 0.9, 8, 0x2f5a3c, false); B.cyl(x, y + 0.93, z, 0.32, 0.3, 0.07, 8, 0x1d3a27); }
function streetBench(B, x, z, y) { B.box(x, y + 0.45, z, 1.6, 0.07, 0.5, 0x7a5230); B.box(x, y + 0.8, z - 0.22, 1.6, 0.45, 0.06, 0x7a5230); B.box(x - 0.7, y + 0.22, z, 0.08, 0.44, 0.45, 0x333333); B.box(x + 0.7, y + 0.22, z, 0.08, 0.44, 0.45, 0x333333); }
function streetMail(B, x, z, y) { B.box(x, y + 0.55, z, 0.5, 1.1, 0.5, 0x2a4fb0); B.box(x, y + 1.12, z, 0.5, 0.08, 0.55, 0x1b3580); }
function streetShelter(B, x, z, y) { B.box(x, y + 2.6, z, 3.6, 0.12, 1.6, 0x8a8f94); B.box(x, y + 1.3, z - 0.78, 3.4, 2.4, 0.05, 0x9fd0e0); B.box(x - 1.7, y + 1.3, z, 0.05, 2.4, 1.5, 0x9fd0e0); B.box(x + 1.7, y + 1.3, z, 0.05, 2.4, 1.5, 0x9fd0e0); B.box(x, y + 0.45, z - 0.4, 2.4, 0.08, 0.4, 0x555a60); addCircle(x, z, 0.5, 3); }
function streetSign(B, x, z, y) { B.cyl(x, y + 1.3, z, 0.04, 0.04, 2.6, 6, 0x888d92, false); B.cyl(x, y + 2.55, z, 0.5, 0.5, 0.05, 8, 0xd02020); B.cyl(x, y + 2.57, z + 0.03, 0.4, 0.4, 0.04, 8, 0xffffff); }

export const cullList = [];
const CELL = 520; // Instanz-Zellen: Frustum-Culling pro Zelle
export function chunkInst(geom, mat, items, opt = {}) {
  const cells = new Map(), grp = new THREE.Group();
  for (const it of items) { const k = Math.floor(it.x / CELL) * 1000 + Math.floor(it.z / CELL); let a = cells.get(k); if (!a) cells.set(k, (a = [])); a.push(it); }
  for (const a of cells.values()) {
    const im = new THREE.InstancedMesh(geom, mat, a.length);
    a.forEach((it, n) => { im.setMatrixAt(n, it.m); if (it.c) im.setColorAt(n, it.c); });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = !!opt.shadow; im.receiveShadow = true; im.computeBoundingSphere(); im.frustumCulled = true; grp.add(im);
    cullList.push({ mesh: im, cx: im.boundingSphere.center.x, cz: im.boundingSphere.center.z, r: im.boundingSphere.radius, kind: opt.kind || 'prop' });
  }
  return grp;
}
export function makeInstanced(geom, mat, list, opt = {}) {
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler();
  const r = mulberry32(list.length + 9), items = [];
  for (let n = 0; n < list.length; n++) {
    const it = list[n], sc = it[2] || 1;
    const y = opt.y != null ? opt.y : groundHeight(it[0], it[1]) + (opt.lift || 0);
    p.set(it[0], y, it[1]); e.set(0, opt.rot ? it[2] : r() * 6.28, 0); q.setFromEuler(e); s.setScalar(opt.rot ? 1 : sc);
    m.compose(p, q, s);
    let c = null; if (opt.color) { const v = 0.75 + r() * 0.5; c = new THREE.Color(v * (0.9 + r() * 0.2), v, v * (0.9 + r() * 0.15)); }
    items.push({ x: it[0], z: it[1], m: m.clone(), c });
  }
  return chunkInst(geom, mat, items, opt);
}

function buildInstances(props) {
  const g = city.group, ts = !!(G.quality && G.quality.treeShadows);
  g.add(makeInstanced(treeGeom(), M.foliage, props.trees, { color: true, shadow: ts, lift: 0.06, kind: 'tree' }));
  g.add(makeInstanced(palmGeom(), M.foliage, props.palms, { color: true, shadow: ts, lift: 0.06, kind: 'tree' }));
  const lampList = props.lamps.map(([x, z, rot]) => [x, z, rot]);
  g.add(makeInstanced(lampGeom(), M.flat, lampList, { rot: true, lift: 0.06, shadow: false }));
  // Lampenköpfe & Glow
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pp = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1), gp = [], hitems = [], yAxis = new THREE.Vector3(0, 1, 0);
  lampList.forEach(([x, z, rot]) => {
    q.setFromAxisAngle(yAxis, rot);
    const ox = Math.sin(rot) * 2.0, oz = Math.cos(rot) * 2.0;
    pp.set(x + ox, 7.5, z + oz); m4.compose(pp, q, sc); hitems.push({ x: x + ox, z: z + oz, m: m4.clone(), c: null }); gp.push(x + ox, 7.2, z + oz);
    city.lamps.push({ x: x + ox, z: z + oz });
  });
  g.add(chunkInst(new THREE.BoxGeometry(0.55, 0.14, 0.35), M.lamp, hitems, { shadow: false }));
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
  const pts = new THREE.Points(pg, M.glow); pts.frustumCulled = false; pts.renderOrder = 3; g.add(pts);
  // Ampeln
  const tl = props.tl;
  g.add(makeInstanced(tlGeom(), M.flat, tl.map((t) => [t.x, t.z, 0]), { lift: 0.06 }));
  const bulb = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.3, 0.1), M.tl, tl.length);
  tl.forEach((t, n) => {
    const fx = -DIRS[t.d][0], fz = -DIRS[t.d][1];
    q.setFromAxisAngle(yAxis, Math.atan2(fx, fz));
    pp.set(t.x + fx * 0.22, 4.55, t.z + fz * 0.22); m4.compose(pp, q, sc); bulb.setMatrixAt(n, m4); bulb.setColorAt(n, new THREE.Color(0x20ff60));
  });
  bulb.frustumCulled = false; bulb.instanceMatrix.needsUpdate = true; g.add(bulb);
  city.tlInst = bulb; city.tlList = tl;
}
