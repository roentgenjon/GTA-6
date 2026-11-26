// Prozedurale Texturen (Canvas)
import * as THREE from 'three';
import { mulberry32 } from './util.js';

function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, srgb = true, rep = true) {
  const t = new THREE.CanvasTexture(c);
  if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
function noiseFill(ctx, w, h, base, amt, r) {
  const id = ctx.getImageData(0, 0, w, h), d = id.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  ctx.putImageData(id, 0, 0);
}

// Fassade: 8x8 Fenster. Gibt {map, emissive, rough?}
export function facadeTextures(type, seed = 1) {
  const S = 512, B = 64, r = mulberry32(seed * 977 + type.length);
  const [c, g] = cv(S, S), [e, ge] = cv(S, S);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, S, S);
  const wall = { curtain: '#9fb7c9', office: '#cfcac0', resid: '#efe3d0' }[type];
  g.fillStyle = wall; g.fillRect(0, 0, S, S);
  for (let fy = 0; fy < 8; fy++) for (let fx = 0; fx < 8; fx++) {
    const x = fx * B, y = fy * B;
    let wx, wy, ww, wh;
    if (type === 'curtain') { wx = x + 2; wy = y + 3; ww = B - 4; wh = B - 8; }
    else if (type === 'office') { wx = x + 6; wy = y + 12; ww = B - 12; wh = B - 24; }
    else { wx = x + 14; wy = y + 12; ww = B - 28; wh = B - 24; }
    const lit = r() < 0.3;
    const tint = type === 'curtain' ? [`#2c4a66`, `#37587a`, `#274057`][(r() * 3) | 0] : ['#35485a', '#3d5266', '#2f4252'][(r() * 3) | 0];
    const grad = g.createLinearGradient(wx, wy, wx + ww * 0.6, wy + wh);
    grad.addColorStop(0, tint); grad.addColorStop(0.5, lit ? '#8aa0b0' : '#1d2b38'); grad.addColorStop(1, tint);
    g.fillStyle = grad; g.fillRect(wx, wy, ww, wh);
    if (type === 'resid') { g.fillStyle = '#d6c7ae'; g.fillRect(wx - 4, wy + wh, ww + 8, 4); g.strokeStyle = '#fff8'; g.lineWidth = 2; g.strokeRect(wx, wy, ww, wh); g.beginPath(); g.moveTo(wx + ww / 2, wy); g.lineTo(wx + ww / 2, wy + wh); g.stroke(); }
    if (type === 'office') { g.fillStyle = '#8c8a82'; g.fillRect(x, y + B - 5, B, 5); }
    if (type === 'curtain') { g.strokeStyle = '#0006'; g.lineWidth = 1; g.strokeRect(wx, wy, ww, wh); }
    if (lit) {
      const warm = r() < 0.75;
      ge.fillStyle = warm ? ['#ffd9a0', '#ffe8b8', '#ffc680', '#fff2d0'][(r() * 4) | 0] : ['#a9d6ff', '#c8b7ff', '#9fe8ff'][(r() * 3) | 0];
      ge.globalAlpha = 0.65 + r() * 0.35; ge.fillRect(wx + 1, wy + 1, ww - 2, wh - 2); ge.globalAlpha = 1;
    }
  }
  noiseFill(g, S, S, 0, 14, r);
  return { map: tex(c), emissive: tex(e) };
}

export function roadTexture() {
  // 14m breit (u), 82m lang (v). 256x1024
  const W = 256, H = 1024, r = mulberry32(5);
  const [c, g] = cv(W, H);
  g.fillStyle = '#3a3b3e'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${r() < 0.5 ? 0 : 255},${r() < 0.5 ? 0 : 255},${r() < 0.5 ? 0 : 255},${0.025 + r() * 0.03})`; g.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2); }
  // Spurwechsel-Verschleiß
  g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(W * 0.2, 0, 14, H); g.fillRect(W * 0.2 + 14 + 34, 0, 14, H); g.fillRect(W * 0.75, 0, 14, H);
  // Mittellinie doppelt gelb
  g.fillStyle = '#d9b43a'; g.fillRect(W / 2 - 5, 0, 3, H); g.fillRect(W / 2 + 2, 0, 3, H);
  // Randlinien
  g.fillStyle = '#d8d8d0'; g.fillRect(8, 0, 3, H); g.fillRect(W - 11, 0, 3, H);
  // Fahrbahn-Pfeile entfallen. Zebrastreifen an beiden Enden
  g.fillStyle = '#e4e2da';
  for (let s = 0; s < 8; s++) { const x = 18 + s * 28; g.fillRect(x, 40, 16, 56); g.fillRect(x, H - 96, 16, 56); }
  g.fillRect(W / 2 + 6, 120, W / 2 - 17, 8); g.fillRect(11, H - 128, W / 2 - 17, 8);
  return tex(c);
}
export function asphaltTexture() {
  const [c, g] = cv(256, 256), r = mulberry32(9);
  g.fillStyle = '#3d3e41'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 6000; i++) { g.fillStyle = `rgba(${r() < 0.5 ? 0 : 255},${r() < 0.5 ? 0 : 255},${r() < 0.5 ? 0 : 255},${0.03 + r() * 0.04})`; g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2); }
  return tex(c);
}
export function pavementTexture() {
  const [c, g] = cv(256, 256), r = mulberry32(3);
  g.fillStyle = '#a7a39a'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2;
  for (let i = 0; i <= 256; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
  noiseFill(g, 256, 256, 0, 22, r);
  return tex(c);
}
export function detailTexture() {
  const [c, g] = cv(256, 256), r = mulberry32(21);
  g.fillStyle = '#808080'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 12000; i++) { const v = 100 + r() * 90; g.fillStyle = `rgba(${v},${v},${v},0.35)`; g.fillRect(r() * 256, r() * 256, 1 + r() * 3, 1 + r() * 3); }
  return tex(c);
}
export function glowTexture() {
  const [c, g] = cv(64, 64);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return tex(c, true, false);
}
export function signTexture(text, fg = '#ff3dbb', bg = '#14081c', w = 512, h = 128, font = 'bold 76px Impact, Arial Black, sans-serif') {
  const [c, g] = cv(w, h);
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = fg; g.shadowBlur = 24; g.fillStyle = fg; g.fillText(text, w / 2, h / 2 + 4); g.fillText(text, w / 2, h / 2 + 4);
  g.shadowBlur = 0; g.fillStyle = '#fff'; g.globalAlpha = 0.85; g.fillText(text, w / 2, h / 2 + 4);
  const t = tex(c, true, false); return t;
}
export function plateTexture(text) {
  const [c, g] = cv(128, 64);
  g.fillStyle = '#f4f1e6'; g.fillRect(0, 0, 128, 64); g.fillStyle = '#c2371f'; g.fillRect(0, 0, 128, 10);
  g.fillStyle = '#111'; g.font = 'bold 34px monospace'; g.textAlign = 'center'; g.fillText(text, 64, 46);
  return tex(c, true, false);
}
export function cloudShadowless() { return null; }
