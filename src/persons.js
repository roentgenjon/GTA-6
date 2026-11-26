// Menschen: skinned Low-Poly-Charaktere mit prozeduraler Animation und Outfits
import * as THREE from 'three';
import { Builder, rgb } from './builder.js';
import { M } from './materials.js';
import { clamp, lerp, damp, pick, rnd } from './util.js';
import { buildBody } from './bodies.js';
import { G } from './game.js';

export const SKINS = [0xffdbb4, 0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0x6b4226, 0x4a2c17, 0xf5cba7];
export const HAIR_STYLES = ['Glatze', 'Kurz', 'Buzz Cut', 'Lang', 'Pferdeschwanz', 'Irokese', 'Afro', 'Dutt'];
export const HAIR_COLORS = [0x1a1410, 0x3b2a1a, 0x6a4a2a, 0xb0793a, 0xe8c36a, 0xb23a2a, 0x777777, 0xf0f0f0, 0x2a5acc, 0xcc2a9a];
export const HATS = ['Keine', 'Cap', 'Beanie', 'Fedora', 'Helm'];
export const TOP_TYPES = ['T-Shirt', 'Hoodie', 'Hemd', 'Tanktop', 'Anzugjacke', 'Lederjacke', 'Hawaii-Hemd'];
export const BOTTOM_TYPES = ['Jeans', 'Shorts', 'Anzughose', 'Jogger', 'Rock'];
export const SHOE_TYPES = ['Sneaker', 'Stiefel', 'Lederschuhe', 'Flip-Flops'];
export const OUTFITS = [
  { id: 'casual', name: 'Streetwear', price: 0, look: { top: 0, topColor: 0x2e86de, bottom: 0, bottomColor: 0x2c3e66, shoe: 0, shoeColor: 0xf0f0f0, hat: 0, glasses: false } },
  { id: 'suit', name: 'Business-Anzug', price: 1200, look: { top: 4, topColor: 0x1b1d24, bottom: 2, bottomColor: 0x1b1d24, shoe: 2, shoeColor: 0x15110e, hat: 0, glasses: false, shirt: 0xf4f4f4 } },
  { id: 'beach', name: 'Strand-Look', price: 350, look: { top: 6, topColor: 0xff6b9a, bottom: 1, bottomColor: 0xf5d68a, shoe: 3, shoeColor: 0x3aa6ff, hat: 0, glasses: true } },
  { id: 'track', name: 'Jogginganzug', price: 450, look: { top: 1, topColor: 0x1f8a5b, bottom: 3, bottomColor: 0x1f8a5b, shoe: 0, shoeColor: 0xffffff, hat: 2, glasses: false } },
  { id: 'biker', name: 'Biker-Leder', price: 900, look: { top: 5, topColor: 0x211c1a, bottom: 0, bottomColor: 0x141a26, shoe: 1, shoeColor: 0x151515, hat: 0, glasses: true } },
  { id: 'night', name: 'Nachtclub', price: 1600, look: { top: 2, topColor: 0xb0124f, bottom: 2, bottomColor: 0x15151a, shoe: 2, shoeColor: 0x0e0e0e, hat: 0, glasses: true } },
  { id: 'cap', name: 'Cap & Hoodie', price: 600, look: { top: 1, topColor: 0x6a3fb5, bottom: 3, bottomColor: 0x222222, shoe: 0, shoeColor: 0xd0d0d0, hat: 1, glasses: false } },
  { id: 'gold', name: 'Gold-Mogul', price: 5200, look: { top: 4, topColor: 0xe0b84a, bottom: 2, bottomColor: 0xfaf7ee, shoe: 2, shoeColor: 0xf3ead2, hat: 3, glasses: true, shirt: 0x111111 } },
];
export const COLOR_SWATCH = [0xe74c3c, 0xe67e22, 0xf1c40f, 0x2ecc71, 0x1abc9c, 0x3498db, 0x2e86de, 0x9b59b6, 0xff6b9a, 0xffffff, 0xbdc3c7, 0x7f8c8d, 0x2c3e50, 0x1b1d24, 0x6b4a2f];

export function randomLook(kind = 'civ') {
  const female = Math.random() < 0.48;
  const look = {
    female, skin: pick(SKINS), hair: female ? pick([1, 3, 3, 4, 7, 6]) : pick([0, 1, 1, 2, 2, 5, 6]), hairColor: pick(HAIR_COLORS.slice(0, 8)),
    top: pick([0, 0, 1, 2, 3, 6]), topColor: pick(COLOR_SWATCH), bottom: female && Math.random() < 0.3 ? 4 : pick([0, 0, 1, 2, 3]), bottomColor: pick([0x2c3e66, 0x1b1d24, 0x6b4a2f, 0x8a8f99, 0xf5d68a, 0x3d5a40, 0xb0586b]),
    shoe: pick([0, 0, 1, 2, 3]), shoeColor: pick([0xf0f0f0, 0x151515, 0x6b4a2f, 0xcc3333]), hat: Math.random() < 0.12 ? pick([1, 2, 3]) : 0, glasses: Math.random() < 0.18,
    scale: 0.94 + Math.random() * 0.14, fat: 0.9 + Math.random() * 0.3, shirt: 0xffffff, eye: pick([0x3a2a1a, 0x5a3b22, 0x2f5f8a, 0x4a7a4a, 0x6a6a6a]),
  };
  if (kind === 'cop') Object.assign(look, { top: 2, topColor: 0x27416f, bottom: 2, bottomColor: 0x181d28, shoe: 2, shoeColor: 0x0d0d0d, hat: 1, hatColor: 0x1d2c4a, hair: 1, glasses: Math.random() < 0.3, female: Math.random() < 0.2 });
  if (kind === 'swat') Object.assign(look, { top: 1, topColor: 0x15171c, bottom: 3, bottomColor: 0x15171c, shoe: 1, shoeColor: 0x101010, hat: 4, hatColor: 0x20232a, glasses: true, female: false });
  if (kind === 'thug') Object.assign(look, { top: pick([1, 3, 5]), topColor: pick([0x7a1f1f, 0x1f3a7a, 0x222222, 0x3a3a3a]), bottom: 0, hat: Math.random() < 0.5 ? 2 : 0, glasses: Math.random() < 0.4, female: false });
  if (kind === 'army') Object.assign(look, { top: 2, topColor: 0x4b5a3a, bottom: 3, bottomColor: 0x4b5a3a, shoe: 1, shoeColor: 0x111111, hat: 4, hatColor: 0x4b5a3a, glasses: true, female: false });
  return look;
}
export function playerLook() { return { female: false, skin: SKINS[1], hair: 1, hairColor: HAIR_COLORS[1], ...OUTFITS[0].look, scale: 1, fat: 1, shirt: 0xffffff, outfit: 'casual', eye: 0x5a3b22 }; }

const BONES = ['hips', 'spine', 'head', 'shL', 'elL', 'shR', 'elR', 'thL', 'knL', 'thR', 'knR'];
const REST = { hips: [0, 0.95, 0], spine: [0, 0.06, 0], head: [0, 0.54, 0], shL: [0.225, 0.46, 0], elL: [0.03, -0.3, 0], shR: [-0.225, 0.46, 0], elR: [-0.03, -0.3, 0], thL: [0.09, -0.04, 0], knL: [0, -0.44, 0], thR: [-0.09, -0.04, 0], knR: [0, -0.44, 0] };
const PARENT = { spine: 'hips', head: 'spine', shL: 'spine', elL: 'shL', shR: 'spine', elR: 'shR', thL: 'hips', knL: 'thL', thR: 'hips', knR: 'thR' };
const WORLD = {};
for (const b of BONES) { const p = PARENT[b]; WORLD[b] = p ? [WORLD[p][0] + REST[b][0], WORLD[p][1] + REST[b][1], WORLD[p][2] + REST[b][2]] : [...REST[b]]; }

const geoCache = new Map();
// level: 0 fern, 1 mittel, 2 voll; -1 = je nach Qualitätsstufe (lite → mittel)
function buildGeom(look, forceLevel = -1) {
  const level = forceLevel >= 0 ? forceLevel : (G.quality && G.quality.lite ? 1 : 2);
  const key = level + JSON.stringify(look, (k, v) => (k === 'scale' ? undefined : v));
  const hit = geoCache.get(key); if (hit) return hit;
  const g = buildBody(look, level);
  geoCache.set(key, g);
  if (geoCache.size > 160) { const k0 = geoCache.keys().next().value; geoCache.get(k0).dispose(); geoCache.delete(k0); }
  return g;
}

const GUNS = {};
function gunMesh(kind) {
  const b = new Builder();
  if (kind === 'pistol') { b.box(0, 0, 0.1, 0.04, 0.06, 0.2, 0x222222); b.box(0, -0.06, 0.04, 0.035, 0.1, 0.05, 0x222222); }
  else if (kind === 'smg') { b.box(0, 0, 0.14, 0.05, 0.08, 0.3, 0x2a2a2a); b.box(0, -0.1, 0.1, 0.035, 0.14, 0.05, 0x1a1a1a); b.box(0, 0.0, 0.34, 0.025, 0.025, 0.14, 0x111111); }
  else if (kind === 'shotgun') { b.box(0, 0, 0.25, 0.045, 0.06, 0.6, 0x3a2a1a); b.box(0, 0.02, 0.45, 0.04, 0.04, 0.3, 0x222222); }
  else if (kind === 'rifle') { b.box(0, 0, 0.3, 0.05, 0.09, 0.72, 0x2d3a2a); b.box(0, 0.07, 0.25, 0.03, 0.04, 0.2, 0x111111); b.box(0, -0.1, 0.18, 0.035, 0.14, 0.05, 0x1a1a1a); }
  else if (kind === 'knife') { b.box(0, 0, 0.1, 0.012, 0.04, 0.22, 0xc8ccd0); b.box(0, 0, -0.02, 0.03, 0.035, 0.1, 0x222222); }
  else if (kind === 'machete') { b.box(0, 0, 0.3, 0.012, 0.07, 0.5, 0xb8bcc2); b.box(0, 0, -0.02, 0.03, 0.04, 0.12, 0x3a2a1a); }
  else if (kind === 'revolver') { b.box(0, 0, 0.12, 0.04, 0.06, 0.24, 0x555a60); b.cyl(0, 0, 0.1, 0.035, 0.035, 0.07, 8, 0x444444); b.box(0, -0.07, 0.03, 0.035, 0.11, 0.05, 0x4a2f18); }
  else if (kind === 'deagle') { b.box(0, 0, 0.13, 0.045, 0.07, 0.3, 0x9a9ea4); b.box(0, -0.07, 0.04, 0.035, 0.11, 0.05, 0x222222); }
  else if (kind === 'uzi') { b.box(0, 0, 0.1, 0.05, 0.08, 0.22, 0x222222); b.box(0, -0.1, 0.08, 0.03, 0.14, 0.04, 0x1a1a1a); b.box(0, 0.0, 0.26, 0.02, 0.02, 0.1, 0x111111); }
  else if (kind === 'autoshotgun') { b.box(0, 0, 0.28, 0.05, 0.07, 0.62, 0x2a2a2a); b.cyl(0, -0.06, 0.28, 0.05, 0.05, 0.16, 8, 0x1a1a1a); b.box(0, -0.03, 0.02, 0.04, 0.06, 0.2, 0x3a2a1a); }
  else if (kind === 'ak47') { b.box(0, 0, 0.3, 0.05, 0.085, 0.74, 0x3a2a1a); b.box(0, 0.05, 0.4, 0.03, 0.03, 0.3, 0x111111); b.box(0, -0.11, 0.24, 0.03, 0.16, 0.06, 0x1a1a1a); }
  else if (kind === 'sniper') { b.box(0, 0, 0.4, 0.045, 0.08, 1.0, 0x1f2a22); b.cyl(0, 0.09, 0.35, 0.03, 0.03, 0.3, 8, 0x111111); b.box(0, 0, 0.95, 0.02, 0.02, 0.3, 0x111111); }
  else if (kind === 'minigun') { b.box(0, 0, 0.1, 0.1, 0.12, 0.3, 0x333333); for (let i = 0; i < 4; i++) { const a = i * 1.57; b.cyl(Math.cos(a) * 0.035, Math.sin(a) * 0.035, 0.45, 0.014, 0.014, 0.55, 6, 0x222222); } }
  else if (kind === 'rpg') { b.cyl(0, 0, 0.3, 0.055, 0.055, 0.9, 8, 0x4a5a3a); b.cyl(0, 0, 0.82, 0.09, 0.05, 0.2, 8, 0x2a3a22); b.box(0, -0.1, 0.2, 0.03, 0.14, 0.05, 0x222222); }
  else if (kind === 'grenade') { b.cyl(0, 0, 0.05, 0.05, 0.05, 0.12, 8, 0x4a5a3a); }
  else if (kind === 'bat') { b.cyl(0, 0, 0.3, 0.03, 0.05, 0.8, 6, 0x9a6a3a, false); }
  const m = new THREE.Mesh(b.build(), M.flat); m.castShadow = true;
  return m;
}

export class Person {
  constructor(look) {
    this.look = look; this.lod = 0; this.group = new THREE.Group();
    const bl = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), M.blob); bl.rotation.x = -Math.PI / 2; bl.position.y = 0.03; this.group.add(bl); this.blob = bl;
    this.bones = {}; this.mesh = null;
    this.phase = Math.random() * 6; this.state = 'idle'; this.speed = 0; this.aimBlend = 0; this.swimT = 0;
    this.deadT = 0; this.sitBlend = 0; this.fear = 0; this.tilt = 0; this.shoot = 0; this.punch = 0; this.hit = 0; this.stateT = 0;
    this.gun = null; this.gunKind = null; this.umbrella = null; this.hold = 0; this.phone = 0;
    this.build();
  }
  build() {
    if (this.mesh) { this.group.remove(this.mesh); }
    const geom = buildGeom(this.look); this.lod = 0;
    const bones = {};
    for (const b of BONES) { const o = new THREE.Bone(); o.position.set(...REST[b]); bones[b] = o; }
    for (const b of BONES) if (PARENT[b]) bones[PARENT[b]].add(bones[b]);
    const arr = BONES.map((b) => bones[b]);
    const mesh = new THREE.SkinnedMesh(geom, M.person);
    mesh.add(bones.hips); mesh.bind(new THREE.Skeleton(arr));
    mesh.castShadow = true; mesh.frustumCulled = false;
    this.bones = bones; this.mesh = mesh; this.group.add(mesh);
    mesh.scale.setScalar(this.look.scale || 1);
    if (this.gunKind) { const k = this.gunKind; this.gunKind = null; this.setGun(k); }
    if (this.umbrella) { bones.elR.add(this.umbrella); }
  }
  setLook(look) { this.look = look; this.build(); }
  // l: 0 nah (Qualität bestimmt Detail), 2 mittel, 1 fern (ohne Schattenwurf)
  setLOD(l) { if (l === this.lod || !this.mesh) return; this.lod = l; this.mesh.geometry = buildGeom(this.look, l === 1 ? 0 : l === 2 ? 1 : -1); this.mesh.castShadow = l !== 1; }
  setGun(kind) {
    if (this.gun) { this.gun.parent && this.gun.parent.remove(this.gun); }
    this.gunKind = kind; this.gun = null;
    if (!kind) return;
    GUNS[kind] = GUNS[kind] || gunMesh(kind);
    this.gun = GUNS[kind].clone(); this.gun.position.set(0, -0.36, 0.035); this.gun.rotation.x = Math.PI / 2 * 1.0 - Math.PI / 2 + Math.PI / 2;
    this.gun.rotation.set(Math.PI / 2, 0, 0);
    this.bones.elR.add(this.gun);
  }
  setUmbrella(on) {
    if (on && !this.umbrella) {
      const b = new Builder(); b.cyl(0, 0.4, 0, 0.015, 0.015, 0.8, 5, 0x222222, false); b.cyl(0, 0.8, 0, 0.5, 0.05, 0.12, 10, [0xc0392b, 0x2980b9, 0x27ae60, 0x8e44ad, 0x222222][Math.floor(Math.random() * 5)], true);
      this.umbrella = new THREE.Mesh(b.build(), M.flat); this.umbrella.position.set(0, -0.3, 0.1); this.umbrella.rotation.x = -0.2; this.bones.elR.add(this.umbrella);
    } else if (!on && this.umbrella) { this.umbrella.parent && this.umbrella.parent.remove(this.umbrella); this.umbrella = null; }
  }
  // opts: speed (m/s), moving, aim, swim, air (vy), sit, dead, cower, shoot kick, punch
  animate(dt, o) {
    const B = this.bones, sp = o.speed || 0;
    this.stateT += dt;
    const run = clamp(sp / 5.5, 0, 1.4);
    this.phase += dt * (3.2 + sp * 1.55);
    const ph = this.phase;
    const target = {};
    this.aimBlend = damp(this.aimBlend, o.aim ? 1 : 0, 14, dt);
    this.sitBlend = damp(this.sitBlend, o.sit ? 1 : 0, 12, dt);
    this.deadT = damp(this.deadT, o.dead ? 1 : 0, 6, dt);
    this.fear = damp(this.fear, o.cower ? 1 : 0, 8, dt);
    this.shoot = Math.max(0, this.shoot - dt * 8); this.punch = Math.max(0, this.punch - dt * 3.2); this.hit = Math.max(0, this.hit - dt * 3);
    const walkAmp = clamp(sp / 2.2, 0, 1) * (sp > 5 ? 0.95 : 0.65);
    const s = Math.sin(ph), c = Math.cos(ph);
    // Standardpose
    let thL = s * walkAmp, thR = -s * walkAmp, knL = Math.max(0, -c) * walkAmp * 1.1 + (sp > 5 ? 0.3 : 0), knR = Math.max(0, c) * walkAmp * 1.1 + (sp > 5 ? 0.3 : 0);
    let shL = -s * walkAmp * 0.9, shR = s * walkAmp * 0.9, elL = -0.15 - Math.max(0, run - 0.5) * 1.1, elR = elL;
    let lean = run * 0.18, hipY = REST.hips[1] - Math.abs(c) * 0.03 * walkAmp, rootRx = 0, rootRz = 0;
    // Idle-Atmung
    const br = Math.sin(this.stateT * 1.8) * 0.012; shL += br; shR -= br;
    if (o.air !== undefined && Math.abs(o.air) > 0.5 && !o.swim) { thL = -0.5; thR = 0.3; knL = 0.9; knR = 0.5; shL = -0.4; shR = -0.4; elL = elR = -0.3; hipY -= 0.0; }
    let swimming = o.swim;
    if (swimming) {
      this.swimT += dt * (2 + sp * 1.5); const w = this.swimT;
      rootRx = Math.PI / 2 - 0.2; lean = 0; thL = Math.sin(w * 2) * 0.4; thR = -Math.sin(w * 2) * 0.4; knL = knR = 0.2;
      shL = -3.0 + Math.sin(w) * 1.2 - (sp > 0.3 ? 0 : 1.2); shR = -3.0 - Math.sin(w) * 1.2 - (sp > 0.3 ? 0 : 1.2); elL = elR = -0.3; hipY = 0.7;
    }
    // Zielen / Schießen
    const ab = this.aimBlend;
    if (ab > 0.01 && this.gun) {
      const kick = this.shoot * 0.25;
      shR = lerp(shR, -1.45 - kick, ab); elR = lerp(elR, -0.1, ab); shL = lerp(shL, -1.2, ab); elL = lerp(elL, -0.5, ab);
      B.shL.rotation.z = lerp(0, -0.35, ab); B.shR.rotation.z = lerp(0, 0.04, ab);
    } else { B.shL.rotation.z = 0.05; B.shR.rotation.z = -0.05; }
    if (this.punch > 0 && !(ab > 0.5)) { const p = Math.sin((1 - this.punch) * Math.PI); shR = -1.5 * p; elR = -0.2; lean += 0.2 * p; }
    if (this.phone > 0.5) { shR = -1.9; elR = -2.1; }
    if (this.hold > 0.5 && !swimming) { shR = -0.9; shL = -0.9; elR = elL = -1.5; }
    // Sitzen (Motorrad)
    const sb = this.sitBlend;
    if (sb > 0.01) { thL = lerp(thL, -1.3, sb); thR = lerp(thR, -1.3, sb); knL = lerp(knL, 1.5, sb); knR = lerp(knR, 1.5, sb); hipY = lerp(hipY, 0.62, sb); shL = lerp(shL, -1.1, sb); shR = lerp(shR, -1.1, sb); elL = lerp(elL, -0.5, sb); elR = lerp(elR, -0.5, sb); lean = lerp(lean, 0.25, sb); }
    // Angst: kauern
    const fe = this.fear;
    if (fe > 0.01) { thL = lerp(thL, -1.0, fe); thR = lerp(thR, -1.0, fe); knL = lerp(knL, 1.9, fe); knR = lerp(knR, 1.9, fe); hipY = lerp(hipY, 0.5, fe); shL = lerp(shL, -1.9, fe); shR = lerp(shR, -1.9, fe); elL = lerp(elL, -2.1, fe); elR = lerp(elR, -2.1, fe); lean = lerp(lean, 0.6, fe); }
    // Treffer
    lean += this.hit * -0.3;
    B.thL.rotation.x = thL; B.thR.rotation.x = thR; B.knL.rotation.x = knL; B.knR.rotation.x = knR;
    B.shL.rotation.x = shL; B.shR.rotation.x = shR; B.elL.rotation.x = elL; B.elR.rotation.x = elR;
    B.spine.rotation.x = lean; B.spine.rotation.y = (o.twist || 0) * 0.4 + Math.sin(ph) * walkAmp * 0.08;
    B.head.rotation.y = (o.look || 0); B.head.rotation.x = (o.lookPitch || 0) - lean * 0.6;
    B.hips.position.y = hipY; B.hips.rotation.y = -Math.sin(ph) * walkAmp * 0.08;
    // Tod: nach hinten fallen
    const dd = this.deadT;
    this.mesh.rotation.x = rootRx * (1 - dd) - dd * (Math.PI / 2 - 0.08);
    this.mesh.position.y = dd * 0.17 + (rootRx ? 0.1 : 0);
    if (this.gun) this.gun.visible = true;
  }
  dispose() { /* Geometrie ist gecacht */ }
}
