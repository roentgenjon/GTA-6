// Gelände, Ozean, Flughafen, Hafen, Landschaft; Welt-Update
import * as THREE from 'three';
import { Builder } from './builder.js';
import { M, initMaterials, updateMaterials } from './materials.js';
import { buildCity, city, makeInstanced, pineGeom } from './city.js';
import * as TR from './terrain.js';
import { G } from './game.js';
import { clamp, smoothstep, fbm, mulberry32, lerp, noise2 } from './util.js';
import * as T from './textures.js';

export const World = { city, spawns: { planes: [], helis: [], boats: [], cars: [] }, water: null, hills: [], landmarks: [] };

// ----- Wellen (identisch zu Shader) -----
const WV = [[1, 0.3, 0.05, 0.35, 1.1], [-0.4, 1, 0.09, 0.18, 1.5], [0.7, 0.7, 0.17, 0.08, 2.0]];
export function waveHeight(x, z, t) {
  let h = 0;
  for (const [dx, dz, k, a, s] of WV) h += Math.sin((x * dx + z * dz) * k + t * s) * a;
  return h;
}

function buildTerrain(scene, quality) {
  const SEG = quality === 'low' ? 320 : 512, size = TR.HALF * 2;
  const g = new THREE.PlaneGeometry(size, size, SEG, SEG);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position, n = pos.count, col = new Float32Array(n * 3), uv = g.attributes.uv;
  const c = new THREE.Color();
  const hs = new Float32Array(n);
  for (let k = 0; k < n; k++) hs[k] = TR.terrainHeight(pos.getX(k), pos.getZ(k));
  const stride = SEG + 1;
  for (let k = 0; k < n; k++) {
    const x = pos.getX(k), z = pos.getZ(k); let h = hs[k];
    const ix = k % stride, iz = (k / stride) | 0;
    const hx = hs[iz * stride + Math.min(SEG, ix + 1)] - hs[iz * stride + Math.max(0, ix - 1)], hz = hs[Math.min(SEG, iz + 1) * stride + ix] - hs[Math.max(0, iz - 1) * stride + ix];
    const slope = Math.hypot(hx, hz) / (2 * size / SEG);
    const dCity = Math.max(TR.CITY.x0 - x, TR.CITY.z0 - z, 0), inCity = x < 1300 && z < 1300 && dCity === 0;
    // Stadtbereich etwas absenken (Straßen liegen darüber)
    const flatDist = Math.min(dCity, Math.hypot(Math.max(TR.AIRPORT.x0 - x, 0, x - TR.AIRPORT.x1), Math.max(TR.AIRPORT.z0 - z, 0, z - TR.AIRPORT.z1)));
    const drop = 0.28 * (1 - smoothstep(0, 45, flatDist)) * (h > -0.5 ? 1 : 0);
    pos.setY(k, h - drop);
    const nz = noise2(x / 30, z / 30), nz2 = noise2(x / 7, z / 7);
    if (h < -1.4) c.setRGB(0.52, 0.45, 0.3).multiplyScalar(0.8 + (h + 30) * 0.003);
    else if (h < 1.0 && (x > 900 || z > 900) && !(x < 1160 && z < 1160 && h > -0.1 && dCity === 0 && x < 1160)) c.setHex(0xe4d3a3).multiplyScalar(0.92 + nz2 * 0.12);
    else if (inCity) c.setHex(0x6f8a52);
    else if (slope > 0.75) c.setHex(0x7b7468).multiplyScalar(0.85 + nz * 0.3);
    else if (h > 130) c.setHex(0x8c8a84).lerp(new THREE.Color(0xe8eef0), smoothstep(160, 230, h)).multiplyScalar(0.9 + nz * 0.2);
    else if (h > 55) c.setHex(0x4e7240).lerp(new THREE.Color(0x76704f), smoothstep(55, 130, h)).multiplyScalar(0.85 + nz * 0.3);
    else c.setHex(0x5c8d44).lerp(new THREE.Color(0x8d9a4f), nz).multiplyScalar(0.88 + nz2 * 0.2);
    col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    uv.setXY(k, x / 14, z / 14);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, M.terrain); mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
  scene.add(mesh);
  World.terrainMesh = mesh;
}

// ----- Ozean -----
function buildOcean(scene, sky) {
  const SEG = 360, size = TR.HALF * 2;
  const g = new THREE.PlaneGeometry(size, size, SEG, SEG); g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position, d = new Float32Array(pos.count);
  for (let k = 0; k < pos.count; k++) d[k] = clamp(TR.WATER - TR.terrainHeight(pos.getX(k), pos.getZ(k)), -2, 30);
  g.setAttribute('aDepth', new THREE.BufferAttribute(d, 1));
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uHor: sky.uniforms.uHor, uZen: sky.uniforms.uZen, uSun: sky.uniforms.uSun, uSunCol: sky.uniforms.uSunCol, uNight: sky.uniforms.uNight, uRain: sky.uniforms.uRain, uCam: { value: new THREE.Vector3() } }]);
  const mat = new THREE.ShaderMaterial({
    uniforms, fog: true, transparent: true, depthWrite: true,
    vertexShader: `
      attribute float aDepth; uniform float uTime; varying float vDepth; varying vec3 vW; varying vec3 vN;
      #include <fog_pars_vertex>
      vec4 wv(vec2 p){ float h=0.; vec2 g=vec2(0.);
        const vec4 W0=vec4(1.,.3,.05,.35); const vec4 W1=vec4(-.4,1.,.09,.18); const vec4 W2=vec4(.7,.7,.17,.08);
        float a0=dot(p,W0.xy)*W0.z+uTime*1.1; h+=sin(a0)*W0.w; g+=W0.xy*W0.z*W0.w*cos(a0);
        float a1=dot(p,W1.xy)*W1.z+uTime*1.5; h+=sin(a1)*W1.w; g+=W1.xy*W1.z*W1.w*cos(a1);
        float a2=dot(p,W2.xy)*W2.z+uTime*2.0; h+=sin(a2)*W2.w; g+=W2.xy*W2.z*W2.w*cos(a2);
        return vec4(h,g,0.); }
      void main(){ vec4 w = wv(position.xz); float k = clamp(aDepth/3.,0.,1.); vec3 p = position; p.y += w.x*k - 1.0;
        vN = normalize(vec3(-w.y*k*2., 1., -w.z*k*2.)); vW = (modelMatrix*vec4(p,1.)).xyz; vDepth = aDepth;
        vec4 mvPosition = modelViewMatrix*vec4(p,1.); gl_Position = projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform vec3 uHor,uZen,uSun,uSunCol,uCam; uniform float uNight,uTime,uRain; varying float vDepth; varying vec3 vW; varying vec3 vN;
      #include <fog_pars_fragment>
      float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
      void main(){
        vec3 V = normalize(uCam - vW);
        vec2 q = vW.xz*0.35 + vec2(uTime*0.15,-uTime*0.1);
        vec3 N = normalize(vN + vec3(noise(q)-.5, 0., noise(q+7.3)-.5)*0.28 + vec3(noise(q*3.1)-.5,0.,noise(q*2.7+1.)-.5)*0.12);
        float fr = pow(1.-max(dot(N,V),0.), 4.0); fr = clamp(0.04+0.96*fr, 0., 1.);
        vec3 R = reflect(-V,N);
        vec3 deep = vec3(0.0,0.07,0.15), shallow = vec3(0.05,0.42,0.48);
        float sh = clamp(vDepth/4.5, 0., 1.);
        vec3 body = mix(shallow, deep, sqrt(sh));
        float lightK = 0.35 + 0.65*(1.-uNight);
        body *= lightK; body = mix(body, body*vec3(0.6,0.65,0.7), uRain);
        vec3 sky = mix(uHor, uZen, clamp(R.y*1.4,0.,1.));
        vec3 col = mix(body, sky, fr);
        float sp = pow(max(dot(R, uSun),0.), 280.)*2.5 * (1.-uRain) * smoothstep(0.,0.15,uSun.y);
        col += uSunCol*sp;
        float foam = smoothstep(0.7, 0.0, vDepth + (noise(vW.xz*0.5+uTime*0.3)-.5)*0.9);
        foam *= 0.55+0.45*sin(vDepth*2.5 - uTime*1.5);
        col = mix(col, vec3(0.92,0.95,0.97)*lightK, clamp(foam,0.,1.)*0.8);
        float alpha = clamp(vDepth*1.3 + 0.35, 0., 1.);
        gl_FragColor = vec4(col, alpha);
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = 1;
  scene.add(mesh); World.water = mesh; World.waterUniforms = uniforms;
}

// ----- Flughafen -----
function buildAirport(scene) {
  const A = TR.AIRPORT, B = new Builder(), N = new Builder(), grp = new THREE.Group();
  const cx = A.rwX, cz = (A.rwZ0 + A.rwZ1) / 2, len = A.rwZ1 - A.rwZ0;
  // Rollfeld-Textur
  const c = document.createElement('canvas'); c.width = 128; c.height = 1024; const g = c.getContext('2d');
  g.fillStyle = '#33353a'; g.fillRect(0, 0, 128, 1024);
  g.fillStyle = '#eee'; for (let y = 60; y < 1000; y += 64) g.fillRect(61, y, 6, 36);
  for (let k = 0; k < 8; k++) { g.fillRect(14 + k * 6, 20, 3, 36); g.fillRect(14 + k * 6, 968, 3, 36); g.fillRect(128 - 17 - k * 6, 20, 3, 36); g.fillRect(128 - 17 - k * 6, 968, 3, 36); }
  g.fillRect(4, 0, 3, 1024); g.fillRect(121, 0, 3, 1024);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const rw = new THREE.Mesh(new THREE.PlaneGeometry(A.rwW, len), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
  rw.rotation.x = -Math.PI / 2; rw.rotation.z = Math.PI; rw.position.set(cx, 0.05, cz); rw.receiveShadow = true; grp.add(rw);
  // Vorfeld + Rollweg
  B.box(-1760, 0.04, 220, 160, 0.1, 400, 0x6e7075, { noBottom: true });
  B.box(-1855, 0.045, 200, 22, 0.1, 40, 0x4a4c50, { noBottom: true });
  B.box(-1855, 0.045, 130, 22, 0.1, 40, 0x4a4c50, { noBottom: true });
  // Terminal
  B.box(-1690, 9, 220, 40, 18, 230, 0xdfe6ec); B.box(-1670, 9, 220, 1, 15, 220, 0x1b2a38);
  B.box(-1690, 18.6, 220, 42, 1.2, 232, 0x9aa5ae);
  N.box(-1670.5, 17, 220, 0.5, 1.2, 200, 0x2ff7ff);
  TR.addBox(-1710, 105, -1670, 335, 20, 'bld');
  // Tower
  B.cyl(-1740, 20, 40, 5, 4, 40, 10, 0xd6dadd); B.box(-1740, 43, 40, 12, 6, 12, 0x1d2c3a); B.box(-1740, 47, 40, 14, 1, 14, 0xb0b6bb);
  B.cyl(-1740, 52, 40, 0.2, 0.2, 8, 5, 0xcc3333);
  TR.addCircle(-1740, 40, 6, 50);
  // Hangars
  for (let k = 0; k < 3; k++) { const z = -120 - k * 70; B.box(-1740, 7, z, 45, 14, 50, 0xb9c2c9); B.gable(-1740, 14, z, 45, 50, 3, 0x7d8890, false, 0.2); B.box(-1717.4, 5, z, 0.3, 10, 36, 0x3a4048); TR.addBox(-1763, z - 25, -1717, z + 25, 16, 'bld'); }
  // Feuerzaun / Tor
  for (let z = -600; z <= 850; z += 20) B.box(-1360, 1.2, z, 0.2, 2.4, 20, 0x777b80);
  // Randfeuer (Landebahn)
  for (let z = A.rwZ0; z <= A.rwZ1; z += 30) { N.box(cx - A.rwW / 2 - 0.5, 0.2, z, 0.5, 0.3, 0.5, 0xffffff); N.box(cx + A.rwW / 2 + 0.5, 0.2, z, 0.5, 0.3, 0.5, 0xffffff); }
  const m1 = new THREE.Mesh(B.build(), M.flat); m1.castShadow = true; m1.receiveShadow = true; grp.add(m1);
  const m2 = new THREE.Mesh(N.build(), M.neon); grp.add(m2);
  // Schild
  const sg = new THREE.Mesh(new THREE.PlaneGeometry(40, 8), new THREE.MeshBasicMaterial({ map: T.signTexture('VICE INTERNATIONAL', '#4dd9ff', '#0a1220', 1024, 200, 'bold 110px Arial Black, sans-serif'), toneMapped: false }));
  sg.position.set(-1669.2, 24, 220); sg.rotation.y = Math.PI / 2; grp.add(sg);
  scene.add(grp);
  // Poi & Spawn
  city.pois.push({ id: 'airport', type: 'airport', name: 'Vice International Airport', x: -1660, z: 220, r: 5 });
  World.spawns.planes = [{ x: -1850, z: 100, yaw: 0, id: 'cessna' }, { x: -1855, z: 200, yaw: 0, id: 'sparrow' }, { x: -1850, z: 300, yaw: 0, id: 'jet_l' }, { x: -1930, z: 380, yaw: 0, id: 'prop2' }];
  World.spawns.helis = [{ x: -1790, z: 20, yaw: 0, id: 'heli_s' }, { x: -1790, z: 60, yaw: 0, id: 'heli_m' }];
}

// ----- Hafen & Piere -----
function buildHarbor(scene) {
  const B = new Builder(), grp = new THREE.Group();
  const bx0 = TR.BAY.x0, bx1 = TR.BAY.x1, z0 = TR.BAY.z0;
  // Kaimauer (Holz) entlang Nordkante
  B.box((bx0 + bx1) / 2, 0.0, z0 + 4, bx1 - bx0 + 20, 0.5, 14, 0x8c7656, { noBottom: true });
  // Piers
  const piers = [[bx0 + 40, z0 + 11, 130], [bx0 + 105, z0 + 11, 170], [bx0 + 170, z0 + 11, 120]];
  piers.forEach(([x, z, len], n) => {
    B.box(x, 0.05, z + len / 2, 5, 0.4, len, 0x9a8460, { noBottom: true });
    for (let s = 6; s < len; s += 12) { B.box(x - 2.4, 0.5, z + s, 0.35, 0.8, 0.35, 0x4a3a28); B.box(x + 2.4, 0.5, z + s, 0.35, 0.8, 0.35, 0x4a3a28); }
    World.spawns.boats.push({ x: x + 6.5, z: z + 30 + (n % 2) * 40, yaw: 0, id: ['sp_boat1', 'yacht1', 'sail1'][n] });
    World.spawns.boats.push({ x: x - 6.5, z: z + 60, yaw: 0, id: ['jet1', 'sp_boat2', 'fish1'][n] });
  });
  // Pier-Kollision weich: nicht nötig
  // Marina Ostküste
  for (let s = 0; s < 4; s++) { const z = -100 + s * 40; B.box(1233, 0.05, z, 30, 0.35, 3.4, 0x9a8460, { noBottom: true }); }
  World.spawns.boats.push({ x: 1262, z: -90, yaw: -Math.PI / 2, id: 'sp_boat3' }, { x: 1262, z: -10, yaw: -Math.PI / 2, id: 'jet2' }, { x: 1262, z: 30, yaw: -Math.PI / 2, id: 'yacht2' });
  const mesh = new THREE.Mesh(B.build(), M.flat); mesh.castShadow = true; mesh.receiveShadow = true; grp.add(mesh);
  scene.add(grp);
  city.pois.push({ id: 'port', type: 'port', name: 'Hafen Port Maria', x: (bx0 + bx1) / 2, z: z0 - 6, r: 5 });
}

// ----- Bäume in der Landschaft, Farmen, Wahrzeichen -----
function buildCountryside(scene) {
  const r = mulberry32(4242), pines = [], oaks = [];
  const lim = 3300;
  for (let x = -lim; x < lim; x += 38) for (let z = -lim; z < lim; z += 38) {
    const px = x + r() * 30, pz = z + r() * 30;
    if (px > -1180 && pz > -1180 && px < 1300 && pz < 1300) continue;
    const h = TR.terrainHeight(px, pz);
    if (h < 0.5 || h > 170) continue;
    if (px > TR.AIRPORT.x0 - 60 && px < TR.AIRPORT.x1 + 60 && pz > TR.AIRPORT.z0 - 60 && pz < TR.AIRPORT.z1 + 60) continue;
    if (px > TR.HIGHWAY.x0 && px < TR.HIGHWAY.x1 && pz > TR.HIGHWAY.z0 - 30 && pz < TR.HIGHWAY.z1 + 30) continue;
    if (px > 1250 && pz > 1200) continue;
    const dens = fbm(px / 260, pz / 260, 3);
    if (dens < 0.46 + 0.06 * r()) continue;
    (h > 55 || r() < 0.4 ? pines : oaks).push([px, pz, 0.8 + r() * 0.9]);
  }
  for (const p of pines.concat(oaks)) if (Math.hypot(p[0], p[1]) < 2400) TR.addCircle(p[0], p[1], 0.5, 8);
  const g = new THREE.Group();
  g.add(makeInstanced(pineGeom(), M.foliage, pines, { color: true, shadow: false }));
  // Eichen: gleiche Geometrie wie Stadtbäume (aus city exportiert nicht verfügbar) → kleine Variante
  const ob = new Builder(); ob.cyl(0, 1.5, 0, 0.3, 0.2, 3, 5, 0x6a4a30, false); ob.blob(0, 4.6, 0, 2.8, 0x4c8f3a, 0.85); ob.blob(1.2, 5.3, 0.5, 1.9, 0x5ca044, 0.9);
  g.add(makeInstanced(ob.build(), M.foliage, oaks, { color: true, shadow: false }));
  World.treeCount = pines.length + oaks.length;
  // Farmen
  const B = new Builder();
  const farms = [[-2500, 1200], [-2000, 1700], [-2800, 300], [-1500, -1900], [-600, -2300], [700, -2200], [-2600, -900]];
  farms.forEach(([x, z], n) => {
    const h = TR.terrainHeight(x, z); if (h < 0.5) return;
    B.box(x, h + 3, z, 12, 6, 9, 0xb5533c); B.gable(x, h + 6, z, 12, 9, 3, 0x59463a, true, 0.5);
    B.box(x + 20, h + 5, z + 4, 12, 10, 18, 0x9b2d24); B.gable(x + 20, h + 10, z + 4, 12, 18, 4, 0x5a3b30, false, 0.3);
    B.cyl(x - 14, h + 7, z + 2, 3, 3, 14, 10, 0xc8ccd0); B.cyl(x - 14, h + 14.5, z + 2, 3, 0.3, 3, 10, 0x9aa0a6);
    TR.addBox(x - 6.5, z - 5, x + 6.5, z + 5, 8, 'bld'); TR.addBox(x + 13.5, z - 6, x + 26.5, z + 14, 12, 'bld'); TR.addCircle(x - 14, z + 2, 3.2, 15);
  });
  // Funkturm + Hütte auf dem Berg
  const tp = findPeak(); World.peak = tp;
  B.cyl(tp.x, tp.h + 22, tp.z, 1.8, 0.4, 44, 4, 0xcc4a3a); B.box(tp.x + 8, tp.h + 2, tp.z + 4, 7, 4, 6, 0x5d4d3f); B.gable(tp.x + 8, tp.h + 4, tp.z + 4, 7, 6, 2, 0x3a2f28, true, 0.3);
  const m = new THREE.Mesh(B.build(), M.flat); m.castShadow = true; m.receiveShadow = true; g.add(m);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false })); beacon.position.set(tp.x, tp.h + 45, tp.z); g.add(beacon); World.beacon = beacon;
  TR.addCircle(tp.x, tp.z, 2, 50);
  city.pois.push({ id: 'peak', type: 'peak', name: 'Aussichtspunkt Cabo Verde', x: tp.x + 8, z: tp.z + 14, r: 5 });
  // Hollywood-Style Schild: "VICE CITY"
  const sx = -300, sz = -1750, sh = TR.terrainHeight(sx, sz);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(180, 36), new THREE.MeshBasicMaterial({ map: T.signTexture('VICE CITY', '#ff4fb8', '#00000000', 1400, 280, 'bold 220px Arial Black, Impact, sans-serif'), transparent: true, toneMapped: false, side: THREE.DoubleSide }));
  sign.position.set(sx, sh + 70, sz); sign.rotation.y = 0; g.add(sign);
  scene.add(g);
}
function findPeak() {
  let best = { h: -1e9, x: 0, z: 0 };
  for (let x = -2800; x < 0; x += 100) for (let z = -3000; z < -1500; z += 100) { const h = TR.terrainHeight(x, z); if (h > best.h) best = { h, x, z }; }
  return best;
}

// Stuntrampen (Strand + Stadt)
function buildRamps(scene) {
  const B = new Builder();
  const defs = [
    { x: 1190, z: -420, yaw: -Math.PI / 2, len: 22, w: 8, h: 4.2 }, { x: 960, z: 960, yaw: Math.PI, len: 24, w: 8, h: 4.5 }, { x: -1000, z: 20, yaw: Math.PI / 2, len: 24, w: 9, h: 4.5 },
    { x: -540, z: -1050, yaw: 0, len: 26, w: 8, h: 5 }, { x: 150, z: 1060, yaw: 0, len: 22, w: 8, h: 4 }, { x: -1500, z: 192, yaw: -Math.PI / 2, len: 28, w: 9, h: 5 },
    { x: 700, z: -1100, yaw: Math.PI, len: 26, w: 9, h: 5 }, { x: 1240, z: 600, yaw: -Math.PI / 2, len: 22, w: 8, h: 4 }, { x: -1950, z: 740, yaw: 0, len: 30, w: 10, h: 6 },
  ];
  World.jumps = [];
  for (const d of defs) {
    TR.addRamp(d);
    // Visuell: Keil als schräge Platte
    const sx = Math.sin(d.yaw), cz = Math.cos(d.yaw);
    const ex = d.x - sx * d.len / 2, ez = d.z - cz * d.len / 2, fx = d.x + sx * d.len / 2, fz = d.z + cz * d.len / 2;
    const lx = cz * d.w / 2, lz = -sx * d.w / 2;
    const A = [ex - lx, 0.0, ez - lz], Bp = [ex + lx, 0.0, ez + lz], C = [fx + lx, d.h, fz + lz], D = [fx - lx, d.h, fz - lz];
    const dbl = (p, q, r2, s2, col) => { B.quad(p, q, r2, s2, col); B.quad(s2, r2, q, p, col); };
    dbl(A, Bp, C, D, 0xe8b023);
    dbl([C[0], 0, C[2]], [D[0], 0, D[2]], D, C, 0xd9a01c);
    dbl([D[0], 0, D[2]], [A[0], 0, A[2]], A, D, 0xc89018);
    dbl([Bp[0], 0, Bp[2]], [C[0], 0, C[2]], C, Bp, 0xc89018);
    World.jumps.push({ x: fx, z: fz, yaw: d.yaw, h: d.h });
  }
  const m = new THREE.Mesh(B.build(), M.flat); m.castShadow = true; m.receiveShadow = true; scene.add(m);
}

// ----- Straße/Highway zum Flughafen -----
function buildHighway(scene) {
  const B = new Builder();
  const z0 = 192, xa = -1152 - R_half(), xb = -1650;
  const len = xa - xb;
  const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#3a3b3e'; g.fillRect(0, 0, 64, 256); g.fillStyle = '#d9b43a'; g.fillRect(30, 0, 3, 256); g.fillStyle = '#ddd'; g.fillRect(3, 0, 2, 256); g.fillRect(59, 0, 2, 256);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.repeat.set(1, len / 12);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(14, len), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }));
  mesh.rotation.x = -Math.PI / 2; mesh.rotation.z = Math.PI / 2; mesh.position.set((xa + xb) / 2, 0.012, z0); mesh.receiveShadow = true; scene.add(mesh);
}
function R_half() { return 7; }

// ===== Aufbau =====
export function buildWorld(scene, sky, quality) {
  initMaterials();
  buildTerrain(scene, quality);
  buildOcean(scene, sky);
  buildCity(scene);
  buildAirport(scene);
  buildHarbor(scene);
  buildHighway(scene);
  buildRamps(scene);
  buildCountryside(scene);
  // Vice Tower Wahrzeichen: Neon-Schriftzug
  const tw = new THREE.Mesh(new THREE.PlaneGeometry(40, 9), new THREE.MeshBasicMaterial({ map: T.signTexture('VICE CITY', '#ff3dbb', '#0a0414', 512, 128), toneMapped: false }));
  tw.position.set(0.5 * TR.P, 62, -0.5 * TR.P + 40); scene.add(tw);
  return World;
}

// Ampel-Update
let tlTimer = 0;
const _c = new THREE.Color();
export function updateWorld(dt, camPos) {
  tlTimer -= dt;
  const w = G.weather;
  updateMaterials(G.night, w.wet, w.rain);
  if (World.waterUniforms) { World.waterUniforms.uTime.value = G.clock; World.waterUniforms.uCam.value.copy(camPos); }
  if (World.beacon) World.beacon.visible = Math.sin(G.clock * 3) > 0;
  for (const s of city.signs) s.material.color.setScalar(0.55 + G.night * 0.65);
  if (tlTimer <= 0 && city.tlInst) {
    tlTimer = 0.4;
    const t = G.clock, list = city.tlList, im = city.tlInst;
    for (let n = 0; n < list.length; n++) {
      const l = list[n], ph = TR.lightPhase(l.k, l.l, t), ns = l.d === 1 || l.d === 3;
      let col;
      if (ns) col = ph === 0 ? 0x20ff60 : ph === 1 ? 0xffc020 : 0xff2020; else col = ph === 2 ? 0x20ff60 : ph === 3 ? 0xffc020 : 0xff2020;
      _c.setHex(col); im.setColorAt(n, _c);
    }
    im.instanceColor.needsUpdate = true;
  }
}
