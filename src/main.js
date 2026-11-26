// Einstieg: Initialisierung, Spielschleife, Interaktion, Respawn, Cheats
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { CSM } from 'three/addons/csm/CSM.js';
import { Reflect } from './reflect.js';
import { Hooks, hookObject } from './materials.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { G, emit, on } from './game.js';
import { Sky, Weather, Rain } from './sky.js';
import { buildWorld, updateWorld, World } from './world.js';
import * as TR from './terrain.js';
import { FX } from './effects.js';
import { Veh } from './vehicles.js';
import { Peds } from './peds.js';
import { Traffic } from './traffic.js';
import { Player, Input, CamCtl } from './player.js';
import { Combat } from './combat.js';
import { Police } from './police.js';
import { Audio } from './audio.js';
import { Markers } from './markers.js';
import { Missions, defineMissions, snapRoad } from './missions.js';
import { Race, Taxi, Delivery, Events, RACES } from './activities.js';
import { newProfile, Save, Eco } from './profile.js';
import { UI } from './ui.js';
import { Touch } from './touch.js';
import { Updater } from './updater.js';
import { Accounts } from './accounts.js';
import { Multi } from './multi.js';
import { Admin } from './admin.js';
import { Sec } from './adminsec.js';
import { showLogin } from './login.js';
import { city, cullList } from './city.js';
import { SITES } from './sites.js';
import { BY_ID, CATALOG } from './catalog.js';
import { clamp, rr, fmtMoney, lerp } from './util.js';
import { WEAPON_ORDER, WEAPONS } from './weapons.js';

// Schatten-Filter: three.js r170 nimmt bei PCF 17 Texturzugriffe pro Pixel und Kaskade – auf Tablets reichen 4
// Materialien mit #define NO_IBL überspringen die Umgebungs-Cube-Map-Abfragen
function patchNoIBL() {
  const c = THREE.ShaderChunk; if (c.lights_fragment_maps.includes('NO_IBL')) return;
  c.lights_fragment_maps = c.lights_fragment_maps.split('defined( USE_ENVMAP )').join('defined( USE_ENVMAP ) && !defined( NO_IBL )');
}
function patchShadowPCF() {
  const c = THREE.ShaderChunk, a = c.shadowmap_pars_fragment.indexOf('#if defined( SHADOWMAP_TYPE_PCF )'), b = c.shadowmap_pars_fragment.indexOf('#elif defined( SHADOWMAP_TYPE_PCF_SOFT )');
  if (a < 0 || b < a) return;
  const quick = `#if defined( SHADOWMAP_TYPE_PCF )
			vec2 qs = shadowRadius * 0.5 / shadowMapSize;
			shadow = ( texture2DCompare( shadowMap, shadowCoord.xy + vec2( -qs.x, -qs.y ), shadowCoord.z ) + texture2DCompare( shadowMap, shadowCoord.xy + vec2( qs.x, -qs.y ), shadowCoord.z ) + texture2DCompare( shadowMap, shadowCoord.xy + vec2( -qs.x, qs.y ), shadowCoord.z ) + texture2DCompare( shadowMap, shadowCoord.xy + vec2( qs.x, qs.y ), shadowCoord.z ) ) * 0.25;
		`;
  c.shadowmap_pars_fragment = c.shadowmap_pars_fragment.slice(0, a) + quick + c.shadowmap_pars_fragment.slice(b);
}

const QUALITY = {
  low: { pr: 0.85, shadow: 1024, bloom: false, traffic: 12, peds: 22, parked: 8, seg: 192, oceanSeg: 140, csm: null, refl: null, rays: 0, lite: true, treeShadows: false, cull: { tree: 260, prop: 300, far: 700 } },
  medium: { pr: 1, shadow: 1024, bloom: false, traffic: 16, peds: 28, parked: 12, seg: 288, oceanSeg: 200, csm: { n: 1, size: 2048, far: 150 }, refl: null, rays: 0, lite: true, treeShadows: false, cull: { tree: 420, prop: 450, far: 1100 } },
  high: { pr: 1.5, shadow: 2048, bloom: true, traffic: 30, peds: 55, parked: 26, seg: 448, oceanSeg: 300, csm: { n: 3, size: 2048, far: 650 }, refl: { scale: 0.5, roads: true, every: 1 }, rays: 26, lite: false, treeShadows: true, cull: { tree: 700, prop: 700, far: 1700 } },
  ultra: { pr: 2, shadow: 4096, bloom: true, traffic: 40, peds: 70, parked: 34, seg: 512, oceanSeg: 360, csm: { n: 4, size: 2048, far: 1100 }, refl: { scale: 0.75, roads: true, every: 1 }, rays: 40, lite: false, treeShadows: true, cull: { tree: 1100, prop: 1000, far: 2800 } },
};
const TIPS = ['Tipp: Mit der Handbremse (Leertaste) lassen sich Autos gezielt driften.', 'Tipp: Nach einem Verbrechen hilft es, außer Sichtweite zu fahren und das Auto zu wechseln.', 'Tipp: Gelbe Rampen bringen Stunt-Prämien.', 'Tipp: Kaufe Immobilien, um Fahrzeuge zu speichern.', 'Tipp: Regen macht Straßen rutschig – fahr vorsichtig!', 'Tipp: Mit F steigst du auch in Boote, Flugzeuge und Hubschrauber.', 'Tipp: Setze einen Wegpunkt auf der Karte (M) für eine GPS-Route.'];

let fpsAcc = 0, fpsN = 0, lastFovT = 0, renderFrames = 0, sunPass, csm, lastFov = 0, sunOcc = 1, gtao, renderer, scene, camera, composer, bloom, cinePass, outPass, sky, rain, lampLights = [], headSpot, clockT = 0, last = performance.now(), saveTimer = 0, speedBlur = 0;
let loaded = false, started = false;

const SunShader = {
  uniforms: { tDiffuse: { value: null }, uSun: { value: new THREE.Vector2(0.5, 0.5) }, uVis: { value: 0 }, uRays: { value: 0.6 }, uFlare: { value: 0.5 }, uAspect: { value: 1.7 }, uColor: { value: new THREE.Color(1, 0.85, 0.6) } },
  defines: { SAMPLES: 24 },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uSun; uniform float uVis, uRays, uFlare, uAspect; uniform vec3 uColor; varying vec2 vUv;
  float lum(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
  float disc(vec2 uv, vec2 c, float r){ return smoothstep(r, r * 0.15, length((uv - c) * vec2(uAspect, 1.0))); }
  float ringf(vec2 uv, vec2 c, float r, float w){ return smoothstep(w, 0.0, abs(length((uv - c) * vec2(uAspect, 1.0)) - r)); }
  void main(){
    vec3 col = texture2D(tDiffuse, vUv).rgb;
    if (uVis > 0.002) {
      vec2 toSun = uSun - vUv; float dist = length(toSun * vec2(uAspect, 1.0));
      vec2 stp = toSun / float(SAMPLES) * 0.9;
      float jit = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453);
      vec2 uv = vUv + stp * jit; float decay = 1.0; vec3 acc = vec3(0.0);
      for (int i = 0; i < SAMPLES; i++) { uv += stp; vec3 s = texture2D(tDiffuse, uv).rgb; float m = smoothstep(0.9, 5.0, lum(s)); acc += s * m * decay; decay *= 0.962; }
      acc /= float(SAMPLES);
      col += acc * uRays * uVis * (1.0 / (1.0 + dist * 1.4)) * 1.7 * mix(vec3(1.0), uColor, 0.55);
      // warmer Schleier um die Sonne
      col += uColor * uVis * exp(-dist * 3.2) * 0.07 * uRays;
      // Linsenreflexe
      vec2 axis = vec2(0.5) - uSun; vec3 fl = vec3(0.0);
      fl += disc(vUv, uSun + axis * 0.32, 0.055) * vec3(1.0, 0.72, 0.4) * 0.30;
      fl += disc(vUv, uSun + axis * 0.62, 0.035) * vec3(0.5, 0.8, 1.0) * 0.35;
      fl += disc(vUv, uSun + axis * 1.08, 0.075) * vec3(0.5, 1.0, 0.65) * 0.22;
      fl += disc(vUv, uSun + axis * 1.55, 0.045) * vec3(1.0, 0.5, 0.8) * 0.32;
      fl += disc(vUv, uSun + axis * 2.05, 0.09) * vec3(0.7, 0.6, 1.0) * 0.16;
      fl += ringf(vUv, uSun + axis * 0.92, 0.17, 0.012) * vec3(1.0, 0.85, 0.6) * 0.30;
      fl += ringf(vUv, uSun, 0.11, 0.010) * vec3(1.0, 0.9, 0.7) * 0.16;
      fl += exp(-abs(vUv.y - uSun.y) * 90.0) * exp(-abs(vUv.x - uSun.x) * 2.6) * vec3(0.45, 0.7, 1.0) * 0.22;
      col += fl * uFlare * uVis;
    }
    gl_FragColor = vec4(col, 1.0);
  }`,
};
const CineShader = {
  uniforms: { tDiffuse: { value: null }, uBlur: { value: 0 }, uVig: { value: 0.4 }, uTime: { value: 0 }, uAspect: { value: 1 }, uWet: { value: 0 }, uCA: { value: 1 }, uAA: { value: 0 }, uTexel: { value: new THREE.Vector2(1 / 1024, 1 / 768) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uBlur,uVig,uTime,uAspect,uWet,uCA,uAA; uniform vec2 uTexel; varying vec2 vUv;
  float hash(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
  vec3 fxaa(vec2 uv){
    vec3 cM = texture2D(tDiffuse, uv).rgb;
    vec3 cNW = texture2D(tDiffuse, uv + vec2(-1.0,-1.0)*uTexel).rgb, cNE = texture2D(tDiffuse, uv + vec2(1.0,-1.0)*uTexel).rgb;
    vec3 cSW = texture2D(tDiffuse, uv + vec2(-1.0,1.0)*uTexel).rgb, cSE = texture2D(tDiffuse, uv + vec2(1.0,1.0)*uTexel).rgb;
    const vec3 L = vec3(0.299,0.587,0.114);
    float lNW=dot(cNW,L), lNE=dot(cNE,L), lSW=dot(cSW,L), lSE=dot(cSE,L), lM=dot(cM,L);
    float lMin=min(lM,min(min(lNW,lNE),min(lSW,lSE))), lMax=max(lM,max(max(lNW,lNE),max(lSW,lSE)));
    if (lMax - lMin < max(0.03, lMax * 0.1)) return cM;
    vec2 dir = vec2(-((lNW+lNE)-(lSW+lSE)), ((lNW+lSW)-(lNE+lSE)));
    float red = max((lNW+lNE+lSW+lSE)*0.03125, 0.0078125);
    dir = clamp(dir / (min(abs(dir.x),abs(dir.y)) + red), vec2(-6.0), vec2(6.0)) * uTexel;
    vec3 a = 0.5*(texture2D(tDiffuse, uv+dir*(1.0/3.0-0.5)).rgb + texture2D(tDiffuse, uv+dir*(2.0/3.0-0.5)).rgb);
    vec3 b = a*0.5 + 0.25*(texture2D(tDiffuse, uv+dir*-0.5).rgb + texture2D(tDiffuse, uv+dir*0.5).rgb);
    float lB = dot(b,L);
    return (lB < lMin || lB > lMax) ? a : b;
  }
  void main(){ vec2 d = vUv-0.5; float r = length(d*vec2(uAspect,1.0));
    vec3 col;
    if (uBlur > 0.004) { col = vec3(0.0); const int N=8; for(int i=0;i<N;i++){ float t=float(i)/float(N); col += texture2D(tDiffuse, vUv - d*uBlur*t*0.14).rgb; } col/=float(N); }
    else col = uAA > 0.5 ? fxaa(vUv) : texture2D(tDiffuse, vUv).rgb;
    if (uCA > 0.5) { float ca = 0.0012 + uBlur*0.0015; col.r = mix(col.r, texture2D(tDiffuse, vUv - d*ca*2.0).r, 0.6); col.b = mix(col.b, texture2D(tDiffuse, vUv + d*ca*2.0).b, 0.6); }
    float l = dot(col, vec3(0.299,0.587,0.114)); col = mix(vec3(l), col, 1.08);
    col = mix(col, col*vec3(1.04,1.0,0.95), 0.4);
    col *= 1.0 - uVig*smoothstep(0.35,1.0,r*1.15);
    col += (hash(vUv*vec2(1920.0,1080.0)+uTime)-0.5)*0.025;
    gl_FragColor = vec4(col,1.0); }`,
};

// ---------------- Setup ----------------
async function boot() {
  UI.init();
  const hadSettings = (() => { try { return !!localStorage.getItem('vicecity_settings_v1'); } catch (e) { return false; } })();
  Save.loadSettings();
  if (!hadSettings && Touch.isTouchDevice()) { G.settings.quality = 'medium'; G.settings.traffic = 0.8; G.settings.bloom = false; }
  G.quality = QUALITY[G.settings.quality] || QUALITY.high;
  if (G.quality.lite) { patchShadowPCF(); patchNoIBL(); }
  UI.setLoading(0.05, 'Renderer wird gestartet …');
  const canvas = document.getElementById('game');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, G.quality.pr)); renderer.setSize(innerWidth, innerHeight); renderer.info.autoReset = false; window.__R = renderer;
  renderer.shadowMap.enabled = G.settings.shadows; renderer.shadowMap.type = G.quality.lite ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(G.settings.fov, innerWidth / innerHeight, 0.4, 7000);
  G.scene = scene; G.camera = camera; G.renderer = renderer; G.weather = new Weather(); G.hour = 17.2; G.weather.set('clear', true); G.terrainY = TR.groundHeight;
  const step = (p, t) => new Promise((r) => { UI.setLoading(p, t); setTimeout(r, 30); });
  await step(0.1, 'Himmel & Beleuchtung …');
  sky = new Sky(scene, renderer); G.sky = sky; sky.setShadowRes(G.quality.shadow);
  await step(0.2, 'Stadt wird generiert … ' + TIPS[Math.floor(Math.random() * TIPS.length)]);
  buildWorld(scene, sky, G.quality);
  await step(0.55, 'Effekte, Marker & Missionen …');
  FX.init(scene); Markers.init(scene); Peds.init(); rain = new Rain(scene);
  defineMissions();
  // Lampenlicht
  for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xffd9a0, 0, 34, 2); l.visible = false; scene.add(l); lampLights.push(l); }
  headSpot = new THREE.SpotLight(0xfff0d0, 0, 90, 0.5, 0.6, 1.2); headSpot.visible = false; scene.add(headSpot); scene.add(headSpot.target);
  await step(0.62, 'Schatten & Spiegelungen …');
  setupLighting();
  await step(0.7, 'Karte wird gezeichnet …');
  UI.buildMap();
  await step(0.9, 'Nachbearbeitung …');
  setupComposer();
  // Shader beider Licht-Varianten (Tag ohne Lampenlichter / Nacht mit) vorab übersetzen → später kein Ruckeln beim Wechsel
  const precompile = async () => { try { camera.position.set(120, 60, -20); camera.updateMatrixWorld(); await Promise.race([renderer.compileAsync(scene, camera), new Promise((r) => setTimeout(r, 12000))]); } catch (e) { } };
  setLampsVisible(true); await precompile(); setLampsVisible(false); await precompile();
  Input.init(canvas);
  Touch.init(UI);
  // Spieler Platzhalter (für Titelhintergrund)
  G.profile = newProfile(); G.player = new Player(); G.player.teleport(120, -20);
  G.player.group.visible = false;
  Race.markers(); Missions.refreshMarkers();
  window.addEventListener('resize', onResize);
  on('pause', () => { if (G.state === 'play') UI.openMenu('map'); });
  on('playerDied', onDied); on('busted', onBusted);
  on('missionComplete', () => { Missions.refreshMarkers(); }); on('missionFailed', () => { Missions.refreshMarkers(); });
  G.autosave = () => { if (started) Save.save(); };
  window.addEventListener('beforeunload', () => { if (started && G.state !== 'menu') { try { Save.serialize(); const r = Save.serialize(); localStorage.setItem(Save.key(), JSON.stringify(r)); } catch (e) { } } });
  document.addEventListener('keydown', (e) => { if (e.code === 'KeyR' && G.state === 'play' && G.player.vehicle) { const st = Audio.nextStation(1); UI.radioShow(st); } if (e.code === 'KeyT' && G.state === 'play') Taxi.toggle(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'play') emit('pause'); });
  UI.setLoading(1, 'Bereit.'); Updater.init();
  loaded = true;
  window.__gameReady = true;
  let resume = false; try { resume = sessionStorage.getItem('vc_resume') === '1'; sessionStorage.removeItem('vc_resume'); } catch (e) { }
  for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, () => { try { Audio.init(); Audio.resume(); } catch (e) { } }, { passive: true });
  // Anmeldung ist Pflicht: erst nach Name + Passwort geht es weiter (gespeichertes Konto → automatisch)
  const enter = () => {
    G.account = Accounts.user; Save.setKey(Accounts.saveKey()); Multi.start(Accounts.user.name); Admin.init();
    if (new URLSearchParams(location.search).has('autostart')) { G.startNew(); }
    else if (resume && Save.has()) { G.continueGame(); UI.toast('✅ Spiel wurde aktualisiert'); }
    else UI.showTitle();
  };
  G.logout = () => { try { if (started) Save.save(); } catch (e) { } Multi.stop(); Accounts.logout(); location.reload(); };
  G.state = 'menu'; UI.hud.classList.add('hidden');
  if (Accounts.restore()) enter(); else showLogin(enter);
  G.state = G.state === 'menu' || G.state === 'play' ? G.state : 'menu';
  requestAnimationFrame(loop);
}
function fixCSMBias() {
  if (!csm) return;
  csm.lights.forEach((l) => { const c = l.shadow.camera, tx = (c.right - c.left) / csm.shadowMapSize; l.shadow.bias = -0.00008; l.shadow.normalBias = clamp(tx * 1.7, 0.05, 2.0); });
}
function setupLighting() {
  const q = G.quality; Hooks.csm = null; Hooks.planar = null; csm = null;
  if (q.csm && G.settings.shadows) {
    csm = new CSM({ camera, parent: scene, cascades: q.csm.n, maxFar: q.csm.far, mode: 'practical', shadowMapSize: q.csm.size, lightDirection: new THREE.Vector3(-0.4, -1, -0.3).normalize(), lightIntensity: 3, lightMargin: 450, lightNear: 1, lightFar: 3200, shadowBias: -0.00008 });
    csm.fade = true; csm.updateFrustums(); fixCSMBias(); lastFov = camera.fov;
    Hooks.csm = csm; G.csm = csm; sky.attachCSM(csm);
  }
  if (q.refl && G.settings.reflections !== false) { Reflect.init(renderer, { enabled: true, ...q.refl }); Hooks.planar = Reflect.uniforms; }
  else Reflect.init(renderer, { enabled: false });
  Reflect.hide = [rain.mesh, Markers.group];
  Reflect.pre = () => {
    for (const c of cullList) if (c.mesh.visible) { c.mesh.visible = false; c._rh = 1; }
    for (const p of G.entities.peds) if (p.group.visible) { p.group.visible = false; p._rh = 1; }
    const cx = camera.position.x, cz = camera.position.z;
    for (const v of G.entities.vehicles) if (v.group.visible && v.kind !== 'boat' && (v.pos.x - cx) ** 2 + (v.pos.z - cz) ** 2 > 90 * 90) { v.group.visible = false; v._rh = 1; }
  };
  Reflect.post = () => {
    for (const c of cullList) if (c._rh) { c.mesh.visible = true; c._rh = 0; }
    for (const p of G.entities.peds) if (p._rh) { p.group.visible = true; p._rh = 0; }
    for (const v of G.entities.vehicles) if (v._rh) { v.group.visible = true; v._rh = 0; }
  };
  hookObject(scene);
  const origAdd = scene.add.bind(scene);
  scene.add = function (...objs) { origAdd(...objs); for (const o of objs) hookObject(o); return this; };
}
const _sv = new THREE.Vector3(), _sf = new THREE.Vector3();
function updateSunPass(dt) {
  if (!sunPass || !G.quality.rays || G.settings.godrays === false) { if (sunPass) sunPass.enabled = false; return; }
  const moon = G.night > 0.55, d = moon ? sky.moonDir : sky.sunDir, u = sunPass.uniforms, w = G.weather;
  _sv.copy(camera.position).addScaledVector(d, 1000).project(camera);
  camera.getWorldDirection(_sf);
  const facing = THREE.MathUtils.smoothstep(_sf.dot(d), -0.12, 0.4);
  const dayF = moon ? 0.2 * THREE.MathUtils.smoothstep(d.y, 0.1, 0.4) : THREE.MathUtils.smoothstep(d.y, -0.03, 0.1);
  const hit = TR.rayStatic(camera.position.x, camera.position.y, camera.position.z, d.x, d.y, d.z, 1400);
  sunOcc = lerp(sunOcc, hit < 1400 ? 0 : 1, Math.min(1, dt * 5));
  const wea = clamp(1 - w.cloud * 0.6 - w.rain * 0.3 - w.fog * 0.4, 0.04, 1);
  const vis = (G.state === 'play' || G.state === 'cutscene' || G.state === 'menu') ? facing * dayF * sunOcc * wea : 0;
  sunPass.enabled = vis > 0.012 && !!G.settings.godrays !== false && !!G.quality.rays;
  u.uVis.value = vis; u.uSun.value.set(_sv.x * 0.5 + 0.5, _sv.y * 0.5 + 0.5); u.uAspect.value = innerWidth / innerHeight;
  u.uColor.value.copy(moon ? new THREE.Color(0.6, 0.7, 1) : sky.uniforms.uSunCol.value);
  const low = 1 - THREE.MathUtils.smoothstep(d.y, 0.0, 0.35); u.uRays.value = 0.5 + low * 0.6; u.uFlare.value = 0.45 + low * 0.2;
}
function setupComposer() {
  if (composer) { try { composer.dispose && composer.dispose(); } catch (e) { } }
  const size = renderer.getSize(new THREE.Vector2()), pr = renderer.getPixelRatio();
  const msaa = G.quality.lite ? 0 : (G.quality.pr > 1 ? 4 : 2);
  const rt = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples: msaa });
  composer = new EffectComposer(renderer, rt); composer.setPixelRatio(pr); composer.setSize(size.x, size.y);
  composer.addPass(new RenderPass(scene, camera));
  gtao = null;
  if (G.settings.quality === 'ultra' && !document.body.classList.contains('touch')) { try { gtao = new GTAOPass(scene, camera, size.x, size.y); gtao.output = GTAOPass.OUTPUT.Default; gtao.updateGtaoMaterial({ radius: 2.2, distanceExponent: 1.2, thickness: 1.2, scale: 1.0, samples: 12, distanceFallOff: 1, screenSpaceRadius: false }); gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 }); gtao.blendIntensity = 0.9; composer.addPass(gtao); } catch (e) { console.warn('GTAO nicht verfügbar', e); gtao = null; } }
  bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.38, 0.65, 0.86); composer.addPass(bloom);
  sunPass = new ShaderPass(SunShader); sunPass.material.defines.SAMPLES = Math.max(6, G.quality.rays || 8); sunPass.enabled = !!G.quality.rays && G.settings.godrays !== false; composer.addPass(sunPass);
  outPass = new OutputPass(); composer.addPass(outPass);
  cinePass = new ShaderPass(CineShader); cinePass.uniforms.uCA.value = (G.quality.lite || document.body.classList.contains('touch')) ? 0 : 1; cinePass.uniforms.uAA.value = msaa ? 0 : 1; composer.addPass(cinePass); updateTexel();
}
function updateTexel() { if (!cinePass) return; const pr = renderer.getPixelRatio(); cinePass.uniforms.uTexel.value.set(1 / (innerWidth * pr), 1 / (innerHeight * pr)); cinePass.uniforms.uAspect.value = innerWidth / innerHeight; }
// Automatische Leistungsanpassung: erst teure Effekte aus, dann Auflösung, im Notfall eine Qualitätsstufe tiefer
const Gov = {
  scale: 1, acc: 0, n: 0, age: 0, cool: 0, slow: 0, fast: 0, enabled: true, shed: 0,
  base() { return Math.min(window.devicePixelRatio || 1, G.quality.pr); },
  apply() { const pr = this.base() * this.scale; renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight); if (composer) { composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight); } Reflect.resize(); updateTexel(); if (csm) { csm.updateFrustums(); fixCSMBias(); lastFov = camera.fov; } window.__gscale = this.scale; },
  // Maßnahmen ohne Neuladen; liefert true, wenn etwas abgeschaltet wurde
  shedOne() {
    if (Reflect.enabled) { Reflect.enabled = false; Reflect.active = false; Reflect.uniforms.uOceanReflect.value = 0; Reflect.uniforms.uWetAmt.value = 0; this.shed = 1; return true; }
    if (sunPass && G.quality.rays && G.settings.godrays !== false) { G.settings.godrays = false; sunPass.enabled = false; this.shed = 2; return true; }
    if (bloom && G.settings.bloom) { G.settings.bloom = false; this.shed = 3; return true; }
    return false;
  },
  tick(dt) {
    if (!this.enabled || G.settings.autoGfx !== true || G.state !== 'play') { this.acc = 0; this.n = 0; return; }
    this.age += dt;
    // Einzelne Aussetzer (Tab-Wechsel, Shader-Kompilierung) ignorieren – aber mehrere lahme Bilder in Folge sind echte Langsamkeit
    if (dt > 0.4) this.hitch = (this.hitch || 0) + 1; else this.hitch = 0;
    if (this.age < 5 || (dt > 0.4 && this.hitch < 3)) { this.acc = 0; this.n = 0; return; }
    this.acc += dt; this.n++; this.cool -= dt;
    if (this.acc < 2) return;
    const avg = this.acc / this.n; this.acc = 0; this.n = 0;
    window.__avgdt = avg;
    if (avg > 1 / 36 && this.cool <= 0) {
      this.fast = 0;
      if (this.shedOne()) { this.cool = 2; this.slow = 0; }
      else if (this.scale > 0.6) { this.scale = Math.max(0.6, this.scale - 0.14); this.cool = 2; this.slow = 0; this.apply(); }
      else if (avg > 1 / 30 && ++this.slow >= 2) this.tierDown();
    }
    else if (avg < 1 / 56 && this.scale < 1 && this.cool <= 0) { if (++this.fast >= 4) { this.scale = Math.min(1, this.scale + 0.07); this.fast = 0; this.cool = 5; this.apply(); } }
    else { this.slow = 0; }
  },
  tierDown() {
    const order = ['ultra', 'high', 'medium', 'low'], i = order.indexOf(G.settings.quality); this.slow = 0;
    let last = 0; try { last = +localStorage.getItem('vicecity_auto_v1') || 0; } catch (e) { }
    if (i < 0 || i >= order.length - 1 || Date.now() - last < 45000) return;
    G.settings.quality = order[i + 1]; Save.saveSettings(); try { localStorage.setItem('vicecity_auto_v1', String(Date.now())); } catch (e) { }
    UI.toast('⚙ Leistung zu niedrig – Grafik wird auf „' + order[i + 1] + '" gesenkt, Seite lädt neu …');
    try { if (started) Save.save(); } catch (e) { }
    setTimeout(() => location.reload(), 1600);
  },
};
let cullT = 0;
function updateCull(dt) {
  cullT -= dt; if (cullT > 0) return; cullT = 0.3;
  const D = G.quality.cull || { tree: 600, prop: 600, far: 1500 }, cx = camera.position.x, cz = camera.position.z;
  for (const c of cullList) c.mesh.visible = Math.hypot(cx - c.cx, cz - c.cz) - c.r < D[c.kind];
}
function onResize() {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight);
  if (composer) { composer.setSize(innerWidth, innerHeight); updateTexel(); }
  Reflect.resize(); if (csm) { csm.updateFrustums(); fixCSMBias(); lastFov = camera.fov; }
}
G.applySettings = (k) => {
  const s = G.settings; G.quality = QUALITY[s.quality] || QUALITY.high;
  if (k === 'quality') { UI.toast('Qualität wird angewendet – Seite lädt neu …'); try { if (started) Save.save(); } catch (e) { } setTimeout(() => location.reload(), 1000); return; }
  if (k === 'shadows') { renderer.shadowMap.enabled = s.shadows; UI.toast(s.shadows ? 'Schatten an (Neuladen für Kaskaden-Schatten)' : 'Schatten aus'); }
  if (k === 'reflections') { Reflect.enabled = !!s.reflections && !!G.quality.refl; if (Reflect.enabled && !Reflect.rt) Reflect.makeRT(); }
  if (k === 'godrays') { if (sunPass) sunPass.enabled = !!s.godrays && !!G.quality.rays; }
  if (k === 'volume' || k === 'music') Audio.setVolumes();
  if (k === 'touch') { Touch.init(UI); }
  if (k === 'fov') { camera.fov = s.fov; camera.updateProjectionMatrix(); }
};

// ---------------- Spielstart ----------------
function resetWorld() {
  Veh.clear(); for (const p of [...Peds.list]) Peds.remove(p); Markers.items.length = 0; Police.setLevel(0); Police.heat = 0; Police.busted = false;
  if (Missions.active) Missions.abort(); Missions.active = null; G.race = null; Taxi.job = null; Delivery.job = null; Events.cur = null;
  for (const c of Peds.cashDrops) scene.remove(c.mesh); Peds.cashDrops.length = 0;
}
function spawnWorldVehicles() {
  // Flugzeuge, Hubschrauber, Boote
  for (const s of World.spawns.planes) { const v = Veh.spawn(s.id, s.x, s.z, s.yaw); if (v) { v.parked = true; v.keep = true; v.input.handbrake = true; } }
  for (const s of World.spawns.helis) { const v = Veh.spawn(s.id, s.x, s.z, s.yaw); if (v) { v.parked = true; v.keep = true; } }
  for (const s of World.spawns.boats) { const v = Veh.spawn(s.id, s.x, s.z, s.yaw); if (v) { v.parked = true; v.keep = true; } }
  // Ausstellungswagen
  const ds = city.dealerSpots, ids = ['super_2', 'sport_3', 'muscle_4'];
  ds.forEach((d, i) => { const v = Veh.spawn(ids[i % 3], d.x, d.z + 3, d.yaw + Math.PI); if (v) { v.parked = true; v.keep = true; v.isDisplay = true; v.input.handbrake = true; v.locked = true; } });
}
G.startNew = () => {
  Audio.init(); Audio.resume(); UI.hideTitle(); resetWorld(); G.profile = newProfile(); Object.assign(G.stats, { dist: 0, vdist: 0, kills: 0, crimes: 0, jumps: 0, driftBest: 0, wins: 0, missions: 0, stolen: 0, arrests: 0, deaths: 0, played: 0, maxJump: 0, spent: 0, earned: 0 });
  G.hour = 9.2; G.day = 1; G.weather.set('clear', true); G.weather.timer = 300;
  G.player.setLook(G.profile.look); G.player.hp = 100; G.player.armor = 0; G.player.alive = true; G.player.group.visible = true; G.player.setWeapon('fist'); G.player.revive();
  spawnWorldVehicles(); Eco.updateGarage();
  const home = city.sites['apt_beach']; G.player.teleport(-1650, 228, Math.PI / 2);
  started = true; Race.markers(); Missions.refreshMarkers();
  CamCtl.init = false; G.state = 'play'; UI.showHud(true); UI.fade(false, 800);
  Input.lock(document.getElementById('game'));
  setTimeout(() => { if (!Missions.active) Missions.start('m1'); }, 600);
};
G.continueGame = (fromPause) => {
  const s = Save.load(); if (!s) return G.startNew();
  Audio.init(); Audio.resume(); UI.hideTitle(); resetWorld();
  G.profile = Object.assign(newProfile(), s.profile); G.profile.skills = Object.assign({ shooting: 0, driving: 0, stamina: 0, flying: 0 }, s.profile.skills); G.profile.side = Object.assign(newProfile().side, s.profile.side);
  Object.assign(G.stats, s.stats); G.hour = s.hour; G.day = s.day; G.weather.set(s.weather || 'clear', true);
  G.player.setLook(G.profile.look); G.player.alive = true; G.player.revive(); G.player.group.visible = true;
  const pos = s.pos || { x: -1650, z: 228, yaw: 0 }; G.player.teleport(pos.x, pos.z, pos.yaw);
  G.player.weaponId = 'fist'; G.player.setWeapon(G.profile.weapons.pistol ? 'pistol' : 'fist');
  spawnWorldVehicles();
  for (const st of G.profile.street || []) { const rec = G.profile.garage.find((g) => g.uid === st.uid); if (rec) Eco.materialize(rec, st.x, st.z, st.yaw); }
  Eco.updateGarage();
  started = true; Race.markers(); Missions.refreshMarkers();
  if (G.profile.story.done.length === 0 && !Missions.isDone('m1') && pos.x < -1300) setTimeout(() => Missions.start('m1'), 500);
  CamCtl.init = false; G.state = 'play'; UI.showHud(true); UI.fade(false, 600); $menuHide(); Input.lock(document.getElementById('game'));
};
function $menuHide() { document.getElementById('menu').classList.add('hidden'); }
G.toTitle = () => { started = false; resetWorld(); G.player.group.visible = false; G.player.teleport(120, -20); UI.showHud(false); UI.showTitle(); UI.closeModal(); };
G.fastTravel = (x, z) => {
  UI.fade(true, 500); G.state = 'play';
  setTimeout(() => { const pl = G.player; let tx = x, tz = z; const inCity = x > -1150 && x < 1150 && z > -1150 && z < 1150; if (inCity) { const s = snapRoad(x, z); tx = s.x; tz = s.z; }
    if (pl.vehicle) { const v = pl.vehicle; v.pos.set(tx, TR.groundHeight(tx, tz), tz); v.vel.set(0, 0, 0); v.speed = 0; } else pl.teleport(tx, tz);
    Markers.setWaypoint(null); UI.route = null; UI.fade(false, 700); }, 600);
};
G.deliverVehicle = (rec) => {
  const pl = G.player; const a = pl.camYaw; let x = pl.pos.x + Math.sin(a) * 40, z = pl.pos.z + Math.cos(a) * 40;
  const inCity = x > -1150 && x < 1150 && z > -1150 && z < 1150; let yaw = a; if (inCity) { const s = snapRoad(x, z); x = s.x; z = s.z; yaw = s.yaw; }
  const old = Eco.vehicleSpawned(rec); if (old) Veh.remove(old);
  const v = Eco.materialize(rec, x, z, yaw); if (v) { v.parked = false; UI.toast('🔧 Dein ' + BY_ID[rec.id].name + ' wurde geliefert.'); }
};
G.sleep = () => { UI.fade(true, 700); setTimeout(() => { if (G.hour > 7) G.day++; G.hour = 7.0; G.player.hp = 100; Save.save(); UI.fade(false, 900); G.weather.set('clear'); }, 900); };
G.cheatCode = (c) => {
  const pl = G.player, ch = G.cheat || (G.cheat = {});
  const spawnV = (id) => { const f = pl.camForward ? pl.camForward() : { x: 0, z: 1 }; const v = Veh.spawn(id, pl.pos.x + Math.sin(pl.camYaw) * 6, pl.pos.z + Math.cos(pl.camYaw) * 6, pl.camYaw); if (v) { v.keep = true; v.parked = true; if (id === 'heli_m' || id === 'jet_l') v.pos.y += 1; } return 'Fahrzeug erschienen'; };
  switch (c) {
    case 'GELD': Eco.earn(50000); return '+$50.000';
    case 'GESUND': pl.hp = 100; pl.armor = 100; return 'Gesundheit & Rüstung voll';
    case 'ARMOR': pl.armor = 100; return 'Rüstung voll';
    case 'WAFFEN': for (const w of WEAPON_ORDER) if (w !== 'fist') { pl.addWeapon(w, (WEAPONS[w].ammoPack || 3) * 4); if (WEAPONS[w].mag) G.profile.weapons[w].mag = WEAPONS[w].mag; } return 'Alle Waffen erhalten';
    case 'FAHNDUNG': Police.setLevel(0); return 'Fahndung gelöscht';
    case 'SUCHE': Police.crime('kill_cop', pl.pos, null); return 'Fahndung erhöht';
    case 'REGEN': G.weather.set('rain'); G.weather.forced = 'rain'; return 'Regen';
    case 'STURM': G.weather.set('storm'); G.weather.forced = 'storm'; return 'Gewitter';
    case 'SONNE': G.weather.set('clear'); G.weather.forced = 'clear'; return 'Sonnig';
    case 'NEBEL': G.weather.set('fog'); G.weather.forced = 'fog'; return 'Nebel';
    case 'WETTER': G.weather.forced = null; return 'Wetter automatisch';
    case 'NACHT': G.hour = 23; return 'Nacht';
    case 'TAG': G.hour = 12; return 'Mittag';
    case 'SUNSET': G.hour = 18.9; return 'Sonnenuntergang';
    case 'MUNITION': G.settings.infAmmo = !G.settings.infAmmo; Save.saveSettings(); return 'Unendlich Munition ' + (G.settings.infAmmo ? 'an' : 'aus');
    case 'GOTT': ch.god = !ch.god; return 'Gott-Modus ' + (ch.god ? 'an' : 'aus');
    case 'NOCOPS': ch.noWanted = !ch.noWanted; return 'Keine Fahndung: ' + (ch.noWanted ? 'an' : 'aus');
    case 'PANZER': return spawnV('army'); case 'FLUG': return spawnV('jet_l'); case 'AUTO': return spawnV('sport_2'); case 'SUPER': return spawnV('super_2'); case 'BOOT': return spawnV('sp_boat1'); case 'HELI': return spawnV('heli_m'); case 'BIKE': return spawnV('bike_6'); case 'BUS': return spawnV('bus_1');
    case 'SPRINT': pl.energy = 600; return 'Unbegrenzte Ausdauer (10 min)';
    default: return 'Unbekannter Code';
  }
};

// ---------------- Tod / Verhaftung ----------------
function nearestPoi(type) { let best = null, bd = 1e12; for (const p of city.pois) if (p.type === type) { const d = (p.x - G.player.pos.x) ** 2 + (p.z - G.player.pos.z) ** 2; if (d < bd) { bd = d; best = p; } } return best; }
function onDied() {
  try { Multi.reportDeath(); } catch (e) { }
  UI.bigMsg('WASTED', '', 'red', 4200); Audio.play('fail');
  setTimeout(() => UI.fade(true, 900), 2600);
  setTimeout(() => {
    const pl = G.player, lose = Math.min(G.profile.money, Math.round(Math.min(800, G.profile.money * 0.08)));
    G.profile.money -= lose; pl.revive(); Police.setLevel(0); Police.busted = false;
    const h = nearestPoi('hospital'); if (h) pl.teleport(h.x, h.z + 6, 0);
    UI.toast(`🏥 Krankenhaus – Behandlungskosten ${fmtMoney(lose)}`); UI.fade(false, 900); CamCtl.init = false;
  }, 3800);
}
function onBusted() {
  UI.bigMsg('BUSTED', '', 'blue', 4200); Audio.play('fail');
  setTimeout(() => UI.fade(true, 900), 2400);
  setTimeout(() => {
    const pl = G.player, lose = Math.min(G.profile.money, Math.round(G.profile.money * 0.1));
    G.profile.money -= lose; G.profile.weapons = { }; pl.setWeapon('fist'); if (pl.vehicle) pl.exitVehicle(true);
    Police.setLevel(0); Police.busted = false; Police.arrestT = 0;
    const st = nearestPoi('police'); if (st) pl.teleport(st.x, st.z + 5, 0);
    UI.toast(`👮 Verhaftet – Kaution ${fmtMoney(lose)}, Waffen beschlagnahmt`); UI.fade(false, 900); CamCtl.init = false;
    if (Missions.active) Missions.fail('Du wurdest verhaftet.');
  }, 3600);
}

// ---------------- Interaktion ----------------
const IA_TYPES = new Set(['bank', 'clothes', 'barber', 'gun', 'dealer', 'tuning', 'burger', 'casino', 'hospital', 'police', 'property', 'business', 'hoops', 'gas', 'airport', 'port']);
function updateInteract(dt) {
  const pl = G.player; if (G.state !== 'play' || !pl.alive) { UI.prompt(''); return; }
  const I = Input; const inV = !!pl.vehicle; let best = null, bd = 1e9;
  const consider = (d, label, fn) => { if (d < bd) { bd = d; best = { label, fn }; } };
  // Mission-Interaktion
  const ih = G.interactHook; if (ih) { const d = Math.hypot(ih.x - pl.pos.x, ih.z - pl.pos.z); if (d < 4) consider(d - 2, `<kbd>E</kbd> ${ih.label}`, ih.fn); }
  const R_ = inV ? 8 : 3.6;
  for (const p of city.pois) {
    if (!IA_TYPES.has(p.type)) continue;
    const d = Math.hypot(p.x - pl.pos.x, p.z - pl.pos.z); if (d > R_) continue;
    if (inV && !['property', 'tuning', 'dealer', 'gas'].includes(p.type)) continue;
    if (inV && pl.vehicle.kind !== 'car' && pl.vehicle.kind !== 'bike') continue;
    const verb = p.type === 'property' ? (Eco.ownsProp(p.site.id) ? 'Betreten' : `Kaufen (${fmtMoney(p.site.price)})`) : p.type === 'business' ? (G.profile.owned.biz[p.site.id] ? 'Verwalten' : `Kaufen (${fmtMoney(p.site.price)})`) : 'Betreten';
    consider(d, `<kbd>E</kbd> ${verb}: ${p.name}`, () => UI.openPoi(p));
  }
  if (!inV) for (const m of Markers.items) { if (m.tag === 'start' && m.def) { const d = Math.hypot(m.x - pl.pos.x, m.z - pl.pos.z); if (d < 3.6) consider(d, `<kbd>E</kbd> Mission starten: <b>${m.def.title}</b>`, () => { if (Police.level > 0) { UI.toast('Verliere erst die Polizei!'); return; } Missions.start(m.def.id); }); } }
  for (const m of Markers.items) { if (m.tag === 'racestart') { const d = Math.hypot(m.x - pl.pos.x, m.z - pl.pos.z); if (d < 9 && inV) consider(d, `<kbd>E</kbd> Rennen: <b>${m.label}</b>`, () => { if (Police.level > 0) { UI.toast('Verliere erst die Polizei!'); return; } Race.start(m.race); }); } }
  // Fahrzeug
  if (!inV) { const v = pl.nearestVehicle(); if (v) { const d = 2.5; let txt = `<kbd>F</kbd> Einsteigen: ${v.spec.name}`; if (v.driver && v.driver.npc) txt = `<kbd>F</kbd> Fahrzeug stehlen: ${v.spec.name}`; else if (v.isDisplay || v.locked) txt = null; if (txt) consider(d + 0.5, txt, null); } }
  else { if (pl.vehicle.kind === 'plane' || pl.vehicle.kind === 'heli') { if (!G._airHint) { G._airHint = true; UI.toast(pl.vehicle.kind === 'heli' ? '🚁 Leertaste = Steigen · Shift = Sinken · W/S = Neigung · A/D = Rollen · Q/E = Gieren' : '✈ Shift = Gas · Leertaste = Gas weg · W/S = Neigung · A/D = Rollen · Q/E = Gieren'); } } }
  if (inV && pl.vehicle.spec.special === 'taxi' && !Taxi.job) consider(50, '<kbd>T</kbd> Taxi-Dienst starten', null);
  UI.prompt(best ? best.label : '');
  if (best && best.fn && I.press('KeyE')) { best.fn(); Audio.play('ui'); }
  if (I.press('KeyF') && !inV) { const v = pl.nearestVehicle(); if (v && !(v.isDisplay || v.locked)) { if (Police.level >= 0) { pl.enterVehicle(v); if (v.owned === false && (v.parked === false)) { } if (v.ownRec) { } } } }
  // Spielerfahrzeug nach Diebstahl besitzen
  if (inV && pl.vehicle.spec && !pl.vehicle.ownRec && false) { }
}

// ---------------- Lampenlichter ----------------
let lampT = 0;
// Nacht-Variante der Beleuchtung: Lampenlichter + Scheinwerfer sind nur dann in der Szene (jede Lichtquelle kostet in jedem Pixel Rechenzeit).
// Beide Varianten werden beim Laden vorab kompiliert, der Wechsel verursacht also kein Ruckeln.
let lampsVisible = false, lampSwitchT = 0;
function setLampsVisible(v) { if (v === lampsVisible) return; lampsVisible = v; for (const l of lampLights) l.visible = v; if (headSpot) headSpot.visible = v; }
function updateLampLights(dt) {
  lampT -= dt; lampSwitchT -= dt; const n = G.night, ref = camera.position;
  const inCar = !!G.player.vehicle, rainy = G.weather.rain;
  if (n > 0.2 || (inCar && rainy > 0.45)) { if (!lampsVisible && lampSwitchT <= 0) { setLampsVisible(true); lampSwitchT = 3; } }
  else if (lampsVisible && lampSwitchT <= 0 && n < 0.1 && !(inCar && rainy > 0.3)) { let m = headSpot ? headSpot.intensity : 0; for (const l of lampLights) m = Math.max(m, l.intensity); if (m < 0.6) { setLampsVisible(false); lampSwitchT = 3; } }
  if (lampT <= 0) {
    lampT = 0.4; const L = city.lamps; const best = [];
    if (n > 0.25 && ref.x > -1250 && ref.x < 1300 && ref.z > -1250 && ref.z < 1300) {
      for (let i = 0; i < L.length; i++) { const l = L[i]; const dx = l.x - ref.x, dz = l.z - ref.z, d = dx * dx + dz * dz; if (d < 3600) { best.push([d, l]); } }
      best.sort((a, b) => a[0] - b[0]);
    }
    lampLights.forEach((pl, i) => { const b = best[i]; if (b) { pl.position.set(b[1].x, 7.2, b[1].z); pl._on = true; } else pl._on = false; });
  }
  const rainDim = 1 - (G.weather.rain * 0.2);
  lampLights.forEach((pl) => { const t = pl._on ? n * 45 * rainDim : 0; pl.intensity = lerp(pl.intensity, t, Math.min(1, dt * 4)); });
  // Scheinwerfer des Spielerfahrzeugs
  const v = G.player.vehicle;
  if (v && n > 0.2 || (v && G.weather.rain > 0.5)) { const s = Math.sin(v.yaw), c = Math.cos(v.yaw); headSpot.position.set(v.pos.x + s * v.halfL, v.pos.y + 0.8, v.pos.z + c * v.halfL); headSpot.target.position.set(v.pos.x + s * (v.halfL + 20), v.pos.y + 0.2, v.pos.z + c * (v.halfL + 20)); headSpot.intensity = (v.kind === 'plane' || v.kind === 'heli' || !lampsVisible ? 0 : 140 * Math.max(n, 0.4)); } else { headSpot.intensity = 0; }
}

// ---------------- Hauptschleife ----------------
function loop(now) {
  requestAnimationFrame(loop);
  const rdt = (now - last) / 1000; let dt = Math.min(0.05, rdt); last = now; if (dt <= 0) dt = 0.001;
  G.clock += dt; clockT += dt;
  const _t0 = performance.now();
  const frozen = !window.__skipRender && ((G.state === 'pause' && UI.tab !== 'char') || (G.state === 'menu' && UI.menuOpen())) && (renderFrames > 3);
  if (frozen) { if (G.state === 'pause') { Input.endFrame(); } Audio.update(dt); Audio.radioTick(dt); return; }
  Gov.tick(rdt);
  fpsAcc += rdt; fpsN++; if (fpsAcc > 0.5) { const f = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; document.body.classList.toggle('showfps', !!G.settings.showFps); if (G.settings.showFps) { const el = document.getElementById('fps'); if (el) el.textContent = Math.round(f) + ' FPS · ' + Math.round((window.__gscale || 1) * 100) + '%'; } }
  const st = G.state, sim = st === 'play' || st === 'cutscene' || st === 'menu';
  const pl = G.player;
  Touch.update();
  if (sim) {
    if (st !== 'menu' || true) { const ts = G.settings.timeScale; G.hour += dt * ts / 60; if (G.hour >= 24) { G.hour -= 24; G.day++; } }
    G.weather.update(dt);
    pl.update(dt);
    Veh.update(dt); Peds.update(dt); Traffic.update(dt); Police.update(dt); Combat.update(dt); Multi.update(dt); Admin.update(dt);
    if (st !== 'menu') { Missions.update(dt); Race.update(dt); Taxi.update(dt); Delivery.update(dt); Events.update(dt); Eco.updateGarage(); updateInteract(dt); Markers.update(dt); saveTimer += dt; }
    else { Markers.update(dt); }
    UI.tickCutscene(dt);
    // Tageswechsel/Einkommen: nichts nötig
    if (G.player.vehicle) { const v = G.player.vehicle; if (Audio.ready && Input.press('KeyR')) { } }
    G.skillTick = (G.skillTick || 0) + dt;
    Input.endFrame();
  } else if (st === 'pause') {
    // Kamera für Charakteransicht
    pl.update(0.0001); Input.endFrame();
  } else { Input.endFrame(); }
  const _t1 = performance.now();
  // Kamera
  const camPos0 = camera.position;
  if (st === 'menu') { CamCtl.update(dt); }
  else if (st === 'play' || st === 'cutscene' || st === 'pause' || st === 'dead') CamCtl.update(dt);
  FX.update(dt, camera);
  // Himmel/Wetter
  camera.updateMatrixWorld();
  const follow = new THREE.Vector3(camera.position.x, 0, camera.position.z);
  const k = sky.update(dt, camera.position, follow);
  if (csm) { if (Math.abs(camera.fov - lastFov) > 1.2 && clockT - lastFovT > 0.5) { csm.updateFrustums(); fixCSMBias(); lastFov = camera.fov; lastFovT = clockT; } csm.update(); }
  renderer.toneMappingExposure = sky.exposure;
  updateWorld(dt, camera.position);
  rain.update(dt, camera.position, G.weather.rain, 0.2);
  updateLampLights(dt); updateCull(dt);
  Audio.update(dt); Audio.radioTick(dt);
  UI.update(dt);
  // Nachbearbeitung
  const q = G.quality; const sp = pl.vehicle ? Math.abs(pl.vehicle.speed) : 0; const target = clamp((sp - 38) / 120, 0, 0.3) * (pl.vehicle && pl.vehicle.kind !== 'boat' ? 1 : 0.4); speedBlur = lerp(speedBlur, target, Math.min(1, dt * 3));
  renderer.info.reset();
  if (window.__skipRender) { } else if (composer && (G.settings.bloom || true)) {
    Reflect.update(dt, camera); Reflect.render(scene, camera); updateSunPass(dt);
    bloom.enabled = !!G.settings.bloom && q.bloom !== false && G.settings.quality !== 'low'; bloom.strength = (G.night > 0.4 ? 0.62 : 0.28) + (G.settings.quality === 'ultra' ? 0.1 : 0);
    cinePass.uniforms.uBlur.value = speedBlur; cinePass.uniforms.uTime.value = clockT % 100; cinePass.uniforms.uVig.value = 0.42 + (pl.alive ? 0 : 0.3) + (pl.hp < 30 ? 0.25 : 0);
    composer.render(dt);
    renderFrames++;
  } else renderer.render(scene, camera);
  const _t2 = performance.now(); window.__prof = { sim: _t1 - _t0, render: _t2 - _t1, calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
  // Autosave alle 2 Minuten (nur im Spiel)
  if (saveTimer > 150 && G.state === 'play') { saveTimer = 0; try { localStorage.setItem(Save.key(), JSON.stringify(Save.serialize())); } catch (e) { } }
  // Fähigkeiten steigern
  if (G.skillTick > 5) { G.skillTick = 0; if (pl.vehicle && (pl.vehicle.kind === 'plane' || pl.vehicle.kind === 'heli') && !pl.vehicle.grounded) G.profile.skills.flying = Math.min(1, G.profile.skills.flying + 0.003); if (pl.sprinting) G.profile.skills.stamina = Math.min(1, G.profile.skills.stamina + 0.004); }
  window.__frame = (window.__frame || 0) + 1;
}
// Debug-Hooks
window.__dbg = { get composer() { return composer; }, get csm() { return csm; }, get sunPass() { return sunPass; }, get cinePass() { return cinePass; }, get outPass() { return outPass; }, get bloom() { return bloom; }, get renderer() { return renderer; }, get scene() { return scene; }, get camera() { return camera; }, get sky() { return sky; }, get lamps() { return lampLights; }, get spot() { return headSpot; }, cullList, Reflect, updateSunPass, Gov, QUALITY, setupComposer };
G.multiList = () => Multi.list();
window.__G = G; window.__mods = { Sec, Admin, Multi, Accounts, World, Reflect, Missions, Veh, Peds, Police, Traffic, Eco, UI, Race, Taxi, Delivery, Events, Combat, TR, Markers, city, Input, CamCtl };
boot().catch((e) => { console.error(e); const t = document.querySelector('#loading .tip'); if (t) t.textContent = 'Fehler beim Start: ' + e.message; });
