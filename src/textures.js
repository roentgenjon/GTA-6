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

// Fassade: 8x8 Fenster (1024px) mit Rahmen, Jalousien, Klimageräten, Bump-Map. Gibt {map, emissive, bump}
export function facadeTextures(type, seed = 1) {
  const S = 1024, B = 128, r = mulberry32(seed * 977 + type.length);
  const [c, g] = cv(S, S), [e, ge] = cv(S, S), [bm, gb] = cv(S, S);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, S, S);
  gb.fillStyle = '#9a9a9a'; gb.fillRect(0, 0, S, S);
  const wall = { curtain: '#8fa9bd', office: '#c9c3b6', resid: '#ece0cb' }[type];
  g.fillStyle = wall; g.fillRect(0, 0, S, S);
  // Wandstruktur: Putz/Beton-Flecken und Fugen
  for (let i = 0; i < 9000; i++) { const v = r() < 0.5 ? 0 : 255; g.fillStyle = `rgba(${v},${v},${v},${0.02 + r() * 0.035})`; g.fillRect(r() * S, r() * S, 1 + r() * 4, 1 + r() * 4); }
  if (type === 'office') { g.strokeStyle = 'rgba(0,0,0,0.14)'; g.lineWidth = 1.5; for (let y = 0; y <= S; y += B / 2) { g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke(); } for (let x = 0; x <= S; x += B) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, S); g.stroke(); } }
  for (let fy = 0; fy < 8; fy++) for (let fx = 0; fx < 8; fx++) {
    const x = fx * B, y = fy * B;
    let wx, wy, ww, wh;
    if (type === 'curtain') { wx = x + 4; wy = y + 6; ww = B - 8; wh = B - 14; }
    else if (type === 'office') { wx = x + 12; wy = y + 24; ww = B - 24; wh = B - 48; }
    else { wx = x + 28; wy = y + 24; ww = B - 56; wh = B - 46; }
    const lit = r() < 0.3;
    const tint = type === 'curtain' ? ['#2c4a66', '#37587a', '#274057', '#2f5470'][(r() * 4) | 0] : ['#35485a', '#3d5266', '#2f4252', '#41586b'][(r() * 4) | 0];
    const grad = g.createLinearGradient(wx, wy, wx + ww * 0.7, wy + wh);
    grad.addColorStop(0, tint); grad.addColorStop(0.45, lit ? '#8aa0b0' : '#1b2835'); grad.addColorStop(0.55, lit ? '#9fb3c2' : '#25364a'); grad.addColorStop(1, tint);
    // Rahmen
    if (type !== 'curtain') { g.fillStyle = type === 'resid' ? '#f7f2e6' : '#6f6c66'; g.fillRect(wx - 5, wy - 5, ww + 10, wh + 10); }
    g.fillStyle = grad; g.fillRect(wx, wy, ww, wh);
    // Himmelsspiegelung (diagonal)
    g.fillStyle = 'rgba(255,255,255,0.10)'; g.beginPath(); g.moveTo(wx, wy + wh * 0.55); g.lineTo(wx + ww * 0.6, wy); g.lineTo(wx + ww * 0.85, wy); g.lineTo(wx, wy + wh * 0.9); g.fill();
    // Jalousien / Vorhänge
    const kind = r();
    if (kind < 0.22) { g.fillStyle = 'rgba(210,205,190,0.55)'; const h2 = wh * (0.25 + r() * 0.6); g.fillRect(wx, wy, ww, h2); g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1; for (let yy = wy; yy < wy + h2; yy += 5) { g.beginPath(); g.moveTo(wx, yy); g.lineTo(wx + ww, yy); g.stroke(); } }
    else if (kind < 0.32) { g.fillStyle = ['rgba(200,80,70,0.5)', 'rgba(70,120,200,0.45)', 'rgba(230,200,120,0.5)'][(r() * 3) | 0]; g.fillRect(wx, wy, ww * 0.35, wh); g.fillRect(wx + ww * 0.65, wy, ww * 0.35, wh); }
    if (type === 'resid') { g.fillStyle = '#d9cbb0'; g.fillRect(wx - 9, wy + wh + 5, ww + 18, 7); g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 3; g.beginPath(); g.moveTo(wx + ww / 2, wy); g.lineTo(wx + ww / 2, wy + wh); g.stroke(); if (r() < 0.18) { g.fillStyle = '#4a6b3a'; g.fillRect(wx + 4, wy + wh - 12, ww - 8, 10); g.strokeStyle = '#2b2b2b'; g.lineWidth = 3; g.strokeRect(wx - 6, wy + wh - 28, ww + 12, 26); } }
    if (type === 'office') { g.fillStyle = '#8c8a82'; g.fillRect(x, y + B - 9, B, 9); if (r() < 0.07) { g.fillStyle = '#b8b8b2'; g.fillRect(wx + ww - 26, wy + wh + 10, 24, 14); g.fillStyle = '#555'; g.fillRect(wx + ww - 22, wy + wh + 14, 16, 6); } }
    if (type === 'curtain') { g.strokeStyle = 'rgba(10,20,30,0.55)'; g.lineWidth = 2; g.strokeRect(wx, wy, ww, wh); g.beginPath(); g.moveTo(wx + ww / 2, wy); g.lineTo(wx + ww / 2, wy + wh); g.stroke(); g.fillStyle = 'rgba(190,205,215,0.5)'; g.fillRect(x, y + B - 8, B, 8); }
    if (lit) {
      const warm = r() < 0.75;
      ge.fillStyle = warm ? ['#ffd9a0', '#ffe8b8', '#ffc680', '#fff2d0'][(r() * 4) | 0] : ['#a9d6ff', '#c8b7ff', '#9fe8ff'][(r() * 3) | 0];
      ge.globalAlpha = 0.6 + r() * 0.4; ge.fillRect(wx + 1, wy + 1, ww - 2, wh - 2); ge.globalAlpha = 1;
      if (kind < 0.22) { ge.fillStyle = 'rgba(0,0,0,0.55)'; for (let yy = wy; yy < wy + wh * 0.5; yy += 6) ge.fillRect(wx, yy, ww, 2); }
    }
    // Bump: Fensterglas vertieft, Rahmen erhaben
    gb.fillStyle = '#d8d8d8'; gb.fillRect(wx - 5, wy - 5, ww + 10, wh + 10); gb.fillStyle = '#4a4a4a'; gb.fillRect(wx, wy, ww, wh);
  }
  const m = tex(c), em = tex(e), bump = tex(bm, false);
  return { map: m, emissive: em, bump };
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
  const [c, g] = cv(512, 512), r = mulberry32(9);
  g.fillStyle = '#3d3e41'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 24000; i++) { g.fillStyle = `rgba(${r() < 0.5 ? 0 : 255},${r() < 0.5 ? 0 : 255},${r() < 0.5 ? 0 : 255},${0.03 + r() * 0.05})`; g.fillRect(r() * 512, r() * 512, 1 + r() * 2, 1 + r() * 2); }
  for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(0,0,0,${0.08 + r() * 0.08})`; g.beginPath(); g.ellipse(r() * 512, r() * 512, 20 + r() * 60, 10 + r() * 30, r() * 3, 0, 6.3); g.fill(); }
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1; for (let i = 0; i < 10; i++) { let x = r() * 512, y = r() * 512; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (r() - 0.5) * 40; y += (r() - 0.3) * 30; g.lineTo(x, y); } g.stroke(); }
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

export function blobTexture() {
  const [c, g] = cv(64, 64); const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return tex(c, true, false);
}
