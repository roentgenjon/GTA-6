// Waffen-Definitionen
export const WEAPONS = {
  fist: { id: 'fist', name: 'Fäuste', icon: '👊', melee: true, dmg: 14, rate: 2.2, range: 1.9, mag: 0, price: 0, model: null },
  bat: { id: 'bat', name: 'Baseballschläger', icon: '🏏', melee: true, dmg: 34, rate: 1.4, range: 2.3, mag: 0, price: 250, model: 'bat' },
  pistol: { id: 'pistol', name: 'Pistole', icon: '🔫', dmg: 26, rate: 3.6, mag: 12, spread: 0.012, range: 90, auto: false, price: 600, ammoPrice: 50, ammoPack: 24, model: 'pistol', sound: 'pistol', reload: 1.2 },
  smg: { id: 'smg', name: 'Maschinenpistole', icon: '🔫', dmg: 15, rate: 12, mag: 30, spread: 0.032, range: 80, auto: true, price: 2200, ammoPrice: 120, ammoPack: 60, model: 'smg', sound: 'smg', reload: 1.5 },
  shotgun: { id: 'shotgun', name: 'Schrotflinte', icon: '🔫', dmg: 11, pellets: 9, rate: 1.1, mag: 6, spread: 0.075, range: 40, auto: false, price: 3500, ammoPrice: 140, ammoPack: 12, model: 'shotgun', sound: 'shotgun', reload: 2.0 },
  rifle: { id: 'rifle', name: 'Sturmgewehr', icon: '🔫', dmg: 30, rate: 8.5, mag: 30, spread: 0.016, range: 150, auto: true, price: 6500, ammoPrice: 220, ammoPack: 60, model: 'rifle', sound: 'rifle', reload: 1.8 },
  grenade: { id: 'grenade', name: 'Handgranate', icon: '💣', throw: true, dmg: 200, rate: 0.8, mag: 0, price: 400, ammoPrice: 400, ammoPack: 3, model: 'grenade', range: 40 },
};
export const WEAPON_ORDER = ['fist', 'bat', 'pistol', 'smg', 'shotgun', 'rifle', 'grenade'];
export const ITEMS = {
  medkit: { id: 'medkit', name: 'Verbandskasten', icon: '🩹', price: 150, desc: 'Stellt 50 Lebenspunkte wieder her.' },
  armor: { id: 'armor', name: 'Schutzweste', icon: '🛡️', price: 500, desc: 'Gibt 100 Rüstung.' },
  burger: { id: 'burger', name: 'Burger', icon: '🍔', price: 12, desc: 'Stellt 20 Lebenspunkte wieder her.' },
  energy: { id: 'energy', name: 'Energy Drink', icon: '🥤', price: 8, desc: 'Ausdauer für 60 Sekunden unbegrenzt.' },
  phone: { id: 'phone', name: 'Smartphone', icon: '📱', price: 0, desc: 'Kontakte, Taxi, Cheats (P).' },
  lockpick: { id: 'lockpick', name: 'Dietrich', icon: '🗝️', price: 60, desc: 'Schnelleres Autoknacken.' },
};
