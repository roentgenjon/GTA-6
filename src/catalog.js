// Fahrzeugkatalog: 120+ Fahrzeuge (fiktive Marken)
import { hashStr, mulberry32, lerp } from './util.js?v=20261126142831-8986ff1';

// Klassen-Grundwerte. top = km/h, acc = m/s², grip = Quergriff, mass kg, cl = Bodenfreiheit
export const CLS = {
  compact: { label: 'Kompakt', kind: 'car', L: 3.8, W: 1.72, H: 1.5, cl: 0.2, wr: 0.31, top: 160, acc: 6.5, grip: 7.0, mass: 1100, steer: 0.62, price: [7000, 16000], prof: [0.04, 0.2, 0.62, 0.74, 0.8, 0.72, 0.55, 1.5] },
  sedan: { label: 'Limousine', kind: 'car', L: 4.7, W: 1.82, H: 1.45, cl: 0.17, wr: 0.33, top: 195, acc: 7.5, grip: 7.5, mass: 1500, steer: 0.6, price: [14000, 60000], prof: [0.15, 0.3, 0.6, 0.7, 0.98, 0.9, 0.7, 1.44] },
  sport: { label: 'Sportwagen', kind: 'car', L: 4.45, W: 1.88, H: 1.25, cl: 0.12, wr: 0.34, top: 255, acc: 11, grip: 9.5, mass: 1350, steer: 0.56, price: [60000, 190000], prof: [0.1, 0.4, 0.6, 0.7, 0.8, 0.7, 0.5, 1.25] },
  super: { label: 'Supersportwagen', kind: 'car', L: 4.6, W: 2.0, H: 1.1, cl: 0.1, wr: 0.35, top: 330, acc: 14.5, grip: 11, mass: 1400, steer: 0.52, price: [250000, 1800000], prof: [0.08, 0.46, 0.62, 0.74, 0.72, 0.6, 0.4, 1.1] },
  muscle: { label: 'Muscle Car', kind: 'car', L: 4.95, W: 1.92, H: 1.34, cl: 0.16, wr: 0.35, top: 245, acc: 12, grip: 7.8, mass: 1750, steer: 0.58, price: [35000, 120000], prof: [0.12, 0.34, 0.54, 0.66, 0.9, 0.92, 0.74, 1.34] },
  suv: { label: 'SUV', kind: 'car', L: 4.85, W: 1.97, H: 1.82, cl: 0.3, wr: 0.4, top: 205, acc: 8.2, grip: 7.2, mass: 2100, steer: 0.58, price: [30000, 140000], prof: [0.04, 0.16, 0.62, 0.74, 1.35, 1.1, 0.88, 1.82] },
  pickup: { label: 'Pickup', kind: 'car', L: 5.4, W: 2.02, H: 1.85, cl: 0.3, wr: 0.42, top: 190, acc: 8.0, grip: 6.8, mass: 2300, steer: 0.55, price: [25000, 90000], prof: [0.45, 0.47, 0.7, 0.8, 1.05, 1.15, 0.9, 1.85], bed: true },
  van: { label: 'Van', kind: 'car', L: 5.3, W: 2.0, H: 2.25, cl: 0.25, wr: 0.36, top: 155, acc: 5.8, grip: 6.4, mass: 2400, steer: 0.55, price: [18000, 55000], prof: [0.02, 0.06, 0.8, 0.9, 1.7, 1.3, 1.05, 2.25] },
  truck: { label: 'LKW', kind: 'car', L: 8.2, W: 2.5, H: 3.4, cl: 0.45, wr: 0.5, top: 125, acc: 3.8, grip: 5.6, mass: 7500, steer: 0.42, price: [60000, 180000], prof: [0.6, 0.6, 0.97, 0.99, 1.6, 1.7, 1.2, 3.0], box: true },
  bus: { label: 'Bus', kind: 'car', L: 11.6, W: 2.55, H: 3.2, cl: 0.4, wr: 0.5, top: 105, acc: 3.0, grip: 5.4, mass: 11000, steer: 0.4, price: [90000, 260000], prof: [0.01, 0.02, 0.98, 0.99, 2.7, 2.7, 1.4, 3.2], bus: true },
  emerg: { label: 'Einsatz', kind: 'car', L: 4.9, W: 1.9, H: 1.5, cl: 0.17, wr: 0.34, top: 215, acc: 9.5, grip: 8.2, mass: 1700, steer: 0.6, price: [0, 0], prof: [0.15, 0.3, 0.6, 0.7, 0.98, 0.9, 0.7, 1.46] },
  bike: { label: 'Motorrad', kind: 'bike', L: 2.1, W: 0.75, H: 1.3, cl: 0.2, wr: 0.32, top: 215, acc: 11, grip: 9.0, mass: 220, steer: 0.7, price: [3000, 45000] },
  boat: { label: 'Boot', kind: 'boat', L: 6.5, W: 2.3, H: 1.6, cl: 0, wr: 0, top: 110, acc: 6, grip: 2.2, mass: 1500, steer: 0.9, price: [20000, 250000] },
  jetski: { label: 'Jetski', kind: 'boat', L: 3.0, W: 1.1, H: 1.0, cl: 0, wr: 0, top: 95, acc: 8, grip: 2.6, mass: 400, steer: 1.2, price: [7000, 18000] },
  yacht: { label: 'Yacht', kind: 'boat', L: 16, W: 4.6, H: 5.5, cl: 0, wr: 0, top: 65, acc: 2.5, grip: 1.6, mass: 12000, steer: 0.5, price: [450000, 4000000] },
  sail: { label: 'Segelboot', kind: 'boat', L: 8, W: 2.6, H: 9, cl: 0, wr: 0, top: 40, acc: 1.5, grip: 2.4, mass: 3000, steer: 0.6, price: [60000, 220000] },
  plane: { label: 'Flugzeug', kind: 'plane', L: 8.4, W: 11, H: 2.7, cl: 0, wr: 0.28, top: 280, acc: 5, grip: 4, mass: 1200, steer: 0.35, price: [140000, 2200000] },
  heli: { label: 'Helikopter', kind: 'heli', L: 9.5, W: 3.0, H: 3.4, cl: 0, wr: 0, top: 230, acc: 6, grip: 4, mass: 1800, steer: 0.4, price: [250000, 1800000] },
};

const N = (cls, name, extra = {}) => ({ cls, name, ...extra });
const raw = [
  // Kompakt
  N('compact', 'Piccolo Uno'), N('compact', 'Zippy Mini'), N('compact', 'Urbano 2'), N('compact', 'Kolibri'), N('compact', 'Lumina City'), N('compact', 'Brio Hatch'), N('compact', 'Pixie X'), N('compact', 'Tango S'),
  // Limousinen
  N('sedan', 'Avenir LX'), N('sedan', 'Capitan 450'), N('sedan', 'Regent Diplomat'), N('sedan', 'Solara GL'), N('sedan', 'Meridian Turbo'), N('sedan', 'Palisade Executive'), N('sedan', 'Boulevard S'), N('sedan', 'Dynasty V8'), N('sedan', 'Cortina 12'), N('sedan', 'Nordic Luxe'), N('sedan', 'Verano'), N('sedan', 'Aurelia Sedan'),
  // Sport
  N('sport', 'Falcon GT'), N('sport', 'Vortex RS'), N('sport', 'Mirage Coupé'), N('sport', 'Stinger Z'), N('sport', 'Rapido R'), N('sport', 'Cobalt S'), N('sport', 'Raven SL'), N('sport', 'Tempest GTS'), N('sport', 'Havoc 3.0'), N('sport', 'Zephyr Roadster', { open: true }), N('sport', 'Pulse 370'), N('sport', 'Ember Sport'), N('sport', 'Siren GT-R'), N('sport', 'Karma Turbo'), N('sport', 'Apex Racer'), N('sport', 'Nitro Drifter', { drift: true }), N('sport', 'Matador'), N('sport', 'Tracer Cabrio', { open: true }),
  // Super
  N('super', 'Aventura X'), N('super', 'Phantom One'), N('super', 'Revenant SC'), N('super', 'Chimera V12'), N('super', 'Obsidian R'), N('super', 'Halcyon Hyper'), N('super', 'Titan XR'), N('super', 'Spectre 9'), N('super', 'Valkyrie GT'), N('super', 'Nova Hypercar'), N('super', 'Saber Zero'), N('super', 'Eclipse Evo'),
  // Muscle
  N('muscle', 'Bruiser 71'), N('muscle', 'Stallion SS'), N('muscle', 'Hammer V8'), N('muscle', 'Outlaw 69'), N('muscle', 'Thunder Ram'), N('muscle', 'Brawler GT'), N('muscle', 'Rampage 500'), N('muscle', 'Blazer Charger'), N('muscle', 'Dominator X'), N('muscle', 'Gator'),
  // SUV
  N('suv', 'Terrain XL'), N('suv', 'Summit 4x4'), N('suv', 'Highlander Pro'), N('suv', 'Pathfinder R'), N('suv', 'Mesa Wagon'), N('suv', 'Ranger GX'), N('suv', 'Bison SUV'), N('suv', 'Grand Cruiser'), N('suv', 'Titan SUV'), N('suv', 'Oasis Crossover'), N('suv', 'Canyon Trail'), N('suv', 'Viceroy LX'),
  // Pickups, Vans
  N('pickup', 'Hauler 1500'), N('pickup', 'Ridge Pickup'), N('pickup', 'Ironclad HD'), N('pickup', 'Bandit Ute'), N('pickup', 'Frontier Cab'), N('pickup', 'Mule 2500'),
  N('van', 'Cargo Max'), N('van', 'Transit Plus'), N('van', 'Camper Van'), N('van', 'Delivery Dan'), N('van', 'Minibus Eco'),
  // LKW/Bus
  N('truck', 'Heavy Hauler'), N('truck', 'Box Truck 7'), N('truck', 'Tanker Pro', { tank: true }), N('truck', 'Garbage Gus'), N('truck', 'Flatbed 90', { flat: true }),
  N('bus', 'City Bus'), N('bus', 'Coach Star'), N('bus', 'Double Decker', { dd: true }),
  // Einsatz
  N('emerg', 'Police Cruiser', { id: 'police', paint: [0x111418, 0xf4f4f4], special: 'police' }), N('emerg', 'Police Interceptor', { id: 'police2', paint: [0x151a22, 0xe8e8e8], special: 'police', top: 245 }),
  N('emerg', 'Taxi Vice', { id: 'taxi', paint: [0xf2c200, 0xf2c200], special: 'taxi' }), N('van', 'Ambulance', { id: 'ambulance', paint: [0xf4f4f4, 0xe02020], special: 'ambulance' }), N('truck', 'Fire Engine', { id: 'firetruck', paint: [0xd0171b, 0xd0171b], special: 'fire', flat: false }),
  N('suv', 'SWAT Enforcer', { id: 'swat', paint: [0x14171c, 0x14171c], special: 'swat', top: 190 }), N('truck', 'Army Barracks', { id: 'army', paint: [0x4b5a3a, 0x4b5a3a], special: 'army', top: 120 }),
  // Motorräder
  N('bike', 'Sprint 600'), N('bike', 'Cruiser Chopper', { chopper: true }), N('bike', 'Dirt Dash', { dirt: true }), N('bike', 'Pizzetta Scooter', { scooter: true, top: 95 }), N('bike', 'Street Naked'), N('bike', 'Hyper 1000', { top: 260 }), N('bike', 'Bobber 88', { chopper: true }), N('bike', 'Moped Mini', { scooter: true, top: 60 }), N('bike', 'Café Classic'), N('bike', 'Police Bike', { id: 'policebike', special: 'police', paint: [0xf0f0f0, 0x15191f] }),
  // Boote
  N('boat', 'Aqua Runner', { id: 'sp_boat1' }), N('boat', 'Marlin 28', { id: 'sp_boat2' }), N('boat', 'Corsair 32', { id: 'sp_boat3', top: 130 }), N('boat', 'Fisher King', { id: 'fish1', top: 70 }), N('jetski', 'Wave Rider', { id: 'jet1' }), N('jetski', 'Splash GP', { id: 'jet2' }), N('yacht', 'Prestige Yacht', { id: 'yacht1' }), N('yacht', 'Atlantis Super Yacht', { id: 'yacht2', L: 24 }), N('sail', 'Sail Breeze', { id: 'sail1' }), N('boat', 'Dinghy Duo', { id: 'dinghy', L: 3.6, top: 40, price: [2000, 4000] }),
  // Flugzeuge
  N('plane', 'Sparrow 172', { id: 'cessna' }), N('plane', 'Barnstormer Biplane', { id: 'sparrow', biplane: true }), N('plane', 'Twin Prop 310', { id: 'prop2', twin: true }), N('plane', 'Jet Light 200', { id: 'jet_l', jet: true, top: 420 }), N('plane', 'Stunt Racer', { id: 'stunt', top: 340, stunt: true }), N('plane', 'Cargo Hauler', { id: 'cargo', twin: true, W: 16, L: 13, top: 260 }),
  // Helis
  N('heli', 'Skylark', { id: 'heli_s' }), N('heli', 'Hornet', { id: 'heli_m', top: 260 }), N('heli', 'News Eye 7', { id: 'heli_news', special: 'news' }), N('heli', 'Police Eagle', { id: 'heli_police', special: 'police', police: true }),
];

const PAL_CAR = [0xd62828, 0x1d3557, 0xf1faee, 0x111111, 0xc0c0c0, 0x2a9d8f, 0xe9c46a, 0xf77f00, 0x6a4c93, 0x264653, 0x8d99ae, 0xff4d8d, 0x3a86ff, 0x2b9348, 0x5a3825, 0xffffff, 0xb5179e, 0x00b4d8];
export const CATALOG = [];
const counts = {};
raw.forEach((r, n) => {
  const c = CLS[r.cls];
  counts[r.cls] = (counts[r.cls] || 0) + 1;
  const id = r.id || r.cls + '_' + counts[r.cls];
  const rng = mulberry32(hashStr(id));
  const clsCount = raw.filter((x) => x.cls === r.cls).length;
  const tier = clsCount > 1 ? (counts[r.cls] - 1) / (clsCount - 1) : 0.5;
  const q = 0.5 * tier + 0.5 * rng();
  const spec = {
    id, name: r.name, cls: r.cls, kind: c.kind, label: c.label,
    L: r.L || c.L * (0.97 + rng() * 0.07), W: r.W || c.W * (0.98 + rng() * 0.04), H: c.H * (0.97 + rng() * 0.05), cl: c.cl, wr: c.wr,
    top: r.top || Math.round(c.top * (0.88 + 0.2 * q)), acc: c.acc * (0.88 + 0.26 * q), grip: c.grip * (0.9 + 0.2 * rng()) * (r.drift ? 0.82 : 1), mass: c.mass * (0.92 + rng() * 0.16), steer: c.steer,
    price: r.price ? Math.round(lerp(r.price[0], r.price[1], tier) / 100) * 100 : Math.round(lerp(c.price[0], c.price[1], q) / 500) * 500,
    colors: r.paint || [PAL_CAR[Math.floor(rng() * PAL_CAR.length)], rng() < 0.2 ? 0x111111 : null],
    prof: c.prof, flags: r, special: r.special || null, seed: hashStr(id),
  };
  CATALOG.push(spec);
});
export const BY_ID = Object.fromEntries(CATALOG.map((c) => [c.id, c]));
export const BUYABLE = CATALOG.filter((c) => c.price > 0 && !c.special);
export const CIVIL_CARS = CATALOG.filter((c) => ['compact', 'sedan', 'sport', 'muscle', 'suv', 'pickup', 'van'].includes(c.cls) && !c.special);
export const CIVIL_COMMON = CATALOG.filter((c) => ['compact', 'sedan', 'suv', 'pickup', 'van', 'sport'].includes(c.cls) && !c.special);
