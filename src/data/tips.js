// New-player tips, grouped by category. Pure data so it is easy to extend.
// Keep advice accurate to current EVE conventions; edit freely.

export const tipCategories = [
  {
    id: 'survival',
    name: 'Staying Alive',
    tips: [
      'In EVE you WILL lose ships. Never fly what you cannot afford to lose.',
      'Always fit a tank: shield extenders / armor plates and a damage-control module. A Damage Control is one of the best low-slot modules in the game.',
      'Check local chat and your overview. A flashing red pilot can shoot you in low/null sec.',
      'High-sec (1.0–0.5) is safest but not safe. Suicide ganks happen, especially to shiny haulers.',
      'Set your overview to show all hostiles. The default overview hides things that can kill you.'
    ]
  },
  {
    id: 'fitting',
    name: 'Fitting Basics',
    tips: [
      'Balance your fit: weapons in highs, tank/utility in mids and lows, rigs to finish.',
      'Match weapon range to your tactic. Long-range guns kite; short-range guns brawl.',
      'Watch your capacitor. A fit that runs out of cap is a dead ship. Use the fitting sim before undocking.',
      'Use meta/named modules early — they are cheap, need fewer skills, and are nearly as good as T2.',
      'Rigs are permanent (removing destroys them). Choose carefully.'
    ]
  },
  {
    id: 'skills',
    name: 'Skills & Progression',
    tips: [
      'Train core support skills first: CPU/Powergrid, capacitor, navigation, and tank skills. They help every ship.',
      'Use a skill plan. Do not random-train. Tools like the in-game skill plan or third-party planners help.',
      'Set a long skill in queue before logging off — skills train offline.',
      'Magic 14: the core support skills almost every pilot should train early. Search "EVE magic 14".'
    ]
  },
  {
    id: 'isk',
    name: 'Making ISK',
    tips: [
      'Good newbie income: mission running (Sisters of EVE arc), exploration (hacking data/relic sites), and mining.',
      'Exploration in a cheap frigate can earn a lot with low investment — learn to scan with probes.',
      'Join a newbie-friendly corp (e.g. starter corporations / EVE University). Group play earns more and teaches faster.',
      'Do the Career Agents and the SoE epic arc first — great ISK, items, and a guided tutorial.'
    ]
  },
  {
    id: 'navigation',
    name: 'Getting Around',
    tips: [
      'Set destination, then use autopilot ONLY when safe — autopilot warps to 0 slowly and is gank bait. Manual jump is faster and safer.',
      'Bookmarks (safe spots) let you warp to a position with no station — handy for hiding.',
      'Align + warp: you must be aligned and at ~75% max speed to enter warp. Spam the warp button after aligning.',
      'D-scan (directional scanner) shows nearby ships/probes. Learn it early to avoid ambushes.',
      'Insta-undock and insta-dock bookmarks remove the slow crawl off a station — a classic safety trick.'
    ]
  },
  {
    id: 'pvp',
    name: 'PvP Basics',
    tips: [
      'Tackle first: a Warp Scrambler/Disruptor stops a target warping off. No tackle = they just leave.',
      'Webs (Stasis Webifier) slow targets so your guns/drones apply damage — huge against small fast ships.',
      'Know your range. Pulling or holding range (orbit / keep-at-range) often wins fights more than raw DPS.',
      'Overheat modules (Shift+click to toggle) for a burst of extra performance — but they take damage and can burn out.',
      'Always expect backup. If a target feels too easy in low/null, it may be bait for a bigger gang.'
    ]
  },
  {
    id: 'social',
    name: 'Corp & Community',
    tips: [
      'Join a newbie-friendly corp early (EVE University, Brave Newbies, Pandemic Horde, etc.). You will learn 10x faster.',
      'Ask questions in Rookie Help chat — it is moderated and beginners are welcome.',
      'EVE is a social game. Fleets, mining ops, and roams are where the fun (and ISK) scale up.',
      'Use a voice comms tool (Discord/Mumble) when fleeting — coordination wins fights.'
    ]
  },
  {
    id: 'ui',
    name: 'UI & Quality of Life',
    tips: [
      'Customize your Overview tabs (PvE, PvP, mining, travel). The default is bad — import a community overview pack.',
      'Set up Watch List and Tactical Overlay (Ctrl+D) to read grid positioning.',
      'Right-click is your friend — almost every action in EVE lives in a context menu.',
      'Save fits in the in-game Fitting window so you can re-buy and re-fit in one click after a loss.'
    ]
  }
];
