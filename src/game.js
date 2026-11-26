// Globaler Spielzustand und einfacher Event-Bus
export const G = {
  scene: null, camera: null, renderer: null,
  player: null,          // Player-Objekt
  state: 'menu',         // menu | play | pause | cutscene | dead | map
  hour: 8.5,             // Spielzeit 0..24
  day: 1,
  clock: 0,              // Sekunden Spielzeit
  night: 0,              // 0..1
  weather: null, sky: null,
  settings: {
    quality: 'high', volume: 0.7, music: 0.5, sens: 1.0, fov: 70, invertY: false, traffic: 1, timeScale: 1,
    shadows: true, bloom: true, mouseSmooth: false, units: 'kmh', subtitles: true, camShake: true, hints: true, touch: 'auto', reflections: true, godrays: true, autoTune: true, showFps: false,
  },
  save: null,
  stats: { dist: 0, vdist: 0, kills: 0, crimes: 0, jumps: 0, driftBest: 0, wins: 0, missions: 0, stolen: 0, arrests: 0, deaths: 0, played: 0, maxJump: 0, spent: 0, earned: 0 },
  keys: {}, mouse: { dx: 0, dy: 0, buttons: 0, wheel: 0 },
  entities: { vehicles: [], peds: [], cops: [], heli: [], pickups: [], projectiles: [] },
};
const handlers = {};
export const on = (ev, fn) => { (handlers[ev] ||= []).push(fn); };
export const emit = (ev, ...a) => { const h = handlers[ev]; if (h) for (const f of h) f(...a); };
