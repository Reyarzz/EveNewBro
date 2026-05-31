// Turns an ESI character snapshot into a list of personalized, actionable tips.
// Pure function, no DOM — easy to unit test or extend.
//
// Each returned tip: { level: 'good' | 'warn' | 'info', text }

import { fits } from './fits.js';

const SP_NEWBIE = 1_500_000; // < ~1.5M SP: very new
const SP_EARLY = 5_000_000; // < 5M SP: still early game
const ISK_THIN = 5_000_000; // < 5M ISK wallet: encourage income

function iskFormat(n) {
  if (n == null) return 'unknown';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'b ISK';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'm ISK';
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'k ISK';
  return Math.round(n) + ' ISK';
}

function spFormat(n) {
  if (n == null) return 'unknown';
  return (n / 1e6).toFixed(1) + 'm SP';
}

// Find curated fits whose ship matches the character's current hull.
function matchingFits(shipTypeName) {
  if (!shipTypeName) return [];
  return fits.filter((f) => f.ship.toLowerCase() === shipTypeName.toLowerCase());
}

export function buildPersonalTips(snapshot) {
  const tips = [];
  if (!snapshot) return tips;

  const {
    totalSp,
    walletBalance,
    shipTypeName,
    solarSystemName,
    skillQueueLength,
    skillQueueFinish
  } = snapshot;

  // Skill points / progression
  if (totalSp != null) {
    if (totalSp < SP_NEWBIE) {
      tips.push({
        level: 'info',
        text: `You're at ${spFormat(totalSp)}. Focus the "Magic 14" core support skills (CPU/PG, capacitor, navigation, tank) before specializing.`
      });
    } else if (totalSp < SP_EARLY) {
      tips.push({
        level: 'info',
        text: `${spFormat(totalSp)} — solid start. Round out core support skills to IV before chasing T2 weapons.`
      });
    } else {
      tips.push({
        level: 'good',
        text: `${spFormat(totalSp)} trained. You can start specializing into a role (PvP, exploration, industry).`
      });
    }
  }

  // Skill queue health
  if (skillQueueLength != null) {
    if (skillQueueLength === 0) {
      tips.push({
        level: 'warn',
        text: 'Your skill queue is EMPTY. Skills train offline — always keep something queued before logging off.'
      });
    } else if (skillQueueFinish) {
      const finish = new Date(skillQueueFinish);
      const hoursLeft = (finish.getTime() - Date.now()) / 3.6e6;
      if (hoursLeft < 24) {
        tips.push({
          level: 'warn',
          text: `Skill queue ends in under a day (${skillQueueLength} item${skillQueueLength === 1 ? '' : 's'}). Add a long skill so training never idles.`
        });
      } else {
        tips.push({
          level: 'good',
          text: `Skill queue looks healthy (${skillQueueLength} items, ends ${finish.toLocaleDateString()}).`
        });
      }
    }
  }

  // Wallet / risk
  if (walletBalance != null) {
    if (walletBalance < ISK_THIN) {
      tips.push({
        level: 'warn',
        text: `Wallet: ${iskFormat(walletBalance)}. Run the Career Agents + SoE epic arc, or exploration, to build a buffer. Never fly what you can't afford to lose.`
      });
    } else {
      tips.push({
        level: 'good',
        text: `Wallet: ${iskFormat(walletBalance)}. Keep a reserve so a ship loss never stops you playing.`
      });
    }
  }

  // Current ship + matching fits
  if (shipTypeName) {
    const fits = matchingFits(shipTypeName);
    if (fits.length > 0) {
      tips.push({
        level: 'good',
        text: `You're in a ${shipTypeName}. We have ${fits.length} starter fit${fits.length === 1 ? '' : 's'} for it — check the Fits tab and "Copy EFT fit".`
      });
    } else {
      tips.push({
        level: 'info',
        text: `Currently flying a ${shipTypeName}. Make sure it has a tank module (e.g. Damage Control) and your cap holds stable before undocking.`
      });
    }
  }

  // Location safety hint
  if (solarSystemName) {
    tips.push({
      level: 'info',
      text: `Located in ${solarSystemName}. Use D-scan and watch local; even high-sec has gankers — keep haulers cheap and tanked.`
    });
  }

  return tips;
}

export { iskFormat, spFormat };
