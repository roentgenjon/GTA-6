// Gemeinsame Materialien
import * as THREE from 'three';
import * as T from './textures.js?v=20261126142831-8986ff1';
import { G } from './game.js?v=20261126142831-8986ff1';

export const M = {};

// ---- Hooks: Kaskaden-Schatten (CSM) + planare Reflexion in Materialien einhängen ----
export const Hooks = { csm: null, planar: null, seen: new WeakSet() };
const PLANAR_FRAG = `
#ifdef PLANAR_REFLECT
if (uWetAmt > 0.01) {
  vec4 pr = uTexMat * vec4(vWPos.x, uReflY, vWPos.z, 1.0);
  float okw = step(0.0, pr.w);
  vec2 ruv = pr.xy / max(pr.w, 0.0001);
  float n1 = pvn(vWPos.xz * 0.22), n2 = pvn(vWPos.xz * 1.9 + 3.1), n3 = pvn(vWPos.xz * 7.0 + 9.7);
  float puddle = smoothstep(0.62 - uWetAmt * 0.42, 0.80 - uWetAmt * 0.40, n1 * 0.7 + n2 * 0.3);
  vec2 duv = (vec2(n2, n3) - 0.5) * 0.035 * (1.0 - puddle * 0.75);
  vec3 rc = texture2D(tReflect, clamp(ruv + duv, 0.002, 0.998)).rgb;
  vec3 pV = normalize(vViewPosition);
  float fr = pow(1.0 - clamp(dot(normalize(normal), pV), 0.0, 1.0), 3.0);
  float edge = smoothstep(0.0, 0.05, ruv.x) * smoothstep(1.0, 0.95, ruv.x) * smoothstep(0.0, 0.05, ruv.y) * smoothstep(1.0, 0.95, ruv.y);
  float k = uWetAmt * (0.12 + 0.88 * puddle) * (0.12 + 0.88 * fr) * edge * okw;
  outgoingLight = mix(outgoingLight, rc * (0.55 + 0.45 * puddle), clamp(k * uReflStr, 0.0, 0.92));
}
#endif
`;
function injectPlanar(shader) {
  const U = Hooks.planar;
  shader.uniforms.tReflect = U.tReflect; shader.uniforms.uTexMat = U.uTexMat; shader.uniforms.uWetAmt = U.uWetAmt; shader.uniforms.uReflY = U.uReflY; shader.uniforms.uReflStr = U.uReflStr;
  shader.defines = shader.defines || {}; shader.defines.PLANAR_REFLECT = 1;
  shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vWPos; uniform sampler2D tReflect; uniform mat4 uTexMat; uniform float uWetAmt, uReflY, uReflStr;
float pvh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float pvn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(pvh(i), pvh(i + vec2(1, 0)), f.x), mix(pvh(i + vec2(0, 1)), pvh(i + vec2(1, 1)), f.x), f.y); }`).replace('#include <opaque_fragment>', PLANAR_FRAG + '\n#include <opaque_fragment>');
}
export function hookMaterial(mat) {
  if (!mat || Hooks.seen.has(mat) || !mat.isMeshStandardMaterial) return;
  Hooks.seen.add(mat);
  const csm = Hooks.csm, planar = !!(Hooks.planar && mat.userData && mat.userData.planar);
  if (!csm && !planar) return;
  if (csm) csm.setupMaterial(mat);
  const base = mat.onBeforeCompile;
  if (planar) mat.onBeforeCompile = function (shader, renderer) { if (csm) base.call(this, shader, renderer); injectPlanar(shader); };
  mat.customProgramCacheKey = () => (csm ? 'csm' + csm.cascades + (csm.fade ? 'f' : '') : 'nocsm') + (planar ? 'P' : '');
  mat.needsUpdate = true;
}
export function hookObject(o) { o.traverse((c) => { if (c.material) { if (Array.isArray(c.material)) c.material.forEach(hookMaterial); else hookMaterial(c.material); } }); }
export function initMaterials() {
  const fc = T.facadeTextures('curtain', 1), fo = T.facadeTextures('office', 2), fr = T.facadeTextures('resid', 3);
  const lite = !!(G.quality && G.quality.lite);
  const fac = (t, rough, metal) => new THREE.MeshStandardMaterial({ map: t.map, bumpMap: lite ? null : t.bump, bumpScale: 2.2, emissiveMap: t.emissive, emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true, roughness: rough, metalness: metal });
  M.curtain = fac(fc, 0.18, 0.55);
  M.office = fac(fo, 0.6, 0.1);
  M.resid = fac(fr, 0.75, 0.0);
  M.flat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.02 });
  M.shiny = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.6 });
  M.neon = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  M.road = new THREE.MeshStandardMaterial({ map: T.roadTexture(), roughness: 0.92, metalness: 0.0, color: 0xffffff });
  M.plain = new THREE.MeshStandardMaterial({ map: T.asphaltTexture(), roughness: 0.92, metalness: 0.0 });
  M.plain.map.repeat.set(3, 3);
  M.slab = new THREE.MeshStandardMaterial({ map: T.pavementTexture(), roughness: 0.88, vertexColors: true });
  M.road.userData.planar = true; M.plain.userData.planar = true; M.slab.userData.planar = true;
  M.beam = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  M.glass = new THREE.MeshStandardMaterial({ color: 0x0c141c, roughness: 0.04, metalness: 0.9 });
  M.carGlass = new THREE.MeshStandardMaterial({ color: 0x0a1118, roughness: 0.02, metalness: 0.9, transparent: true, opacity: 0.62 });
  M.blob = new THREE.MeshBasicMaterial({ map: T.blobTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, fog: false });
  M.rubber = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.8 });
  M.chrome = new THREE.MeshStandardMaterial({ color: 0xcfd3d8, roughness: 0.15, metalness: 1.0 });
  M.person = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.0 });
  M.skin = new THREE.MeshStandardMaterial({ roughness: 0.65 });
  M.foliage = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
  M.terrain = new THREE.MeshStandardMaterial({ vertexColors: true, map: T.detailTexture(), roughness: 0.96, metalness: 0 });
  M.terrain.map.repeat.set(1, 1);
  M.lamp = new THREE.MeshBasicMaterial({ color: 0xfff0c0, toneMapped: false });
  M.glow = new THREE.PointsMaterial({ map: T.glowTexture(), size: 9, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffd9a0, opacity: 0, sizeAttenuation: true, fog: false });
  M.tl = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  M.car = (color, rough = 0.28, metal = 0.7) => (G.quality && G.quality.lite ? new THREE.MeshStandardMaterial({ color, roughness: rough * 0.9, metalness: Math.min(0.85, metal + 0.1), vertexColors: true }) : new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: metal, clearcoat: 1, clearcoatRoughness: 0.06, vertexColors: true }));
  if (lite) { // raue Flächen ohne IBL (spart pro Pixel mehrere Cube-Map-Zugriffe); Autos, Glas und Chrom behalten die Himmelsspiegelung
    M.curtain.metalness = 0.12;
    for (const k of ['curtain', 'office', 'resid', 'flat', 'road', 'plain', 'slab', 'terrain', 'foliage', 'person', 'skin', 'rubber']) if (M[k]) M[k].defines = Object.assign(M[k].defines || {}, { NO_IBL: '' });
  }
}
// Nacht-/Nässe-Update der Weltmaterialien
export function updateMaterials(night, wet, rain) {
  const em = night * 0.8;
  M.curtain.emissiveIntensity = em; M.office.emissiveIntensity = em * 0.9; M.resid.emissiveIntensity = em * 0.85;
  const n = 0.5 + night * 0.9;
  M.neon.color.setRGB(n, n, n);
  M.lamp.color.setRGB(0.25 + night * 1.2, 0.22 + night * 1.0, 0.15 + night * 0.7);
  M.glow.opacity = night * 0.6;
  M.road.envMapIntensity = 1 + wet * 1.6; M.plain.envMapIntensity = 1 + wet * 1.6; M.road.roughness = 0.92 - wet * 0.72; M.plain.roughness = 0.92 - wet * 0.72;
  const dk = 1 - wet * 0.35; M.road.color.setRGB(dk, dk, dk); M.plain.color.setRGB(dk, dk, dk);
  M.slab.roughness = 0.88 - wet * 0.5;
  M.beam.opacity = Math.min(1, night * 0.9 + (rain > 0.4 ? 0.25 : 0));
}
