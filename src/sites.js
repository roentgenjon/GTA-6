// Feste Orte: Geschäfte, Immobilien, Einrichtungen, Missionsorte
// i,j = Blockkoordinaten, side = Frontseite (S,N,E,W)
export const SITES = [
  // Downtown
  { id: 'bank', type: 'bank', name: 'Vice Savings & Trust', i: 0, j: 0, side: 'S', tex: 'office', color: 0xe4dccb, sign: '#5ad1ff', h: 24, w: 52, d: 42 },
  { id: 'clothes1', type: 'clothes', name: 'Threadz Fashion', i: 1, j: 0, side: 'S', tex: 'resid', color: 0xf2c6d8, sign: '#ff5fd0', h: 10, w: 44, d: 36 },
  { id: 'barber1', type: 'barber', name: 'Fresh Cuts', i: -2, j: 0, side: 'S', tex: 'resid', color: 0x9ad9d0, sign: '#4dffd2', h: 9, w: 36, d: 30 },
  { id: 'burger1', type: 'burger', name: 'Burger Barn', i: 1, j: 1, side: 'S', tex: 'resid', color: 0xf6c35a, sign: '#ffb000', h: 8, w: 36, d: 30 },
  { id: 'loft', type: 'property', name: 'Downtown Loft', i: -1, j: 1, side: 'S', tex: 'office', color: 0xc9c2b2, sign: '#9fb7ff', h: 28, w: 44, d: 38, price: 90000, garage: 2, rent: 0 },
  { id: 'penthouse', type: 'property', name: 'Skyline Penthouse', i: 0, j: -2, side: 'S', tex: 'curtain', color: 0xb9d8f0, sign: '#ffd35a', h: 80, w: 46, d: 40, price: 2500000, garage: 8, rent: 0 },
  // Midtown
  { id: 'police1', type: 'police', name: 'Vice City PD', i: -3, j: 3, side: 'S', tex: 'office', color: 0xa9b8c8, sign: '#3d7bff', h: 16, w: 56, d: 40 },
  { id: 'dealer', type: 'dealer', name: 'Premium Motors', i: 4, j: -1, side: 'S', tex: 'curtain', color: 0xd8e4ee, sign: '#ff2d55', h: 8, w: 56, d: 36 },
  { id: 'hospital', type: 'hospital', name: 'Mercy General Hospital', i: -4, j: -3, side: 'S', tex: 'office', color: 0xf2f2f2, sign: '#ff3b30', h: 26, w: 58, d: 44 },
  { id: 'fire1', type: 'fire', name: 'Feuerwache 7', i: 3, j: 3, side: 'S', tex: 'office', color: 0xc0392b, sign: '#ffcc00', h: 10, w: 48, d: 34 },
  { id: 'gun1', type: 'gun', name: 'Bullseye Arms', i: -4, j: 1, side: 'S', tex: 'office', color: 0x5d6b5a, sign: '#ff8a00', h: 8, w: 36, d: 30 },
  { id: 'tuning', type: 'tuning', name: 'Turbo Garage', i: -3, j: 5, side: 'S', tex: 'office', color: 0x3b3f4a, sign: '#00e0ff', h: 8, w: 48, d: 34 },
  { id: 'gas1', type: 'gas', name: 'Gas & Go', i: 2, j: 4, side: 'S', tex: 'resid', color: 0xd9d9d9, sign: '#33ff66', h: 5, w: 20, d: 14 },
  { id: 'dante', type: 'story', name: "Dante's Autoteile", i: -5, j: -2, side: 'S', tex: 'office', color: 0x8a5a3c, sign: '#ffb347', h: 8, w: 44, d: 34 },
  { id: 'club', type: 'business', name: 'Club Neon', i: 4, j: 1, side: 'S', tex: 'office', color: 0x2a1450, sign: '#ff2fd6', h: 12, w: 46, d: 38, price: 350000, income: 2400 },
  { id: 'cab', type: 'business', name: 'Yellow Cab Co.', i: 1, j: 6, side: 'S', tex: 'office', color: 0xe8c619, sign: '#ffe14d', h: 9, w: 44, d: 34, price: 150000, income: 1100 },
  // Beach
  { id: 'casino', type: 'casino', name: 'Golden Flamingo Casino', i: 8, j: -1, side: 'W', tex: 'resid', color: 0xff8fb7, sign: '#ff2fa8', h: 34, w: 56, d: 56 },
  { id: 'apt_beach', type: 'property', name: 'Ocean View Apartment', i: 7, j: -3, side: 'S', tex: 'resid', color: 0x8fe0e8, sign: '#4dffd2', h: 18, w: 40, d: 34, price: 0, garage: 2, rent: 0, start: true },
  { id: 'beachhouse', type: 'property', name: 'Beach House', i: 10, j: 2, side: 'W', tex: 'resid', color: 0xf8f3e6, sign: '#ffd35a', h: 7, w: 34, d: 30, price: 300000, garage: 3, rent: 0 },
  { id: 'marina_bar', type: 'business', name: 'Sunset Marina Bar', i: 8, j: 4, side: 'W', tex: 'resid', color: 0xf47c5d, sign: '#ffcf33', h: 8, w: 40, d: 32, price: 200000, income: 1500 },
  { id: 'hoops', type: 'hoops', name: 'Strandkorb Court', i: 9, j: 0, side: 'W', tex: 'resid', color: 0xffffff, sign: '#ff9a00', h: 0, w: 30, d: 50 },
  { id: 'police2', type: 'police', name: 'Marina Precinct', i: 8, j: 6, side: 'W', tex: 'office', color: 0xa9b8c8, sign: '#3d7bff', h: 12, w: 44, d: 34 },
  { id: 'burger2', type: 'burger', name: 'Burger Barn', i: 8, j: 7, side: 'W', tex: 'resid', color: 0xf6c35a, sign: '#ffb000', h: 8, w: 34, d: 28 },
  // Villen
  { id: 'villa1', type: 'property', name: 'Palm Estates Villa', i: 3, j: -5, side: 'S', tex: 'curtain', color: 0xfaf8f0, sign: '#ffd35a', h: 9, w: 46, d: 34, price: 450000, garage: 6, rent: 0 },
  { id: 'mansion', type: 'property', name: 'Starlight Mansion', i: 6, j: -6, side: 'S', tex: 'curtain', color: 0xf3efe6, sign: '#ffd35a', h: 13, w: 56, d: 44, price: 1200000, garage: 10, rent: 0 },
  { id: 'gas2', type: 'gas', name: 'Gas & Go', i: 5, j: -3, side: 'S', tex: 'resid', color: 0xd9d9d9, sign: '#33ff66', h: 5, w: 20, d: 14 },
  // Westen / Süden
  { id: 'house1', type: 'property', name: 'Sunset Heights Haus', i: -8, j: 2, side: 'S', tex: 'resid', color: 0xf0d8b8, sign: '#9fb7ff', h: 7, w: 26, d: 24, price: 60000, garage: 2, rent: 0 },
  { id: 'carwash', type: 'business', name: 'Splash Car Wash', i: -7, j: -3, side: 'S', tex: 'office', color: 0x4aa8d8, sign: '#00d0ff', h: 6, w: 40, d: 30, price: 120000, income: 800 },
  { id: 'gas3', type: 'gas', name: 'Gas & Go', i: -6, j: -1, side: 'S', tex: 'resid', color: 0xd9d9d9, sign: '#33ff66', h: 5, w: 20, d: 14 },
  { id: 'clothes2', type: 'clothes', name: 'Urban Threads', i: -8, j: -5, side: 'S', tex: 'resid', color: 0xc5b5e6, sign: '#b36bff', h: 9, w: 40, d: 32 },
  { id: 'barber2', type: 'barber', name: 'Hair by Rosa', i: 6, j: -1, side: 'S', tex: 'resid', color: 0xf2a07b, sign: '#ff7a59', h: 8, w: 34, d: 28 },
  { id: 'gun2', type: 'gun', name: 'Rust Yard Guns', i: -2, j: 8, side: 'S', tex: 'office', color: 0x6b6f5a, sign: '#ff8a00', h: 7, w: 34, d: 28 },
  { id: 'portgarage', type: 'property', name: 'Hafen-Lagerhalle', i: 6, j: 7, side: 'S', tex: 'office', color: 0x7a8794, sign: '#9fb7ff', h: 11, w: 60, d: 46, price: 150000, garage: 12, rent: 0 },
  { id: 'burger3', type: 'burger', name: 'Burger Barn', i: -6, j: 5, side: 'S', tex: 'resid', color: 0xf6c35a, sign: '#ffb000', h: 8, w: 34, d: 28 },
  { id: 'fire2', type: 'fire', name: 'Feuerwache 3', i: -9, j: -1, side: 'S', tex: 'office', color: 0xc0392b, sign: '#ffcc00', h: 10, w: 48, d: 34 },
  { id: 'mission_g', type: 'story', name: 'Vance Records', i: 2, j: -4, side: 'S', tex: 'office', color: 0x6a4c93, sign: '#c77dff', h: 14, w: 44, d: 36 },
];
export const SITE_ICON = { bank: '🏦', clothes: '👕', barber: '✂️', gun: '🔫', dealer: '🚘', tuning: '🔧', burger: '🍔', casino: '🎰', hospital: '➕', police: '🚓', fire: '🚒', gas: '⛽', property: '🏠', business: '💼', hoops: '🏀', story: '★', airport: '✈', port: '⚓', race: '🏁', atm: '$' };
export const TYPE_LABEL = { bank: 'Bank', clothes: 'Kleidung', barber: 'Friseur', gun: 'Waffenladen', dealer: 'Autohaus', tuning: 'Tuning', burger: 'Fast Food', casino: 'Casino', hospital: 'Krankenhaus', police: 'Polizei', fire: 'Feuerwehr', gas: 'Tankstelle', property: 'Immobilie', business: 'Geschäft', hoops: 'Basketball', story: 'Kontakt' };
