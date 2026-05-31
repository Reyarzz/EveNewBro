// Curated beginner-friendly fit library.
//
// Flat list of fits with rich metadata so the UI can filter and group by
// category, faction, hull class, difficulty, and ISK tier. Each `eft` string is
// standard EFT (EVE Fitting Tool) format that imports straight into the in-game
// Fitting window.
//
// These favor cheap meta/named modules and low skill requirements. Verify in
// the in-game fitting simulator before relying on them.

export const CATEGORIES = [
  'Exploration',
  'Mining',
  'Missions',
  'Ratting',
  'Hauling',
  'PvP'
];

export const FACTIONS = ['Amarr', 'Caldari', 'Gallente', 'Minmatar', 'ORE'];

export const HULL_CLASSES = ['Frigate', 'Destroyer', 'Cruiser', 'Industrial', 'Mining Barge'];

// Helper to keep entries terse.
function fit(o) {
  return o;
}

export const fits = [
  // ---------------- EXPLORATION ----------------
  fit({
    id: 'heron-explorer',
    name: 'Heron — Newbie Explorer',
    ship: 'Heron',
    faction: 'Caldari',
    hull: 'Frigate',
    category: 'Exploration',
    difficulty: 'Beginner',
    isk: 'Cheap',
    tags: ['scanning', 'data', 'relic', 'cloak'],
    role: 'Scan and run data/relic sites in a cheap, expendable frigate.',
    notes:
      'Cheap and capable. If you get scrammed you are likely dead — stay cloaked, warp off when others appear, and never carry more loot than you can afford to lose.',
    eft: `[Heron, Newbie Explorer]
Nanofiber Internal Structure I
Nanofiber Internal Structure I

5MN Y-T8 Compact Microwarpdrive
Data Analyzer I
Relic Analyzer I
Scan Rangefinding Array I

Core Probe Launcher I
Prototype Cloaking Device I

Small Gravity Capacitor Upgrade I
Small Gravity Capacitor Upgrade I
Small Gravity Capacitor Upgrade I

Core Scanner Probe I x8`
  }),
  fit({
    id: 'magnate-explorer',
    name: 'Magnate — Amarr Explorer',
    ship: 'Magnate',
    faction: 'Amarr',
    hull: 'Frigate',
    category: 'Exploration',
    difficulty: 'Beginner',
    isk: 'Cheap',
    tags: ['scanning', 'data', 'relic', 'cloak'],
    role: 'Amarr exploration frigate for data/relic sites.',
    notes:
      'Functionally similar to the Heron. Pick the one that matches your race so the skills carry over.',
    eft: `[Magnate, Amarr Explorer]
Nanofiber Internal Structure I
Nanofiber Internal Structure I
Nanofiber Internal Structure I

5MN Y-T8 Compact Microwarpdrive
Data Analyzer I
Relic Analyzer I

Core Probe Launcher I
Prototype Cloaking Device I
Scan Rangefinding Array I

Small Gravity Capacitor Upgrade I
Small Gravity Capacitor Upgrade I

Core Scanner Probe I x8`
  }),
  fit({
    id: 'imicus-explorer',
    name: 'Imicus — Gallente Explorer',
    ship: 'Imicus',
    faction: 'Gallente',
    hull: 'Frigate',
    category: 'Exploration',
    difficulty: 'Beginner',
    isk: 'Cheap',
    tags: ['scanning', 'data', 'relic', 'cloak'],
    role: 'Gallente exploration frigate for data/relic sites.',
    notes: 'Same playstyle as the Heron — scan, cloak, hack, and stay safe.',
    eft: `[Imicus, Gallente Explorer]
Nanofiber Internal Structure I
Nanofiber Internal Structure I

5MN Y-T8 Compact Microwarpdrive
Data Analyzer I
Relic Analyzer I
Scan Rangefinding Array I

Core Probe Launcher I
Prototype Cloaking Device I

Small Gravity Capacitor Upgrade I
Small Gravity Capacitor Upgrade I
Small Gravity Capacitor Upgrade I

Core Scanner Probe I x8`
  }),
  fit({
    id: 'probe-explorer',
    name: 'Probe — Minmatar Explorer',
    ship: 'Probe',
    faction: 'Minmatar',
    hull: 'Frigate',
    category: 'Exploration',
    difficulty: 'Beginner',
    isk: 'Cheap',
    tags: ['scanning', 'data', 'relic', 'cloak', 'fast'],
    role: 'Fast Minmatar exploration frigate.',
    notes: 'Naturally quick and agile — great for slipping between sites.',
    eft: `[Probe, Minmatar Explorer]
Nanofiber Internal Structure I
Nanofiber Internal Structure I

5MN Y-T8 Compact Microwarpdrive
Data Analyzer I
Relic Analyzer I
Scan Rangefinding Array I

Core Probe Launcher I
Prototype Cloaking Device I

Small Gravity Capacitor Upgrade I
Small Gravity Capacitor Upgrade I
Small Gravity Capacitor Upgrade I

Core Scanner Probe I x8`
  }),

  // ---------------- MINING ----------------
  fit({
    id: 'venture-miner',
    name: 'Venture — Starter Miner',
    ship: 'Venture',
    faction: 'ORE',
    hull: 'Frigate',
    category: 'Mining',
    difficulty: 'Beginner',
    isk: 'Cheap',
    tags: ['ore', 'high-sec', 'fast'],
    role: 'Mine ore in high-sec; fast and hard to tackle.',
    notes:
      'The best newbie miner — built-in warp-strength bonus and ore bay. Dock up the instant a hostile appears; do not be greedy.',
    eft: `[Venture, Starter Miner]
Damage Control I

5MN Y-T8 Compact Microwarpdrive
Medium Shield Extender I
Survey Scanner I

Miner I
Miner I

Small Core Defense Field Extender I
Small Core Defense Field Extender I`
  }),
  fit({
    id: 'venture-gas',
    name: 'Venture — Gas Huffer',
    ship: 'Venture',
    faction: 'ORE',
    hull: 'Frigate',
    category: 'Mining',
    difficulty: 'Beginner',
    isk: 'Cheap',
    tags: ['gas', 'huffing', 'fast'],
    role: 'Harvest gas clouds (good ISK in wormholes/nullsec, with risk).',
    notes:
      'Gas huffing pays well but is dangerous outside high-sec. Fit for align speed and run at the first sign of trouble.',
    eft: `[Venture, Gas Huffer]
Damage Control I

5MN Y-T8 Compact Microwarpdrive
Medium Shield Extender I
Inertial Stabilizers I

Gas Cloud Harvester I
Gas Cloud Harvester I

Small Core Defense Field Extender I
Small Core Defense Field Extender I`
  }),
  fit({
    id: 'procurer-miner',
    name: 'Procurer — Tanky Barge',
    ship: 'Procurer',
    faction: 'ORE',
    hull: 'Mining Barge',
    category: 'Mining',
    difficulty: 'Intermediate',
    isk: 'Moderate',
    tags: ['ore', 'tanky', 'barge'],
    role: 'High-tank mining barge that survives most ganks.',
    notes:
      'The safest barge thanks to a big shield buffer and drones. Requires Mining Barge skill. Great step up from the Venture.',
    eft: `[Procurer, Tanky Barge]
Damage Control I

Large Shield Extender I
Large Shield Extender I
Adaptive Invulnerability Field I
Survey Scanner I

Modulated Strip Miner I

Medium Core Defense Field Extender I
Medium Core Defense Field Extender I
Medium Core Defense Field Extender I

Hobgoblin I x2`
  }),

  // ---------------- MISSIONS (PvE agents) ----------------
  fit({
    id: 'algos-missions',
    name: 'Algos — L1 Mission Drones',
    ship: 'Algos',
    faction: 'Gallente',
    hull: 'Destroyer',
    category: 'Missions',
    difficulty: 'Beginner',
    isk: 'Cheap',
    tags: ['drones', 'level-1'],
    role: 'Drone destroyer that chews through Level 1 missions.',
    notes:
      'Lots of drone damage for the price. Keep spare drones in the bay — rats will shoot them.',
    eft: `[Algos, L1 Missions]
Damage Control I
Drone Damage Amplifier I
Drone Damage Amplifier I

1MN Afterburner I
Cap Recharger I
Cap Recharger I

125mm Railgun I
125mm Railgun I
Drone Link Augmentor I

Small Trimark Armor Pump I
Small Trimark Armor Pump I

Hobgoblin I x5
Hammerhead I x3`
  }),
  fit({
    id: 'coercer-missions',
    name: 'Coercer — L1 Laser Boat',
    ship: 'Coercer',
    faction: 'Amarr',
    hull: 'Destroyer',
    category: 'Missions',
    difficulty: 'Beginner',
    isk: 'Cheap',
    tags: ['lasers', 'level-1'],
    role: 'High-DPS Amarr destroyer for Level 1 missions.',
    notes:
      'Lasers never run out of ammo — just swap crystals for range. Watch your capacitor with 8 guns.',
    eft: `[Coercer, L1 Missions]
Damage Control I
Heat Sink I
Heat Sink I

1MN Afterburner I
Cap Recharger I

Small Focused Pulse Laser I
Small Focused Pulse Laser I
Small Focused Pulse Laser I
Small Focused Pulse Laser I
Small Focused Pulse Laser I
Small Focused Pulse Laser I
Small Focused Pulse Laser I
Small Focused Pulse Laser I

Small Trimark Armor Pump I
Small Trimark Armor Pump I`
  }),
  fit({
    id: 'vexor-missions',
    name: 'Vexor — L2/L3 Drone Boat',
    ship: 'Vexor',
    faction: 'Gallente',
    hull: 'Cruiser',
    category: 'Missions',
    difficulty: 'Intermediate',
    isk: 'Moderate',
    tags: ['drones', 'level-2', 'level-3', 'workhorse'],
    role: 'Forgiving cruiser that carries you into Level 2–3 missions.',
    notes:
      'Drones do most of the damage so you focus on staying alive. One of the best newbie ISK-makers in the game.',
    eft: `[Vexor, L2-L3 Missions]
Damage Control I
Drone Damage Amplifier I
Drone Damage Amplifier I
200mm Steel Plates I

10MN Afterburner I
Cap Recharger I
Cap Recharger I

Drone Link Augmentor I
250mm Railgun I
250mm Railgun I

Medium Trimark Armor Pump I
Medium Trimark Armor Pump I
Medium Trimark Armor Pump I

Hammerhead I x5
Hobgoblin I x5`
  }),
  fit({
    id: 'caracal-missions',
    name: 'Caracal — L2/L3 Missiles',
    ship: 'Caracal',
    faction: 'Caldari',
    hull: 'Cruiser',
    category: 'Missions',
    difficulty: 'Intermediate',
    isk: 'Moderate',
    tags: ['missiles', 'level-2', 'level-3', 'range'],
    role: 'Missile cruiser that applies damage at range and picks its damage type.',
    notes:
      'Missiles let you choose damage type to match the rats. Kite at range and you barely get touched.',
    eft: `[Caracal, L2-L3 Missions]
Damage Control I
Ballistic Control System I
Ballistic Control System I

10MN Afterburner I
Large Shield Extender I
Adaptive Invulnerability Field I
Cap Recharger I

Rapid Light Missile Launcher I
Rapid Light Missile Launcher I
Rapid Light Missile Launcher I
Rapid Light Missile Launcher I
Rapid Light Missile Launcher I

Medium Core Defense Field Extender I
Medium Core Defense Field Extender I
Medium Core Defense Field Extender I`
  }),

  // ---------------- RATTING (anomalies / belt rats) ----------------
  fit({
    id: 'caracal-ratting',
    name: 'Caracal — Null Anomaly Ratter',
    ship: 'Caracal',
    faction: 'Caldari',
    hull: 'Cruiser',
    category: 'Ratting',
    difficulty: 'Intermediate',
    isk: 'Moderate',
    tags: ['missiles', 'nullsec', 'anomalies'],
    role: 'Cheap, effective ratter for nullsec combat anomalies.',
    notes:
      'Cheap to replace and applies well to frigate/cruiser rats. Always watch local + d-scan when ratting in null.',
    eft: `[Caracal, Null Ratter]
Damage Control I
Ballistic Control System I
Ballistic Control System I

10MN Afterburner I
Large Shield Extender I
Multispectrum Shield Hardener I
Cap Recharger I

Heavy Missile Launcher I
Heavy Missile Launcher I
Heavy Missile Launcher I
Heavy Missile Launcher I
Heavy Missile Launcher I

Medium Core Defense Field Extender I
Medium Core Defense Field Extender I
Medium Core Defense Field Extender I`
  }),
  fit({
    id: 'rupture-ratting',
    name: 'Rupture — Minmatar Ratter',
    ship: 'Rupture',
    faction: 'Minmatar',
    hull: 'Cruiser',
    category: 'Ratting',
    difficulty: 'Intermediate',
    isk: 'Moderate',
    tags: ['autocannons', 'drones', 'nullsec'],
    role: 'Versatile autocannon + drone cruiser for belts and anomalies.',
    notes:
      'Selectable damage via ammo, plus a drone flight. A solid all-rounder while you train toward bigger hulls.',
    eft: `[Rupture, Ratter]
Damage Control I
Gyrostabilizer I
800mm Steel Plates I
Energized Adaptive Nano Membrane I

10MN Afterburner I
Cap Recharger I
Cap Recharger I

220mm Vulcan AutoCannon I
220mm Vulcan AutoCannon I
220mm Vulcan AutoCannon I
220mm Vulcan AutoCannon I

Medium Trimark Armor Pump I
Medium Trimark Armor Pump I
Medium Trimark Armor Pump I

Hammerhead I x5`
  }),

  // ---------------- HAULING ----------------
  fit({
    id: 'sigil-hauler',
    name: 'Sigil — Cheap Hauler',
    ship: 'Sigil',
    faction: 'Amarr',
    hull: 'Industrial',
    category: 'Hauling',
    difficulty: 'Beginner',
    isk: 'Cheap',
    tags: ['cargo', 'high-sec', 'tank'],
    role: 'Move goods in high-sec on a budget with a survivable tank.',
    notes:
      'Never autopilot a loaded hauler. Keep cargo value low, warp to 0 manually, and watch for gankers at gates/stations.',
    eft: `[Sigil, Starter Hauler]
Expanded Cargohold I
Expanded Cargohold I
Inertial Stabilizers I

Medium Shield Extender I
Medium Shield Extender I
Adaptive Invulnerability Field I

[Empty High slot]

Medium Core Defense Field Extender I
Medium Core Defense Field Extender I
Medium Core Defense Field Extender I`
  }),
  fit({
    id: 'wreathe-hauler',
    name: 'Wreathe — Fast Minmatar Hauler',
    ship: 'Wreathe',
    faction: 'Minmatar',
    hull: 'Industrial',
    category: 'Hauling',
    difficulty: 'Beginner',
    isk: 'Cheap',
    tags: ['cargo', 'agile', 'high-sec'],
    role: 'Agile hauler that aligns and warps quickly to dodge ganks.',
    notes:
      'Speed-tank build — a fast align time is your best defense in high-sec. Split valuable loads into multiple trips.',
    eft: `[Wreathe, Fast Hauler]
Inertial Stabilizers I
Inertial Stabilizers I
Nanofiber Internal Structure I

Medium Shield Extender I
Medium Shield Extender I
Adaptive Invulnerability Field I

[Empty High slot]

Medium Core Defense Field Extender I
Medium Core Defense Field Extender I
Medium Core Defense Field Extender I`
  }),

  // ---------------- PvP (combat frigates) ----------------
  fit({
    id: 'rifter-pvp',
    name: 'Rifter — Minmatar Brawler',
    ship: 'Rifter',
    faction: 'Minmatar',
    hull: 'Frigate',
    category: 'PvP',
    difficulty: 'Beginner',
    isk: 'Cheap',
    tags: ['autocannons', 'brawl', 'solo'],
    role: 'Classic cheap close-range PvP frigate.',
    notes:
      'Get in close, web + scram, and apply autocannon damage. Carry spare ammo and expect to lose a few while learning.',
    eft: `[Rifter, Newbie Brawler]
Damage Control I
Small Armor Repairer I
200mm Steel Plates I

1MN Afterburner I
Stasis Webifier I
Warp Scrambler I

200mm AutoCannon I
200mm AutoCannon I
200mm AutoCannon I

Small Trimark Armor Pump I
Small Trimark Armor Pump I
Small Trimark Armor Pump I`
  }),
  fit({
    id: 'merlin-pvp',
    name: 'Merlin — Caldari Shield Brawler',
    ship: 'Merlin',
    faction: 'Caldari',
    hull: 'Frigate',
    category: 'PvP',
    difficulty: 'Beginner',
    isk: 'Cheap',
    tags: ['blasters', 'shield', 'brawl'],
    role: 'Tanky shield frigate, very forgiving for newbie PvP.',
    notes:
      'One of the toughest newbie frigates. Brawl close with blasters, web + scram, and let the shield buffer carry the fight.',
    eft: `[Merlin, Shield Brawler]
Damage Control I
Magnetic Field Stabilizer I

1MN Afterburner I
Medium Shield Extender I
Stasis Webifier I
Warp Scrambler I

Light Neutron Blaster I
Light Neutron Blaster I
Light Neutron Blaster I

Small Anti-EM Screen Reinforcer I
Small Core Defense Field Extender I
Small Core Defense Field Extender I`
  }),
  fit({
    id: 'tristan-pvp',
    name: 'Tristan — Gallente Drone Kiter',
    ship: 'Tristan',
    faction: 'Gallente',
    hull: 'Frigate',
    category: 'PvP',
    difficulty: 'Beginner',
    isk: 'Cheap',
    tags: ['drones', 'kite', 'versatile'],
    role: 'Drone frigate that fights at range while drones do the work.',
    notes:
      'Super flexible — swap drones for the situation. Great for learning range control without juggling guns.',
    eft: `[Tristan, Drone Kiter]
Damage Control I
Small Armor Repairer I
Drone Damage Amplifier I

5MN Y-T8 Compact Microwarpdrive
Stasis Webifier I
Warp Scrambler I

125mm Gatling AutoCannon I
125mm Gatling AutoCannon I

Small Anti-EM Screen Reinforcer I
Small Auxiliary Nano Pump I

Hobgoblin I x5
Hornet EC-300 x2`
  }),
  fit({
    id: 'punisher-pvp',
    name: 'Punisher — Amarr Armor Tank',
    ship: 'Punisher',
    faction: 'Amarr',
    hull: 'Frigate',
    category: 'PvP',
    difficulty: 'Beginner',
    isk: 'Cheap',
    tags: ['lasers', 'armor', 'brawl'],
    role: 'Beefy armor-tanked laser frigate.',
    notes:
      'Huge armor buffer for a frigate. Lasers mean no ammo runs — just bring crystals. Cap is tight, so manage it.',
    eft: `[Punisher, Armor Brawler]
Damage Control I
Small Armor Repairer I
Heat Sink I
200mm Steel Plates I

1MN Afterburner I
Stasis Webifier I
Warp Scrambler I

Small Focused Pulse Laser I
Small Focused Pulse Laser I
Small Focused Pulse Laser I

Small Trimark Armor Pump I
Small Trimark Armor Pump I
Small Trimark Armor Pump I`
  }),
  fit({
    id: 'kestrel-pvp',
    name: 'Kestrel — Caldari Missile Kiter',
    ship: 'Kestrel',
    faction: 'Caldari',
    hull: 'Frigate',
    category: 'PvP',
    difficulty: 'Beginner',
    isk: 'Cheap',
    tags: ['missiles', 'kite', 'range'],
    role: 'Missile frigate that fights from a safe distance.',
    notes:
      'Apply damage at range and pick your damage type. Keep distance with the scram + MWD and let missiles do the rest.',
    eft: `[Kestrel, Missile Kiter]
Damage Control I
Ballistic Control System I

5MN Y-T8 Compact Microwarpdrive
Stasis Webifier I
Warp Scrambler I

Light Missile Launcher I
Light Missile Launcher I
Light Missile Launcher I
Light Missile Launcher I

Small Core Defense Field Extender I
Small Anti-EM Screen Reinforcer I
Small Core Defense Field Extender I`
  })
];

// EVE type IDs so we can pull official ship renders from CCP's image server:
//   https://images.evetech.net/types/{typeId}/render?size=128
export const SHIP_TYPE_IDS = {
  Heron: 605,
  Magnate: 29248,
  Imicus: 607,
  Probe: 586,
  Venture: 32880,
  Procurer: 17480,
  Algos: 32872,
  Coercer: 16236,
  Vexor: 626,
  Caracal: 621,
  Rupture: 629,
  Sigil: 19744,
  Wreathe: 653,
  Rifter: 587,
  Merlin: 603,
  Tristan: 593,
  Punisher: 597,
  Kestrel: 602
};

export function shipRenderUrl(ship, size = 128) {
  const id = SHIP_TYPE_IDS[ship];
  return id ? `https://images.evetech.net/types/${id}/render?size=${size}` : null;
}

// Convenience: list of unique ships present in the library.
export const SHIPS = [...new Set(fits.map((f) => f.ship))].sort();

// Richer per-ship list (name + faction + hull + typeId + fit count) for the
// "pick your ship" dropdown.
export const SHIP_LIST = SHIPS.map((name) => {
  const f = fits.find((x) => x.ship === name);
  return {
    name,
    typeId: SHIP_TYPE_IDS[name] || null,
    faction: f.faction,
    hull: f.hull,
    count: fits.filter((x) => x.ship === name).length
  };
});
