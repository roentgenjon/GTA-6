// Spielerprofil, Speichern/Laden, Wirtschaft (Immobilien, Garagen, Geschäfte)
import { G, emit } from './game.js?v=20261126142831-8986ff1';
import { playerLook, OUTFITS } from './persons.js?v=20261126142831-8986ff1';
import { SITES } from './sites.js?v=20261126142831-8986ff1';
import { BY_ID } from './catalog.js?v=20261126142831-8986ff1';
import { fmtMoney } from './util.js?v=20261126142831-8986ff1';
import { city } from './city.js?v=20261126142831-8986ff1';
import { Veh } from './vehicles.js?v=20261126142831-8986ff1';
import * as TR from './terrain.js?v=20261126142831-8986ff1';

let KEY = 'vicecity_save_v1'; const SKEY = 'vicecity_settings_v1';

export function newProfile() {
  return {
    name: 'Leo Marquez', money: 4500, bank: 0, look: playerLook(),
    weapons: { pistol: { ammo: 36, mag: 12 } }, inv: { medkit: 1, burger: 2 },
    owned: { props: ['apt_beach'], biz: {}, outfits: ['casual'] },
    garage: [], street: [], skills: { shooting: 0, driving: 0, stamina: 0, flying: 0 },
    story: { done: [], current: null, step: 0, flags: {} }, side: { races: {}, taxi: 0, vigil: 0, deliveries: 0, stunts: {}, hoops: 0, slots: 0 },
    flags: {}, home: 'apt_beach', wantedTotal: 0, uid: 1,
  };
}
export const Save = {
  setKey(k) { KEY = k; }, key() { return KEY; },
  has() { try { return !!localStorage.getItem(KEY); } catch (e) { return false; } },
  info() { try { const s = JSON.parse(localStorage.getItem(KEY)); return s ? { at: s.at, money: s.profile.money, day: s.day, missions: s.profile.story.done.length } : null; } catch (e) { return null; } },
  serialize() {
    const pl = G.player;
    const street = [];
    for (const v of G.entities.vehicles) if (v.owned && v.ownRec && !v.wreck) street.push({ uid: v.ownRec.uid, x: v.pos.x, z: v.pos.z, yaw: v.yaw });
    G.profile.street = street;
    const rec = { v: 1, at: Date.now(), profile: G.profile, stats: G.stats, hour: G.hour, day: G.day, weather: G.weather ? G.weather.type : 'clear', pos: pl ? { x: pl.pos.x, z: pl.pos.z, yaw: pl.yaw, vehUid: pl.vehicle && pl.vehicle.ownRec ? pl.vehicle.ownRec.uid : null } : null };
    return rec;
  },
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.serialize())); emit('toast', '💾 Spielstand gespeichert'); return true; } catch (e) { emit('toast', 'Speichern fehlgeschlagen'); return false; } },
  load() { try { const s = JSON.parse(localStorage.getItem(KEY)); return s; } catch (e) { return null; } },
  wipe() { try { localStorage.removeItem(KEY); } catch (e) { } },
  saveSettings() { try { localStorage.setItem(SKEY, JSON.stringify(G.settings)); } catch (e) { } },
  loadSettings() { try { const s = JSON.parse(localStorage.getItem(SKEY)); if (s) Object.assign(G.settings, s); } catch (e) { } },
};

export const Eco = {
  site(id) { return SITES.find((s) => s.id === id); },
  ownsProp(id) { return G.profile.owned.props.includes(id); },
  ownedPropSites() { return G.profile.owned.props.map((id) => this.site(id)).filter(Boolean); },
  capacity(id) { const s = this.site(id); return s ? (s.garage || 0) : 0; },
  used(id) { return G.profile.garage.filter((g) => g.prop === id).length; },
  freeProp() { for (const s of this.ownedPropSites()) if (this.used(s.id) < this.capacity(s.id)) return s.id; return null; },
  spend(n) { if (G.profile.money < n) { emit('toast', '❌ Nicht genug Geld'); if (G.audio) G.audio.play('fail'); return false; } G.profile.money -= n; G.stats.spent += n; return true; },
  earn(n, why = '') { G.profile.money += n; G.stats.earned += n; emit('cash', n, why); },
  buyProp(id) { const s = this.site(id); if (!s || this.ownsProp(id)) return false; if (!this.spend(s.price)) return false; G.profile.owned.props.push(id); emit('toast', `🏠 ${s.name} gekauft!`); if (G.audio) G.audio.play('win'); emit('propBought', id); return true; },
  sellProp(id) { const s = this.site(id); if (!s || !this.ownsProp(id) || s.start) return false; if (G.profile.garage.some((g) => g.prop === id)) { emit('toast', 'Garage zuerst leeren!'); return false; } G.profile.owned.props = G.profile.owned.props.filter((p) => p !== id); this.earn(Math.round(s.price * 0.6), 'Verkauf'); if (G.profile.home === id) G.profile.home = 'apt_beach'; return true; },
  buyBiz(id) { const s = this.site(id); if (!s || G.profile.owned.biz[id]) return false; if (!this.spend(s.price)) return false; G.profile.owned.biz[id] = { last: G.day * 24 + G.hour }; emit('toast', `💼 ${s.name} gekauft! Einnahmen: ${fmtMoney(s.income)}/Tag`); if (G.audio) G.audio.play('win'); return true; },
  bizAccrued(id) { const b = G.profile.owned.biz[id], s = this.site(id); if (!b) return 0; const days = Math.min(7, (G.day * 24 + G.hour - b.last) / 24); return Math.floor(s.income * Math.max(0, days)); },
  collectBiz(id) { const a = this.bizAccrued(id); if (a < 1) { emit('toast', 'Noch keine Einnahmen.'); return; } G.profile.owned.biz[id].last = G.day * 24 + G.hour; this.earn(a, 'Einnahmen'); },
  // Fahrzeuge
  newRec(id, c1, c2, prop) { const spec = BY_ID[id]; return { uid: G.profile.uid++, id, c1: c1 != null ? c1 : spec.colors[0], c2: c2 !== undefined ? c2 : spec.colors[1], hp: 1000, prop, plate: 'VC' + String(Math.floor(Math.random() * 900 + 100)) + 'X' }; },
  addVehicleRecord(rec) { G.profile.garage.push(rec); },
  buyVehicle(id, c1) {
    const spec = BY_ID[id]; if (!spec) return null; if (!this.spend(spec.price)) return null;
    const prop = this.freeProp();
    const rec = this.newRec(id, c1, undefined, prop); G.profile.garage.push(rec);
    emit('toast', `🚘 ${spec.name} gekauft${prop ? ' – wartet in deiner Garage' : ' – keine freie Garage!'}`);
    if (G.audio) G.audio.play('win'); return rec;
  },
  vehicleSpawned(rec) { return G.entities.vehicles.find((v) => v.ownRec === rec); },
  materialize(rec, x, z, yaw) {
    if (this.vehicleSpawned(rec)) return this.vehicleSpawned(rec);
    const v = Veh.spawn(rec.id, x, z, yaw, { c1: rec.c1, c2: rec.c2 }); if (!v) return null;
    v.owned = true; v.ownRec = rec; v.hp = rec.hp; v.keep = true; v.parked = true; v.plate = rec.plate; return v;
  },
  parkVehicle(v, propId) {
    const rec = v.ownRec; if (!rec) return false;
    if (!propId || this.used(propId) >= this.capacity(propId) && rec.prop !== propId) { emit('toast', 'Garage voll!'); return false; }
    rec.prop = propId; rec.hp = 1000; rec.c1 = v.c1; rec.c2 = v.c2; Veh.remove(v); emit('toast', '🅿️ Fahrzeug eingeparkt und repariert'); return true;
  },
  claimVehicle(v) { // gestohlenes Fahrzeug in Besitz nehmen
    if (v.ownRec) return v.ownRec; const rec = this.newRec(v.spec.id, v.c1, v.c2, null); rec.hp = v.hp; v.owned = true; v.ownRec = rec; G.profile.garage.push(rec); return rec;
  },
  // Spawn von Garagenfahrzeugen in Spielernähe
  updateGarage() {
    const pl = G.player; if (!pl) return;
    for (const rec of G.profile.garage) {
      if (!rec.prop) continue; const s = this.site(rec.prop); if (!s || !s.spots) continue;
      const idx = G.profile.garage.filter((g) => g.prop === rec.prop).indexOf(rec); const sp = s.spots[idx % s.spots.length]; if (!sp) continue;
      const d = Math.hypot(sp.x - pl.pos.x, sp.z - pl.pos.z); const live = this.vehicleSpawned(rec);
      if (!live && d < 130) { this.materialize(rec, sp.x, sp.z, sp.yaw); }
      else if (live && !live.driver && d > 320 && !live.isMission) { rec.hp = live.hp; rec.c1 = live.c1; Veh.remove(live); }
    }
  },
  // Einkommen
  tickIncome() { /* wird bei Einsammeln abgerechnet */ },
};
export function loadSettingsInit() { Save.loadSettings(); }
