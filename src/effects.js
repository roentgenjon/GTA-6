// Partikel (Rauch, Feuer, Funken, Staub, Gischt), Reifenspuren, Einschläge
import * as THREE from 'three';
import { G } from './game.js';
import { rr, clamp } from './util.js';

const VS = `attribute float size; attribute vec4 col; varying vec4 vC; uniform float scale;
void main(){ vC = col; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = size*scale/(-mv.z); gl_Position = projectionMatrix*mv; }`;
const FS = `varying vec4 vC; void main(){ vec2 p = gl_PointCoord-0.5; float d = length(p); if(d>0.5) discard; float a = smoothstep(0.5,0.0,d); gl_FragColor = vec4(vC.rgb, vC.a*a); }`;

class PSys {
  constructor(scene, N, additive) {
    this.N = N; this.p = []; this.free = [];
    this.pos = new Float32Array(N * 3); this.col = new Float32Array(N * 4); this.size = new Float32Array(N);
    this.life = new Float32Array(N); this.max = new Float32Array(N); this.vel = new Float32Array(N * 3); this.grow = new Float32Array(N); this.grav = new Float32Array(N); this.c0 = new Float32Array(N * 4); this.fade = new Float32Array(N);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('col', new THREE.BufferAttribute(this.col, 4)); g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    this.mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, uniforms: { scale: { value: 800 } } });
    this.mesh = new THREE.Points(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 4; scene.add(this.mesh);
    this.head = 0;
    for (let i = 0; i < N; i++) { this.life[i] = 0; this.pos[i * 3 + 1] = -9999; }
  }
  emit(x, y, z, vx, vy, vz, size, grow, life, r, g, b, a, grav = 0) {
    const i = this.head; this.head = (this.head + 1) % this.N;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z; this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.size[i] = size; this.grow[i] = grow; this.life[i] = life; this.max[i] = life; this.grav[i] = grav;
    this.c0[i * 4] = r; this.c0[i * 4 + 1] = g; this.c0[i * 4 + 2] = b; this.c0[i * 4 + 3] = a;
  }
  update(dt, scale) {
    this.mat.uniforms.scale.value = scale;
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) { if (this.pos[i * 3 + 1] > -9000) { this.pos[i * 3 + 1] = -9999; this.col[i * 4 + 3] = 0; } continue; }
      this.life[i] -= dt; const t = 1 - this.life[i] / this.max[i];
      this.vel[i * 3 + 1] += this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      this.col[i * 4] = this.c0[i * 4]; this.col[i * 4 + 1] = this.c0[i * 4 + 1]; this.col[i * 4 + 2] = this.c0[i * 4 + 2];
      this.col[i * 4 + 3] = this.c0[i * 4 + 3] * (t < 0.1 ? t * 10 : 1 - (t - 0.1) / 0.9);
    }
    const g = this.mesh.geometry; g.attributes.position.needsUpdate = true; g.attributes.col.needsUpdate = true; g.attributes.size.needsUpdate = true;
  }
}

export const FX = {
  init(scene) {
    this.smoke = new PSys(scene, 1400, false); this.fire = new PSys(scene, 900, true);
    // Reifenspuren
    this.skidN = 700; this.skidPos = new Float32Array(this.skidN * 12); this.skidHead = 0; this.skidAlpha = new Float32Array(this.skidN * 4);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.skidPos, 3));
    const idx = []; for (let i = 0; i < this.skidN; i++) idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3); g.setIndex(idx);
    for (let i = 0; i < this.skidPos.length; i += 3) this.skidPos[i + 1] = -500;
    this.skidMesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    this.skidMesh.frustumCulled = false; scene.add(this.skidMesh); this.skidLast = new Map();
    // Mündungsfeuer + Tracer
    this.tracers = [];
    this.tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9, toneMapped: false });
    this.muzzle = new THREE.PointLight(0xffc070, 0, 14, 2); scene.add(this.muzzle); this.muzzleT = 0;
    this.explLight = new THREE.PointLight(0xff8a30, 0, 60, 2); scene.add(this.explLight); this.explT = 0;
    this.scene = scene; this.shake = 0;
  },
  update(dt, camera) {
    const scale = G.renderer ? G.renderer.domElement.height * 0.5 / Math.tan(camera.fov * Math.PI / 360) : 800;
    this.smoke.update(dt, scale); this.fire.update(dt, scale);
    this.shake = Math.max(0, this.shake - dt * 2.2);
    this.muzzleT -= dt; this.muzzle.intensity = this.muzzleT > 0 ? 25 : 0;
    this.explT -= dt; this.explLight.intensity = Math.max(0, this.explT) * 700;
    for (let i = this.tracers.length - 1; i >= 0; i--) { const t = this.tracers[i]; t.life -= dt; if (t.life <= 0) { this.scene.remove(t.line); t.line.geometry.dispose(); this.tracers.splice(i, 1); } }
  },
  puffSmoke(x, y, z, amt = 1, dark = 0.3, rise = 2) {
    this.smoke.emit(x + rr(-0.3, 0.3), y, z + rr(-0.3, 0.3), rr(-0.6, 0.6) + (G.weather ? 0.6 : 0), rise + rr(0, 1), rr(-0.6, 0.6), 1.2 * amt, 2.4 * amt, rr(1.6, 2.8), dark, dark, dark, 0.55);
  },
  dust(x, y, z, vx, vz, col = [0.6, 0.55, 0.45]) { this.smoke.emit(x, y + 0.1, z, vx * 0.2 + rr(-1, 1), rr(0.3, 1.2), vz * 0.2 + rr(-1, 1), 0.8, 2.2, rr(0.7, 1.4), col[0], col[1], col[2], 0.45); },
  splash(x, y, z, vx, vz, power = 1) { for (let i = 0; i < 2; i++) this.smoke.emit(x + rr(-0.4, 0.4), y, z + rr(-0.4, 0.4), vx * 0.15 + rr(-1, 1), rr(1, 3) * power, vz * 0.15 + rr(-1, 1), 0.7, 1.4, rr(0.5, 1.0), 0.9, 0.95, 1, 0.5, -6); },
  sparks(x, y, z, n = 6, nx = 0, nz = 0) { for (let i = 0; i < n; i++) this.fire.emit(x, y, z, rr(-4, 4) + nx * 3, rr(0.5, 4), rr(-4, 4) + nz * 3, 0.22, -0.1, rr(0.2, 0.55), 1, rr(0.6, 0.9), 0.3, 1, -9); },
  blood(x, y, z, n = 4) { for (let i = 0; i < n; i++) this.smoke.emit(x, y, z, rr(-2, 2), rr(0.5, 2.5), rr(-2, 2), 0.18, 0.2, rr(0.3, 0.7), 0.6, 0.02, 0.02, 0.9, -8); },
  flame(x, y, z, s = 1) { this.fire.emit(x + rr(-0.4, 0.4), y, z + rr(-0.4, 0.4), rr(-0.4, 0.4), rr(2, 4.5), rr(-0.4, 0.4), 1.4 * s, -0.6 * s, rr(0.4, 0.9), 1, rr(0.35, 0.65), 0.12, 0.8); },
  explosion(x, y, z, power = 1) {
    for (let i = 0; i < 26 * power; i++) this.fire.emit(x + rr(-1, 1), y + rr(0, 1.5), z + rr(-1, 1), rr(-8, 8) * power, rr(1, 9) * power, rr(-8, 8) * power, rr(2.5, 6) * power, rr(-4, 1), rr(0.5, 1.1), 1, rr(0.4, 0.8), 0.15, 0.95);
    for (let i = 0; i < 30 * power; i++) this.smoke.emit(x + rr(-2, 2), y + rr(0, 2), z + rr(-2, 2), rr(-5, 5), rr(2, 8), rr(-5, 5), rr(3, 6), rr(2, 4), rr(2, 4.5), 0.12, 0.12, 0.12, 0.75);
    this.explT = 0.35; this.explLight.position.set(x, y + 3, z); this.shake = Math.min(1.5, this.shake + 0.9 * power);
  },
  skid(id, x, z, y, yaw, intensity, width = 0.22) {
    const last = this.skidLast.get(id);
    if (intensity <= 0.05) { if (last) this.skidLast.delete(id); return; }
    const sx = Math.cos(yaw) * width, sz = -Math.sin(yaw) * width;
    if (last && Math.hypot(x - last.x, z - last.z) > 0.35 && Math.hypot(x - last.x, z - last.z) < 4) {
      const i = this.skidHead, p = this.skidPos, o = i * 12, h = y + 0.03;
      p[o] = last.x - last.sx; p[o + 1] = h; p[o + 2] = last.z - last.sz; p[o + 3] = last.x + last.sx; p[o + 4] = h; p[o + 5] = last.z + last.sz;
      p[o + 6] = x + sx; p[o + 7] = h; p[o + 8] = z + sz; p[o + 9] = x - sx; p[o + 10] = h; p[o + 11] = z - sz;
      this.skidHead = (this.skidHead + 1) % this.skidN; this.skidMesh.geometry.attributes.position.needsUpdate = true;
      this.skidLast.set(id, { x, z, sx, sz });
    } else if (!last || Math.hypot(x - last.x, z - last.z) >= 4) this.skidLast.set(id, { x, z, sx, sz });
  },
  tracer(a, b) {
    const g = new THREE.BufferGeometry().setFromPoints([a, b]);
    const line = new THREE.Line(g, this.tracerMat); line.frustumCulled = false; this.scene.add(line); this.tracers.push({ line, life: 0.05 });
  },
  flash(pos) { this.muzzle.position.copy(pos); this.muzzleT = 0.05; },
};
