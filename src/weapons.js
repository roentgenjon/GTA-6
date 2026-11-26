// Waffen-Definitionen
export const WEAPONS = {
  fist: { id: 'fist', name: 'Fäuste', icon: '👊', melee: true, dmg: 14, rate: 2.2, range: 1.9, mag: 0, price: 0, model: null },
  bat: { id: 'bat', name: 'Baseballschläger', icon: '🏏', melee: true, dmg: 34, rate: 1.4, range: 2.3, mag: 0, price: 250, model: 'bat' },
  pistol: { id: 'pistol', name: 'Pistole', icon: '🔫', dmg: 26, rate: 3.6, mag: 12, spread: 0.012, range: 90, auto: false, price: 600, ammoPrice: 50, ammoPack: 24, model: 'pistol', sound: 'pistol', reload: 1.2 },
  smg: { id: 'smg', name: 'Maschinenpistole', icon: '🔫', dmg: 15, rate: 12, mag: 30, spread: 0.032, range: 80, auto: true, price: 2200, ammoPrice: 120, ammoPack: 60, model: 'smg', sound: 'smg', reload: 1.5 },
  shotgun: { id: 'shotgun', name: 'Schrotflinte', icon: '🔫', dmg: 11, pellets: 9, rate: 1.1, mag: 6, spread: 0.075, range: 40, auto: false, price: 3500, ammoPrice: 140, ammoPack: 12, model: 'shotgun', sound: 'shotgun', reload: 2.0 },
  rifle: { id: 'rifle', name: 'Sturmgewehr', icon: '🔫', dmg: 30, rate: 8.5, mag: 30, spread: 0.016, range: 150, auto: true, price: 6500, ammoPrice: 220, ammoPack: 60, model: 'rifle', sound: 'rifle', reload: 1.8 },
  knife: { id: 'knife', name: 'Messer', icon: '🔪', melee: true, dmg: 24, rate: 3.2, range: 1.8, mag: 0, price: 150, model: 'knife' },
  machete: { id: 'machete', name: 'Machete', icon: '🗡️', melee: true, dmg: 48, rate: 1.7, range: 2.3, mag: 0, price: 500, model: 'machete' },
  revolver: { id: 'revolver', name: 'Revolver', icon: '🔫', dmg: 58, rate: 1.9, mag: 6, spread: 0.01, range: 110, auto: false, price: 1800, ammoPrice: 90, ammoPack: 18, model: 'revolver', sound: 'heavy', reload: 2.2 },
  deagle: { id: 'deagle', name: 'Desert Eagle', icon: '🔫', dmg: 75, rate: 2.2, mag: 7, spread: 0.012, range: 120, auto: false, price: 3000, ammoPrice: 120, ammoPack: 21, model: 'deagle', sound: 'heavy', reload: 1.8 },
  uzi: { id: 'uzi', name: 'Mikro-Uzi', icon: '🔫', dmg: 11, rate: 17, mag: 25, spread: 0.048, range: 60, auto: true, price: 1600, ammoPrice: 100, ammoPack: 50, model: 'uzi', sound: 'smg', reload: 1.3 },
  autoshotgun: { id: 'autoshotgun', name: 'Kampfschrotflinte', icon: '🔫', dmg: 10, pellets: 8, rate: 3, mag: 8, spread: 0.07, range: 40, auto: true, price: 6500, ammoPrice: 200, ammoPack: 16, model: 'autoshotgun', sound: 'shotgun', reload: 2.4 },
  ak47: { id: 'ak47', name: 'AK-47', icon: '🔫', dmg: 37, rate: 7, mag: 30, spread: 0.022, range: 140, auto: true, price: 7500, ammoPrice: 240, ammoPack: 60, model: 'ak47', sound: 'rifle', reload: 2.0 },
  sniper: { id: 'sniper', name: 'Scharfschützengewehr', icon: '🎯', dmg: 150, rate: 0.9, mag: 5, spread: 0.002, range: 420, auto: false, price: 12000, ammoPrice: 300, ammoPack: 10, model: 'sniper', sound: 'sniper', reload: 2.6, zoom: 50 },
  minigun: { id: 'minigun', name: 'Minigun', icon: '⚙️', dmg: 14, rate: 28, mag: 150, spread: 0.05, range: 90, auto: true, price: 25000, ammoPrice: 600, ammoPack: 300, model: 'minigun', sound: 'smg', reload: 4 },
  rpg: { id: 'rpg', name: 'Raketenwerfer', icon: '🚀', dmg: 320, blast: 11, explosive: true, rate: 0.6, mag: 1, spread: 0.004, range: 220, auto: false, price: 15000, ammoPrice: 900, ammoPack: 3, model: 'rpg', sound: 'rpg', reload: 2.5 },
  grenade: { id: 'grenade', name: 'Handgranate', icon: '💣', throw: true, dmg: 200, rate: 0.8, mag: 0, price: 400, ammoPrice: 400, ammoPack: 3, model: 'grenade', range: 40 },
};
export const WEAPON_ORDER = ['fist', 'bat', 'knife', 'machete', 'pistol', 'revolver', 'deagle', 'smg', 'uzi', 'shotgun', 'autoshotgun', 'rifle', 'ak47', 'sniper', 'minigun', 'rpg', 'grenade'];
export const ITEMS = {
  medkit: { id: 'medkit', name: 'Verbandskasten', icon: '🩹', price: 150, desc: 'Stellt 50 Lebenspunkte wieder her.' },
  armor: { id: 'armor', name: 'Schutzweste', icon: '🛡️', price: 500, desc: 'Gibt 100 Rüstung.' },
  burger: { id: 'burger', name: 'Burger', icon: '🍔', price: 12, desc: 'Stellt 20 Lebenspunkte wieder her.' },
  energy: { id: 'energy', name: 'Energy Drink', icon: '🥤', price: 8, desc: 'Ausdauer für 60 Sekunden unbegrenzt.' },
  phone: { id: 'phone', name: 'Smartphone', icon: '📱', price: 0, desc: 'Kontakte, Taxi, Cheats (P).' },
  lockpick: { id: 'lockpick', name: 'Dietrich', icon: '🗝️', price: 60, desc: 'Schnelleres Autoknacken.' },
};
