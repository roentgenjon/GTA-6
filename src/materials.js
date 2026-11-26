// Gemeinsame Materialien
import * as THREE from 'three';
import * as T from './textures.js';

export const M = {};
export function initMaterials() {
  const fc = T.facadeTextures('curtain', 1), fo = T.facadeTextures('office', 2), fr = T.facadeTextures('resid', 3);
  const fac = (t, rough, metal) => new THREE.MeshStandardMaterial({ map: t.map, emissiveMap: t.emissive, emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true, roughness: rough, metalness: metal });
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
  M.glass = new THREE.MeshStandardMaterial({ color: 0x0c141c, roughness: 0.04, metalness: 0.9 });
  M.carGlass = new THREE.MeshStandardMaterial({ color: 0x0a1118, roughness: 0.02, metalness: 0.95, transparent: true, opacity: 0.88 });
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
  M.car = (color, rough = 0.28, metal = 0.7) => new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: metal, clearcoat: 1, clearcoatRoughness: 0.06, vertexColors: true });
}
// Nacht-/Nässe-Update der Weltmaterialien
export function updateMaterials(night, wet, rain) {
  const em = night * 0.8;
  M.curtain.emissiveIntensity = em; M.office.emissiveIntensity = em * 0.9; M.resid.emissiveIntensity = em * 0.85;
  const n = 0.5 + night * 0.9;
  M.neon.color.setRGB(n, n, n);
  M.lamp.color.setRGB(0.25 + night * 1.2, 0.22 + night * 1.0, 0.15 + night * 0.7);
  M.glow.opacity = night * 0.6;
  M.road.roughness = 0.92 - wet * 0.72; M.plain.roughness = 0.92 - wet * 0.72;
  const dk = 1 - wet * 0.35; M.road.color.setRGB(dk, dk, dk); M.plain.color.setRGB(dk, dk, dk);
  M.slab.roughness = 0.88 - wet * 0.5;
}
