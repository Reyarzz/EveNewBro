// Damage-type & resist quick reference (static).
//
// "deal" = the damage that works best AGAINST that faction's rats/ships
//          (what to load / what your guns should do).
// "take" = the damage that faction shoots at YOU (what to tank).
// Types are listed in rough priority order.

export const NPC_FACTIONS = [
  { name: 'Angel Cartel', deal: ['Explosive', 'Kinetic'], take: ['Explosive', 'Kinetic'], note: 'Fastest rats; explosive-heavy.' },
  { name: 'Blood Raiders', deal: ['EM', 'Thermal'], take: ['EM', 'Thermal'], note: 'Heavy neut/nos — watch cap.' },
  { name: 'Guristas', deal: ['Kinetic', 'Thermal'], take: ['Kinetic', 'Thermal'], note: 'Kinetic-heavy; ECM jams.' },
  { name: 'Sansha\u2019s Nation', deal: ['EM', 'Thermal'], take: ['EM', 'Thermal'], note: 'Tracking disruption.' },
  { name: 'Serpentis', deal: ['Kinetic', 'Thermal'], take: ['Kinetic', 'Thermal'], note: 'Sensor damps.' },
  { name: 'Rogue Drones', deal: ['Explosive', 'Thermal'], take: ['Explosive', 'Thermal'], note: 'Mixed; often EXP/THM.' },
  { name: 'Mercenaries', deal: ['Thermal', 'Kinetic'], take: ['All'], note: 'Mixed damage.' },
  { name: 'Sleepers (WH)', deal: ['EM', 'Thermal'], take: ['Omni'], note: 'Omni; remote rep + neut.' },
  { name: 'Triglavians', deal: ['Thermal', 'Explosive'], take: ['Thermal', 'Explosive'], note: 'Ramping spool-up damage.' },
  { name: 'EDENCOM', deal: ['EM', 'Kinetic'], take: ['EM', 'Kinetic'], note: 'Chain-lightning AoE.' }
];

// Empire ship resist profiles — the "hole" is what to shoot them with.
export const EMPIRE_RESISTS = [
  { name: 'Amarr (Armor)', tanks: 'Armor', strong: ['EM', 'Thermal'], hole: 'Explosive', note: 'Armor strong vs EM/THM.' },
  { name: 'Caldari (Shield)', tanks: 'Shield', strong: ['Kinetic', 'Thermal'], hole: 'EM', note: 'Shields weakest vs EM.' },
  { name: 'Gallente (Armor)', tanks: 'Armor', strong: ['Kinetic', 'Explosive'], hole: 'EM', note: 'Armor weakest vs EM.' },
  { name: 'Minmatar (Mixed)', tanks: 'Both', strong: ['Explosive'], hole: 'EM', note: 'Usually EM/THM hole.' }
];

// Base resist holes by tank layer (before fitting hardeners).
export const TANK_HOLES = [
  { layer: 'Shield (base)', weakest: 'EM — 0%', strongest: 'Explosive — 50%' },
  { layer: 'Armor (base)', weakest: 'Explosive low', strongest: 'EM — 50%' }
];
