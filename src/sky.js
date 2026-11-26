// Himmel, Tageszeit, Wetter, Beleuchtung
import * as THREE from 'three';
import { G } from './game.js';
import { clamp, lerp, smoothstep, colorLerp, rr, damp } from './util.js';

const KF = [
  { h: 0,    zen: 0x04061a, hor: 0x0c1230, sun: 0x6a7fc0, si: 0, hs: 0x34467e, hg: 0x12151f, hi: 0.95, ex: 1.2 },
  { h: 4.8,  zen: 0x060a20, hor: 0x161c3c, sun: 0x6a7fc0, si: 0, hs: 0x34467e, hg: 0x12151f, hi: 0.95, ex: 1.2 },
  { h: 5.9,  zen: 0x25315c, hor: 0xff9a66, sun: 0xff9a60, si: 0.7, hs: 0x6a7aa8, hg: 0x2a2a30, hi: 0.7, ex: 1.05 },
  { h: 7.3,  zen: 0x4a7fc4, hor: 0xcbdcee, sun: 0xffd6a0, si: 2.6, hs: 0x9fbfe6, hg: 0x5a5448, hi: 1.0, ex: 1.0 },
  { h: 10,   zen: 0x2f6fc6, hor: 0xa9cff0, sun: 0xfff1dc, si: 3.6, hs: 0xa8c8f0, hg: 0x6a6a58, hi: 1.2, ex: 0.95 },
  { h: 13,   zen: 0x2a68c2, hor: 0x9fc8f0, sun: 0xffffff, si: 4.0, hs: 0xa8c8f0, hg: 0x6e6c5a, hi: 1.25, ex: 0.92 },
  { h: 16.5, zen: 0x3070bc, hor: 0xb4cdea, sun: 0xffe6bb, si: 3.3, hs: 0xa8c0e0, hg: 0x6a6455, hi: 1.1, ex: 0.95 },
  { h: 18.2, zen: 0x36528e, hor: 0xffaa62, sun: 0xffa458, si: 2.3, hs: 0xd0b8a0, hg: 0x5a4a40, hi: 0.9, ex: 1.0 },
  { h: 19.2, zen: 0x1f2c5c, hor: 0xff6b4a, sun: 0xff7a44, si: 0.9, hs: 0x8a78a0, hg: 0x3a2e38, hi: 0.7, ex: 1.05 },
  { h: 20.4, zen: 0x0c1234, hor: 0x4c3c6c, sun: 0x7080c0, si: 0.05, hs: 0x3a4a82, hg: 0x16161e, hi: 0.95, ex: 1.15 },
  { h: 22,   zen: 0x050818, hor: 0x0e1536, sun: 0x6a7fc0, si: 0, hs: 0x34467e, hg: 0x12151f, hi: 0.95, ex: 1.2 },
  { h: 24,   zen: 0x04061a, hor: 0x0c1230, sun: 0x6a7fc0, si: 0, hs: 0x34467e, hg: 0x12151f, hi: 0.95, ex: 1.2 },
];
function sample(h) {
  let a = KF[0], b = KF[1];
  for (let i = 0; i < KF.length - 1; i++) if (h >= KF[i].h && h <= KF[i + 1].h) { a = KF[i]; b = KF[i + 1]; break; }
  const t = (h - a.h) / (b.h - a.h || 1);
  return { zen: colorLerp(a.zen, b.zen, t), hor: colorLerp(a.hor, b.hor, t), sun: colorLerp(a.sun, b.sun, t), si: lerp(a.si, b.si, t), hs: colorLerp(a.hs, b.hs, t), hg: colorLerp(a.hg, b.hg, t), hi: lerp(a.hi, b.hi, t), ex: lerp(a.ex, b.ex, t) };
}

const SKY_VS = `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*p; gl_Position.z = gl_Position.w*0.99999; }`;
const SKY_FS = `
varying vec3 vDir;
uniform vec3 uSun, uMoon, uZen, uHor, uSunCol; uniform float uNight, uCloud, uTime, uFlash, uRain;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=.5,s=0.; for(int i=0;i<5;i++){ s+=a*noise(p); p*=2.07; a*=.5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  float h = clamp(d.y, 0., 1.);
  float t = pow(1.-h, 3.2);
  vec3 col = mix(uZen, uHor, t);
  if(d.y < 0.) col = mix(uHor, uHor*0.55, clamp(-d.y*4., 0., 1.));
  float sd = max(dot(d, uSun), 0.);
  float sunVis = smoothstep(-0.05, 0.1, uSun.y);
  col += uSunCol * (pow(sd, 1400.)*30. + pow(sd, 30.)*0.28 + pow(sd, 5.)*0.12) * sunVis * (1.-0.7*uRain);
  float md = dot(d, uMoon);
  col += vec3(.92,.95,1.)*smoothstep(0.99935, 0.9996, md)*uNight*1.6 + vec3(.3,.4,.65)*pow(max(md,0.), 80.)*0.18*uNight;
  if(d.y > 0.){
    vec2 sp = d.xz/(d.y+0.25)*70.; float s = hash(floor(sp));
    float st = step(0.987, s)*smoothstep(0., .25, d.y)*(0.55+0.45*sin(uTime*2.+s*60.));
    col += vec3(st)*uNight*(1.-uCloud*0.9);
  }
  if(d.y > 0.0){
    vec2 cp = d.xz/(d.y+0.18)*0.8 + vec2(uTime*0.012, uTime*0.004);
    float n = fbm(cp*1.4);
    float cov = mix(0.66, 0.30, uCloud);
    float c = smoothstep(cov, cov+0.22, n);
    float lit = 0.3 + 0.7*(1.-uNight);
    vec3 cc = mix(vec3(1.0,0.99,0.97), vec3(0.34,0.36,0.41), uRain)*lit;
    cc = mix(cc, uHor*1.25+vec3(0.1), t*0.65);
    cc += uSunCol*pow(sd, 6.)*0.5*sunVis*(1.-c*0.5);
    cc *= 1.0 - 0.35*smoothstep(cov+0.1, cov+0.4, n)*(1.-uRain);
    float fade = smoothstep(0.0, 0.14, d.y);
    col = mix(col, cc, c*fade);
    col += vec3(0.65,0.72,1.0)*uFlash*(0.5+c*1.2);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

export class Sky {
  constructor(scene, renderer) {
    this.scene = scene; this.renderer = renderer;
    this.uniforms = {
      uSun: { value: new THREE.Vector3(0, 1, 0) }, uMoon: { value: new THREE.Vector3(0, -1, 0) },
      uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() },
      uNight: { value: 0 }, uCloud: { value: 0.2 }, uTime: { value: 0 }, uFlash: { value: 0 }, uRain: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = -10; this.mesh.scale.setScalar(3000);
    scene.add(this.mesh);
    // Kopie für Umgebungs-Reflexion
    this.envScene = new THREE.Scene();
    this.envMesh = new THREE.Mesh(this.mesh.geometry, mat); this.envMesh.scale.setScalar(50); this.envMesh.frustumCulled = false;
    this.envScene.add(this.envMesh);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envRT = null; this.envTimer = 99;

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true; this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.8;
    this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 900;
    const sc = 160; Object.assign(this.sun.shadow.camera, { left: -sc, right: sc, top: sc, bottom: -sc });
    scene.add(this.sun); scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xaaccff, 0x666655, 1);
    scene.add(this.hemi);
    scene.fog = new THREE.FogExp2(0x9fc8f0, 0.00028);
    this.sunDir = new THREE.Vector3(); this.moonDir = new THREE.Vector3();
    this.exposure = 1; this.flash = 0; this.flashTimer = 5;
    this.setShadowRes(2048);
  }
  setShadowRes(n) { this.sun.shadow.mapSize.set(n, n); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } }
  update(dt, camPos, followPos) {
    const hour = G.hour, w = G.weather;
    const k = sample(hour);
    // Sonnenstand
    const dayA = Math.PI * (hour - 5.9) / 13.4;
    const sunUp = hour > 5.9 && hour < 19.3;
    this.sunDir.set(Math.cos(dayA), Math.sin(dayA) * 0.92 + 0.03, -0.38).normalize();
    if (!sunUp) { const nh = hour >= 19.3 ? hour - 19.3 : hour + 4.7; const nA = Math.PI * nh / 10.6; this.moonDir.set(Math.cos(nA), Math.sin(nA) * 0.85 + 0.05, 0.3).normalize(); }
    else this.moonDir.copy(this.sunDir).multiplyScalar(-1);
    if (sunUp) this.moonDir.set(-this.sunDir.x, -this.sunDir.y, 0.3).normalize();
    const night = 1 - smoothstep(-0.02, 0.2, this.sunDir.y);
    G.night = night;
    const cloud = w.cloud, rain = w.rain;
    const u = this.uniforms;
    u.uSun.value.copy(this.sunDir); u.uMoon.value.copy(this.moonDir);
    // Wetter dämpft Farben
    const grey = clamp(cloud * 0.45 + rain * 0.35, 0, 0.8);
    const lum = (c) => (c >> 16 & 255) * .3 + (c >> 8 & 255) * .59 + (c & 255) * .11;
    const grayC = (c, l) => { const y = Math.round(lum(c) * l); return colorLerp(c, (y << 16) | (y << 8) | y, grey); };
    u.uZen.value.setHex(grayC(k.zen, 0.8)); u.uHor.value.setHex(grayC(k.hor, 0.85)); u.uSunCol.value.setHex(k.sun);
    u.uNight.value = night; u.uCloud.value = cloud; u.uRain.value = rain; u.uTime.value = G.clock;
    // Blitz
    this.flashTimer -= dt;
    if (w.type === 'storm' && this.flashTimer <= 0) { this.flash = 1; this.flashTimer = rr(4, 12); G.lightning = { t: 0, delay: rr(0.4, 3.5), done: false }; }
    this.flash = Math.max(0, this.flash - dt * (this.flash > 0.5 ? 2.2 : 1.4));
    const fl = this.flash * (0.55 + 0.45 * Math.sin(G.clock * 60));
    u.uFlash.value = fl;
    if (G.lightning && !G.lightning.done) { G.lightning.t += dt; if (G.lightning.t > G.lightning.delay) { G.lightning.done = true; G.onThunder && G.onThunder(); } }
    // Lichter
    const daySun = k.si * (1 - cloud * 0.55) * (1 - rain * 0.25) * sunVisible(this.sunDir.y);
    const moonI = night * 0.45 * (1 - cloud * 0.5);
    const dir = night > 0.55 ? this.moonDir : this.sunDir;
    this.sun.color.setHex(night > 0.55 ? 0x8aa4ff : k.sun);
    this.sun.intensity = (night > 0.55 ? moonI : daySun) + fl * 1.5;
    const anchor = followPos || camPos;
    // Schatten-Kamera am Boden einrasten (Texel-Snap)
    const sc = this.sun.shadow.camera.right, tex = (sc * 2) / this.sun.shadow.mapSize.x;
    const ax = Math.round(anchor.x / tex) * tex, ay = anchor.y, az = Math.round(anchor.z / tex) * tex;
    this.sun.target.position.set(ax, ay, az);
    this.sun.position.set(ax + dir.x * 400, ay + Math.max(dir.y, 0.12) * 400 + (dir.y < 0.12 ? 40 : 0), az + dir.z * 400);
    this.sun.target.updateMatrixWorld();
    this.hemi.color.setHex(k.hs); this.hemi.groundColor.setHex(k.hg);
    this.hemi.intensity = k.hi * (1 - cloud * 0.1) * 0.9 + fl * 1.2;
    // Nebel
    const hor = new THREE.Color(this.uniforms.uHor.value);
    const fogD = 0.00026 + w.fog * 0.0042 + rain * 0.0007 + cloud * 0.00006;
    scene_fog(this.scene, hor, fogD, night);
    this.exposure = k.ex * (1 - cloud * 0.07);
    this.mesh.position.copy(camPos);
    // Umgebung aktualisieren
    this.envTimer += dt;
    if (this.envTimer > 4) { this.envTimer = 0; this.updateEnv(); }
    this.scene.environmentIntensity = clamp(0.25 + (1 - night) * 0.55 + night * 0.18, 0, 1) * (1 - 0.2 * rain);
    return k;
  }
  updateEnv() {
    const rt = this.pmrem.fromScene(this.envScene, 0, 0.1, 100);
    if (this.envRT) this.envRT.dispose();
    this.envRT = rt; this.scene.environment = rt.texture;
  }
}
function sunVisible(y) { return smoothstep(-0.02, 0.12, y); }
function scene_fog(scene, col, d, night) {
  scene.fog.color.copy(col); scene.fog.density = d;
}

// ---------- Wetter ----------
const WTYPES = {
  clear:    { cloud: 0.12, rain: 0, fog: 0 },
  clouds:   { cloud: 0.55, rain: 0, fog: 0 },
  overcast: { cloud: 0.88, rain: 0, fog: 0.05 },
  rain:     { cloud: 0.92, rain: 0.65, fog: 0.12 },
  storm:    { cloud: 1.0, rain: 1.0, fog: 0.2 },
  fog:      { cloud: 0.5, rain: 0, fog: 0.85 },
};
export const WEATHER_NAMES = { clear: 'Sonnig', clouds: 'Wolkig', overcast: 'Bedeckt', rain: 'Regen', storm: 'Gewitter', fog: 'Nebel' };
export class Weather {
  constructor() { this.type = 'clear'; this.cloud = 0.12; this.rain = 0; this.fog = 0; this.wet = 0; this.timer = 240; this.forced = null; this.target = WTYPES.clear; }
  set(type, instant = false) {
    this.type = type; this.target = WTYPES[type];
    if (instant) { this.cloud = this.target.cloud; this.rain = this.target.rain; this.fog = this.target.fog; }
  }
  next() {
    const t = this.type, r = Math.random();
    const table = { clear: ['clouds', 'clear', 'fog'], clouds: ['clear', 'overcast', 'rain', 'clouds'], overcast: ['rain', 'clouds', 'storm'], rain: ['storm', 'overcast', 'clouds', 'rain'], storm: ['rain', 'overcast'], fog: ['clear', 'clouds'] };
    const o = table[t]; this.set(o[Math.floor(r * o.length)]);
  }
  update(dt) {
    this.timer -= dt;
    if (this.timer <= 0 && !this.forced) { this.next(); this.timer = rr(180, 420); }
    const T = this.target, s = 0.35;
    this.cloud = damp(this.cloud, T.cloud, s * 0.5, dt); this.rain = damp(this.rain, T.rain, 0.3, dt); this.fog = damp(this.fog, T.fog, 0.2, dt);
    this.wet = clamp(this.wet + (this.rain > 0.2 ? dt * 0.08 : -dt * 0.012), 0, 1);
  }
}

// ---------- Regen ----------
export class Rain {
  constructor(scene) {
    this.N = 5000;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.N * 6);
    this.seed = new Float32Array(this.N * 3);
    for (let i = 0; i < this.N; i++) { this.seed[i * 3] = Math.random() * 60 - 30; this.seed[i * 3 + 1] = Math.random() * 40; this.seed[i * 3 + 2] = Math.random() * 60 - 30; }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.mat = new THREE.LineBasicMaterial({ color: 0xbfd0e6, transparent: true, opacity: 0.35, depthWrite: false, fog: false });
    this.mesh = new THREE.LineSegments(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 5;
    scene.add(this.mesh); this.t = 0;
  }
  update(dt, cam, amount, wind = 0.15) {
    this.mesh.visible = amount > 0.02;
    if (!this.mesh.visible) return;
    this.t += dt;
    const n = Math.floor(this.N * clamp(amount, 0, 1)), p = this.pos, s = this.seed, fall = 38;
    for (let i = 0; i < this.N; i++) {
      if (i >= n) { p[i * 6] = p[i * 6 + 3] = 0; p[i * 6 + 1] = p[i * 6 + 4] = -999; continue; }
      let y = ((s[i * 3 + 1] - this.t * fall) % 40 + 40) % 40;
      const x = cam.x + s[i * 3] + (40 - y) * wind * 0.3, z = cam.z + s[i * 3 + 2];
      const yy = cam.y - 12 + y;
      p[i * 6] = x; p[i * 6 + 1] = yy; p[i * 6 + 2] = z;
      p[i * 6 + 3] = x - wind * 0.4; p[i * 6 + 4] = yy + 1.1; p[i * 6 + 5] = z;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mat.opacity = 0.18 + amount * 0.25;
  }
}
