// Planare Echtzeit-Spiegelung: Ozean und nasse Straßen reflektieren Stadt, Himmel und Fahrzeuge
import * as THREE from 'three';
import { G } from './game.js';
import * as TR from './terrain.js';
import { Hooks } from './materials.js';

const PY = 0.02;             // Spiegelebene (Straßenniveau)
const _v = new THREE.Vector3(), _rot = new THREE.Matrix4(), _look = new THREE.Vector3(), _tgt = new THREE.Vector3(), _q = new THREE.Vector4(), _clip = new THREE.Vector4();
const TEXMAT = new THREE.Matrix4();
const _plane = new THREE.Plane(), _n = new THREE.Vector3(0, 1, 0), _p0 = new THREE.Vector3(0, PY, 0), _v2 = new THREE.Vector2();

export const Reflect = {
  enabled: false, roads: true, scale: 0.5, every: 1, rt: null, vcam: new THREE.PerspectiveCamera(), texMat: TEXMAT,
  uniforms: { tReflect: { value: null }, uTexMat: { value: TEXMAT }, uWetAmt: { value: 0 }, uReflY: { value: PY }, uReflStr: { value: 1 }, uOceanReflect: { value: 0 } },
  active: false, frame: 0, checkT: 0, waterVisible: false, ocean: null, hide: [],
  init(renderer, opts) {
    this.renderer = renderer; this.enabled = !!opts.enabled; this.scale = opts.scale || 0.5; this.roads = opts.roads !== false; this.every = opts.every || 1;
    if (this.enabled) this.makeRT();
  },
  makeRT() {
    const s = this.renderer.getDrawingBufferSize(_v2), w = Math.max(128, Math.floor(s.x * this.scale)), h = Math.max(96, Math.floor(s.y * this.scale));
    if (this.rt) this.rt.dispose();
    this.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: true, samples: 0, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.rt.texture.generateMipmaps = false;
    this.uniforms.tReflect.value = this.rt.texture;
  },
  resize() { if (this.enabled) this.makeRT(); },
  // Ist Wasser im Blickfeld?
  scanWater(camera) {
    camera.getWorldDirection(_look); const hx = _look.x, hz = _look.z, hl = Math.hypot(hx, hz) || 1;
    const dx = hx / hl, dz = hz / hl, cx = camera.position.x, cz = camera.position.z;
    if (camera.position.y > 120) { // Flug: großes Gebiet
      for (const t of [0, 400, 900, 1600]) if (TR.terrainHeight(cx + dx * t, cz + dz * t) < TR.WATER - 0.3) return true;
    }
    for (const ang of [0, 0.5, -0.5]) {
      const c = Math.cos(ang), s = Math.sin(ang), ex = dx * c - dz * s, ez = dx * s + dz * c;
      for (const t of [10, 60, 140, 260, 450, 800, 1300]) if (TR.terrainHeight(cx + ex * t, cz + ez * t) < TR.WATER - 0.3) return true;
    }
    return false;
  },
  update(dt, camera) {
    const w = G.weather ? G.weather.wet : 0, st = G.state;
    this.checkT -= dt;
    if (this.checkT <= 0) { this.checkT = 0.35; this.waterVisible = this.enabled && this.scanWater(camera); }
    const inCity = camera.position.x > -1200 && camera.position.x < 1300 && camera.position.z > -1200 && camera.position.z < 1300;
    const wetNeed = this.enabled && this.roads && w > 0.1 && inCity;
    const was = this.active;
    this.active = this.enabled && (this.waterVisible || wetNeed) && camera.position.y > PY + 0.3;
    this.uniforms.uWetAmt.value = wetNeed ? Math.min(1, w * 1.1) : 0;
    this.uniforms.uOceanReflect.value = this.active && this.waterVisible ? 1 : 0;
  },
  // Spiegelbild rendern (vor dem Hauptbild)
  render(scene, camera) {
    if (!this.active || !this.rt) return;
    this.frame++; if (this.every > 1 && this.frame % this.every !== 0 && this.hasImage) return;
    const r = this.renderer, vc = this.vcam;
    camera.updateMatrixWorld();
    const cp = camera.position;
    _rot.extractRotation(camera.matrixWorld);
    _look.set(0, 0, -1).applyMatrix4(_rot).add(cp);
    _tgt.set(_look.x, 2 * PY - _look.y, _look.z);
    vc.position.set(cp.x, 2 * PY - cp.y, cp.z);
    vc.up.set(0, 1, 0).applyMatrix4(_rot); vc.up.y *= -1;
    vc.lookAt(_tgt);
    vc.near = camera.near; vc.far = Math.min(camera.far, 4500); vc.fov = camera.fov; vc.aspect = camera.aspect;
    vc.updateMatrixWorld(); vc.projectionMatrix.copy(camera.projectionMatrix); vc.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    // Textur-Matrix (Welt → Spiegel-UV)
    const tm = this.texMat;
    tm.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    tm.multiply(vc.projectionMatrix); tm.multiply(vc.matrixWorldInverse);
    // Schräge Near-Plane: alles unter der Spiegelebene abschneiden
    _plane.setFromNormalAndCoplanarPoint(_n, _p0); _plane.applyMatrix4(vc.matrixWorldInverse);
    _clip.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
    const pm = vc.projectionMatrix, e = pm.elements;
    _q.x = (Math.sign(_clip.x) + e[8]) / e[0]; _q.y = (Math.sign(_clip.y) + e[9]) / e[5]; _q.z = -1.0; _q.w = (1.0 + e[10]) / e[14];
    _clip.multiplyScalar(2.0 / _clip.dot(_q));
    e[2] = _clip.x; e[6] = _clip.y; e[10] = _clip.z + 1.0 - 0.003; e[14] = _clip.w;
    // Rendern
    const prevRT = r.getRenderTarget(), prevAuto = r.shadowMap.autoUpdate, prevXr = r.xr.enabled;
    const hidden = [];
    for (const o of this.hide) if (o && o.visible) { o.visible = false; hidden.push(o); }
    if (this.ocean) { this.ocean.visible = false; }
    r.shadowMap.autoUpdate = false; r.xr.enabled = false;
    r.setRenderTarget(this.rt); r.clear();
    r.render(scene, vc);
    r.setRenderTarget(prevRT); r.shadowMap.autoUpdate = prevAuto; r.xr.enabled = prevXr;
    if (this.ocean) this.ocean.visible = true;
    for (const o of hidden) o.visible = true;
    this.hasImage = true;
  },
};
Hooks.planar = null;
