import { tipCategories } from './data/tips.js';
import {
  fits,
  CATEGORIES,
  FACTIONS,
  HULL_CLASSES,
  SHIP_LIST,
  shipRenderUrl
} from './data/fits.js';
import { buildPersonalTips, iskFormat, spFormat } from './data/personalize.js';
import { NPC_FACTIONS, EMPIRE_RESISTS, TANK_HOLES } from './data/damage.js';

// ---------- Render tips ----------
function renderTips() {
  const root = document.getElementById('tips-view');
  root.innerHTML = pageHead(
    'Tips',
    'Bite-sized advice for new pilots — survival, fitting, ISK, PvP, and more.'
  );

  tipCategories.forEach((cat) => {
    const wrap = document.createElement('div');
    wrap.className = 'category';

    const header = document.createElement('button');
    header.className = 'category-header';
    header.innerHTML = `<span>${cat.name}</span><span class="chev">▾</span>`;
    header.addEventListener('click', () => wrap.classList.toggle('collapsed'));

    const list = document.createElement('ul');
    list.className = 'tip-list';
    cat.tips.forEach((tip) => {
      const li = document.createElement('li');
      li.textContent = tip;
      list.appendChild(li);
    });

    wrap.appendChild(header);
    wrap.appendChild(list);
    root.appendChild(wrap);
  });
}

// ---------- Render fits (with filters) ----------
const fitFilters = {
  category: 'All',
  faction: 'All',
  hull: 'All',
  ship: 'All',
  source: 'All',
  search: ''
};

// Community fits (EVE Workbench) loaded from the main process.
let communityFits = [];
let communityState = { configured: false, count: 0, fetchedAt: 0, stale: true };

function allFits() {
  const builtin = fits.map((f) => ({ ...f, source: 'Built-in' }));
  return builtin.concat(communityFits);
}

function findFit(id) {
  return allFits().find((f) => f.id === id) || null;
}

const FACTION_CLASS = {
  Amarr: 'amarr',
  Caldari: 'caldari',
  Gallente: 'gallente',
  Minmatar: 'minmatar',
  ORE: 'ore'
};

function filteredFits() {
  const q = fitFilters.search.trim().toLowerCase();
  return allFits().filter((f) => {
    if (fitFilters.category !== 'All' && f.category !== fitFilters.category) return false;
    if (fitFilters.faction !== 'All' && f.faction !== fitFilters.faction) return false;
    if (fitFilters.hull !== 'All' && f.hull !== fitFilters.hull) return false;
    if (fitFilters.ship !== 'All' && f.ship !== fitFilters.ship) return false;
    if (fitFilters.source === 'Built-in' && f.source !== 'Built-in') return false;
    if (fitFilters.source === 'Community' && f.source === 'Built-in') return false;
    if (q) {
      const hay = `${f.name} ${f.ship} ${f.role} ${f.notes} ${(f.tags || []).join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function shipDropdown() {
  const options = SHIP_LIST
    .map(
      (s) =>
        `<option value="${s.name}"${fitFilters.ship === s.name ? ' selected' : ''}>${s.name} — ${s.faction} ${s.hull} (${s.count})</option>`
    )
    .join('');
  const allSel = fitFilters.ship === 'All' ? ' selected' : '';
  return `
    <div class="ship-select-row">
      <label class="chip-label" for="ship-select">Your ship</label>
      <select id="ship-select" class="ship-select">
        <option value="All"${allSel}>All ships</option>
        ${options}
      </select>
    </div>
  `;
}

function chipRow(label, values, key) {
  const opts = ['All', ...values];
  const chips = opts
    .map((v) => {
      const active = fitFilters[key] === v ? ' active' : '';
      return `<button class="chip${active}" data-key="${key}" data-val="${v}">${v}</button>`;
    })
    .join('');
  return `<div class="chip-row"><span class="chip-label">${label}</span>${chips}</div>`;
}

function fitCardHtml(f) {
  const tagHtml = (f.tags || [])
    .slice(0, 4)
    .map((t) => `<span class="tag">${t}</span>`)
    .join('');
  const img = f.shipTypeId
    ? `https://images.evetech.net/types/${f.shipTypeId}/render?size=128`
    : shipRenderUrl(f.ship, 128);
  const imgHtml = img
    ? `<img class="ship-img" src="${img}" alt="${f.ship}" loading="lazy" onerror="this.style.display='none'" />`
    : '<div class="ship-img placeholder"></div>';

  const isCommunity = f.source && f.source !== 'Built-in';
  const sourceBadge = isCommunity
    ? '<span class="badge source-ewb">EVE Workbench</span>'
    : '<span class="badge source-builtin">Built-in</span>';
  const factionBadge = f.faction
    ? `<span class="badge faction ${FACTION_CLASS[f.faction] || ''}">${f.faction}</span>`
    : '';
  const hullBadge = f.hull ? `<span class="badge">${f.hull}</span>` : '';
  const catBadge = f.category ? `<span class="badge">${f.category}</span>` : '';
  const diffBadge = f.difficulty
    ? `<span class="badge diff-${f.difficulty.toLowerCase()}">${f.difficulty}</span>`
    : '';
  const iskBadge = f.isk ? `<span class="badge isk-${f.isk.toLowerCase()}">${f.isk}</span>` : '';
  const openBtn =
    isCommunity && f.url ? `<button class="open-btn" data-url="${f.url}">Open ↗</button>` : '';

  return `
    <div class="fit-card${isCommunity ? ' community' : ''}">
      <div class="fit-card-top">
        ${imgHtml}
        <div class="fit-card-info">
          <div class="fit-card-head">
            <h3>${f.name}</h3>
            <div class="card-btns">
              ${openBtn}
              <button class="copy-btn" data-fit="${f.id}">Copy EFT</button>
            </div>
          </div>
          <div class="badges">
            ${factionBadge}
            ${hullBadge}
            ${catBadge}
            ${diffBadge}
            ${iskBadge}
            ${sourceBadge}
          </div>
        </div>
      </div>
      <div class="role">${f.role}</div>
      <div class="notes">${f.notes}</div>
      <div class="tags">${tagHtml}</div>
    </div>
  `;
}

const fitCheckState = { open: false, text: '', data: null, loading: false };

function renderFitCheckTool() {
  const el = document.getElementById('fitcheck-tool');
  if (!el || !window.skills) return;
  if (!fitCheckState.open) {
    el.innerHTML = '<button class="link-btn" id="fc-open">⚙ Check a fit (skills + cost) ▸</button>';
    el.querySelector('#fc-open').addEventListener('click', () => {
      fitCheckState.open = true;
      renderFitCheckTool();
    });
    return;
  }
  el.innerHTML = `
    <div class="section-label">Fit check <button class="link-btn" id="fc-close">close</button></div>
    <textarea id="fc-input" class="text-area" placeholder="Paste an EFT fit…">${escapeAttr(fitCheckState.text)}</textarea>
    <button class="primary-btn" id="fc-go">Check fit</button>
    <div id="fc-result"></div>
  `;
  el.querySelector('#fc-close').addEventListener('click', () => {
    fitCheckState.open = false;
    renderFitCheckTool();
  });
  const ta = el.querySelector('#fc-input');
  ta.addEventListener('input', () => {
    fitCheckState.text = ta.value;
  });
  el.querySelector('#fc-go').addEventListener('click', () => doFitCheck(ta.value));
  renderFitCheckResult();
}

async function doFitCheck(text) {
  fitCheckState.text = text;
  fitCheckState.loading = true;
  fitCheckState.data = null;
  renderFitCheckResult();
  try {
    fitCheckState.data = await window.skills.fitCheck(text);
  } catch (_e) {
    fitCheckState.data = null;
  }
  fitCheckState.loading = false;
  renderFitCheckResult();
}

function renderFitCheckResult() {
  const el = document.getElementById('fc-result');
  if (!el) return;
  if (fitCheckState.loading) {
    el.innerHTML = '<div class="empty-state small">Checking skills + pricing…</div>';
    return;
  }
  const d = fitCheckState.data;
  if (!d) {
    el.innerHTML = '';
    return;
  }
  if (!d.items) {
    el.innerHTML = '<div class="empty-state small">No modules recognized.</div>';
    return;
  }
  const missing = d.requirements.filter((r) => !r.ok);
  const status = !d.loggedIn
    ? '<div class="fc-note muted">Log in (Me tab) to compare against your trained skills.</div>'
    : missing.length === 0
      ? '<div class="fc-ok">✓ You can fly this fit — all skills trained.</div>'
      : `<div class="fc-bad">✗ Missing ${missing.length} skill(s) · ${volFmt(d.totalMissingSp)} SP to train</div>`;
  const reqRows = d.requirements
    .map(
      (r) =>
        `<div class="fc-skill ${r.ok ? 'ok' : 'bad'}"><span>${r.name}</span><span>${r.have}/${r.need}</span></div>`
    )
    .join('');
  const price = d.price
    ? `<div class="fc-price">Cost ${priceFmt(d.price.totalSell)} · sell value ${priceFmt(d.price.totalBuy)}</div>`
    : '';
  el.innerHTML = `${status}${price}<div class="fc-skills">${reqRows}</div>`;
}

function renderFits() {
  const root = document.getElementById('fits-view');

  const controls = `
    ${pageHead('Fits', 'Curated starter fits and community builds — filter, copy EFT, fly.')}
    <div id="fitcheck-tool"></div>
    <div id="community-bar"></div>
    <div class="filters">
      ${shipDropdown()}
      ${chipRow('Activity', CATEGORIES, 'category')}
      ${chipRow('Faction', FACTIONS, 'faction')}
      ${chipRow('Hull', HULL_CLASSES, 'hull')}
      ${chipRow('Source', ['Built-in', 'Community'], 'source')}
      <div class="filter-bottom">
        <input id="fit-search" class="search-box" type="text" placeholder="Search ships, roles, tags…" value="${fitFilters.search}" />
        <button class="clear-btn" id="clear-filters">Reset</button>
      </div>
    </div>
    <div class="fit-count" id="fit-count"></div>
    <div id="fit-results"></div>
  `;
  root.innerHTML = controls;

  renderFitCheckTool();
  renderCommunityBar();

  // Chip click handlers
  root.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      fitFilters[chip.dataset.key] = chip.dataset.val;
      renderFits();
    });
  });

  // Ship dropdown
  const shipSelect = root.querySelector('#ship-select');
  shipSelect.addEventListener('change', (e) => {
    fitFilters.ship = e.target.value;
    renderFits();
  });

  // Reset filters
  root.querySelector('#clear-filters').addEventListener('click', () => {
    fitFilters.category = 'All';
    fitFilters.faction = 'All';
    fitFilters.hull = 'All';
    fitFilters.ship = 'All';
    fitFilters.source = 'All';
    fitFilters.search = '';
    renderFits();
  });

  // Search box
  const search = root.querySelector('#fit-search');
  search.addEventListener('input', (e) => {
    fitFilters.search = e.target.value;
    renderFitResults();
  });
  // Keep focus + caret after re-render when typing
  search.focus();
  search.setSelectionRange(search.value.length, search.value.length);

  renderFitResults();
}

function renderFitResults() {
  const results = document.getElementById('fit-results');
  const count = document.getElementById('fit-count');
  if (!results) return;

  const list = filteredFits();
  count.textContent = `${list.length} fit${list.length === 1 ? '' : 's'}`;

  if (list.length === 0) {
    results.innerHTML = '<div class="empty-state">No fits match these filters. Try clearing one.</div>';
    return;
  }

  // Group by ship so it reads "per ship, per category".
  const byShip = {};
  list.forEach((f) => {
    (byShip[f.ship] = byShip[f.ship] || []).push(f);
  });

  results.innerHTML = Object.keys(byShip)
    .sort()
    .map((ship) => {
      const cards = byShip[ship].map(fitCardHtml).join('');
      const icon = shipRenderUrl(ship, 64);
      const iconHtml = icon
        ? `<img class="ship-group-icon" src="${icon}" alt="" loading="lazy" onerror="this.style.display='none'" />`
        : '';
      return `<div class="ship-group"><div class="ship-group-title">${iconHtml}<span>${ship}</span></div>${cards}</div>`;
    })
    .join('');

  // Copy handlers
  results.querySelectorAll('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const fit = findFit(btn.dataset.fit);
      if (!fit) return;
      try {
        await navigator.clipboard.writeText(fit.eft);
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = 'Copy EFT';
          btn.classList.remove('copied');
        }, 1600);
      } catch (e) {
        btn.textContent = 'Failed';
      }
    });
  });

  // Open community fit on EVE Workbench
  results.querySelectorAll('.open-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (window.community && window.eve && window.eve.openExternal) {
        window.eve.openExternal(btn.dataset.url);
      }
    });
  });
}

// ---------- Community fits bar (EVE Workbench) ----------
function timeAgo(ts) {
  if (!ts) return 'never';
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function renderCommunityBar() {
  const bar = document.getElementById('community-bar');
  if (!bar) return;

  if (!window.community) {
    bar.innerHTML = '';
    return;
  }

  if (communityState.configured) {
    const own = communityState.ownCount || 0;
    const imp = communityState.importedCount || 0;
    bar.innerHTML = `
      <div class="community-bar">
        <span class="cb-status">EVE Workbench: <b>${communityState.count}</b> fits (${own} yours · ${imp} imported) · updated ${timeAgo(communityState.fetchedAt)}</span>
        <button class="mini-btn" id="cb-refresh">Refresh</button>
      </div>
      <div class="cb-import">
        <input id="cb-import-input" class="text-input" type="text" placeholder="Paste an EVE Workbench fit link to import…" />
        <button class="mini-btn" id="cb-import-btn">Import</button>
      </div>
      <div id="cb-import-msg" class="setup-msg"></div>
    `;
    document.getElementById('cb-refresh').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = 'Updating…';
      try {
        communityState = await window.community.refresh();
        communityFits = communityState.fits || [];
      } catch (err) {
        btn.textContent = 'Failed';
      }
      renderFits();
    });
    document.getElementById('cb-import-btn').addEventListener('click', async () => {
      const input = document.getElementById('cb-import-input');
      const msg = document.getElementById('cb-import-msg');
      const val = input.value.trim();
      if (!val) {
        msg.textContent = 'Paste an EVE Workbench fit link or ID.';
        return;
      }
      msg.textContent = 'Importing…';
      try {
        communityState = await window.community.importFit(val);
        communityFits = communityState.fits || [];
        renderFits();
      } catch (err) {
        msg.textContent = 'Import failed: ' + (err.message || err);
      }
    });
    return;
  }

  // Not configured — collapsed prompt that expands into a small form.
  bar.innerHTML = `
    <div class="community-bar collapsed">
      <span class="cb-status">Add community fits from EVE Workbench (auto-updates daily)</span>
      <button class="mini-btn" id="cb-connect">Connect</button>
    </div>
    <div class="cb-form" id="cb-form" style="display:none">
      <p class="setup-text">
        Create a free app at
        <a href="#" id="cb-link">eveworkbench.com/my-account/developer</a>
        (Public access is fine), then paste your <b>API Key</b>. The Client ID is
        optional — leave it blank if you only got a key.
      </p>
      <input id="cb-key" class="text-input" type="text" placeholder="EVE Workbench API Key (required)" />
      <input id="cb-client" class="text-input" type="text" placeholder="Client ID (optional)" />
      <button class="primary-btn" id="cb-save">Save & fetch fits</button>
      <div id="cb-msg" class="setup-msg"></div>
    </div>
  `;

  document.getElementById('cb-connect').addEventListener('click', () => {
    const form = document.getElementById('cb-form');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
  });
  document.getElementById('cb-link').addEventListener('click', (e) => {
    e.preventDefault();
    if (window.eve && window.eve.openExternal)
      window.eve.openExternal('https://www.eveworkbench.com/my-account/developer');
  });
  document.getElementById('cb-save').addEventListener('click', async () => {
    const clientId = document.getElementById('cb-client').value.trim();
    const apiKey = document.getElementById('cb-key').value.trim();
    const msg = document.getElementById('cb-msg');
    if (!apiKey) {
      msg.textContent = 'Enter your EVE Workbench API Key.';
      return;
    }
    msg.textContent = 'Saving & fetching community fits…';
    try {
      await window.community.setCreds(clientId, apiKey);
      communityState = await window.community.refresh();
      communityFits = communityState.fits || [];
      renderFits();
    } catch (err) {
      msg.textContent = 'Could not fetch: ' + (err.message || err);
    }
  });
}

async function loadCommunity() {
  if (!window.community) return;
  try {
    communityState = await window.community.state();
    communityFits = communityState.fits || [];
  } catch (_e) {
    /* ignore */
  }
}

// ---------- Market / trading tab ----------
const marketState = {
  mode: 'search', // 'search' | 'browse'
  query: '',
  results: [], // search results [{id,name}]
  searching: false,
  loading: false, // item detail loading
  error: '',
  data: null, // item detail
  detailOpen: false,
  catalog: null, // full market tree {groups, roots, typeNames}
  catStatus: null,
  path: [], // breadcrumb of group ids (browse)
  prices: {}, // typeId -> {sellMin, buyMax} | null (pending)
  pollTimer: null,
  searchTimer: null,
  appraiseText: '',
  appraiseData: null,
  appraising: false,
  watchItems: [],
  watchLoading: false,
  dealsRows: [],
  dealsLoading: false,
  dealsSort: 'station',
  dealsRisk: null, // hub-pair danger map keyed "From→To"
  dealsSafer: false, // prefer high-sec routing for risk calc
  dealsSource: 'preset',
  contractsRows: [],
  contractsLoading: false,
  contractsRegion: 10000002,
  contractsType: 'all',
  contractsRegions: null,
  contractsError: '',
  contractsView: 'list', // 'list' | 'deals'
  contractDeals: null,
  contractDealsLoading: false
};

const POPULAR_ITEMS = [
  'PLEX',
  'Large Skill Injector',
  'Tritanium',
  'Pyerite',
  'Mexallon',
  'Isogen',
  'Nocxium',
  'Zydrine',
  'Megacyte',
  'Morphite'
];

function priceFmt(n) {
  if (!n || n <= 0) return '—';
  return (
    Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
    ' ISK'
  );
}

function volFmt(n) {
  if (!n) return '0';
  return Math.round(n).toLocaleString('en-US');
}

function pageHead(title, lead) {
  const esc = (s) =>
    String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  const t = esc(title);
  const l = lead ? `<p class="page-lead">${esc(lead)}</p>` : '';
  return `<header class="page-head hud-module-head">
    <div class="hud-module-title-row">
      <span class="hud-module-glyph" aria-hidden="true"></span>
      <h1 class="page-title">${t}</h1>
      <span class="hud-module-line" aria-hidden="true"></span>
    </div>${l}</header>`;
}

function escapeAttr(s) {
  return String(s || '').replace(/"/g, '&quot;');
}

function renderMarket() {
  const root = document.getElementById('market-view');
  if (!window.market) {
    root.innerHTML = '<div class="empty-state">Market bridge unavailable.</div>';
    return;
  }

  root.innerHTML = `
    ${pageHead('Market', 'Live prices, browse the full catalog, appraise fits, watch items, and scan contracts.')}
    <div class="mkt-modes">
      <button class="mkt-mode${marketState.mode === 'search' ? ' active' : ''}" data-mode="search">Search</button>
      <button class="mkt-mode${marketState.mode === 'browse' ? ' active' : ''}" data-mode="browse">Browse</button>
      <button class="mkt-mode${marketState.mode === 'deals' ? ' active' : ''}" data-mode="deals">Deals</button>
      <button class="mkt-mode${marketState.mode === 'appraise' ? ' active' : ''}" data-mode="appraise">Appraise</button>
      <button class="mkt-mode${marketState.mode === 'watch' ? ' active' : ''}" data-mode="watch">Watch</button>
      <button class="mkt-mode${marketState.mode === 'contracts' ? ' active' : ''}" data-mode="contracts">Contracts</button>
    </div>
    <div id="market-top"></div>
    <div id="market-results"></div>
  `;

  root.querySelectorAll('.mkt-mode').forEach((b) => {
    b.addEventListener('click', async () => {
      if (marketState.mode !== b.dataset.mode) {
        marketState.mode = b.dataset.mode;
        marketState.detailOpen = false;
      }
      if (marketState.mode === 'browse' && !marketState.catalog) await loadCatalog();
      if (marketState.mode === 'watch') loadWatch();
      renderMarket();
      if (marketState.mode === 'deals' && !marketState.dealsRows.length) loadDeals('preset');
      if (marketState.mode === 'contracts' && !marketState.contractsRows.length) loadContracts();
    });
  });

  renderMarketTop();
  renderMarketBody();
}

function renderMarketTop() {
  const top = document.getElementById('market-top');
  if (!top) return;

  if (marketState.mode === 'search') {
    top.innerHTML = `
      <div class="market-search">
        <input id="mkt-input" class="search-box" type="text"
          placeholder="Search any item by name…" value="${escapeAttr(marketState.query)}" />
        <button class="primary-btn" id="mkt-go">Search</button>
      </div>
      <div class="market-quick">
        ${POPULAR_ITEMS.map((i) => `<button class="chip" data-item="${escapeAttr(i)}">${i}</button>`).join('')}
      </div>
    `;
    const input = top.querySelector('#mkt-input');
    const run = () => {
      marketState.detailOpen = false;
      doSearch(input.value);
    };
    top.querySelector('#mkt-go').addEventListener('click', run);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') run();
    });
    input.addEventListener('input', (e) => {
      marketState.query = e.target.value;
      marketState.detailOpen = false;
      clearTimeout(marketState.searchTimer);
      marketState.searchTimer = setTimeout(() => doSearch(e.target.value), 250);
    });
    top.querySelectorAll('.market-quick .chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        marketState.query = chip.dataset.item;
        input.value = chip.dataset.item;
        openDetailByName(chip.dataset.item);
      });
    });
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  } else if (marketState.mode === 'browse') {
    top.innerHTML = renderBreadcrumb();
    top.querySelectorAll('.crumb').forEach((c) => {
      c.addEventListener('click', () => {
        const idx = Number(c.dataset.idx);
        marketState.path = idx < 0 ? [] : marketState.path.slice(0, idx + 1);
        marketState.detailOpen = false;
        renderMarketTop();
        renderMarketBody();
      });
    });
  } else if (marketState.mode === 'appraise') {
    top.innerHTML = `
      <textarea id="appraise-input" class="text-area" placeholder="Paste an EFT fit or a shopping list (one item per line, e.g. 'Tritanium 1000' or 'Large Skill Injector x3')…">${escapeAttr(marketState.appraiseText || '')}</textarea>
      <button class="primary-btn" id="appraise-go">Appraise (Jita)</button>
    `;
    const ta = top.querySelector('#appraise-input');
    top.querySelector('#appraise-go').addEventListener('click', () => {
      marketState.appraiseText = ta.value;
      marketState.detailOpen = false;
      doAppraise(ta.value);
    });
  } else if (marketState.mode === 'deals') {
    top.innerHTML = `
      <div class="deals-bar">
        <button class="chip" id="deals-preset">Popular goods</button>
        <button class="chip" id="deals-watch">My watchlist</button>
        <span class="deals-sort muted">sort:</span>
        <button class="chip${marketState.dealsSort === 'station' ? ' active' : ''}" data-sort="station">station %</button>
        <button class="chip${marketState.dealsSort === 'haul' ? ' active' : ''}" data-sort="haul">haul profit</button>
        <button class="chip${marketState.dealsSort === 'risk' ? ' active' : ''}" data-sort="risk">risk-adj</button>
        <label class="deals-safer"><input type="checkbox" id="deals-safer"${marketState.dealsSafer ? ' checked' : ''}/> safer route</label>
      </div>`;
    top.querySelector('#deals-preset').addEventListener('click', () => loadDeals('preset'));
    top.querySelector('#deals-watch').addEventListener('click', () => loadDeals('watch'));
    top.querySelector('#deals-safer').addEventListener('change', (e) => {
      marketState.dealsSafer = e.target.checked;
      loadDealsRisk();
    });
    top.querySelectorAll('[data-sort]').forEach((b) =>
      b.addEventListener('click', () => {
        marketState.dealsSort = b.dataset.sort;
        renderMarketTop();
        renderMarketBody();
      })
    );
  } else if (marketState.mode === 'contracts') {
    if (!marketState.contractsRegions && window.contracts) {
      window.contracts
        .regions()
        .then((r) => {
          marketState.contractsRegions = r;
          renderMarketTop();
        })
        .catch(() => {});
    }
    const regions = marketState.contractsRegions || [{ id: 10000002, name: 'The Forge' }];
    const types = [
      ['all', 'All'],
      ['courier', 'Courier'],
      ['item_exchange', 'Item exchange'],
      ['auction', 'Auction']
    ];
    const typeChips =
      marketState.contractsView === 'list'
        ? types
            .map(
              ([k, l]) =>
                `<button class="chip${marketState.contractsType === k ? ' active' : ''}" data-ctype="${k}">${l}</button>`
            )
            .join('')
        : '';
    top.innerHTML = `
      <div class="deals-bar">
        <select id="ct-region" class="route-flag">
          ${regions.map((r) => `<option value="${r.id}"${r.id === marketState.contractsRegion ? ' selected' : ''}>${r.name}</option>`).join('')}
        </select>
        <button class="chip${marketState.contractsView === 'list' ? ' active' : ''}" data-cview="list">Listings</button>
        <button class="chip${marketState.contractsView === 'deals' ? ' active' : ''}" data-cview="deals">Bargains &amp; scams</button>
        ${typeChips}
      </div>`;
    top.querySelector('#ct-region').addEventListener('change', (e) => {
      marketState.contractsRegion = Number(e.target.value);
      if (marketState.contractsView === 'deals') loadContractDeals();
      else loadContracts();
    });
    top.querySelectorAll('[data-cview]').forEach((b) =>
      b.addEventListener('click', () => {
        marketState.contractsView = b.dataset.cview;
        renderMarketTop();
        if (marketState.contractsView === 'deals') {
          if (!marketState.contractDeals) loadContractDeals();
          else renderMarketBody();
        } else {
          renderMarketBody();
        }
      })
    );
    top.querySelectorAll('[data-ctype]').forEach((b) =>
      b.addEventListener('click', () => {
        marketState.contractsType = b.dataset.ctype;
        loadContracts();
      })
    );
  } else {
    top.innerHTML = `<div class="setup-text">Items you're tracking, with live Jita prices. Set a target price to get a desktop alert when it's reached.</div>`;
  }
}

function renderBreadcrumb() {
  const cat = marketState.catalog;
  let crumbs = `<button class="crumb" data-idx="-1">Market</button>`;
  if (cat) {
    marketState.path.forEach((gid, idx) => {
      const g = cat.groups[gid];
      crumbs += `<span class="crumb-sep">›</span><button class="crumb" data-idx="${idx}">${g ? g.name : gid}</button>`;
    });
  }
  const st = marketState.catStatus;
  const info = cat && st ? `<span class="crumb-info muted">${(st.itemCount || 0).toLocaleString()} items</span>` : '';
  return `<div class="mkt-crumbs">${crumbs}${info}</div>`;
}

// ---- body dispatch ----
function renderMarketBody() {
  const el = document.getElementById('market-results');
  if (!el) return;
  if (marketState.detailOpen) {
    el.innerHTML = detailHtml();
    const back = el.querySelector('#mkt-back');
    if (back)
      back.addEventListener('click', () => {
        marketState.detailOpen = false;
        marketState.error = '';
        renderMarketBody();
      });
    const watchBtn = el.querySelector('#mkt-watch');
    if (watchBtn && marketState.data)
      watchBtn.addEventListener('click', () => {
        const d = marketState.data;
        window.watch.add(d.type.id, d.type.name).then(() => {
          watchBtn.textContent = '✓ Watching';
          watchBtn.disabled = true;
          loadWatch();
        });
      });
    if (marketState.data && marketState.data.history && marketState.data.history.series)
      drawPriceChart(marketState.data.history.series);
    return;
  }
  if (marketState.mode === 'search') return renderSearchResults(el);
  if (marketState.mode === 'appraise') return renderAppraise(el);
  if (marketState.mode === 'watch') return renderWatch(el);
  if (marketState.mode === 'deals') return renderDeals(el);
  if (marketState.mode === 'contracts') return renderContracts(el);
  return renderBrowse(el);
}

// ---- public contracts ----
async function loadContracts() {
  if (!window.contracts) return;
  marketState.contractsLoading = true;
  marketState.contractsRows = [];
  marketState.contractsError = '';
  renderMarketTop();
  renderMarketBody();
  try {
    marketState.contractsRows = await window.contracts.search(
      marketState.contractsRegion,
      marketState.contractsType
    );
  } catch (e) {
    marketState.contractsError = e.message || String(e);
  }
  marketState.contractsLoading = false;
  renderMarketBody();
}

async function loadContractDeals() {
  if (!window.contracts || !window.contracts.scanDeals) return;
  marketState.contractDealsLoading = true;
  marketState.contractDeals = null;
  renderMarketBody();
  try {
    marketState.contractDeals = await window.contracts.scanDeals(marketState.contractsRegion);
  } catch (e) {
    marketState.contractDeals = { error: e.message || String(e) };
  }
  marketState.contractDealsLoading = false;
  renderMarketBody();
}

function renderContractDeals(el) {
  if (marketState.contractDealsLoading) {
    el.innerHTML =
      '<div class="empty-state">Appraising item-exchange contracts against Jita (this scans many contracts, give it a few seconds)…</div>';
    return;
  }
  const d = marketState.contractDeals;
  if (!d) {
    el.innerHTML = '<div class="empty-state small">Scan a region for under-priced bargains and likely scams.</div>';
    return;
  }
  if (d.error) {
    el.innerHTML = `<div class="me-error">${d.error}</div>`;
    return;
  }
  const ctRow = (c, kind) => {
    const ratio = c.price > 0 ? (c.value / c.price).toFixed(2) + '×' : '—';
    const tag =
      kind === 'bargain'
        ? `<span class="ct-tag ct-bargain">+${iskShortR(c.profit)}</span>`
        : `<span class="ct-tag ct-scam">${ratio}</span>`;
    const bpc = c.bpc ? '<span class="ct-bpc" title="Contains a blueprint copy">BPC</span>' : '';
    return `<div class="ctd-row">
        <span class="ctd-main"><span class="ctd-val">${iskShortR(c.price)} ISK</span><span class="ctd-sub muted">worth ≈${iskShortR(c.value)} · ${c.items} item${c.items === 1 ? '' : 's'}${bpc ? ' · ' : ''}${bpc} · ${c.start || ''}${c.title ? ' · ' + c.title : ''}</span></span>
        ${tag}
      </div>`;
  };
  const courierRow = (c) =>
    `<div class="ctd-row"><span class="ctd-main"><span class="ctd-val">${iskShortR(c.reward)} reward</span><span class="ctd-sub muted">collateral ${iskShortR(c.collateral)} · ${(c.rewardPct * 100).toFixed(2)}% of risk · ${c.volume.toLocaleString()} m³</span></span><span class="ct-tag ct-scam">risky</span></div>`;

  const bargains = (d.bargains || []).map((c) => ctRow(c, 'bargain')).join('');
  const scams = (d.scams || []).map((c) => ctRow(c, 'scam')).join('');
  const couriers = (d.couriers || []).map(courierRow).join('');
  el.innerHTML = `
    <div class="section-label">Bargains (contents worth more than asking price)</div>
    ${bargains || '<div class="empty-state small">No clear bargains found in the scanned set.</div>'}
    <div class="section-label">Likely scams (over-priced / BPC traps / worthless)</div>
    ${scams || '<div class="empty-state small">No obvious item-exchange scams found.</div>'}
    <div class="section-label">Risky couriers (tiny reward vs collateral)</div>
    ${couriers || '<div class="empty-state small">No suspicious couriers found.</div>'}
    <div class="ctd-note muted">Find these in-game: open Contracts, set region to ${marketState.contractsRegions ? (marketState.contractsRegions.find((r) => r.id === marketState.contractsRegion) || {}).name || '' : ''} and sort by price.</div>
  `;
}

function renderContracts(el) {
  if (marketState.contractsView === 'deals') return renderContractDeals(el);
  if (marketState.contractsLoading) {
    el.innerHTML = '<div class="empty-state">Loading public contracts…</div>';
    return;
  }
  if (marketState.contractsError) {
    el.innerHTML = `<div class="me-error">${marketState.contractsError}</div>`;
    return;
  }
  const rows = marketState.contractsRows;
  if (!rows.length) {
    el.innerHTML = '<div class="empty-state small">No contracts found for that region/type.</div>';
    return;
  }
  el.innerHTML = rows
    .map((c) => {
      const isCourier = c.type === 'courier';
      const main = isCourier
        ? `${iskShortR(c.reward)} reward`
        : `${iskShortR(c.price)} ISK`;
      const sub = isCourier
        ? `${c.start} → ${c.end} · ${c.volume.toLocaleString()} m³ · col ${iskShortR(c.collateral)}`
        : `${c.start}${c.title ? ' · ' + c.title : ''}`;
      return `<div class="ct-row"><span class="ct-type ct-${c.type}">${c.type === 'item_exchange' ? 'item' : c.type}</span><span class="ct-main"><span class="ct-val">${main}</span><span class="ct-sub muted">${sub}</span></span></div>`;
    })
    .join('');
}

// ---- deals scanner ----
async function loadDeals(source) {
  marketState.dealsSource = source || marketState.dealsSource || 'preset';
  marketState.dealsLoading = true;
  marketState.dealsRows = [];
  renderMarketBody();
  try {
    let ids = [];
    if (marketState.dealsSource === 'watch') {
      const items = await window.watch.list();
      ids = items.map((w) => w.id);
    } else {
      ids = await window.deals.preset();
    }
    marketState.dealsRows = await window.deals.scan(ids);
  } catch (_e) {
    marketState.dealsRows = [];
  }
  marketState.dealsLoading = false;
  renderMarketBody();
  loadDealsRisk();
}

// Fetch route danger between hubs (for the haul rows) without blocking the list.
async function loadDealsRisk() {
  if (!window.radar) return;
  const flag = marketState.dealsSafer ? 'secure' : 'shortest';
  try {
    marketState.dealsRisk = await window.radar.hubDanger(flag);
  } catch (_e) {
    marketState.dealsRisk = null;
  }
  if (marketState.mode === 'deals') renderMarketBody();
}

function riskInfoFor(haul) {
  if (!haul || !marketState.dealsRisk) return null;
  return marketState.dealsRisk[`${haul.from}\u2192${haul.to}`] || null;
}

function renderDeals(el) {
  if (marketState.dealsLoading) {
    el.innerHTML = '<div class="empty-state">Scanning hubs…</div>';
    return;
  }
  const rows = (marketState.dealsRows || []).slice();
  if (rows.length === 0) {
    el.innerHTML =
      '<div class="empty-state small">Pick a set to scan (Popular goods or your Watchlist). Shows Jita station-trade margin and the best buy-low/sell-high hauling route across the five hubs — now annotated with route danger and risk-adjusted profit.</div>';
    return;
  }
  // Risk-adjusted profit = haul profit discounted by the route's danger penalty.
  const adj = (r) => {
    if (!r.haul) return 0;
    const info = riskInfoFor(r.haul);
    return info ? r.haul.profit * (1 - info.penalty) : r.haul.profit;
  };
  if (marketState.dealsSort === 'haul') {
    rows.sort((a, b) => (b.haul ? b.haul.profit : 0) - (a.haul ? a.haul.profit : 0));
  } else if (marketState.dealsSort === 'risk') {
    rows.sort((a, b) => adj(b) - adj(a));
  } else {
    rows.sort((a, b) => b.stationMargin - a.stationMargin);
  }
  el.innerHTML = rows
    .map((r) => {
      let haul;
      if (r.haul) {
        const info = riskInfoFor(r.haul);
        const riskTag = info
          ? `<span class="deal-risk risk-${info.risk}" title="${info.jumps}j · ${info.hi}HS/${info.lo}LS/${info.ns}NS · ${info.kills} kills/hr${info.camp ? ' · camp on route!' : ''}">${info.risk}${info.camp ? ' ⚠' : ''}</span>`
          : '';
        const radj = info ? ` <span class="deal-adj muted">≈+${iskShortR(r.haul.profit * (1 - info.penalty))}</span>` : '';
        haul = `<span class="deal-haul">${r.haul.from}→${r.haul.to} +${iskShortR(r.haul.profit)}${radj}</span>${riskTag}`;
      } else {
        haul = '<span class="deal-haul muted">no haul</span>';
      }
      return `
      <button class="deal-row" data-id="${r.id}" data-name="${escapeAttr(r.name)}">
        <span class="deal-name">${r.name}</span>
        <span class="deal-station">stn ${r.stationMargin > 0 ? r.stationMargin.toFixed(1) + '%' : '—'}</span>
        ${haul}
      </button>`;
    })
    .join('');
  el.querySelectorAll('.deal-row').forEach((b) =>
    b.addEventListener('click', () => openDetail(Number(b.dataset.id), b.dataset.name))
  );
}

// ---- appraise ----
async function doAppraise(text) {
  marketState.appraising = true;
  marketState.appraiseData = null;
  renderMarketBody();
  try {
    marketState.appraiseData = await window.appraise.run(text);
  } catch (_e) {
    marketState.appraiseData = { lines: [], totalSell: 0, totalBuy: 0, unknown: 0 };
  }
  marketState.appraising = false;
  renderMarketBody();
}

function renderAppraise(el) {
  if (marketState.appraising) {
    el.innerHTML = '<div class="empty-state">Pricing items…</div>';
    return;
  }
  const d = marketState.appraiseData;
  if (!d) {
    el.innerHTML =
      '<div class="empty-state small">Paste a fit or shopping list above, then Appraise. Prices are Jita best sell (to buy) and best buy (to sell).</div>';
    return;
  }
  if (d.lines.length === 0) {
    el.innerHTML = '<div class="empty-state">Nothing recognized in that text.</div>';
    return;
  }
  const rows = d.lines
    .map((l) => {
      if (!l.found)
        return `<div class="apr-row notfound"><span class="apr-qty">${l.qty}×</span><span class="apr-name">${l.name}</span><span class="apr-val muted">not found</span></div>`;
      return `<div class="apr-row"><span class="apr-qty">${l.qty}×</span><span class="apr-name">${l.name}</span><span class="apr-val">${priceFmt(l.sellTotal)}</span></div>`;
    })
    .join('');
  el.innerHTML = `
    <div class="apr-totals">
      <div class="apr-total"><span class="label">Buy all (sell orders)</span><span class="value">${priceFmt(d.totalSell)}</span></div>
      <div class="apr-total"><span class="label">Sell all (buy orders)</span><span class="value">${priceFmt(d.totalBuy)}</span></div>
    </div>
    ${d.unknown ? `<div class="empty-state small">${d.unknown} line(s) not matched to a market item.</div>` : ''}
    <div class="apr-list">${rows}</div>
  `;
}

// ---- watchlist ----
async function loadWatch() {
  if (!window.watch) return;
  marketState.watchLoading = true;
  try {
    marketState.watchItems = await window.watch.list();
  } catch (_e) {
    marketState.watchItems = [];
  }
  marketState.watchLoading = false;
  if (marketState.mode === 'watch') renderMarketBody();
}

function renderWatch(el) {
  if (marketState.watchLoading && marketState.watchItems.length === 0) {
    el.innerHTML = '<div class="empty-state">Loading watchlist…</div>';
    return;
  }
  const items = marketState.watchItems || [];
  if (items.length === 0) {
    el.innerHTML =
      '<div class="empty-state small">No items watched yet. Open any item (Search or Browse) and hit “Watch”, then set a target price here for desktop alerts.</div>';
    return;
  }
  el.innerHTML = items
    .map((w) => {
      const dirLabel = w.dir === 'above' ? 'sell ≥' : 'buy ≤';
      return `
      <div class="watch-row" data-id="${w.id}">
        <div class="watch-main">
          <span class="watch-name">${w.name}</span>
          <span class="watch-price muted">sell ${priceFmt(w.sellMin)} · buy ${priceFmt(w.buyMax)}</span>
        </div>
        <div class="watch-target">
          <select class="watch-dir" data-id="${w.id}">
            <option value="below"${w.dir !== 'above' ? ' selected' : ''}>buy ≤</option>
            <option value="above"${w.dir === 'above' ? ' selected' : ''}>sell ≥</option>
          </select>
          <input class="watch-input" data-id="${w.id}" type="number" placeholder="target ISK" value="${w.target != null ? w.target : ''}" />
          <button class="watch-del" data-id="${w.id}" title="Remove">✕</button>
        </div>
      </div>`;
    })
    .join('');

  const saveTarget = (id) => {
    const inp = el.querySelector(`.watch-input[data-id="${id}"]`);
    const sel = el.querySelector(`.watch-dir[data-id="${id}"]`);
    window.watch.setTarget(Number(id), inp.value, sel.value).then(loadWatch);
  };
  el.querySelectorAll('.watch-input').forEach((inp) => {
    inp.addEventListener('change', () => saveTarget(inp.dataset.id));
  });
  el.querySelectorAll('.watch-dir').forEach((sel) => {
    sel.addEventListener('change', () => saveTarget(sel.dataset.id));
  });
  el.querySelectorAll('.watch-del').forEach((b) => {
    b.addEventListener('click', () => {
      window.watch.remove(Number(b.dataset.id)).then(loadWatch);
    });
  });
}

// ---- item detail ----
function detailHtml() {
  if (marketState.loading) return '<div class="empty-state">Fetching live prices…</div>';
  if (marketState.error)
    return `<div class="mkt-detail-bar"><button class="link-btn" id="mkt-back">← Back</button></div><div class="me-error">${marketState.error}</div>`;
  const d = marketState.data;
  if (!d) return '<div class="empty-state">No data.</div>';
  return `
    <div class="mkt-detail-bar">
      <button class="link-btn" id="mkt-back">← Back</button>
      <button class="link-btn" id="mkt-watch">+ Watch</button>
    </div>
    <div class="mkt-head">
      <img class="mkt-icon" src="${d.icon}" alt="" onerror="this.style.display='none'" />
      <div>
        <div class="mkt-name">${d.type.name}</div>
        <div class="mkt-id muted">type #${d.type.id} · updated ${timeAgo(d.fetchedAt)}</div>
      </div>
    </div>
    ${marketSummaryHtml(d)}
    <div class="mkt-detail-wide">
      ${marketHubsHtml(d)}
      ${marketHistoryHtml(d)}
    </div>
  `;
}

async function openDetail(id, name) {
  marketState.detailOpen = true;
  marketState.loading = true;
  marketState.error = '';
  marketState.data = null;
  renderMarketBody();
  try {
    marketState.data = await window.market.lookupById(id, name);
  } catch (err) {
    marketState.error = err.message || String(err);
  }
  marketState.loading = false;
  renderMarketBody();
}

async function openDetailByName(name) {
  marketState.detailOpen = true;
  marketState.loading = true;
  marketState.error = '';
  marketState.data = null;
  renderMarketBody();
  try {
    marketState.data = await window.market.lookup(name);
  } catch (err) {
    marketState.error = err.message || String(err);
  }
  marketState.loading = false;
  renderMarketBody();
}

// ---- shared item rows + lazy prices ----
function itemRowHtml(id, name) {
  const p = marketState.prices[id];
  const sell = p ? priceFmt(p.sellMin) : '<span class="muted">…</span>';
  const buy = p ? priceFmt(p.buyMax) : '<span class="muted">…</span>';
  const icon = `https://images.evetech.net/types/${id}/icon?size=32`;
  return `<button class="mkt-item" data-id="${id}" data-name="${escapeAttr(name)}">
      <img class="mkt-item-icon" src="${icon}" alt="" onerror="this.style.visibility='hidden'" />
      <span class="mkt-item-name">${name}</span>
      <span class="mkt-item-price"><span class="s">${sell}</span><span class="b">${buy}</span></span>
    </button>`;
}

function wireItemRows(el) {
  el.querySelectorAll('.mkt-item').forEach((b) =>
    b.addEventListener('click', () => openDetail(Number(b.dataset.id), b.dataset.name))
  );
}

async function ensurePrices(ids) {
  const missing = ids.filter((id) => !(id in marketState.prices));
  if (missing.length === 0) return;
  missing.forEach((id) => {
    marketState.prices[id] = null; // pending
  });
  let map = {};
  try {
    map = await window.market.groupPrices(missing);
  } catch (_e) {
    map = {};
  }
  missing.forEach((id) => {
    marketState.prices[id] = map[id] || { sellMin: 0, buyMax: 0 };
  });
  renderMarketBody();
}

// ---- search results ----
async function doSearch(q) {
  const query = (q || '').trim();
  marketState.query = query;
  if (!query) {
    marketState.results = [];
    renderMarketBody();
    return;
  }
  marketState.searching = true;
  renderMarketBody();
  try {
    marketState.results = await window.market.search(query);
  } catch (_e) {
    marketState.results = [];
  }
  marketState.searching = false;
  renderMarketBody();
}

function renderSearchResults(el) {
  if (marketState.searching && marketState.results.length === 0) {
    el.innerHTML = '<div class="empty-state">Searching…</div>';
    return;
  }
  if (!marketState.query) {
    el.innerHTML =
      '<div class="empty-state">Search any item, or use <b>Browse all</b> to walk the entire market tree. Building the catalog (in Browse all) enables instant full-text search across every item.</div>';
    return;
  }
  if (marketState.results.length === 0) {
    el.innerHTML =
      '<div class="empty-state">No matches. If you haven’t built the market catalog yet, open <b>Browse all</b> and build it to search every item by name.</div>';
    return;
  }
  el.innerHTML = `<div class="mkt-list">${marketState.results
    .map((r) => itemRowHtml(r.id, r.name))
    .join('')}</div>`;
  wireItemRows(el);
  ensurePrices(marketState.results.map((r) => r.id));
}

// ---- browse the full catalog ----
async function loadCatalog() {
  if (!window.market) return;
  try {
    marketState.catStatus = await window.market.catalogStatus();
  } catch (_e) {
    /* ignore */
  }
  if (marketState.catStatus && marketState.catStatus.ready && !marketState.catalog) {
    try {
      marketState.catalog = await window.market.getCatalog();
    } catch (_e) {
      /* ignore */
    }
  }
}

function itemName(id) {
  const c = marketState.catalog;
  return (c && c.typeNames && c.typeNames[id]) || `Type ${id}`;
}

function currentLevel() {
  const cat = marketState.catalog;
  const gid = marketState.path.length ? marketState.path[marketState.path.length - 1] : null;
  const childIds = gid != null ? (cat.groups[gid] ? cat.groups[gid].childIds : []) : cat.roots;
  const itemIds = gid != null ? (cat.groups[gid] ? cat.groups[gid].typeIds : []) : [];
  return { groups: childIds.map((id) => cat.groups[id]).filter(Boolean), items: itemIds };
}

function startCatalogBuild() {
  window.market.buildCatalog().then((st) => {
    marketState.catStatus = st;
  });
  clearInterval(marketState.pollTimer);
  marketState.pollTimer = setInterval(async () => {
    await loadCatalog();
    if (marketState.catalog) {
      clearInterval(marketState.pollTimer);
      marketState.pollTimer = null;
    }
    renderMarketTop();
    renderMarketBody();
  }, 1200);
  renderMarketBody();
}

function renderBrowse(el) {
  const cat = marketState.catalog;
  const st = marketState.catStatus;

  if (!cat) {
    if (st && st.building) {
      const pct = st.total ? Math.round((st.done / st.total) * 100) : 0;
      el.innerHTML = `
        <div class="mkt-build">
          <div class="section-label">Building market catalog…</div>
          <div class="progress"><div class="bar" style="width:${pct}%"></div></div>
          <div class="muted">${(st.done || 0).toLocaleString()} / ${(st.total || 0).toLocaleString()} categories · then resolving item names…</div>
        </div>`;
      return;
    }
    el.innerHTML = `
      <div class="mkt-build">
        <p class="setup-text">Browse <b>every item on the market</b>, organized exactly like the in-game Market window. This fetches the full category tree and all item names once (~15,000 items) and caches it locally — about a minute.</p>
        <button class="primary-btn" id="mkt-build-btn">Build full market catalog</button>
        ${st && st.error ? `<div class="setup-msg">${st.error}</div>` : ''}
      </div>`;
    el.querySelector('#mkt-build-btn').addEventListener('click', startCatalogBuild);
    return;
  }

  const { groups, items } = currentLevel();
  if (groups.length === 0 && items.length === 0) {
    el.innerHTML = '<div class="empty-state">This category is empty.</div>';
    return;
  }

  const folderHtml = groups
    .map(
      (g) =>
        `<button class="mkt-folder" data-gid="${g.id}"><span class="fold-name">${g.name}</span><span class="fold-arrow">›</span></button>`
    )
    .join('');
  const sortedItems = items.slice().sort((a, b) => itemName(a).localeCompare(itemName(b)));
  const itemsHtml = sortedItems.map((id) => itemRowHtml(id, itemName(id))).join('');

  el.innerHTML = `
    ${folderHtml ? `<div class="mkt-folders">${folderHtml}</div>` : ''}
    ${itemsHtml ? `<div class="mkt-list">${itemsHtml}</div>` : ''}
  `;

  el.querySelectorAll('.mkt-folder').forEach((b) =>
    b.addEventListener('click', () => {
      marketState.path.push(Number(b.dataset.gid));
      marketState.detailOpen = false;
      renderMarketTop();
      renderMarketBody();
    })
  );
  wireItemRows(el);
  if (sortedItems.length) ensurePrices(sortedItems);
}

function marketSummaryHtml(d) {
  const s = d.summary || {};
  const cards = [];
  cards.push(
    s.cheapest
      ? `<div class="mkt-sum"><div class="lbl">Cheapest to buy</div><div class="val">${s.cheapest.name}</div><div class="sub">${priceFmt(s.cheapest.price)}</div></div>`
      : `<div class="mkt-sum"><div class="lbl">Cheapest to buy</div><div class="val muted">—</div><div class="sub muted">no sell orders</div></div>`
  );
  cards.push(
    s.bestSell
      ? `<div class="mkt-sum"><div class="lbl">Best place to sell</div><div class="val">${s.bestSell.name}</div><div class="sub">${priceFmt(s.bestSell.price)}</div></div>`
      : `<div class="mkt-sum"><div class="lbl">Best place to sell</div><div class="val muted">—</div><div class="sub muted">no buy orders</div></div>`
  );
  if (s.arbitrage) {
    const a = s.arbitrage;
    cards.push(
      `<div class="mkt-sum arb"><div class="lbl">Hauling profit</div><div class="val">${a.buyHub} → ${a.sellHub}</div><div class="sub">+${priceFmt(a.profitPerUnit)} / unit · ${a.marginPct.toFixed(1)}%</div></div>`
    );
  } else {
    cards.push(
      `<div class="mkt-sum"><div class="lbl">Hauling profit</div><div class="val muted">none</div><div class="sub muted">buy ≥ sell across hubs</div></div>`
    );
  }
  return `<div class="mkt-summary">${cards.join('')}</div>`;
}

function marketHubsHtml(d) {
  const s = d.summary || {};
  const rows = d.hubs
    .map((h) => {
      if (!h.ok || (!h.sellMin && !h.buyMax)) {
        return `<tr class="mkt-row off"><td class="hub">${h.name}</td><td class="muted" colspan="5">no orders</td></tr>`;
      }
      const cheap = s.cheapest && s.cheapest.name === h.name ? ' best' : '';
      const rich = s.bestSell && s.bestSell.name === h.name ? ' best' : '';
      return `<tr class="mkt-row">
        <td class="hub">${h.name}</td>
        <td class="sell${cheap}">${priceFmt(h.sellMin)}</td>
        <td class="buy${rich}">${priceFmt(h.buyMax)}</td>
        <td>${h.spread > 0 ? priceFmt(h.spread) : '—'}</td>
        <td>${h.margin > 0 ? h.margin.toFixed(1) + '%' : '—'}</td>
        <td class="vol">${volFmt(h.sellVolume)} / ${volFmt(h.buyVolume)}</td>
      </tr>`;
    })
    .join('');

  return `
    <table class="mkt-table">
      <thead>
        <tr>
          <th>Hub</th>
          <th>Sell (you pay)</th>
          <th>Buy (you get)</th>
          <th>Spread</th>
          <th>Margin</th>
          <th>Vol S/B</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="mkt-legend">
      <b>Sell</b> = lowest sell order (instant buy price) ·
      <b>Buy</b> = highest buy order (instant sell price) ·
      <b>Margin</b> = station-trade profit between them.
    </div>
  `;
}

function marketHistoryHtml(d) {
  const h = d.history;
  if (!h) return '';
  const hasSeries = Array.isArray(h.series) && h.series.length > 1;
  return `
    <div class="section-label">Jita price history</div>
    ${hasSeries ? '<canvas id="price-chart" class="price-chart"></canvas>' : ''}
    <div class="stat-grid">
      ${statBox('Avg price (30d)', priceFmt(h.avg30Price))}
      ${statBox('Daily volume (30d)', volFmt(h.avg30Volume))}
      ${statBox('Latest daily avg', priceFmt(h.average))}
      ${statBox('Day high / low', priceFmt(h.highest) + ' / ' + priceFmt(h.lowest))}
    </div>
  `;
}

function drawPriceChart(series) {
  const canvas = document.getElementById('price-chart');
  if (!canvas || !series || series.length < 2) return;
  const cssW = canvas.clientWidth || 380;
  const cssH = 90;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const padL = 4;
  const padR = 4;
  const padT = 6;
  const padB = 14;
  const w = cssW - padL - padR;
  const volH = 22;
  const priceH = cssH - padT - padB - volH;

  const prices = series.map((s) => s.average).filter((p) => p > 0);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const maxV = Math.max(...series.map((s) => s.volume), 1);
  const n = series.length;
  const xAt = (i) => padL + (w * i) / (n - 1);
  const yAt = (p) => padT + priceH - (priceH * (p - minP)) / (maxP - minP || 1);

  // Volume bars.
  ctx.fillStyle = 'rgba(99,197,240,0.25)';
  const bw = Math.max(1, w / n - 0.5);
  series.forEach((s, i) => {
    const bh = (volH * s.volume) / maxV;
    ctx.fillRect(xAt(i) - bw / 2, padT + priceH + volH - bh, bw, bh);
  });

  // Price line.
  ctx.strokeStyle = 'rgba(120,220,160,0.95)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  let started = false;
  series.forEach((s, i) => {
    if (!(s.average > 0)) return;
    const x = xAt(i);
    const y = yAt(s.average);
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Min/max labels.
  ctx.fillStyle = 'rgba(150,180,200,0.8)';
  ctx.font = '9px sans-serif';
  ctx.fillText(priceFmt(maxP), padL, padT + 8);
  ctx.fillText(priceFmt(minP), padL, padT + priceH);
}

// ---------- Map / conflict-intel tab ----------
const mapState = {
  loading: false,
  building: false,
  error: '',
  data: null, // { systems, regions, stations }
  live: null,
  liveLoading: false,
  layers: { kills: true, sov: true, incursions: true, fw: true, live: true, radar: true, stations: false },
  proj: null,
  points: [],
  killsBySys: {},
  killsDetailBySys: {},
  jumpsBySys: {},
  campaignBySys: {},
  fwBySys: {},
  incursionBySys: {},
  stationsBySys: {},
  liveKills: [],
  selectedSystem: null,
  killFeedTimer: null,
  refreshTimer: null,
  resizeHooked: false,
  view: { zoom: 1, panX: 0, panY: 0 }, // screen-space pan/zoom on top of base fit
  focus: null, // { x, z, label } world-space marker
  anim: 0,
  drag: null, // { startX, startY, panX, panY, moved }
  route: { from: '', to: '', flag: 'shortest', ids: [], loading: false, error: '' },
  radar: null, // { ready, loggedIn, location, nearby, battles }
  radarLoading: false,
  radarRange: 5,
  radarTimer: null,
  ratting: null,
  rattingLoading: false,
  dockTab: 'zkill',
  dockUrl: '',
  dockHooked: false,
  _dockNavTimer: null
};

const KSPACE_MAX_REGION = 11000000; // regions >= this are wormhole/abyssal
const MAP_PAD = 10;
const MAP_MIN_ZOOM = 1;
const MAP_MAX_ZOOM = 60;

// ---------- Shell mode (overlay vs desktop) + responsive layout tiers ----------
const shellState = { mode: 'overlay', tier: 'compact' };

function isDesktopMode() {
  return shellState.mode === 'desktop';
}

function isLayoutAtLeast(minTier) {
  const order = { compact: 0, medium: 1, wide: 2, ultra: 3 };
  return (order[shellState.tier] || 0) >= (order[minTier] || 0);
}

function mapCanvasHeight() {
  const tier = shellState.tier;
  const vh = window.innerHeight || 640;
  if (isDesktopMode()) {
    if (tier === 'ultra') return Math.max(380, Math.min(780, Math.round(vh * 0.58)));
    if (tier === 'wide') return Math.max(300, Math.min(560, Math.round(vh * 0.48)));
    if (tier === 'medium') return Math.max(260, Math.min(420, Math.round(vh * 0.38)));
    return 280;
  }
  if (tier === 'wide' || tier === 'ultra') return 420;
  if (tier === 'medium') return 360;
  return 300;
}

function updateLayoutTier() {
  const w = document.documentElement.clientWidth || 430;
  let tier = 'compact';
  if (w >= 1400) tier = 'ultra';
  else if (w >= 1000) tier = 'wide';
  else if (w >= 700) tier = 'medium';
  shellState.tier = tier;
  document.documentElement.dataset.tier = tier;
  document.documentElement.dataset.mode = shellState.mode;
  const badge = document.getElementById('layout-tier');
  if (badge) {
    badge.textContent =
      (isDesktopMode() ? 'Desktop' : 'Overlay') + ' · ' + tier;
  }
  if (document.getElementById('galaxy-canvas')) drawMap();
  if (mapState.selectedSystem) renderSysInfo();
}

function updateExpandButton() {
  const btn = document.getElementById('expand-btn');
  if (!btn) return;
  if (isDesktopMode()) {
    btn.textContent = 'Compact';
    btn.title = 'Shrink back to small overlay size (Alt+Shift+D)';
    btn.classList.add('expanded');
  } else {
    btn.textContent = 'Expand';
    btn.title = 'Larger intel layout on this screen — not fullscreen (Alt+Shift+D)';
    btn.classList.remove('expanded');
  }
}

async function applyShellMode(mode) {
  shellState.mode = mode === 'desktop' ? 'desktop' : 'overlay';
  document.body.classList.remove('mode-overlay', 'mode-desktop');
  document.body.classList.add(isDesktopMode() ? 'mode-desktop' : 'mode-overlay');
  updateExpandButton();
  updateStatus(false);
  updateLayoutTier();
  const mapView = document.getElementById('map-view');
  if (mapView && mapView.classList.contains('active')) renderMap();
  if (mapState.selectedSystem) renderSysInfo();
}

async function initShellMode() {
  if (window.shell && window.shell.getMode) {
    try {
      shellState.mode = (await window.shell.getMode()) || 'overlay';
    } catch (_e) {
      shellState.mode = 'overlay';
    }
  }
  await applyShellMode(shellState.mode);
  if (window.shell && window.shell.onModeChanged) {
    window.shell.onModeChanged((mode) => applyShellMode(mode));
  }
  if (!shellState._resizeHooked) {
    window.addEventListener('resize', updateLayoutTier);
    shellState._resizeHooked = true;
  }
}

function renderMap() {
  const root = document.getElementById('map-view');
  if (!window.galaxy) {
    root.innerHTML = '<div class="empty-state">Map bridge unavailable.</div>';
    return;
  }

  mapState.dockUrl = '';

  root.innerHTML = `
    <header class="page-head hud-module-head map-page-head">
      <div class="hud-module-title-row">
        <span class="hud-module-glyph" aria-hidden="true"></span>
        <h1 class="page-title">Map</h1>
        <span class="hud-module-line" aria-hidden="true"></span>
        <div class="map-head-actions">
          <span id="map-updated" class="muted"></span>
          <button type="button" class="mini-btn" id="map-refresh">Refresh</button>
        </div>
      </div>
      <p class="page-lead">Live kills, sov, FW, incursions, routes, and zKill feed — no login required.</p>
    </header>
    <div id="map-status" class="map-status"></div>
    <div class="map-search-row">
      <input id="map-search" class="search-box" type="text" placeholder="Find a system or region…" autocomplete="off" />
      <button class="mini-btn" id="map-reset" title="Reset view">Reset</button>
      <div id="map-search-results" class="map-search-results"></div>
    </div>
    <div class="route-row">
      <input id="route-from" class="search-box route-input" type="text" placeholder="From system" value="${escapeAttr(mapState.route.from)}" />
      <input id="route-to" class="search-box route-input" type="text" placeholder="To system" value="${escapeAttr(mapState.route.to)}" />
      <select id="route-flag" class="route-flag">
        <option value="shortest"${mapState.route.flag === 'shortest' ? ' selected' : ''}>fastest</option>
        <option value="secure"${mapState.route.flag === 'secure' ? ' selected' : ''}>safer</option>
        <option value="insecure"${mapState.route.flag === 'insecure' ? ' selected' : ''}>less safe</option>
      </select>
      <button class="mini-btn" id="route-go">Route</button>
    </div>
    <div id="route-info"></div>
    <div class="map-workspace">
      <div class="map-main-col">
        <div class="map-canvas-wrap">
          <canvas id="galaxy-canvas"></canvas>
          <div id="map-tip" class="map-tip" style="display:none"></div>
          <div class="map-zoom-hint muted">scroll to zoom · drag to pan · click a system</div>
        </div>
        <div id="map-sysinfo" class="map-sysinfo map-sysinfo-inline" style="display:none"></div>
        <div class="map-layers" id="map-layers"></div>
        <div class="map-legend">
          <span class="lg lg-kill">kills/hr</span>
          <span class="lg lg-sov">sov fight</span>
          <span class="lg lg-inc">incursion</span>
          <span class="lg lg-fw">FW front</span>
          <span class="lg lg-live">live kill</span>
          <span class="lg lg-you">you</span>
        </div>
      </div>
      <aside class="map-side-dock tier-wide tier-ultra">
        <div class="dock-head">
          <span class="section-label">External intel</span>
          <div class="dock-tabs">
            <button type="button" class="dock-tab active" data-dock="zkill">zKillboard</button>
            <button type="button" class="dock-tab" data-dock="dotlan">Dotlan</button>
            <button type="button" class="dock-tab" data-dock="intel">Summary</button>
          </div>
        </div>
        <div id="map-sysinfo-dock" class="map-sysinfo map-sysinfo-dock"></div>
        <div id="map-dock-empty" class="dock-empty">Select a system on the map to load zKillboard or Dotlan here.</div>
        <webview id="map-dock-webview" class="dock-webview" partition="eve-intel-dock" allowpopups="false" webpreferences="contextIsolation=yes,javascript=yes,images=yes"></webview>
        <div class="dock-hint muted tier-ultra">Select a system on the map — zKillboard &amp; Dotlan load here so you never leave the app.</div>
      </aside>
    </div>
    <div class="map-lower tier-wide tier-ultra">
      <div class="map-lower-grid">
        <div id="map-radar"></div>
        <div id="map-ratting"></div>
      </div>
      <div id="map-panels"></div>
      <div id="map-killfeed"></div>
    </div>
  `;

  document.getElementById('map-refresh').addEventListener('click', () => {
    loadLive(true);
    pollKills();
    loadRadar(true);
    loadRatting(true);
  });
  document.getElementById('map-reset').addEventListener('click', resetView);
  document.getElementById('route-go').addEventListener('click', findRoute);
  document.getElementById('route-flag').addEventListener('change', (e) => {
    mapState.route.flag = e.target.value;
  });
  renderLayers();
  setupMapInteractions();
  setupMapSearch();
  renderRouteInfo();

  if (!mapState.resizeHooked) {
    window.addEventListener('resize', () => {
      if (document.getElementById('galaxy-canvas')) {
        resetView();
      }
    });
    mapState.resizeHooked = true;
  }

  clearInterval(mapState.refreshTimer);
  mapState.refreshTimer = setInterval(() => {
    if (mapState.data) loadLive(true);
  }, 5 * 60 * 1000);

  clearInterval(mapState.killFeedTimer);
  mapState.killFeedTimer = setInterval(pollKills, 6000);
  pollKills();

  clearInterval(mapState.radarTimer);
  mapState.radarTimer = setInterval(() => {
    if (mapState.data) loadRadar(true);
  }, 60 * 1000);

  renderRadar();
  renderRatting();
  setupMapDock();

  ensureMapData();
}

function setupMapDock() {
  mapState.dockTab = mapState.dockTab || 'zkill';
  const root = document.getElementById('map-view');
  if (!root) return;

  root.querySelectorAll('.dock-tab').forEach((b) => {
    b.classList.toggle('active', b.dataset.dock === mapState.dockTab);
  });

  if (!mapState.dockHooked) {
    mapState.dockHooked = true;
    root.addEventListener('click', (e) => {
      const tab = e.target.closest('.dock-tab');
      if (!tab || !root.contains(tab)) return;
      mapState.dockTab = tab.dataset.dock;
      root.querySelectorAll('.dock-tab').forEach((t) =>
        t.classList.toggle('active', t.dataset.dock === mapState.dockTab)
      );
      updateMapDock();
      renderSysInfo();
    });
  }

  const wv = document.getElementById('map-dock-webview');
  if (wv && !wv.dataset.failHooked) {
    wv.dataset.failHooked = '1';
    // -3 = aborted (navigation cancelled). Subframe ad failures are blocked in main process.
    wv.addEventListener('did-fail-load', (e) => {
      if (e.errorCode === -3 || e.isMainFrame === false) return;
      if (e.validatedURL && /measureadv|omnitagjs|programmaticx|yellowblue|iqzone/i.test(e.validatedURL)) {
        return;
      }
    });
  }

  updateMapDock();
}

function updateMapDock() {
  clearTimeout(mapState._dockNavTimer);
  mapState._dockNavTimer = setTimeout(updateMapDockNow, 100);
}

function updateMapDockNow() {
  const wv = document.getElementById('map-dock-webview');
  const dockIntel = document.getElementById('map-sysinfo-dock');
  const empty = document.getElementById('map-dock-empty');
  if (!wv) return;

  const tab = mapState.dockTab || 'zkill';
  const wide = isLayoutAtLeast('wide');
  const showWebTab = (tab === 'zkill' || tab === 'dotlan') && wide;
  const showIntel =
    tab === 'intel' && wide && mapState.selectedSystem && mapState.data;

  if (dockIntel) dockIntel.style.display = showIntel ? 'block' : 'none';

  let url = '';
  if (showWebTab && mapState.selectedSystem && mapState.data) {
    const s = mapState.data.systems[mapState.selectedSystem];
    if (s) {
      const name = (s.n || '').replace(/ /g, '_');
      if (tab === 'zkill') {
        url = `https://zkillboard.com/system/${mapState.selectedSystem}/`;
      } else if (tab === 'dotlan') {
        url = `https://evemaps.dotlan.net/system/${encodeURIComponent(name)}`;
      }
    }
  }

  if (!showWebTab) {
    wv.style.display = 'none';
    if (empty) empty.style.display = 'none';
    mapState.dockUrl = '';
    return;
  }

  if (!url) {
    wv.style.display = 'none';
    if (empty) empty.style.display = 'flex';
    mapState.dockUrl = '';
    return;
  }

  if (empty) empty.style.display = 'none';
  wv.style.display = 'flex';

  if (mapState.dockUrl === url) return;
  mapState.dockUrl = url;

  try {
    wv.src = url;
  } catch (_e) {
    /* ignore navigation errors */
  }
}

function renderLayers() {
  const el = document.getElementById('map-layers');
  if (!el) return;
  const defs = [
    ['kills', 'Kill heat'],
    ['sov', 'Sov fights'],
    ['incursions', 'Incursions'],
    ['fw', 'FW front'],
    ['live', 'Live kills'],
    ['radar', 'Threat radar'],
    ['stations', 'Stations']
  ];
  el.innerHTML = defs
    .map(([k, label]) => `<button class="chip${mapState.layers[k] ? ' active' : ''}" data-layer="${k}">${label}</button>`)
    .join('');
  el.querySelectorAll('.chip').forEach((b) =>
    b.addEventListener('click', () => {
      mapState.layers[b.dataset.layer] = !mapState.layers[b.dataset.layer];
      renderLayers();
      drawMap();
    })
  );
}

async function ensureMapData() {
  const status = document.getElementById('map-status');
  if (mapState.data) {
    if (status) status.textContent = '';
    computeProjection();
    drawMap();
    loadLive();
    loadRadar();
    loadRatting();
    return;
  }
  mapState.loading = true;
  try {
    const st = await window.galaxy.systemsStatus();
    if (!st.ready) {
      mapState.building = true;
      if (status) status.textContent = 'Downloading galaxy map data (one-time, ~3 MB)…';
      mapState.data = await window.galaxy.buildSystems();
      mapState.building = false;
    } else {
      if (status) status.textContent = 'Loading map…';
      mapState.data = await window.galaxy.getSystems();
    }
  } catch (err) {
    mapState.loading = false;
    mapState.error = err.message || String(err);
    if (status) status.textContent = 'Could not load map data: ' + mapState.error;
    return;
  }
  mapState.loading = false;
  if (status) status.textContent = '';
  precomputeStations();
  computeProjection();
  drawMap();
  loadLive();
  loadRadar();
  loadRatting();
}

function precomputeStations() {
  mapState.stationsBySys = {};
  (mapState.data.stations || []).forEach((s) => {
    mapState.stationsBySys[s.sys] = (mapState.stationsBySys[s.sys] || 0) + 1;
  });
}

function computeProjection() {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const sys = mapState.data.systems;
  for (const id in sys) {
    const s = sys[id];
    if (s.r >= KSPACE_MAX_REGION) continue;
    if (s.x < minX) minX = s.x;
    if (s.x > maxX) maxX = s.x;
    if (s.z < minZ) minZ = s.z;
    if (s.z > maxZ) maxZ = s.z;
  }
  mapState.proj = { minX, maxX, minZ, maxZ };
}

// Base fit (zoom 1, no pan).
function baseX(s, w, pad) {
  const p = mapState.proj;
  const span = p.maxX - p.minX || 1;
  return pad + ((s.x - p.minX) / span) * (w - 2 * pad);
}
function baseY(s, h, pad) {
  const p = mapState.proj;
  const span = p.maxZ - p.minZ || 1;
  return pad + ((p.maxZ - s.z) / span) * (h - 2 * pad);
}

// Apply the interactive pan/zoom on top of the base fit.
function projX(s, w, pad) {
  return baseX(s, w, pad) * mapState.view.zoom + mapState.view.panX;
}
function projY(s, h, pad) {
  return baseY(s, h, pad) * mapState.view.zoom + mapState.view.panY;
}

function secColor(s) {
  if (s >= 0.5) return 'rgba(90,175,150,0.75)';
  if (s > 0) return 'rgba(205,150,70,0.6)';
  return 'rgba(190,85,85,0.55)';
}

function ring(ctx, x, y, color, r) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}

function drawMap() {
  const canvas = document.getElementById('galaxy-canvas');
  if (!canvas || !mapState.data || !mapState.proj) return;
  const wrap = canvas.parentElement;
  const cssW = wrap.clientWidth || 398;
  const cssH = mapCanvasHeight();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  ctx.fillStyle = 'rgba(4,8,12,0.55)';
  ctx.fillRect(0, 0, cssW, cssH);

  const pad = MAP_PAD;
  const sys = mapState.data.systems;
  mapState.points = [];

  for (const id in sys) {
    const s = sys[id];
    if (s.r >= KSPACE_MAX_REGION) continue;
    const sx = projX(s, cssW, pad);
    const sy = projY(s, cssH, pad);
    ctx.fillStyle = secColor(s.s);
    ctx.fillRect(sx, sy, 1, 1);
    mapState.points.push({ sx, sy, id: Number(id) });
  }

  if (mapState.layers.stations) {
    ctx.fillStyle = 'rgba(120,190,240,0.5)';
    for (const id in mapState.stationsBySys) {
      const s = sys[id];
      if (!s || s.r >= KSPACE_MAX_REGION) continue;
      ctx.fillRect(projX(s, cssW, pad) - 0.5, projY(s, cssH, pad) - 0.5, 2, 2);
    }
  }

  const live = mapState.live;
  if (live) {
    if (mapState.layers.kills) {
      ctx.globalCompositeOperation = 'lighter';
      live.kills.forEach((k) => {
        const s = sys[k.system_id];
        if (!s || s.r >= KSPACE_MAX_REGION) return;
        const total = (k.ship_kills || 0) + (k.pod_kills || 0);
        if (total <= 0) return;
        const sx = projX(s, cssW, pad);
        const sy = projY(s, cssH, pad);
        const rad = Math.min(20, 3 + Math.sqrt(total) * 2.2);
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, rad);
        g.addColorStop(0, 'rgba(255,95,60,0.55)');
        g.addColorStop(1, 'rgba(255,95,60,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(sx, sy, rad, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalCompositeOperation = 'source-over';
    }
    if (mapState.layers.incursions) {
      live.incursions.forEach((i) => {
        const s = sys[i.stagingSystemId];
        if (!s) return;
        ring(ctx, projX(s, cssW, pad), projY(s, cssH, pad), 'rgba(185,115,255,0.9)', 5);
      });
    }
    if (mapState.layers.fw) {
      ctx.fillStyle = 'rgba(240,170,60,0.95)';
      live.fw.forEach((f) => {
        const s = sys[f.systemId];
        if (!s) return;
        ctx.fillRect(projX(s, cssW, pad) - 1, projY(s, cssH, pad) - 1, 3, 3);
      });
    }
    if (mapState.layers.sov) {
      live.campaigns.forEach((c) => {
        const s = sys[c.systemId];
        if (!s) return;
        ring(ctx, projX(s, cssW, pad), projY(s, cssH, pad), 'rgba(255,70,70,1)', 5);
      });
    }
  }

  // Live kills (zKillboard) — bright recent-kill dots.
  if (mapState.layers.live && mapState.liveKills && mapState.liveKills.length) {
    ctx.fillStyle = 'rgba(255,120,230,0.95)';
    mapState.liveKills.forEach((k) => {
      const s = sys[k.systemId];
      if (!s || s.r >= KSPACE_MAX_REGION) return;
      const sx = projX(s, cssW, pad);
      const sy = projY(s, cssH, pad);
      ctx.beginPath();
      ctx.arc(sx, sy, 2.4, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // Planned route polyline.
  if (mapState.route.ids && mapState.route.ids.length > 1) {
    ctx.strokeStyle = 'rgba(130,235,255,0.9)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    let started = false;
    mapState.route.ids.forEach((id) => {
      const s = sys[id];
      if (!s) return;
      const x = projX(s, cssW, pad);
      const y = projY(s, cssH, pad);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else ctx.lineTo(x, y);
    });
    ctx.stroke();
    const endpoints = [mapState.route.ids[0], mapState.route.ids[mapState.route.ids.length - 1]];
    endpoints.forEach((id) => {
      const s = sys[id];
      if (s) ring(ctx, projX(s, cssW, pad), projY(s, cssH, pad), 'rgba(130,235,255,1)', 6);
    });
  }

  // Near-me threat radar overlay: danger rings + the pilot's location.
  const rad = mapState.radar;
  if (mapState.layers.radar && rad && rad.location && sys[rad.location.id]) {
    (rad.nearby || []).forEach((n) => {
      const s = sys[n.id];
      if (!s || s.r >= KSPACE_MAX_REGION) return;
      const x = projX(s, cssW, pad);
      const y = projY(s, cssH, pad);
      const col = n.level >= 2 ? 'rgba(255,70,70,0.95)' : 'rgba(255,170,60,0.8)';
      ring(ctx, x, y, col, n.level >= 2 ? 6 : 4);
    });
    const ls = sys[rad.location.id];
    const lx = projX(ls, cssW, pad);
    const ly = projY(ls, cssH, pad);
    ring(ctx, lx, ly, 'rgba(120,235,180,1)', 8);
    ring(ctx, lx, ly, 'rgba(120,235,180,0.4)', 13);
  }

  // Selected-system highlight (sticky, from click/search).
  if (mapState.selectedSystem && sys[mapState.selectedSystem]) {
    const ss = sys[mapState.selectedSystem];
    ring(ctx, projX(ss, cssW, pad), projY(ss, cssH, pad), 'rgba(255,225,130,0.95)', 7);
  }

  // Searched-for place marker.
  if (mapState.focus) {
    const fx = projX(mapState.focus, cssW, pad);
    const fy = projY(mapState.focus, cssH, pad);
    ring(ctx, fx, fy, 'rgba(130,235,255,1)', 9);
    ring(ctx, fx, fy, 'rgba(130,235,255,0.45)', 14);
    ctx.fillStyle = 'rgba(190,242,255,1)';
    ctx.font = '11px Bahnschrift, Segoe UI, sans-serif';
    const label = mapState.focus.label || '';
    const tw = ctx.measureText(label).width;
    const lx = Math.min(fx + 13, cssW - tw - 4);
    ctx.fillText(label, lx, fy + 3);
  }
}

async function loadLive(force) {
  if (!window.galaxy || !mapState.data) return;
  mapState.liveLoading = true;
  renderMapPanels();
  try {
    mapState.live = await window.galaxy.live(!!force);
  } catch (_e) {
    /* keep old */
  }
  mapState.liveLoading = false;
  buildLiveIndexes();
  drawMap();
  renderMapPanels();
  renderSysInfo();
  const upd = document.getElementById('map-updated');
  if (upd && mapState.live) upd.textContent = 'updated ' + timeAgo(mapState.live.fetchedAt);
}

// Build fast per-system lookups from the live conflict snapshot so the hover
// tooltip + info card can show everything we know about any system instantly.
function buildLiveIndexes() {
  mapState.killsBySys = {};
  mapState.killsDetailBySys = {};
  mapState.jumpsBySys = {};
  mapState.campaignBySys = {};
  mapState.fwBySys = {};
  mapState.incursionBySys = {};
  const live = mapState.live;
  if (!live) return;
  (live.kills || []).forEach((k) => {
    mapState.killsBySys[k.system_id] = (k.ship_kills || 0) + (k.pod_kills || 0);
    mapState.killsDetailBySys[k.system_id] = {
      ship: k.ship_kills || 0,
      pod: k.pod_kills || 0,
      npc: k.npc_kills || 0
    };
  });
  (live.jumps || []).forEach((j) => {
    mapState.jumpsBySys[j.system_id] = j.ship_jumps || 0;
  });
  (live.campaigns || []).forEach((c) => {
    mapState.campaignBySys[c.systemId] = c;
  });
  (live.fw || []).forEach((f) => {
    mapState.fwBySys[f.systemId] = f;
  });
  (live.incursions || []).forEach((i) => {
    (i.infested || []).forEach((sid) => {
      mapState.incursionBySys[sid] = i;
    });
    if (i.stagingSystemId) mapState.incursionBySys[i.stagingSystemId] = i;
  });
}

function sysName(id) {
  const s = mapState.data && mapState.data.systems[id];
  return s ? s.n : 'Sys ' + id;
}
function regionName(id) {
  const s = mapState.data && mapState.data.systems[id];
  const rid = s ? s.r : null;
  return (rid && mapState.data.regions[rid]) || '';
}
function constName(id) {
  const s = mapState.data && mapState.data.systems[id];
  const cid = s ? s.c : null;
  return (cid && mapState.data.constellations && mapState.data.constellations[cid]) || '';
}

function secLabelClass(sec) {
  if (sec >= 0.5) return 'sec-hi';
  if (sec > 0) return 'sec-lo';
  return 'sec-ns';
}

// Aggregate EVERYTHING we know about a system from static + live + zKill data.
function buildSystemInfo(id) {
  const s = mapState.data && mapState.data.systems[id];
  if (!s) return null;
  const kd = mapState.killsDetailBySys[id];
  const jumps = mapState.jumpsBySys[id] || 0;
  const campaign = mapState.campaignBySys[id] || null;
  const fw = mapState.fwBySys[id] || null;
  const incursion = mapState.incursionBySys[id] || null;
  const stations = mapState.stationsBySys[id] || 0;
  const liveKills = (mapState.liveKills || []).filter((k) => k.systemId === id);
  return {
    id,
    name: s.n,
    region: regionName(id),
    constellation: constName(id),
    sec: s.s,
    kd,
    jumps,
    campaign,
    fw,
    incursion,
    stations,
    liveKills
  };
}

function sysTooltipHtml(info) {
  if (!info) return '';
  const secTxt = info.sec.toFixed(1);
  const rows = [];
  rows.push(
    `<div class="st-head"><b>${info.name}</b> <span class="${secLabelClass(info.sec)}">${secTxt}</span></div>`
  );
  rows.push(
    `<div class="st-sub">${info.region}${info.constellation ? ' · ' + info.constellation : ''}</div>`
  );
  const kd = info.kd;
  if (kd) {
    rows.push(
      `<div>Kills/hr: <b>${kd.ship + kd.pod}</b> <span class="muted">(${kd.ship} ship · ${kd.pod} pod · ${kd.npc} npc)</span></div>`
    );
  } else {
    rows.push('<div class="muted">No kills last hour</div>');
  }
  rows.push(`<div>Jumps/hr: <b>${info.jumps.toLocaleString()}</b> · ${info.stations} station${info.stations === 1 ? '' : 's'}</div>`);
  if (info.campaign) {
    const c = info.campaign;
    const total = (c.defenderScore || 0) + (c.attackersScore || 0);
    const def = total ? Math.round((c.defenderScore / total) * 100) : null;
    rows.push(`<div class="st-sov">⚑ Sov: ${c.type} · ${c.defender}${def != null ? ' (' + def + '% def)' : ''}</div>`);
  }
  if (info.fw) {
    const pct = info.fw.vpThreshold ? Math.round((info.fw.vp / info.fw.vpThreshold) * 100) : 0;
    rows.push(`<div class="st-fw">⚔ FW: ${info.fw.occupier} · ${info.fw.contested} ${pct}%</div>`);
  }
  if (info.incursion) {
    const infl = Math.round((info.incursion.influence || 0) * 100);
    rows.push(`<div class="st-inc">☣ Incursion: ${info.incursion.state} ${infl}%</div>`);
  }
  if (info.liveKills.length) {
    rows.push(`<div class="st-live">● ${info.liveKills.length} live zKill${info.liveKills.length === 1 ? '' : 's'} recent</div>`);
  }
  return rows.join('');
}

function selectSystem(id) {
  mapState.selectedSystem = id;
  renderSysInfo();
  drawMap();
}

function sysInfoHtml(info) {
  const kd = info.kd || { ship: 0, pod: 0, npc: 0 };
  const liveRows = info.liveKills
    .slice(0, isLayoutAtLeast('wide') ? 12 : 5)
    .map(
      (k) =>
        `<button class="si-kill" data-url="${k.url}"><span>${k.shipName || 'Ship'}</span><span class="muted">${iskShortR(k.value)}</span></button>`
    )
    .join('');
  return `
    <div class="si-head">
      <div class="si-title"><b>${info.name}</b> <span class="${secLabelClass(info.sec)}">${info.sec.toFixed(1)}</span></div>
      <button class="si-close" title="Close">✕</button>
    </div>
    <div class="si-sub muted">${info.region}${info.constellation ? ' · ' + info.constellation : ''}</div>
    <div class="si-grid">
      <div class="si-cell"><span class="si-k">Kills/hr</span><span class="si-v">${kd.ship + kd.pod}</span></div>
      <div class="si-cell"><span class="si-k">Pod / NPC</span><span class="si-v">${kd.pod} / ${kd.npc}</span></div>
      <div class="si-cell"><span class="si-k">Jumps/hr</span><span class="si-v">${info.jumps.toLocaleString()}</span></div>
      <div class="si-cell"><span class="si-k">Stations</span><span class="si-v">${info.stations}</span></div>
    </div>
    ${
      info.campaign
        ? `<div class="si-line si-sov">⚑ Sov campaign: ${info.campaign.type} · defender ${info.campaign.defender}</div>`
        : ''
    }
    ${
      info.fw
        ? `<div class="si-line si-fw">⚔ FW front: ${info.fw.occupier} · ${info.fw.contested} ${info.fw.vpThreshold ? Math.round((info.fw.vp / info.fw.vpThreshold) * 100) : 0}%</div>`
        : ''
    }
    ${
      info.incursion
        ? `<div class="si-line si-inc">☣ Incursion: ${info.incursion.state} · ${Math.round((info.incursion.influence || 0) * 100)}% influence${info.incursion.hasBoss ? ' · boss up' : ''}</div>`
        : ''
    }
    <div class="si-actions">
      <button class="mini-btn" data-act="from">Route from</button>
      <button class="mini-btn" data-act="to">Route to</button>
      <button class="mini-btn" data-act="dotlan">Dotlan ↗</button>
      <button class="mini-btn" data-act="zkill">zKill ↗</button>
      <button class="mini-btn tier-wide tier-ultra" data-act="dock-zkill">Dock zKill</button>
      <button class="mini-btn tier-wide tier-ultra" data-act="dock-dotlan">Dock Dotlan</button>
    </div>
    ${liveRows ? `<div class="si-live"><span class="section-label">Recent zKills here</span>${liveRows}</div>` : ''}
  `;
}

function bindSysInfoEl(el, info) {
  if (!el || !info) return;
  el.querySelector('.si-close').addEventListener('click', () => {
    mapState.selectedSystem = null;
    renderSysInfo();
    drawMap();
  });
  el.querySelectorAll('.si-kill').forEach((b) =>
    b.addEventListener('click', () => window.eve && window.eve.openExternal(b.dataset.url))
  );
  el.querySelectorAll('[data-act]').forEach((b) =>
    b.addEventListener('click', () => {
      const act = b.dataset.act;
      if (act === 'from') {
        mapState.route.from = info.name;
        const inp = document.getElementById('route-from');
        if (inp) inp.value = info.name;
      } else if (act === 'to') {
        mapState.route.to = info.name;
        const inp = document.getElementById('route-to');
        if (inp) inp.value = info.name;
      } else if (act === 'dotlan' || act === 'dock-dotlan') {
        if (act === 'dock-dotlan' && isLayoutAtLeast('wide')) {
          mapState.dockTab = 'dotlan';
          document.querySelectorAll('.dock-tab').forEach((t) =>
            t.classList.toggle('active', t.dataset.dock === 'dotlan')
          );
          updateMapDock();
        } else {
          window.eve &&
            window.eve.openExternal(
              'https://evemaps.dotlan.net/system/' + info.name.replace(/ /g, '_')
            );
        }
      } else if (act === 'zkill' || act === 'dock-zkill') {
        if (act === 'dock-zkill' && isLayoutAtLeast('wide')) {
          mapState.dockTab = 'zkill';
          document.querySelectorAll('.dock-tab').forEach((t) =>
            t.classList.toggle('active', t.dataset.dock === 'zkill')
          );
          updateMapDock();
        } else {
          window.eve && window.eve.openExternal('https://zkillboard.com/system/' + info.id + '/');
        }
      }
    })
  );
}

function renderSysInfo() {
  const inline = document.getElementById('map-sysinfo');
  const dock = document.getElementById('map-sysinfo-dock');
  const id = mapState.selectedSystem;
  if (!id || !mapState.data || !mapState.data.systems[id]) {
    if (inline) {
      inline.style.display = 'none';
      inline.innerHTML = '';
    }
    if (dock) {
      dock.style.display = 'none';
      dock.innerHTML = '';
    }
    updateMapDock();
    return;
  }
  const info = buildSystemInfo(id);
  const html = sysInfoHtml(info);
  const wide = isLayoutAtLeast('wide');

  if (inline) {
    inline.innerHTML = html;
    inline.style.display = wide ? 'none' : 'block';
    bindSysInfoEl(inline, info);
  }
  if (dock) {
    dock.innerHTML = html;
    bindSysInfoEl(dock, info);
  }
  updateMapDock();
}

function resetView() {
  cancelAnimationFrame(mapState.anim);
  mapState.view = { zoom: 1, panX: 0, panY: 0 };
  mapState.focus = null;
  drawMap();
}

function systemIdByName(name) {
  const q = String(name || '').trim().toLowerCase();
  if (!q || !mapState.data) return null;
  const sys = mapState.data.systems;
  let starts = null;
  for (const id in sys) {
    const n = (sys[id].n || '').toLowerCase();
    if (n === q) return Number(id);
    if (!starts && n.startsWith(q)) starts = Number(id);
  }
  return starts;
}

function secClass(sec) {
  if (sec >= 0.5) return 'sec-hi';
  if (sec > 0) return 'sec-lo';
  return 'sec-ns';
}

async function findRoute() {
  if (!mapState.data) return;
  const fromName = document.getElementById('route-from').value;
  const toName = document.getElementById('route-to').value;
  mapState.route.from = fromName;
  mapState.route.to = toName;
  const origin = systemIdByName(fromName);
  const dest = systemIdByName(toName);
  const info = document.getElementById('route-info');
  if (!origin || !dest) {
    info.innerHTML = '<div class="me-error">Enter two valid system names.</div>';
    return;
  }
  mapState.route.loading = true;
  info.innerHTML = '<div class="empty-state small">Plotting route…</div>';
  try {
    mapState.route.ids = await window.route.find(origin, dest, mapState.route.flag);
  } catch (_e) {
    mapState.route.ids = [];
  }
  mapState.route.loading = false;
  drawMap();
  renderRouteInfo();
}

function renderRouteInfo() {
  const info = document.getElementById('route-info');
  if (!info) return;
  const ids = mapState.route.ids || [];
  if (ids.length === 0) {
    info.innerHTML = '';
    return;
  }
  const sys = mapState.data.systems;
  let hi = 0;
  let lo = 0;
  let ns = 0;
  ids.forEach((id) => {
    const s = sys[id];
    if (!s) return;
    if (s.s >= 0.5) hi++;
    else if (s.s > 0) lo++;
    else ns++;
  });
  const jumps = ids.length - 1;
  const rows = ids
    .map((id) => {
      const s = sys[id];
      if (!s) return '';
      const kills = mapState.killsBySys[id] || 0;
      return `<div class="route-jump"><span class="rj-sec ${secClass(s.s)}">${s.s.toFixed(1)}</span><span class="rj-name">${s.n}</span><span class="rj-kills ${kills ? 'hot' : 'muted'}">${kills ? kills + ' k/hr' : ''}</span></div>`;
    })
    .join('');
  info.innerHTML = `
    <div class="route-summary">
      <span><b>${jumps}</b> jumps</span>
      <span class="sec-hi">${hi} HS</span>
      <span class="sec-lo">${lo} LS</span>
      <span class="sec-ns">${ns} NS</span>
      <button class="link-btn" id="route-clear">clear</button>
    </div>
    <div class="route-list">${rows}</div>`;
  const clear = document.getElementById('route-clear');
  if (clear)
    clear.addEventListener('click', () => {
      mapState.route.ids = [];
      drawMap();
      renderRouteInfo();
    });
  info.querySelectorAll('.route-jump').forEach((r, i) => {
    r.addEventListener('click', () => {
      const id = mapState.route.ids[i];
      if (mapState.data.systems[id]) focusSystem(id);
    });
  });
}

// Smoothly animate the view to a target zoom/pan.
function animateTo(zoom, panX, panY) {
  cancelAnimationFrame(mapState.anim);
  const start = { ...mapState.view };
  const t0 = performance.now();
  const dur = 450;
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - k, 3); // ease-out cubic
    mapState.view.zoom = start.zoom + (zoom - start.zoom) * e;
    mapState.view.panX = start.panX + (panX - start.panX) * e;
    mapState.view.panY = start.panY + (panY - start.panY) * e;
    drawMap();
    if (k < 1) mapState.anim = requestAnimationFrame(step);
  };
  mapState.anim = requestAnimationFrame(step);
}

// Center a world-space point at a given zoom, and drop a marker there.
function focusWorld(x, z, zoom, label) {
  mapState.focus = { x, z, label };
  const canvas = document.getElementById('galaxy-canvas');
  if (!canvas) {
    drawMap();
    return;
  }
  const cssW = canvas.clientWidth || 398;
  const cssH = mapCanvasHeight();
  const bx = baseX({ x }, cssW, MAP_PAD);
  const by = baseY({ z }, cssH, MAP_PAD);
  animateTo(zoom, cssW / 2 - bx * zoom, cssH / 2 - by * zoom);
}

function focusSystem(id) {
  const s = mapState.data.systems[id];
  if (!s) return;
  focusWorld(s.x, s.z, 7, s.n);
}

function focusRegion(rid) {
  const sys = mapState.data.systems;
  let sx = 0;
  let sz = 0;
  let n = 0;
  for (const id in sys) {
    const s = sys[id];
    if (s.r !== rid) continue;
    sx += s.x;
    sz += s.z;
    n++;
  }
  if (!n) return;
  focusWorld(sx / n, sz / n, 3.2, mapState.data.regions[rid] || 'Region');
}

function searchPlaces(q) {
  const query = (q || '').trim().toLowerCase();
  if (!query || !mapState.data) return [];
  const out = [];
  const sys = mapState.data.systems;
  for (const id in sys) {
    const s = sys[id];
    if (s.r >= KSPACE_MAX_REGION) continue;
    const nm = s.n.toLowerCase();
    if (nm.includes(query)) {
      out.push({ type: 'sys', id: Number(id), name: s.n, sub: regionName(Number(id)), pre: nm.startsWith(query) });
      if (out.length > 60) break;
    }
  }
  for (const rid in mapState.data.regions) {
    const rn = mapState.data.regions[rid];
    if (rn && rn.toLowerCase().includes(query)) {
      out.push({ type: 'region', id: Number(rid), name: rn, sub: 'Region', pre: rn.toLowerCase().startsWith(query) });
    }
  }
  out.sort((a, b) => {
    if (a.pre !== b.pre) return a.pre ? -1 : 1;
    return a.name.length - b.name.length;
  });
  return out.slice(0, 10);
}

function hideMapSearchResults() {
  const box = document.getElementById('map-search-results');
  if (box) {
    box.innerHTML = '';
    box.style.display = 'none';
  }
}

function pickPlace(r) {
  if (r.type === 'region') focusRegion(r.id);
  else {
    focusSystem(r.id);
    selectSystem(r.id);
  }
  const input = document.getElementById('map-search');
  if (input) input.value = r.name;
  hideMapSearchResults();
}

function setupMapSearch() {
  const input = document.getElementById('map-search');
  const box = document.getElementById('map-search-results');
  if (!input || !box) return;

  let current = [];
  const render = () => {
    if (current.length === 0) {
      hideMapSearchResults();
      return;
    }
    box.innerHTML = current
      .map(
        (r, i) =>
          `<button class="map-sr${i === 0 ? ' first' : ''}" data-i="${i}"><span class="sr-name">${r.name}</span><span class="sr-sub muted">${r.type === 'region' ? 'Region' : r.sub}</span></button>`
      )
      .join('');
    box.style.display = 'block';
    box.querySelectorAll('.map-sr').forEach((b) =>
      b.addEventListener('click', () => pickPlace(current[Number(b.dataset.i)]))
    );
  };

  input.addEventListener('input', () => {
    current = searchPlaces(input.value);
    render();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (current.length) pickPlace(current[0]);
    } else if (e.key === 'Escape') {
      hideMapSearchResults();
    }
  });
  input.addEventListener('blur', () => setTimeout(hideMapSearchResults, 150));
}

function nearestSystemAt(mx, my) {
  let best = null;
  let bd = 49; // ~7px pick radius
  for (const p of mapState.points) {
    const dx = p.sx - mx;
    const dy = p.sy - my;
    const d = dx * dx + dy * dy;
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

function setupMapInteractions() {
  const canvas = document.getElementById('galaxy-canvas');
  const tip = document.getElementById('map-tip');
  if (!canvas || !tip) return;

  // Scroll to zoom, keeping the point under the cursor fixed.
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = Math.exp(-e.deltaY * 0.0015);
      const z0 = mapState.view.zoom;
      let z1 = z0 * factor;
      z1 = Math.max(MAP_MIN_ZOOM, Math.min(MAP_MAX_ZOOM, z1));
      const ratio = z1 / z0;
      mapState.view.panX = mx - (mx - mapState.view.panX) * ratio;
      mapState.view.panY = my - (my - mapState.view.panY) * ratio;
      mapState.view.zoom = z1;
      cancelAnimationFrame(mapState.anim);
      drawMap();
    },
    { passive: false }
  );

  canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    mapState.drag = {
      startX: e.clientX - rect.left,
      startY: e.clientY - rect.top,
      panX: mapState.view.panX,
      panY: mapState.view.panY,
      moved: false
    };
  });

  if (!mapState.mouseupHooked) {
    window.addEventListener('mouseup', () => {
      const d = mapState.drag;
      mapState.drag = null;
      // A press without movement is a click → select the system under it.
      if (d && !d.moved) {
        const best = nearestSystemAt(d.startX, d.startY);
        if (best) selectSystem(best.id);
      }
    });
    mapState.mouseupHooked = true;
  }

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (mapState.drag) {
      const dxm = mx - mapState.drag.startX;
      const dym = my - mapState.drag.startY;
      // Only count as a drag past a small threshold, so a click still selects.
      if (Math.abs(dxm) > 3 || Math.abs(dym) > 3) mapState.drag.moved = true;
      mapState.view.panX = mapState.drag.panX + dxm;
      mapState.view.panY = mapState.drag.panY + dym;
      tip.style.display = 'none';
      cancelAnimationFrame(mapState.anim);
      drawMap();
      return;
    }

    const best = nearestSystemAt(mx, my);
    if (best) {
      tip.innerHTML = sysTooltipHtml(buildSystemInfo(best.id));
      tip.style.display = 'block';
      tip.style.left = Math.min(mx + 14, canvas.clientWidth - 188) + 'px';
      tip.style.top = Math.min(my + 12, mapCanvasHeight() - 8) + 'px';
    } else {
      tip.style.display = 'none';
    }
  });

  canvas.addEventListener('mouseleave', () => {
    tip.style.display = 'none';
  });
}

function panelSection(label, rowsHtml, emptyText) {
  return `
    <div class="map-panel">
      <div class="section-label">${label}</div>
      ${rowsHtml || `<div class="empty-state small">${emptyText}</div>`}
    </div>`;
}

function renderMapPanels() {
  const el = document.getElementById('map-panels');
  if (!el || !mapState.data) return;
  const live = mapState.live;
  if (!live) {
    el.innerHTML = mapState.liveLoading
      ? '<div class="empty-state">Loading live conflict data…</div>'
      : '';
    return;
  }

  // Hottest systems by player kills.
  const hot = live.kills
    .map((k) => ({ id: k.system_id, kills: (k.ship_kills || 0) + (k.pod_kills || 0) }))
    .filter((k) => k.kills > 0)
    .sort((a, b) => b.kills - a.kills)
    .slice(0, 10)
    .map(
      (k) =>
        `<div class="map-row"><span class="mr-name">${sysName(k.id)}</span><span class="mr-sub muted">${regionName(k.id)}</span><span class="mr-val hot">${k.kills}</span></div>`
    )
    .join('');

  const sov = live.campaigns
    .slice(0, 14)
    .map((c) => {
      const total = (c.defenderScore || 0) + (c.attackersScore || 0);
      const def = total ? Math.round((c.defenderScore / total) * 100) : null;
      return `<div class="map-row"><span class="mr-name">${sysName(c.systemId)}</span><span class="mr-sub muted">${c.type} · ${c.defender}</span><span class="mr-val">${def != null ? def + '% def' : ''}</span></div>`;
    })
    .join('');

  const inc = live.incursions
    .map((i) => {
      const infl = Math.round((i.influence || 0) * 100);
      return `<div class="map-row"><span class="mr-name">${sysName(i.stagingSystemId)}</span><span class="mr-sub muted">${regionName(i.stagingSystemId)} · ${i.infestedCount} sys${i.hasBoss ? ' · boss' : ''}</span><span class="mr-val ${i.state === 'mobilizing' || i.state === 'withdrawing' ? 'warn' : ''}">${i.state} ${infl}%</span></div>`;
    })
    .join('');

  const fw = live.fw
    .filter((f) => f.contested === 'vulnerable' || f.contested === 'contested')
    .sort((a, b) => (b.vp || 0) / (b.vpThreshold || 1) - (a.vp || 0) / (a.vpThreshold || 1))
    .slice(0, 14)
    .map((f) => {
      const pct = f.vpThreshold ? Math.round((f.vp / f.vpThreshold) * 100) : 0;
      return `<div class="map-row"><span class="mr-name">${sysName(f.systemId)}</span><span class="mr-sub muted">${f.occupier}</span><span class="mr-val ${f.contested === 'vulnerable' ? 'warn' : ''}">${pct}%</span></div>`;
    })
    .join('');

  const wars = (live.wars && live.wars.sample) || [];
  const warRows = wars
    .slice(0, 12)
    .map(
      (w) =>
        `<div class="map-row"><span class="mr-name">${w.aggressor}</span><span class="mr-sub muted">vs ${w.defender}</span><span class="mr-val">⚔</span></div>`
    )
    .join('');

  const totalStations = mapState.data.stations ? mapState.data.stations.length : 0;

  el.innerHTML = `
    <div class="map-counts">
      <span>${live.campaigns.length} sov fights</span>
      <span>${live.incursions.length} incursions</span>
      <span>${live.fw.length} FW fronts</span>
      <span>${(live.wars && live.wars.activeCount) || 0} active wars</span>
      <span>${totalStations.toLocaleString()} stations</span>
    </div>
    ${panelSection('Hottest systems (kills/hr)', hot, 'No recorded kills this hour.')}
    ${panelSection('Sovereignty campaigns', sov, 'No active sovereignty fights.')}
    ${panelSection('Incursions', inc, 'No active incursions.')}
    ${panelSection('Faction-warfare fronts', fw, 'No contested FW systems.')}
    ${panelSection('Active wars (recent)', warRows, 'No recent active wars.')}
  `;
}

function iskShortR(n) {
  n = Number(n) || 0;
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(0) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'k';
  return String(Math.round(n));
}

async function pollKills() {
  if (!window.zkill) return;
  try {
    const r = await window.zkill.recent(40);
    mapState.liveKills = (r && r.kills) || [];
  } catch (_e) {
    return;
  }
  renderKillFeed();
  if (mapState.selectedSystem) renderSysInfo();
  if (mapState.layers.live) drawMap();
}

function renderKillFeed() {
  const el = document.getElementById('map-killfeed');
  if (!el) return;
  const kills = mapState.liveKills || [];
  const rows = kills
    .slice(0, 25)
    .map((k) => {
      const sysn =
        k.systemName ||
        (mapState.data && mapState.data.systems[k.systemId] && mapState.data.systems[k.systemId].n) ||
        'Sys ' + k.systemId;
      const ship = k.shipName || 'Ship';
      const who = k.victimName || k.corpName || '';
      return `<button class="kill-row" data-sys="${k.systemId}" data-url="${k.url}"><span class="kr-sys">${sysn}</span><span class="kr-ship muted">${ship}${who ? ' · ' + who : ''}</span><span class="kr-val">${iskShortR(k.value)}</span></button>`;
    })
    .join('');
  el.innerHTML = `<div class="section-label">Live kills (zKillboard)</div>${rows || '<div class="empty-state small">Waiting for kills…</div>'}`;
  el.querySelectorAll('.kill-row').forEach((b) =>
    b.addEventListener('click', () => {
      const sid = Number(b.dataset.sys);
      if (mapState.data && mapState.data.systems[sid]) focusSystem(sid);
    })
  );
}

// ---------- Near-me threat radar + battle/gatecamp feed ----------
async function loadRadar(force) {
  if (!window.radar || !mapState.data) return;
  if (mapState.radarLoading && !force) return;
  mapState.radarLoading = true;
  renderRadar();
  try {
    mapState.radar = await window.radar.near(mapState.radarRange);
  } catch (_e) {
    /* keep old */
  }
  mapState.radarLoading = false;
  renderRadar();
  if (mapState.layers.radar) drawMap();
}

function dangerTag(n) {
  if (n.flags.includes('battle')) return '<span class="rad-tag rad-battle">BATTLE</span>';
  if (n.flags.includes('camp')) return '<span class="rad-tag rad-camp">CAMP?</span>';
  if (n.flags.includes('hot')) return '<span class="rad-tag rad-hot">HOT</span>';
  return '';
}

function renderRadar() {
  const el = document.getElementById('map-radar');
  if (!el) return;
  const r = mapState.radar;
  const rangeSel = `<select id="radar-range" class="route-flag" title="Jumps to scan">
      ${[3, 5, 7, 10].map((j) => `<option value="${j}"${mapState.radarRange === j ? ' selected' : ''}>${j}j</option>`).join('')}
    </select>`;

  let nearHtml = '';
  if (!r) {
    nearHtml = mapState.radarLoading
      ? '<div class="empty-state small">Scanning…</div>'
      : '';
  } else if (!r.loggedIn || !r.location) {
    nearHtml = '<div class="empty-state small">Log in (Me tab) to see threats around your current system.</div>';
  } else {
    const head = `<div class="rad-loc">You are in <b>${r.location.name}</b> <span class="${secClass(r.location.sec)}">${r.location.sec.toFixed(1)}</span> · ${r.location.region}</div>`;
    const rows = (r.nearby || [])
      .map(
        (n) =>
          `<button class="rad-row lvl${n.level}" data-sys="${n.id}"><span class="rad-j">${n.jumps}j</span><span class="rad-name">${n.name}</span><span class="rad-mid muted">${n.ship + n.pod} k/hr${n.npc ? ' · ' + n.npc + ' npc' : ''}</span>${dangerTag(n)}</button>`
      )
      .join('');
    nearHtml = head + (rows || '<div class="empty-state small">No elevated danger within range. Fly safe o7</div>');
  }

  const battles = (r && r.battles) || [];
  const battleRows = battles
    .map(
      (b) =>
        `<button class="rad-row" data-sys="${b.id}"><span class="rad-name">${b.name}</span><span class="rad-mid muted">${b.region} · ${b.topShips.slice(0, 2).join(', ')}</span><span class="rad-tag rad-battle">${b.kills}</span></button>`
    )
    .join('');

  el.innerHTML = `
    <div class="section-label">Threat radar ${rangeSel}<button class="mini-btn" id="radar-refresh">Scan</button></div>
    ${nearHtml}
    <div class="section-label">Battles happening now (live feed)</div>
    ${battleRows || '<div class="empty-state small">No clustered fights in the live feed right now.</div>'}
  `;
  const rangeEl = el.querySelector('#radar-range');
  if (rangeEl)
    rangeEl.addEventListener('change', (e) => {
      mapState.radarRange = Number(e.target.value) || 5;
      loadRadar(true);
    });
  const rf = el.querySelector('#radar-refresh');
  if (rf) rf.addEventListener('click', () => loadRadar(true));
  el.querySelectorAll('.rad-row').forEach((b) =>
    b.addEventListener('click', () => {
      const sid = Number(b.dataset.sys);
      if (mapState.data && mapState.data.systems[sid]) {
        focusSystem(sid);
        selectSystem(sid);
      }
    })
  );
}

// ---------- Safe-and-lucrative ratting finder ----------
async function loadRatting(force) {
  if (!window.radar || !mapState.data) return;
  if (mapState.rattingLoading && !force) return;
  mapState.rattingLoading = true;
  renderRatting();
  try {
    mapState.ratting = await window.radar.ratting(20);
  } catch (_e) {
    /* keep old */
  }
  mapState.rattingLoading = false;
  renderRatting();
}

function renderRatting() {
  const el = document.getElementById('map-ratting');
  if (!el) return;
  const data = mapState.ratting;
  let rows = '';
  if (!data) {
    rows = mapState.rattingLoading ? '<div class="empty-state small">Finding ratting systems…</div>' : '';
  } else if (!data.rows || !data.rows.length) {
    rows = '<div class="empty-state small">No clearly safe + busy ratting systems right now.</div>';
  } else {
    rows = data.rows
      .map(
        (s) =>
          `<button class="rat-row" data-sys="${s.id}"><span class="rad-name">${s.name}</span><span class="rat-sec ${secClass(s.sec)}">${s.sec.toFixed(1)}</span><span class="rat-mid muted">${s.region} · ${s.sov}</span><span class="rat-npc">${s.npc} npc/hr</span><span class="rat-pvp ${s.ship ? 'hot' : 'muted'}">${s.ship} pvp</span></button>`
      )
      .join('');
  }
  el.innerHTML = `
    <div class="section-label">Ratting finder <span class="muted">high rats · low hunters · low/null</span></div>
    ${rows}
  `;
  el.querySelectorAll('.rat-row').forEach((b) =>
    b.addEventListener('click', () => {
      const sid = Number(b.dataset.sys);
      if (mapState.data && mapState.data.systems[sid]) {
        focusSystem(sid);
        selectSystem(sid);
      }
    })
  );
}

// ---------- Intel tab (character / corp / alliance) ----------
const intelState = {
  mode: 'single', // 'single' | 'bulk'
  query: '',
  loading: false,
  error: '',
  data: null,
  bulkText: '',
  bulkRows: [],
  bulkLoading: false
};

function renderIntel() {
  const root = document.getElementById('intel-view');
  if (!window.intel) {
    root.innerHTML = '<div class="empty-state">Intel bridge unavailable.</div>';
    return;
  }
  root.innerHTML = `
    ${pageHead('Intel', 'Look up pilots, corps, or alliances — or paste a Local list to flag threats.')}
    <div class="mkt-modes">
      <button class="mkt-mode${intelState.mode === 'single' ? ' active' : ''}" data-imode="single">Single</button>
      <button class="mkt-mode${intelState.mode === 'bulk' ? ' active' : ''}" data-imode="bulk">Local (bulk)</button>
    </div>
    <div id="intel-top"></div>
    <div id="intel-results"></div>
  `;
  root.querySelectorAll('[data-imode]').forEach((b) =>
    b.addEventListener('click', () => {
      intelState.mode = b.dataset.imode;
      renderIntel();
    })
  );
  renderIntelTop();
  if (intelState.mode === 'single') renderIntelResults();
  else renderBulkResults();
}

function renderIntelTop() {
  const top = document.getElementById('intel-top');
  if (intelState.mode === 'single') {
    top.innerHTML = `
      <div class="market-search">
        <input id="intel-input" class="search-box" type="text"
          placeholder="Character, corp or alliance name…" value="${escapeAttr(intelState.query)}" />
        <button class="primary-btn" id="intel-go">Look up</button>
      </div>
      <div class="setup-text" style="margin-bottom:8px">Vet a target or recruit: combat stats, danger/gang ratio, top ship/system, and affiliation. Public ESI + zKillboard data.</div>`;
    const input = top.querySelector('#intel-input');
    const go = () => doIntel(input.value);
    top.querySelector('#intel-go').addEventListener('click', go);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') go();
    });
    input.focus();
  } else {
    top.innerHTML = `
      <textarea id="bulk-input" class="text-area" placeholder="Paste pilot names — one per line. In-game: select all in Local → Copy, then paste here. Up to 100 names.">${escapeAttr(intelState.bulkText || '')}</textarea>
      <button class="primary-btn" id="bulk-go">Vet list</button>
      <div class="setup-text" style="margin:6px 0">You copy the names yourself — this never reads the game client. Flags pilots by zKillboard threat (kills, danger %, recent activity).</div>`;
    const ta = top.querySelector('#bulk-input');
    top.querySelector('#bulk-go').addEventListener('click', () => {
      intelState.bulkText = ta.value;
      doBulk(ta.value);
    });
  }
}

async function doBulk(text) {
  const names = (text || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (names.length === 0) return;
  intelState.bulkLoading = true;
  intelState.bulkRows = [];
  renderBulkResults();
  try {
    intelState.bulkRows = await window.intel.bulk(names);
  } catch (_e) {
    intelState.bulkRows = [];
  }
  intelState.bulkLoading = false;
  renderBulkResults();
}

function renderBulkResults() {
  const el = document.getElementById('intel-results');
  if (!el) return;
  if (intelState.bulkLoading) {
    el.innerHTML = '<div class="empty-state">Vetting pilots… (zKillboard stats per pilot)</div>';
    return;
  }
  const rows = intelState.bulkRows || [];
  if (rows.length === 0) {
    el.innerHTML = '<div class="empty-state small">Paste names above and hit Vet.</div>';
    return;
  }
  const counts = rows.reduce((a, r) => ((a[r.threat] = (a[r.threat] || 0) + 1), a), {});
  const summary = `<div class="bulk-summary">${rows.length} pilots · <span class="th-high">${counts.high || 0} high</span> · <span class="th-medium">${counts.medium || 0} med</span> · <span class="th-low">${counts.low || 0} low</span> · <span class="th-blue">${counts.blue || 0} clean</span></div>`;
  el.innerHTML =
    summary +
    rows
      .map((r) => {
        const org = [r.corporation, r.alliance].filter(Boolean).join(' · ') || '—';
        return `
      <button class="bulk-row th-${r.threat}" data-name="${escapeAttr(r.name)}">
        <span class="bulk-dot"></span>
        <span class="bulk-name">${r.name}</span>
        <span class="bulk-org muted">${org}</span>
        <span class="bulk-stat">${r.kills}k · ${Math.round(r.danger)}%</span>
      </button>`;
      })
      .join('');
  el.querySelectorAll('.bulk-row').forEach((b) =>
    b.addEventListener('click', () => {
      intelState.mode = 'single';
      renderIntel();
      doIntel(b.dataset.name);
    })
  );
}

async function doIntel(name) {
  const q = (name || '').trim();
  if (!q) return;
  intelState.query = q;
  intelState.loading = true;
  intelState.error = '';
  renderIntelResults();
  try {
    intelState.data = await window.intel.lookup(q);
  } catch (err) {
    intelState.data = null;
    intelState.error = err.message || String(err);
  }
  intelState.loading = false;
  renderIntelResults();
}

function ratioPct(r) {
  return r == null ? '—' : Math.round(r) + '%';
}

function renderIntelResults() {
  const el = document.getElementById('intel-results');
  if (!el) return;
  if (intelState.loading) {
    el.innerHTML = '<div class="empty-state">Looking up…</div>';
    return;
  }
  if (intelState.error) {
    el.innerHTML = `<div class="me-error">${intelState.error}</div>`;
    return;
  }
  const d = intelState.data;
  if (!d) {
    el.innerHTML = '<div class="empty-state">Search a pilot, corporation or alliance.</div>';
    return;
  }

  const info = d.info || {};
  const st = d.stats;
  const subline = [];
  if (d.type === 'character') {
    if (info.corporation) subline.push(info.corporation);
    if (info.alliance) subline.push(info.alliance);
    if (info.security != null) subline.push('sec ' + info.security);
  } else if (d.type === 'corporation') {
    if (info.ticker) subline.push('[' + info.ticker + ']');
    if (info.members != null) subline.push(info.members + ' members');
    if (info.alliance) subline.push(info.alliance);
  } else {
    if (info.ticker) subline.push('<' + info.ticker + '>');
  }

  const statHtml = st
    ? `
      <div class="stat-grid">
        ${statBox('Kills', (st.shipsDestroyed || 0).toLocaleString())}
        ${statBox('Losses', (st.shipsLost || 0).toLocaleString())}
        ${statBox('Danger', ratioPct(st.dangerRatio))}
        ${statBox('Gang', ratioPct(st.gangRatio))}
        ${statBox('Solo kills', (st.soloKills || 0).toLocaleString())}
        ${statBox('ISK destroyed', iskShortR(st.iskDestroyed))}
      </div>
      <div class="section-label">Favorites</div>
      <div class="intel-favs">
        <div class="map-row"><span class="mr-name">Top ship</span><span class="mr-sub muted">${st.topShip ? st.topShip.name || '—' : '—'}</span><span class="mr-val">${st.topShip ? st.topShip.kills : ''}</span></div>
        <div class="map-row"><span class="mr-name">Top system</span><span class="mr-sub muted">${st.topSystem ? st.topSystem.name || '—' : '—'}</span><span class="mr-val">${st.topSystem ? st.topSystem.kills : ''}</span></div>
        <div class="map-row"><span class="mr-name">Top region</span><span class="mr-sub muted">${st.topRegion ? st.topRegion.name || '—' : '—'}</span><span class="mr-val">${st.topRegion ? st.topRegion.kills : ''}</span></div>
      </div>`
    : '<div class="empty-state small">No zKillboard combat record (or never been on a killmail).</div>';

  el.innerHTML = `
    <div class="char-header">
      <img class="char-portrait" src="${d.portrait}" alt="" onerror="this.style.visibility='hidden'" />
      <div class="char-meta">
        <div class="name">${d.name}</div>
        <div class="sub">${d.type}${subline.length ? ' · ' + subline.join(' · ') : ''}</div>
      </div>
    </div>
    ${statHtml}
    <div class="refresh-row">
      <button class="link-btn" id="intel-zkill">Open on zKillboard ↗</button>
    </div>
  `;
  const z = document.getElementById('intel-zkill');
  if (z)
    z.addEventListener('click', () => {
      const kind = d.type === 'character' ? 'character' : d.type;
      if (window.eve && window.eve.openExternal)
        window.eve.openExternal(`https://zkillboard.com/${kind}/${d.id}/`);
    });
}

// ---------- Industry tab ----------
const industryState = {
  status: null,
  building: false,
  mode: 'build', // 'build' | 'ore'
  buildData: null,
  buildLoading: false,
  oreData: null,
  oreLoading: false,
  yield: 0.7
};

async function renderIndustry() {
  const root = document.getElementById('industry-view');
  if (!window.industry) {
    root.innerHTML = '<div class="empty-state">Industry bridge unavailable.</div>';
    return;
  }
  try {
    industryState.status = await window.industry.status();
  } catch (_e) {
    industryState.status = null;
  }
  const st = industryState.status;

  if (!st || !st.ready) {
    root.innerHTML = `
      <div class="setup">
        <div class="section-label">Industry data</div>
        <p class="setup-text">Build-vs-buy and refining need the industry recipe + reprocessing tables from EVE's SDE (~a few MB, downloaded once and cached).</p>
        <button class="primary-btn" id="ind-build"${industryState.building ? ' disabled' : ''}>${industryState.building ? 'Downloading…' : 'Build industry data'}</button>
        <div id="ind-build-msg" class="setup-msg"></div>
      </div>`;
    const btn = root.querySelector('#ind-build');
    if (btn)
      btn.addEventListener('click', async () => {
        industryState.building = true;
        renderIndustry();
        try {
          await window.industry.build();
        } catch (_e) {
          /* ignore */
        }
        industryState.building = false;
        renderIndustry();
      });
    return;
  }

  root.innerHTML = `
    ${pageHead('Industry', 'Compare build cost to buy price, or rank ores by refined ISK per m³.')}
    <div class="mkt-modes">
      <button class="mkt-mode${industryState.mode === 'build' ? ' active' : ''}" data-indmode="build">Build vs buy</button>
      <button class="mkt-mode${industryState.mode === 'ore' ? ' active' : ''}" data-indmode="ore">Refine / ore</button>
    </div>
    <div id="ind-top"></div>
    <div id="ind-result"></div>
  `;
  root.querySelectorAll('[data-indmode]').forEach((b) =>
    b.addEventListener('click', () => {
      industryState.mode = b.dataset.indmode;
      renderIndustry();
    })
  );
  renderIndustryTop();
  if (industryState.mode === 'build') renderBuildResult();
  else renderOreResult();
}

function renderIndustryTop() {
  const top = document.getElementById('ind-top');
  if (industryState.mode === 'build') {
    top.innerHTML = `
      <div class="market-search">
        <input id="ind-input" class="search-box" type="text" placeholder="Item to manufacture (e.g. Rifter, 425mm Railgun II)…" />
        <button class="primary-btn" id="ind-go">Compare</button>
      </div>
      <div class="setup-text" style="margin-bottom:8px">Material cost (Jita sell) vs buying the finished item — tells you whether to build or buy.</div>`;
    const input = top.querySelector('#ind-input');
    const go = () => doBuildCost(input.value);
    top.querySelector('#ind-go').addEventListener('click', go);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') go();
    });
  } else {
    top.innerHTML = `
      <div class="market-search">
        <label class="ore-yield">Yield % <input id="ore-yield" type="number" min="1" max="90" value="${Math.round(industryState.yield * 100)}" /></label>
        <button class="primary-btn" id="ore-go">Rank ores</button>
      </div>
      <div class="setup-text" style="margin-bottom:8px">Best ore to mine by refined ISK/m³ at current mineral prices. Set your reprocessing yield (skills + structure).</div>`;
    top.querySelector('#ore-go').addEventListener('click', () => {
      const y = Number(top.querySelector('#ore-yield').value) || 70;
      industryState.yield = Math.max(0.01, Math.min(0.9, y / 100));
      doBestOre();
    });
  }
}

async function doBuildCost(name) {
  const q = (name || '').trim();
  if (!q) return;
  industryState.buildLoading = true;
  industryState.buildData = null;
  renderBuildResult();
  try {
    const r = await window.market.search(q);
    const match = r && r[0];
    if (!match) throw new Error('No item found by that name.');
    industryState.buildData = await window.industry.buildCost(match.id);
  } catch (e) {
    industryState.buildData = { error: e.message || String(e) };
  }
  industryState.buildLoading = false;
  renderBuildResult();
}

function renderBuildResult() {
  const el = document.getElementById('ind-result');
  if (!el) return;
  if (industryState.buildLoading) {
    el.innerHTML = '<div class="empty-state">Pricing materials…</div>';
    return;
  }
  const d = industryState.buildData;
  if (!d) {
    el.innerHTML = '<div class="empty-state small">Search an item to compare build vs buy.</div>';
    return;
  }
  if (d.error) {
    el.innerHTML = `<div class="me-error">${d.error}</div>`;
    return;
  }
  const verdict =
    d.savingsVsSell > 0
      ? `<span class="fc-ok">Build saves ${priceFmt(d.savingsVsSell)}</span>`
      : `<span class="fc-bad">Buying is cheaper by ${priceFmt(-d.savingsVsSell)}</span>`;
  const mats = d.materials
    .map(
      (m) =>
        `<div class="apr-row"><span class="apr-qty">${volFmt(m.qty)}×</span><span class="apr-name">${m.name}</span><span class="apr-val">${priceFmt(m.total)}</span></div>`
    )
    .join('');
  el.innerHTML = `
    <div class="ind-head"><b>${d.productName}</b> · ${d.runQty} per run</div>
    <div class="apr-totals">
      <div class="apr-total"><span class="label">Build cost</span><span class="value">${priceFmt(d.buildCost)}</span></div>
      <div class="apr-total"><span class="label">Buy (Jita sell)</span><span class="value">${priceFmt(d.productSell * d.runQty)}</span></div>
    </div>
    <div class="ind-verdict">${verdict}</div>
    <div class="section-label">Materials</div>
    <div class="apr-list">${mats}</div>`;
}

async function doBestOre() {
  industryState.oreLoading = true;
  industryState.oreData = null;
  renderOreResult();
  try {
    industryState.oreData = await window.industry.bestOre(industryState.yield);
  } catch (e) {
    industryState.oreData = { error: e.message || String(e) };
  }
  industryState.oreLoading = false;
  renderOreResult();
}

function renderOreResult() {
  const el = document.getElementById('ind-result');
  if (!el) return;
  if (industryState.oreLoading) {
    el.innerHTML = '<div class="empty-state">Pricing minerals…</div>';
    return;
  }
  const d = industryState.oreData;
  if (!d) {
    el.innerHTML = '<div class="empty-state small">Set a yield and rank ores by ISK/m³.</div>';
    return;
  }
  if (d.error) {
    el.innerHTML = `<div class="me-error">${d.error}</div>`;
    return;
  }
  const rows = d.rows
    .map(
      (r) =>
        `<div class="ore-row"><span class="ore-name">${r.name}</span><span class="ore-m3">${priceFmt(r.refinedPerM3)}/m³</span><span class="ore-raw muted">ore ${priceFmt(r.orePerM3)}/m³</span></div>`
    )
    .join('');
  el.innerHTML = `<div class="sp-head muted">refined value at ${Math.round(d.yield * 100)}% yield</div>${rows}`;
}

// ---------- Me / character tab ----------
function esiAvailable() {
  return typeof window !== 'undefined' && window.eve;
}

function renderLoginPrompt(root, state) {
  const configured = state && state.configured;

  if (configured) {
    root.innerHTML = `
      <div class="me-login">
        <p>
          Log in with EVE Online to personalize tips to your character —
          skills, current ship, wallet, location, and skill-queue health.
          Official SSO + ESI (read-only); never touches the game client.
        </p>
        <button class="primary-btn" id="login-btn">Log in with EVE Online</button>
        <div><button class="link-btn" id="change-id-btn">Change Client ID</button></div>
      </div>
    `;
    document.getElementById('login-btn').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = 'Opening EVE login\u2026';
      try {
        await window.eve.login();
        await loadCharacter();
      } catch (err) {
        renderMeError(root, err.message || String(err));
      }
    });
    document.getElementById('change-id-btn').addEventListener('click', () =>
      renderClientIdSetup(root, state, true)
    );
    return;
  }

  renderClientIdSetup(root, state, false);
}

function renderClientIdSetup(root, state, isChange) {
  const callbackUrl = (state && state.callbackUrl) || 'http://localhost:3838/callback';
  const scopes = (state && state.scopes) || [];
  root.innerHTML = `
    <div class="setup">
      <div class="section-label">${isChange ? 'Change' : 'One-time'} login setup</div>
      <p class="setup-text">
        To personalize tips, create a free EVE application and paste its
        <b>Client ID</b> below. Takes ~2 minutes.
      </p>
      <ol class="setup-steps">
        <li>Open <a href="#" id="dev-link">developers.eveonline.com</a> → Manage Applications → Create New Application.</li>
        <li>Connection Type: <b>Authentication &amp; API Access</b>.</li>
        <li>Callback URL: <code>${callbackUrl}</code> <button class="mini-btn" id="copy-cb">copy</button></li>
        <li>Add scopes: <button class="mini-btn" id="copy-scopes">copy all ${scopes.length}</button></li>
        <li>Copy the <b>Client ID</b> and paste it here:</li>
      </ol>
      <input id="client-id-input" class="text-input" type="text" placeholder="Paste your Client ID" />
      <button class="primary-btn" id="save-id-btn">Save &amp; continue</button>
      <div id="setup-msg" class="setup-msg"></div>
    </div>
  `;

  document.getElementById('dev-link').addEventListener('click', (e) => {
    e.preventDefault();
    if (window.eve.openExternal) window.eve.openExternal('https://developers.eveonline.com/');
  });
  document.getElementById('copy-cb').addEventListener('click', () =>
    navigator.clipboard.writeText(callbackUrl)
  );
  document.getElementById('copy-scopes').addEventListener('click', () =>
    navigator.clipboard.writeText(scopes.join(' '))
  );

  const input = document.getElementById('client-id-input');
  const msg = document.getElementById('setup-msg');
  document.getElementById('save-id-btn').addEventListener('click', async () => {
    const id = input.value.trim();
    if (!id) {
      msg.textContent = 'Please paste your Client ID first.';
      return;
    }
    await window.eve.setClientId(id);
    msg.textContent = 'Saved. Opening EVE login\u2026';
    try {
      await window.eve.login();
      await loadCharacter();
    } catch (err) {
      renderMeError(root, err.message || String(err));
    }
  });
}

function renderMeError(root, message) {
  root.innerHTML = `
    <div class="me-error">Could not load character data:<br>${message}</div>
    <div class="me-login"><button class="link-btn" id="retry-btn">Try again</button></div>
  `;
  const retry = document.getElementById('retry-btn');
  if (retry) retry.addEventListener('click', () => loadCharacter());
}

function statBox(label, value) {
  return `<div class="stat"><div class="label">${label}</div><div class="value">${value}</div></div>`;
}

function renderCharacter(root, snapshot) {
  const portrait = `https://images.evetech.net/characters/${snapshot.characterId}/portrait?size=64`;
  const personal = buildPersonalTips(snapshot);

  root.innerHTML = `
    <div class="char-header">
      <img class="char-portrait" src="${portrait}" alt="" onerror="this.style.visibility='hidden'" />
      <div class="char-meta">
        <div class="name">${snapshot.characterName}</div>
        <div class="sub">${
          snapshot.solarSystemName ? 'In ' + snapshot.solarSystemName : 'Location unavailable'
        }${snapshot.securityStatus != null ? ' \u00b7 sec ' + snapshot.securityStatus : ''}</div>
      </div>
    </div>

    <div class="stat-grid">
      ${statBox('Skill Points', spFormat(snapshot.totalSp))}
      ${statBox('Wallet', iskFormat(snapshot.walletBalance))}
      ${statBox('Current Ship', snapshot.shipTypeName || snapshot.shipName || 'Unknown')}
      ${statBox(
        'Skill Queue',
        snapshot.skillQueueLength == null
          ? 'Unknown'
          : snapshot.skillQueueLength + (snapshot.skillQueueLength === 1 ? ' skill' : ' skills')
      )}
    </div>

    <div class="section-label">Personalized for you</div>
    <div id="ptips"></div>

    <div class="refresh-row">
      <button class="link-btn" id="refresh-btn">Refresh</button>
      <button class="link-btn" id="logout-btn">Log out</button>
    </div>
  `;

  const ptips = document.getElementById('ptips');
  if (personal.length === 0) {
    ptips.innerHTML = '<div class="ptip info">No specific suggestions right now — fly safe!</div>';
  } else {
    personal.forEach((t) => {
      const div = document.createElement('div');
      div.className = `ptip ${t.level}`;
      div.textContent = t.text;
      ptips.appendChild(div);
    });
  }

  document.getElementById('refresh-btn').addEventListener('click', () => loadCharacter());
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await window.eve.logout();
    loadCharacter();
  });
}

async function loadCharacter() {
  const root = document.getElementById('me-view');
  if (!esiAvailable()) {
    root.innerHTML = '<div class="me-error">Login bridge unavailable.</div>';
    return;
  }
  root.innerHTML = '<div class="me-login"><p>Loading\u2026</p></div>';
  try {
    const state = await window.eve.authState();
    if (!state.loggedIn) {
      renderLoginPrompt(root, state);
      return;
    }
    const result = await window.eve.getSnapshot();
    if (!result.loggedIn || !result.snapshot) {
      renderLoginPrompt(root, state);
      return;
    }
    renderCharacter(root, result.snapshot);
  } catch (e) {
    renderMeError(root, e.message || String(e));
  } finally {
    appendAffordPanel(root);
    appendCareerPanel(root);
    appendSkillCalc(root);
    appendNotifyPanel(root);
    appendPilotPanels(root);
  }
}

// "What can I afford AND fly?" — needs login (wallet + trained skills).
async function appendAffordPanel(root) {
  if (!window.hangar || !window.eve) return;
  let state;
  try {
    state = await window.eve.authState();
  } catch (_e) {
    return;
  }
  if (!state || !state.loggedIn) return;
  if (!document.getElementById('me-view').contains(root)) return;

  const div = document.createElement('div');
  div.className = 'afford-panel';
  div.innerHTML = `
    <div class="section-label">What can I afford &amp; fly? <button class="mini-btn" id="afford-btn">Load</button></div>
    <div id="afford-body"></div>
  `;
  root.appendChild(div);
  const body = div.querySelector('#afford-body');
  div.querySelector('#afford-btn').addEventListener('click', async () => {
    const btn = div.querySelector('#afford-btn');
    btn.disabled = true;
    btn.textContent = 'Checking…';
    body.innerHTML = '<div class="empty-state small">Pricing hulls and checking your skills…</div>';
    try {
      const d = await window.hangar.affordAndFly();
      body.innerHTML = renderAfford(d);
      body.querySelectorAll('[data-id]').forEach((b) =>
        b.addEventListener('click', () => {
          marketState.mode = 'search';
          setTab('market');
          openDetail(Number(b.dataset.id), b.dataset.name);
        })
      );
    } catch (e) {
      body.innerHTML = `<div class="me-error">${e.message || e}</div>`;
    }
    btn.textContent = 'Reload';
    btn.disabled = false;
  });
}

function renderAfford(d) {
  if (!d || !d.loggedIn) return '<div class="empty-state small">Login required.</div>';
  const wallet = d.wallet != null ? iskShortR(d.wallet) + ' ISK' : 'unknown';
  const ships = d.ships || [];
  const ready = ships
    .filter((s) => s.canFly && s.affordable)
    .sort((a, b) => b.price - a.price);
  const almost = ships
    .filter((s) => s.affordable && !s.canFly && s.missingCount <= 3)
    .sort((a, b) => a.missingCount - b.missingCount || b.price - a.price)
    .slice(0, 8);
  const readyRows = ready
    .map(
      (s) =>
        `<button class="afford-row ok" data-id="${s.id}" data-name="${escapeAttr(s.name)}"><span class="af-name">${s.name}</span><span class="af-price">${iskShortR(s.price)}</span></button>`
    )
    .join('');
  const almostRows = almost
    .map(
      (s) =>
        `<button class="afford-row miss" data-id="${s.id}" data-name="${escapeAttr(s.name)}"><span class="af-name">${s.name}</span><span class="af-miss muted">needs ${s.missing.map((m) => m.name + ' ' + m.need).join(', ')}</span><span class="af-price">${iskShortR(s.price)}</span></button>`
    )
    .join('');
  return `
    <div class="afford-head muted">Wallet: <b>${wallet}</b> · ${ready.length} hull${ready.length === 1 ? '' : 's'} you can buy &amp; fly now</div>
    ${readyRows || '<div class="empty-state small">No curated hull is both affordable and flyable yet — keep training / earning!</div>'}
    ${almost.length ? `<div class="section-label small">Affordable, almost trained</div>${almostRows}` : ''}`;
}

// Career analytics + "where you die" heatmap.
async function appendCareerPanel(root) {
  if (!window.career || !window.eve) return;
  let state;
  try {
    state = await window.eve.authState();
  } catch (_e) {
    return;
  }
  if (!state || !state.loggedIn) return;
  if (!document.getElementById('me-view').contains(root)) return;

  const div = document.createElement('div');
  div.className = 'career-panel';
  div.innerHTML = `
    <div class="section-label">Career analytics <button class="mini-btn" id="career-btn">Load</button></div>
    <div id="career-body"></div>
  `;
  root.appendChild(div);
  const body = div.querySelector('#career-body');
  div.querySelector('#career-btn').addEventListener('click', async () => {
    const btn = div.querySelector('#career-btn');
    btn.disabled = true;
    btn.textContent = 'Loading…';
    body.innerHTML = '<div class="empty-state small">Reading wallet / SP / loss history…</div>';
    try {
      const d = await window.career.analytics();
      body.innerHTML = renderCareer(d);
      const c = body.querySelector('#career-spark-net');
      if (c && d.history) drawSpark(c, d.history.map((h) => h.wallet));
      const c2 = body.querySelector('#career-spark-sp');
      if (c2 && d.history) drawSpark(c2, d.history.map((h) => h.sp));
    } catch (e) {
      body.innerHTML = `<div class="me-error">${e.message || e}</div>`;
    }
    btn.textContent = 'Reload';
    btn.disabled = false;
  });
}

function renderCareer(d) {
  if (!d || !d.loggedIn) return '<div class="empty-state small">Login required.</div>';
  const cur = d.current || {};
  const hist = d.history || [];
  const hm = d.heatmap || {};
  const kd =
    cur.losses != null && cur.losses > 0
      ? (cur.kills / cur.losses).toFixed(2)
      : cur.kills != null
      ? cur.kills + ':0'
      : '—';
  const trendNote =
    hist.length < 2
      ? '<span class="muted">Trends build as you reopen this over days.</span>'
      : `<span class="muted">${hist.length} snapshots</span>`;
  const topSys = (hm.topSystems || [])
    .map((s) => `<div class="hm-row"><span class="hm-name">${s.name}</span><span class="hm-bar"><span style="width:${barPct(s.count, hm.topSystems)}%"></span></span><span class="hm-n">${s.count}</span></div>`)
    .join('');
  const topShip = (hm.topShips || [])
    .map((s) => `<div class="hm-row"><span class="hm-name">${s.name}</span><span class="hm-bar"><span style="width:${barPct(s.count, hm.topShips)}%"></span></span><span class="hm-n">${s.count}</span></div>`)
    .join('');
  const hours = hm.byHour || [];
  const maxHour = Math.max(1, ...hours);
  const hourCells = hours
    .map(
      (h, i) =>
        `<span class="hh-cell" title="${pad2(i)}:00 UTC · ${h} losses" style="opacity:${0.12 + 0.88 * (h / maxHour)}"></span>`
    )
    .join('');

  return `
    <div class="career-stats">
      <div class="cs-cell"><span class="cs-k">Liquid ISK</span><span class="cs-v">${cur.wallet != null ? iskShortR(cur.wallet) : '—'}</span><canvas id="career-spark-net" class="spark"></canvas></div>
      <div class="cs-cell"><span class="cs-k">Total SP</span><span class="cs-v">${cur.sp != null ? iskShortR(cur.sp) : '—'}</span><canvas id="career-spark-sp" class="spark"></canvas></div>
      <div class="cs-cell"><span class="cs-k">K / D</span><span class="cs-v">${kd}</span><span class="cs-sub muted">${cur.kills != null ? cur.kills + ' / ' + cur.losses : ''}</span></div>
    </div>
    <div class="career-trend">${trendNote}</div>
    <div class="section-label small">Where you die — top systems (last ${hm.sampled || 0} losses)</div>
    ${topSys || '<div class="empty-state small">No recent losses to map (good!).</div>'}
    <div class="section-label small">Ships you lose most</div>
    ${topShip || '<div class="empty-state small">—</div>'}
    <div class="section-label small">When you die (hour of day, UTC)</div>
    <div class="hour-heat">${hourCells}</div>
    <div class="hour-axis muted"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
  `;
}

function barPct(count, arr) {
  const max = Math.max(1, ...(arr || []).map((x) => x.count));
  return Math.round((count / max) * 100);
}

// Tiny sparkline for a numeric series on a small canvas.
function drawSpark(canvas, values) {
  const data = (values || []).filter((v) => v != null && isFinite(v));
  const wrap = canvas.parentElement;
  const w = (wrap && wrap.clientWidth) || 90;
  const h = 22;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (data.length < 2) return;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  ctx.strokeStyle = 'rgba(120,235,180,0.9)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  data.forEach((v, i) => {
    const x = (i / (data.length - 1)) * (w - 2) + 1;
    const y = h - 2 - ((v - min) / span) * (h - 4);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

async function appendPilotPanels(root) {
  if (!window.pilot || !window.eve) return;
  let state;
  try {
    state = await window.eve.authState();
  } catch (_e) {
    return;
  }
  if (!state || !state.loggedIn) return;
  if (!document.getElementById('me-view').contains(root)) return;

  const div = document.createElement('div');
  div.className = 'pilot-panels';
  div.innerHTML = `
    <div class="section-label">Assets &amp; locations <button class="mini-btn" id="pa-btn">Load</button></div>
    <div id="pa-body"></div>
    <div class="section-label">Jump clones &amp; implants <button class="mini-btn" id="pc-btn">Load</button></div>
    <div id="pc-body"></div>
    <div class="section-label">Recent losses &amp; ISK efficiency <button class="mini-btn" id="pl-btn">Load</button></div>
    <div id="pl-body"></div>
  `;
  root.appendChild(div);

  const lazy = (btnId, bodyId, fn, render) => {
    const btn = div.querySelector('#' + btnId);
    const body = div.querySelector('#' + bodyId);
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Loading…';
      try {
        const data = await fn();
        body.innerHTML = render(data);
        if (bodyId === 'pl-body') {
          body.querySelectorAll('[data-url]').forEach((b) =>
            b.addEventListener('click', () => window.eve.openExternal(b.dataset.url))
          );
        }
      } catch (e) {
        body.innerHTML = `<div class="me-error">${e.message || e}</div>`;
      }
      btn.textContent = 'Reload';
      btn.disabled = false;
    });
  };

  lazy('pa-btn', 'pa-body', () => window.pilot.assets(), renderPilotAssets);
  lazy('pc-btn', 'pc-body', () => window.pilot.clones(), renderPilotClones);
  lazy('pl-btn', 'pl-body', () => window.pilot.losses(), renderPilotLosses);
}

function renderPilotAssets(d) {
  if (!d || !d.loggedIn) return '<div class="empty-state small">Login required.</div>';
  if (d.error) return `<div class="me-error">${d.error}</div>`;
  if (!d.locations || !d.locations.length)
    return '<div class="empty-state small">No assets found.</div>';
  const rows = d.locations
    .map(
      (l) =>
        `<div class="pilot-row"><span class="pr-name">${l.name}</span><span class="pr-val">${l.items.toLocaleString()} items</span></div>`
    )
    .join('');
  return `<div class="pilot-sub muted">${d.totalItems.toLocaleString()} asset stacks across ${d.locations.length}+ locations (top shown)</div>${rows}`;
}

function renderPilotClones(d) {
  if (!d || !d.loggedIn) return '<div class="empty-state small">Login required.</div>';
  if (d.error) return `<div class="me-error">${d.error}</div>`;
  const active = d.active && d.active.length
    ? `<div class="pilot-row"><span class="pr-name">Active implants</span><span class="pr-val">${d.active.length}</span></div><div class="pilot-implants muted">${d.active.join(', ')}</div>`
    : '<div class="pilot-row"><span class="pr-name">Active implants</span><span class="pr-val">none</span></div>';
  const home = d.home ? `<div class="pilot-sub muted">Home station: ${d.home}</div>` : '';
  const clones = (d.clones || [])
    .map(
      (c) =>
        `<div class="pilot-row"><span class="pr-name">${c.location}</span><span class="pr-val">${c.implants.length} imp</span></div>${c.implants.length ? `<div class="pilot-implants muted">${c.implants.join(', ')}</div>` : ''}`
    )
    .join('');
  return `${home}${active}<div class="section-label small">Jump clones (${(d.clones || []).length})</div>${clones || '<div class="empty-state small">No jump clones.</div>'}`;
}

function renderPilotLosses(d) {
  if (!d || !d.loggedIn) return '<div class="empty-state small">Login required.</div>';
  const eff = d.efficiency != null ? d.efficiency.toFixed(1) + '%' : '—';
  const head = `<div class="pilot-sub muted">ISK efficiency: <b class="${d.efficiency != null && d.efficiency >= 50 ? 'fc-ok' : 'fc-bad'}">${eff}</b>${d.shipsDestroyed != null ? ` · ${d.shipsDestroyed.toLocaleString()} kills / ${d.shipsLost.toLocaleString()} losses` : ''}</div>`;
  const rows = (d.losses || [])
    .map(
      (l) =>
        `<button class="pilot-row loss-row" data-url="${l.url}"><span class="pr-name">${l.ship}</span><span class="pr-sub muted">${l.system}</span><span class="pr-val hot">${iskShortR(l.value)}</span></button>`
    )
    .join('');
  return `${head}${rows || '<div class="empty-state small">No recent losses (nice!).</div>'}`;
}

async function appendSkillCalc(root) {
  if (!window.skills || !window.market) return;
  const div = document.createElement('div');
  div.className = 'skillcalc-panel';
  div.innerHTML = `
    <div class="section-label">Skill plan / training time</div>
    <div class="market-search">
      <input id="skill-input" class="search-box" type="text" placeholder="Skill name (e.g. Gallente Battleship)…" />
      <select id="skill-target" class="watch-dir">
        <option value="1">→ I</option>
        <option value="2">→ II</option>
        <option value="3">→ III</option>
        <option value="4">→ IV</option>
        <option value="5" selected>→ V</option>
      </select>
      <button class="primary-btn" id="skill-go">Plan</button>
    </div>
    <div id="skill-result"></div>
  `;
  root.appendChild(div);
  const resEl = div.querySelector('#skill-result');
  const go = async () => {
    const q = div.querySelector('#skill-input').value.trim();
    if (!q) return;
    resEl.innerHTML = '<div class="empty-state small">Resolving skill…</div>';
    let match = null;
    try {
      const r = await window.market.search(q);
      match = r && r[0];
    } catch (_e) {
      /* ignore */
    }
    if (!match) {
      resEl.innerHTML = '<div class="me-error">No skill found by that name.</div>';
      return;
    }
    const target = Number(div.querySelector('#skill-target').value) || 5;
    resEl.innerHTML = '<div class="empty-state small">Calculating…</div>';
    try {
      const plan = await window.skills.plan(match.id, match.name, target);
      resEl.innerHTML = renderSkillPlan(plan);
    } catch (e) {
      resEl.innerHTML = `<div class="me-error">${e.message || e}</div>`;
    }
  };
  div.querySelector('#skill-go').addEventListener('click', go);
  div.querySelector('#skill-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') go();
  });
}

function renderSkillPlan(p) {
  const rows = p.levels
    .map(
      (l) =>
        `<div class="sp-row${l.done ? ' done' : ''}"><span class="sp-lvl">L${l.level}</span><span class="sp-sp">${volFmt(l.totalSp)} SP</span><span class="sp-time">${l.done ? 'trained' : l.time}</span></div>`
    )
    .join('');
  const head = p.loggedIn
    ? `${p.name} · rank ${p.rank} · ${p.primary}/${p.secondary} · ${Math.round(p.perMin)} SP/min · current L${p.currentLevel}`
    : `${p.name} · rank ${p.rank} · ${p.primary}/${p.secondary} · assuming 20/20 attrs`;
  return `
    <div class="sp-head muted">${head}</div>
    <div class="sp-target">To level ${p.target}: <b>${volFmt(p.targetRemaining)} SP</b> · ${p.targetTime}${p.loggedIn ? '' : ' (est.)'}</div>
    ${rows}`;
}

async function appendNotifyPanel(root) {
  if (!window.notify) return;
  let prefs;
  try {
    prefs = await window.notify.getPrefs();
  } catch (_e) {
    return;
  }
  if (!document.getElementById('me-view').contains(root)) return;
  const div = document.createElement('div');
  div.className = 'notify-panel';
  const row = (key, label, desc) =>
    `<label class="notify-row"><input type="checkbox" data-key="${key}" ${prefs[key] ? 'checked' : ''}/><span class="nr-text"><span class="nr-label">${label}</span><span class="nr-desc muted">${desc}</span></span></label>`;
  div.innerHTML = `
    <div class="section-label">Desktop notifications</div>
    ${row('priceAlerts', 'Watchlist price alerts', 'When a watched item hits your target price')}
    ${row('incursions', 'New incursions', 'When a new Sansha incursion starts')}
    ${row('skillQueue', 'Skill queue', 'Empty or finishing within 24h (needs login)')}
    ${row('pi', 'PI extractors', 'Disabled — PI scope not accepted by EVE SSO currently')}
    ${row('radar', 'Near-me threat radar', 'When a battle/gatecamp flares up within ~6 jumps (needs login)')}
  `;
  root.appendChild(div);
  div.querySelectorAll('input[type=checkbox]').forEach((cb) => {
    cb.addEventListener('change', () => {
      window.notify.setPrefs({ [cb.dataset.key]: cb.checked });
    });
  });
}

// ---------- Tools tab (damage cheat sheet / notes / news) ----------
const toolsState = {
  mode: 'damage', // 'damage' | 'notes' | 'news'
  news: null,
  newsLoading: false,
  notesLoaded: false,
  notesTimer: null
};

const DMG_ABBR = { EM: 'EM', Thermal: 'TH', Kinetic: 'KI', Explosive: 'EX', All: 'ALL', Omni: 'OMNI', Varies: '~' };
const DMG_CLASS = { EM: 'dt-em', Thermal: 'dt-th', Kinetic: 'dt-ki', Explosive: 'dt-ex' };

function dmgPills(arr) {
  return (arr || [])
    .map((t) => `<span class="dt-pill ${DMG_CLASS[t] || 'dt-other'}">${DMG_ABBR[t] || t}</span>`)
    .join('');
}

function renderTools() {
  const root = document.getElementById('tools-view');
  if (!root) return;
  root.innerHTML = `
    ${pageHead('Tools', 'Damage types, scratchpad notes, and EVE news feeds in one place.')}
    <div class="mkt-modes">
      <button class="mkt-mode${toolsState.mode === 'damage' ? ' active' : ''}" data-tmode="damage">Damage</button>
      <button class="mkt-mode${toolsState.mode === 'notes' ? ' active' : ''}" data-tmode="notes">Notes</button>
      <button class="mkt-mode${toolsState.mode === 'news' ? ' active' : ''}" data-tmode="news">News</button>
    </div>
    <div id="tools-body"></div>
  `;
  root.querySelectorAll('[data-tmode]').forEach((b) =>
    b.addEventListener('click', () => {
      toolsState.mode = b.dataset.tmode;
      renderTools();
    })
  );
  const body = root.querySelector('#tools-body');
  if (toolsState.mode === 'damage') renderDamage(body);
  else if (toolsState.mode === 'notes') renderNotes(body);
  else renderNews(body);
}

function renderDamage(el) {
  const npc = NPC_FACTIONS.map(
    (f) =>
      `<div class="dmg-row"><span class="dmg-name">${f.name}</span><span class="dmg-cell">${dmgPills(f.deal)}</span><span class="dmg-cell">${dmgPills(f.take)}</span><span class="dmg-note muted">${f.note}</span></div>`
  ).join('');
  const emp = EMPIRE_RESISTS.map(
    (e) =>
      `<div class="dmg-row"><span class="dmg-name">${e.name}</span><span class="dmg-cell">${dmgPills(e.strong)}</span><span class="dmg-cell">${dmgPills([e.hole])}</span><span class="dmg-note muted">${e.note}</span></div>`
  ).join('');
  const holes = TANK_HOLES.map(
    (h) =>
      `<div class="dmg-row"><span class="dmg-name">${h.layer}</span><span class="dmg-cell">${h.weakest}</span><span class="dmg-cell">${h.strongest}</span><span class="dmg-note"></span></div>`
  ).join('');
  el.innerHTML = `
    <div class="section-label">NPC factions — deal / take</div>
    <div class="dmg-head"><span class="dmg-name"></span><span class="dmg-cell">shoot them</span><span class="dmg-cell">they shoot</span><span class="dmg-note"></span></div>
    ${npc}
    <div class="section-label">Empire hulls — strong / weak hole</div>
    <div class="dmg-head"><span class="dmg-name"></span><span class="dmg-cell">resists</span><span class="dmg-cell">hole</span><span class="dmg-note"></span></div>
    ${emp}
    <div class="section-label">Base tank resist holes</div>
    <div class="dmg-head"><span class="dmg-name"></span><span class="dmg-cell">weakest</span><span class="dmg-cell">strongest</span><span class="dmg-note"></span></div>
    ${holes}
    <div class="dmg-legend muted">EM <span class="dt-pill dt-em">EM</span> Thermal <span class="dt-pill dt-th">TH</span> Kinetic <span class="dt-pill dt-ki">KI</span> Explosive <span class="dt-pill dt-ex">EX</span></div>
  `;
}

async function renderNotes(el) {
  if (!window.notes) {
    el.innerHTML = '<div class="empty-state">Notes bridge unavailable.</div>';
    return;
  }
  let text = '';
  try {
    text = await window.notes.get();
  } catch (_e) {
    /* ignore */
  }
  el.innerHTML = `
    <div class="section-label">Scratchpad <span id="notes-saved" class="muted"></span></div>
    <textarea id="notes-area" class="text-area notes-area" placeholder="Intel, shopping lists, saved fits, links… Saved automatically."></textarea>
  `;
  const area = el.querySelector('#notes-area');
  area.value = text || '';
  const saved = el.querySelector('#notes-saved');
  area.addEventListener('input', () => {
    saved.textContent = 'saving…';
    clearTimeout(toolsState.notesTimer);
    toolsState.notesTimer = setTimeout(async () => {
      try {
        await window.notes.set(area.value);
        saved.textContent = 'saved';
        setTimeout(() => {
          if (saved) saved.textContent = '';
        }, 1500);
      } catch (_e) {
        saved.textContent = 'save failed';
      }
    }, 600);
  });
}

async function renderNews(el) {
  if (!window.news) {
    el.innerHTML = '<div class="empty-state">News bridge unavailable.</div>';
    return;
  }
  if (!toolsState.news && !toolsState.newsLoading) {
    toolsState.newsLoading = true;
    el.innerHTML = '<div class="empty-state">Loading EVE news…</div>';
    try {
      toolsState.news = await window.news.get();
    } catch (_e) {
      toolsState.news = { items: [], feeds: [] };
    }
    toolsState.newsLoading = false;
  }
  const data = toolsState.news || { items: [] };
  const rows = (data.items || [])
    .map(
      (it) =>
        `<button class="news-row" data-url="${escapeAttr(it.link)}"><span class="news-title">${it.title || '(untitled)'}</span><span class="news-meta muted">${it.source || ''}${it.date ? ' · ' + new Date(it.ts || it.date).toLocaleDateString() : ''}</span></button>`
    )
    .join('');
  el.innerHTML = `
    <div class="section-label">EVE news & patch notes <button class="mini-btn" id="news-refresh">Refresh</button></div>
    ${rows || '<div class="empty-state small">No items. Check the feed URLs below.</div>'}
    <div class="news-feeds-edit">
      <div class="section-label">Feeds (name | url per line)</div>
      <textarea id="news-feeds" class="text-area news-feeds-area"></textarea>
      <button class="mini-btn" id="news-save-feeds">Save feeds</button>
    </div>
  `;
  el.querySelectorAll('.news-row').forEach((b) =>
    b.addEventListener('click', () => {
      if (b.dataset.url) window.eve && window.eve.openExternal(b.dataset.url);
    })
  );
  const feedsArea = el.querySelector('#news-feeds');
  feedsArea.value = (data.feeds || []).map((f) => `${f.name} | ${f.url}`).join('\n');
  el.querySelector('#news-refresh').addEventListener('click', () => {
    toolsState.news = null;
    renderTools();
  });
  el.querySelector('#news-save-feeds').addEventListener('click', async () => {
    const feeds = feedsArea.value
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const i = l.indexOf('|');
        if (i === -1) return { name: l, url: l };
        return { name: l.slice(0, i).trim(), url: l.slice(i + 1).trim() };
      });
    try {
      await window.news.setFeeds(feeds);
      toolsState.news = null;
      renderTools();
    } catch (_e) {
      /* ignore */
    }
  });
}

// ---------- Account hub (multi-char, assets, mail, corp) ----------
const accountState = {
  mode: 'overview',
  loading: false,
  error: '',
  roster: null,
  overview: null,
  assetsQuery: '',
  assets: null,
  insights: null,
  mailCharId: null,
  mailLabels: [],
  mailList: [],
  mailPage: 1,
  mailPages: 1,
  mailLabelFilter: null,
  selectedMailId: null,
  mailDetail: null,
  corpData: null,
  corpQuery: '',
  compose: { to: '', subject: '', body: '' }
};

const searchState = {
  query: '',
  loading: false,
  error: '',
  groups: []
};

async function refreshAccountRoster() {
  if (!window.eve) return;
  try {
    const st = await window.eve.authState();
    accountState.roster = st.roster || { characters: [], activeId: null };
    if (!accountState.mailCharId && accountState.roster.activeId) {
      accountState.mailCharId = accountState.roster.activeId;
    }
  } catch (_e) {
    accountState.roster = { characters: [], activeId: null };
  }
}

function renderAccount() {
  const root = document.getElementById('account-view');
  if (!window.accountHub || !window.eve) {
    root.innerHTML = '<div class="empty-state">Account bridge unavailable.</div>';
    return;
  }

  const chars = (accountState.roster && accountState.roster.characters) || [];
  const activeId = accountState.roster && accountState.roster.activeId;

  root.innerHTML = `
    ${pageHead('Account', 'Monitor all logged-in characters — overview, assets across alts, mail, and corp watch.')}
    <div class="acct-header">
      <div class="acct-roster" id="acct-roster"></div>
      <div class="acct-actions">
        <button class="primary-btn mini" id="acct-add">+ Add character</button>
        <button class="link-btn" id="acct-relogin">Re-login (new scopes)</button>
      </div>
    </div>
    <div class="mkt-modes acct-modes">
      <button class="mkt-mode${accountState.mode === 'overview' ? ' active' : ''}" data-amode="overview">Overview</button>
      <button class="mkt-mode${accountState.mode === 'assets' ? ' active' : ''}" data-amode="assets">Assets</button>
      <button class="mkt-mode${accountState.mode === 'insights' ? ' active' : ''}" data-amode="insights">Insights</button>
      <button class="mkt-mode${accountState.mode === 'mail' ? ' active' : ''}" data-amode="mail">Mail</button>
      <button class="mkt-mode${accountState.mode === 'corp' ? ' active' : ''}" data-amode="corp">Corp</button>
    </div>
    <div class="setup-text acct-hint">
      ESI has no “all alts” API — log in each character once with <b>Add character</b>.
      Data is aggregated here for overview, cross-alt asset search, mail, and corp watch.
    </div>
    <div id="acct-body"></div>
  `;

  const rosterEl = root.querySelector('#acct-roster');
  if (chars.length === 0) {
    rosterEl.innerHTML =
      '<span class="muted">No characters on roster — add your main and alts.</span>';
  } else {
    rosterEl.innerHTML = chars
      .map(
        (c) => `
      <button class="acct-char${c.id === activeId ? ' active' : ''}" data-cid="${c.id}" title="Set active">
        <span class="acct-char-name">${escapeHtml(c.name)}</span>
        <span class="acct-char-remove" data-remove="${c.id}" title="Remove">×</span>
      </button>`
      )
      .join('');
    rosterEl.querySelectorAll('.acct-char').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        if (e.target.closest('[data-remove]')) return;
        await window.eve.setActive(btn.dataset.cid);
        await refreshAccountRoster();
        renderAccount();
      });
    });
    rosterEl.querySelectorAll('[data-remove]').forEach((x) => {
      x.addEventListener('click', async (e) => {
        e.stopPropagation();
        await window.eve.removeChar(x.dataset.remove);
        await refreshAccountRoster();
        renderAccount();
      });
    });
  }

  root.querySelector('#acct-add').addEventListener('click', async () => {
    try {
      await window.eve.login();
      await refreshAccountRoster();
      renderAccount();
      loadAccountMode();
    } catch (err) {
      accountState.error = err.message || String(err);
      renderAccountBody();
    }
  });
  root.querySelector('#acct-relogin').addEventListener('click', async () => {
    try {
      await window.eve.login();
      await refreshAccountRoster();
      renderAccount();
      loadAccountMode();
    } catch (_e) {
      /* ignore */
    }
  });

  root.querySelectorAll('[data-amode]').forEach((b) =>
    b.addEventListener('click', () => {
      accountState.mode = b.dataset.amode;
      renderAccount();
      loadAccountMode();
    })
  );

  renderAccountBody();
  if (!accountState.overview && chars.length > 0 && accountState.mode === 'overview') {
    loadAccountMode();
  }
}

function renderAccountBody() {
  const body = document.getElementById('acct-body');
  if (!body) return;
  const chars = (accountState.roster && accountState.roster.characters) || [];

  if (chars.length === 0) {
    body.innerHTML =
      '<div class="empty-state">Add at least one character to use the account hub.</div>';
    return;
  }

  if (accountState.error) {
    body.innerHTML = `<div class="me-error">${accountState.error}</div>`;
    return;
  }

  if (accountState.loading) {
    body.innerHTML = '<div class="empty-state">Loading account data…</div>';
    return;
  }

  if (accountState.mode === 'overview') renderAccountOverview(body);
  else if (accountState.mode === 'assets') renderAccountAssets(body);
  else if (accountState.mode === 'insights') renderAccountInsights(body);
  else if (accountState.mode === 'mail') renderAccountMail(body);
  else if (accountState.mode === 'corp') renderAccountCorp(body);
}

function renderAccountOverview(body) {
  const d = accountState.overview;
  if (!d || !d.loggedIn) {
    body.innerHTML = '<div class="empty-state small">Refresh overview…</div>';
    return;
  }
  const ins = d.insights || {};
  const summary = `
    <div class="acct-summary">
      <div class="acct-stat"><span class="lbl">Characters</span><span class="val">${ins.characterCount || 0}</span></div>
      <div class="acct-stat"><span class="lbl">Total wallet</span><span class="val">${iskFormat(ins.totalWallet || 0)}</span></div>
      <div class="acct-stat"><span class="lbl">Total SP</span><span class="val">${spFormat(ins.totalSp || 0)}</span></div>
      <div class="acct-stat"><span class="lbl">Training</span><span class="val">${ins.training || 0} / ${ins.characterCount || 0}</span></div>
    </div>`;
  const emptyQ = (ins.emptyQueues || []).length
    ? `<div class="acct-note warn">Empty skill queues: ${ins.emptyQueues.join(', ')}</div>`
    : '';
  const rows = (d.characters || [])
    .map((r) => {
      if (!r.ok) {
        return `<tr class="acct-row-err"><td>${escapeHtml(r.name)}</td><td colspan="5">${escapeHtml(r.error || 'Error')}</td></tr>`;
      }
      return `<tr>
        <td><b>${escapeHtml(r.name)}</b></td>
        <td>${r.wallet != null ? iskFormat(r.wallet) : '—'}</td>
        <td>${r.totalSp != null ? spFormat(r.totalSp) : '—'}</td>
        <td class="muted">${escapeHtml(r.system || '—')}</td>
        <td class="muted">${escapeHtml(r.ship || '—')}</td>
        <td class="muted">${escapeHtml(r.corp || '—')}</td>
      </tr>`;
    })
    .join('');
  body.innerHTML =
    summary +
    emptyQ +
    `<table class="acct-table"><thead><tr>
      <th>Pilot</th><th>Wallet</th><th>SP</th><th>System</th><th>Ship</th><th>Corp</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
}

function renderAccountAssets(body) {
  body.innerHTML = `
    <div class="market-search">
      <input id="acct-asset-q" class="search-box" type="text"
        placeholder="Filter items across all characters…" value="${escapeAttr(accountState.assetsQuery)}" />
      <button class="primary-btn" id="acct-asset-go">Search</button>
    </div>
    <div id="acct-asset-results"></div>`;
  const input = body.querySelector('#acct-asset-q');
  const go = () => loadAccountAssets(input.value);
  body.querySelector('#acct-asset-go').addEventListener('click', go);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') go();
  });
  renderAccountAssetResults();
}

function renderAccountAssetResults() {
  const el = document.getElementById('acct-asset-results');
  if (!el) return;
  const d = accountState.assets;
  if (!d || !d.loggedIn) {
    el.innerHTML = '<div class="empty-state small">Search to load consolidated hangar assets (first load may take a moment).</div>';
    return;
  }
  el.innerHTML = `
    <div class="acct-asset-meta muted">
      ${d.itemCount || 0} asset rows · ${d.uniqueTypes || 0} item types · est. Jita value ${iskFormat(d.totalEstIsk || 0)}
    </div>`;
  const rows = (d.rows || [])
    .map((r) => {
      const alts = Object.entries(r.byChar || {})
        .map(([n, q]) => `${n}: ${q}`)
        .join(' · ');
      return `<div class="acct-asset-row">
        <span class="acct-asset-name">${escapeHtml(r.name)}</span>
        <span class="acct-asset-qty">×${(r.totalQty || 0).toLocaleString()}</span>
        <span class="acct-asset-val">${iskFormat(r.estValue || 0)}</span>
        <span class="acct-asset-alts muted">${escapeHtml(alts)}</span>
      </div>`;
    })
    .join('');
  el.innerHTML += rows || '<div class="empty-state small">No matching items.</div>';
}

function renderAccountInsights(body) {
  const d = accountState.insights;
  if (!d || !d.loggedIn) {
    body.innerHTML = '<div class="empty-state small">Computing insights…</div>';
    return;
  }
  const ins = d.insights || {};
  const dupes = (ins.topDuplicates || [])
    .map(
      (x) =>
        `<div class="insight-row"><b>${escapeHtml(x.name)}</b> <span class="muted">on ${escapeHtml(x.chars.join(', '))}</span></div>`
    )
    .join('');
  const topVal = (ins.topValueItems || [])
    .map(
      (r) =>
        `<div class="insight-row"><span>${escapeHtml(r.name)}</span><span>${iskFormat(r.estValue || 0)}</span></div>`
    )
    .join('');
  body.innerHTML = `
    <div class="acct-summary">
      <div class="acct-stat"><span class="lbl">Duplicated types</span><span class="val">${ins.duplicatedAcrossAlts || 0}</span></div>
      <div class="acct-stat"><span class="lbl">Est. hangar value</span><span class="val">${iskFormat(d.totalEstIsk || 0)}</span></div>
    </div>
    <div class="section-label">Same item on multiple alts</div>
    ${dupes || '<div class="empty-state small">No duplicates found.</div>'}
    <div class="section-label" style="margin-top:12px">Top value in hangars</div>
    ${topVal || '<div class="empty-state small">—</div>'}`;
}

function renderAccountMail(body) {
  const chars = (accountState.roster && accountState.roster.characters) || [];
  const cid = accountState.mailCharId || accountState.roster.activeId;
  const opts = chars
    .map((c) => `<option value="${c.id}"${c.id === cid ? ' selected' : ''}>${escapeHtml(c.name)}</option>`)
    .join('');

  body.innerHTML = `
    <div class="mail-toolbar">
      <label class="muted">Mailbox</label>
      <select id="mail-char" class="text-input">${opts}</select>
      <button class="primary-btn mini" id="mail-refresh">Refresh</button>
      <button class="link-btn" id="mail-compose">Compose</button>
    </div>
    <div id="mail-compose-panel" class="mail-compose" style="display:none"></div>
    <div class="mail-split">
      <div id="mail-list" class="mail-list"></div>
      <div id="mail-read" class="mail-read"></div>
    </div>`;

  body.querySelector('#mail-char').addEventListener('change', (e) => {
    accountState.mailCharId = Number(e.target.value);
    accountState.mailPage = 1;
    accountState.selectedMailId = null;
    accountState.mailDetail = null;
    loadAccountMail();
  });
  body.querySelector('#mail-refresh').addEventListener('click', () => loadAccountMail());
  body.querySelector('#mail-compose').addEventListener('click', () => toggleMailCompose(body));

  renderMailList();
  renderMailRead();
  if (!accountState.mailList.length) loadAccountMail();
}

function toggleMailCompose(body) {
  const panel = body.querySelector('#mail-compose-panel');
  const open = panel.style.display !== 'none';
  if (open) {
    panel.style.display = 'none';
    return;
  }
  panel.style.display = 'block';
  const c = accountState.compose;
  panel.innerHTML = `
    <input id="mail-to" class="text-input" placeholder="Recipient character ID" value="${escapeAttr(c.to)}" />
    <input id="mail-subj" class="text-input" placeholder="Subject" value="${escapeAttr(c.subject)}" />
    <textarea id="mail-body" class="text-area" placeholder="Body">${escapeAttr(c.body)}</textarea>
    <button class="primary-btn" id="mail-send">Send</button>`;
  panel.querySelector('#mail-send').addEventListener('click', async () => {
    const charId = accountState.mailCharId || accountState.roster.activeId;
    const to = panel.querySelector('#mail-to').value.trim();
    const subject = panel.querySelector('#mail-subj').value.trim();
    const bodyText = panel.querySelector('#mail-body').value;
    if (!to) return;
    try {
      await window.eveMail.send(charId, Number(to), subject, bodyText);
      panel.style.display = 'none';
      loadAccountMail();
    } catch (err) {
      accountState.error = err.message || String(err);
      renderMailRead();
    }
  });
}

function renderMailList() {
  const el = document.getElementById('mail-list');
  if (!el) return;
  const mails = accountState.mailList || [];
  if (!mails.length) {
    el.innerHTML = '<div class="empty-state small">No mail loaded.</div>';
    return;
  }
  el.innerHTML = mails
    .map(
      (m) => `
    <button class="mail-row${m.id === accountState.selectedMailId ? ' active' : ''}${m.isRead ? '' : ' unread'}" data-mid="${m.id}">
      <span class="mail-subj">${escapeHtml(m.subject)}</span>
      <span class="mail-from muted">${escapeHtml(String(m.from))}</span>
      <span class="mail-ts muted">${(m.timestamp || '').slice(0, 10)}</span>
    </button>`
    )
    .join('');
  el.querySelectorAll('.mail-row').forEach((b) =>
    b.addEventListener('click', () => openMail(b.dataset.mid))
  );
}

async function openMail(mailId) {
  accountState.selectedMailId = Number(mailId);
  const charId = accountState.mailCharId || accountState.roster.activeId;
  try {
    accountState.mailDetail = await window.eveMail.read(charId, Number(mailId));
  } catch (err) {
    accountState.mailDetail = { error: err.message || String(err) };
  }
  renderMailList();
  renderMailRead();
}

function renderMailRead() {
  const el = document.getElementById('mail-read');
  if (!el) return;
  const d = accountState.mailDetail;
  if (!d) {
    el.innerHTML = '<div class="empty-state small">Select a message.</div>';
    return;
  }
  if (d.error) {
    el.innerHTML = `<div class="me-error">${d.error}</div>`;
    return;
  }
  el.innerHTML = `
    <div class="mail-read-head"><b>${escapeHtml(d.subject || '')}</b>
      <span class="muted"> from ${escapeHtml(String(d.from))}</span></div>
    <pre class="mail-body">${escapeHtml(d.body || '')}</pre>`;
}

function renderAccountCorp(body) {
  body.innerHTML = `
    <div class="market-search">
      <input id="corp-q" class="search-box" type="text" placeholder="Corp name (optional) or use active char's corp"
        value="${escapeAttr(accountState.corpQuery)}" />
      <button class="primary-btn" id="corp-go">Monitor</button>
    </div>
    <div id="corp-results"></div>`;
  body.querySelector('#corp-go').addEventListener('click', () => loadAccountCorp(body.querySelector('#corp-q').value));
  renderCorpResults();
}

function renderCorpResults() {
  const el = document.getElementById('corp-results');
  if (!el) return;
  const d = accountState.corpData;
  if (!d) {
    el.innerHTML =
      '<div class="empty-state small">Shows your active character\'s corporation — wars, member count, zKill stats.</div>';
    return;
  }
  if (!d.ok) {
    el.innerHTML = `<div class="me-error">${escapeHtml(d.error || 'Failed')}</div>`;
    return;
  }
  const wars = (d.wars || [])
    .map((w) => `<li>War #${w.id} · started ${(w.started || '').slice(0, 10)}${w.mutual ? ' · mutual' : ''}</li>`)
    .join('');
  const zk = d.zkill
    ? `<div class="corp-zk">zKill: ${d.zkill.shipsDestroyed || 0} kills · danger ${Math.round(d.zkill.dangerRatio || 0)}%</div>`
    : '';
  el.innerHTML = `
    <div class="corp-card">
      <h3>[${escapeHtml(d.ticker || '?')}] ${escapeHtml(d.name)}</h3>
      <div class="muted">${d.members || '?'} members · ${escapeHtml(d.alliance || 'no alliance')}</div>
      <div class="muted">Active wars: ${d.warCount || 0}${d.memberListAvailable ? ' · member list (director scope)' : ''}</div>
      ${zk}
      ${wars ? `<ul class="corp-wars">${wars}</ul>` : ''}
      <button class="link-btn" id="corp-intel">Open in Intel</button>
    </div>`;
  el.querySelector('#corp-intel').addEventListener('click', () => {
    setTab('intel');
    if (d.name) doIntel(d.name);
  });
}

async function loadAccountMode() {
  accountState.error = '';
  if (accountState.mode === 'overview') await loadAccountOverview();
  else if (accountState.mode === 'assets') await loadAccountAssets(accountState.assetsQuery);
  else if (accountState.mode === 'insights') await loadAccountInsights();
  else if (accountState.mode === 'mail') await loadAccountMail();
  else if (accountState.mode === 'corp') await loadAccountCorp(accountState.corpQuery);
}

async function loadAccountOverview() {
  accountState.loading = true;
  renderAccountBody();
  try {
    accountState.overview = await window.accountHub.overview();
  } catch (err) {
    accountState.error = err.message || String(err);
  }
  accountState.loading = false;
  renderAccountBody();
}

async function loadAccountAssets(query) {
  accountState.assetsQuery = query || '';
  accountState.loading = true;
  renderAccountBody();
  try {
    accountState.assets = await window.accountHub.assets(accountState.assetsQuery);
  } catch (err) {
    accountState.error = err.message || String(err);
  }
  accountState.loading = false;
  renderAccountBody();
}

async function loadAccountInsights() {
  accountState.loading = true;
  renderAccountBody();
  try {
    accountState.insights = await window.accountHub.insights();
  } catch (err) {
    accountState.error = err.message || String(err);
  }
  accountState.loading = false;
  renderAccountBody();
}

async function loadAccountMail() {
  const charId = accountState.mailCharId || accountState.roster.activeId;
  if (!charId || !window.eveMail) return;
  accountState.loading = true;
  renderAccountBody();
  try {
    const labels = await window.eveMail.labels(charId);
    accountState.mailLabels = labels.labels || [];
    const inbox = (labels.labels || []).find((l) => l.name === 'Inbox');
    const labelIds = inbox ? [inbox.label_id] : [];
    const list = await window.eveMail.list(charId, labelIds, accountState.mailPage || 1);
    accountState.mailList = list.mails || [];
    accountState.mailPages = list.pages || 1;
  } catch (err) {
    accountState.error = err.message || String(err);
    accountState.mailList = [];
  }
  accountState.loading = false;
  renderAccountBody();
}

async function loadAccountCorp(name) {
  accountState.corpQuery = name || '';
  accountState.loading = true;
  renderAccountBody();
  try {
    if (name && name.trim()) {
      accountState.corpData = await window.corpwatch.lookup(name.trim());
    } else {
      accountState.corpData = await window.corpwatch.monitor(null);
    }
  } catch (err) {
    accountState.corpData = { ok: false, error: err.message || String(err) };
  }
  accountState.loading = false;
  renderAccountBody();
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------- New Eden search ----------
function renderSearch() {
  const root = document.getElementById('search-view');
  if (!window.eden) {
    root.innerHTML = '<div class="empty-state">Search bridge unavailable.</div>';
    return;
  }
  root.innerHTML = `
    ${pageHead('New Eden search', 'Find characters, corps, systems, regions, and items — click a result to jump to Intel or Map.')}
    <div class="market-search">
      <input id="eden-q" class="search-box" type="text"
        placeholder="Character, corp, alliance, system, region, item…" value="${escapeAttr(searchState.query)}" />
      <button class="primary-btn" id="eden-go">Search</button>
    </div>
    <div class="setup-text">Search pilots, corps, items, and locations. Open the <b>Map</b> tab once first if system/region search returns nothing (builds the local star map index).</div>
    <div id="eden-results"></div>`;
  const input = root.querySelector('#eden-q');
  const go = () => doEdenSearch(input.value);
  root.querySelector('#eden-go').addEventListener('click', go);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') go();
  });
  input.focus();
  renderEdenResults();
}

async function doEdenSearch(q) {
  searchState.query = (q || '').trim();
  if (!searchState.query) return;
  searchState.loading = true;
  searchState.error = '';
  renderEdenResults();
  try {
    const res = await window.eden.search(searchState.query);
    searchState.groups = res.groups || [];
    if (res.error) searchState.error = res.error;
  } catch (err) {
    searchState.groups = [];
    searchState.error = err.message || String(err);
  }
  searchState.loading = false;
  renderEdenResults();
}

function renderEdenResults() {
  const el = document.getElementById('eden-results');
  if (!el) return;
  if (searchState.loading) {
    el.innerHTML = '<div class="empty-state">Searching New Eden…</div>';
    return;
  }
  if (searchState.error) {
    el.innerHTML = `<div class="me-error">${searchState.error}</div>`;
    return;
  }
  const groups = searchState.groups || [];
  if (!groups.length) {
    el.innerHTML =
      '<div class="empty-state">No matches. Try another spelling, open <b>Map</b> once for system data, or use exact in-game names for items.</div>';
    return;
  }
  el.innerHTML = groups
    .map((g) => {
      const rows = (g.results || [])
        .map(
          (r) =>
            `<button class="eden-hit" data-cat="${escapeAttr(g.category)}" data-name="${escapeAttr(r.name)}" data-id="${r.id}">
          <span>${escapeHtml(r.name)}</span>
          <span class="muted">#${r.id}</span>
        </button>`
        )
        .join('');
      return `<div class="eden-group"><div class="section-label">${escapeHtml(g.label)}</div>${rows}</div>`;
    })
    .join('');
  el.querySelectorAll('.eden-hit').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cat = btn.dataset.cat;
      const name = btn.dataset.name;
      if (cat === 'character' || cat === 'alliance') {
        setTab('intel');
        doIntel(name);
      } else if (cat === 'corporation') {
        setTab('account');
        accountState.mode = 'corp';
        accountState.corpQuery = name;
        refreshAccountRoster().then(() => {
          renderAccount();
          loadAccountCorp(name);
        });
      } else if (cat === 'solar_system') {
        setTab('map');
        setTimeout(() => {
          const hits = searchPlaces(name);
          if (hits && hits[0]) pickPlace(hits[0]);
        }, 400);
      }
    });
  });
}

// ---------- Ops tab (elite veteran tools) ----------
const OPS_MODES = [
  { id: 'route', label: 'Route' },
  { id: 'situational', label: 'Threat' },
  { id: 'career', label: 'Career' },
  { id: 'killmail', label: 'Killmail' },
  { id: 'courier', label: 'Courier' },
  { id: 'wh', label: 'WH Log' },
  { id: 'fleet', label: 'Fleet' },
  { id: 'arbitrage', label: 'Arbitrage' },
  { id: 'fit', label: 'Fit' },
  { id: 'camps', label: 'Camps' }
];

const opsState = {
  mode: 'route',
  loading: false,
  error: '',
  route: { from: '', to: '', flag: 'shortest', data: null },
  situational: { range: 6, data: null },
  career: { data: null },
  killmail: { input: '', data: null },
  courier: { regionId: 10000002, data: null },
  wh: { data: null },
  fleet: { text: '', data: null },
  arbitrage: { flag: 'shortest', data: null },
  fit: { text: '', data: null },
  camps: { data: null }
};

function renderOps() {
  const root = document.getElementById('ops-view');
  if (!window.ops) {
    root.innerHTML = '<div class="empty-state">Ops bridge unavailable.</div>';
    return;
  }

  const modeBtns = OPS_MODES.map(
    (m) =>
      `<button class="mkt-mode ops-mode${opsState.mode === m.id ? ' active' : ''}" data-omode="${m.id}">${m.label}</button>`
  ).join('');

  root.innerHTML = `
    ${pageHead('Ops', 'Veteran tools — route briefs, threat fusion, killmail analysis, fleet rollup, WH chains, and more.')}
    <div class="mkt-modes ops-modes">${modeBtns}</div>
    <div id="ops-body"></div>
  `;

  root.querySelectorAll('[data-omode]').forEach((b) =>
    b.addEventListener('click', () => {
      opsState.mode = b.dataset.omode;
      opsState.error = '';
      renderOps();
      loadOpsMode();
    })
  );

  const body = root.querySelector('#ops-body');
  if (opsState.mode === 'route') renderOpsRoute(body);
  else if (opsState.mode === 'situational') renderOpsSituational(body);
  else if (opsState.mode === 'career') renderOpsCareer(body);
  else if (opsState.mode === 'killmail') renderOpsKillmail(body);
  else if (opsState.mode === 'courier') renderOpsCourier(body);
  else if (opsState.mode === 'wh') renderOpsWh(body);
  else if (opsState.mode === 'fleet') renderOpsFleet(body);
  else if (opsState.mode === 'arbitrage') renderOpsArbitrage(body);
  else if (opsState.mode === 'fit') renderOpsFit(body);
  else if (opsState.mode === 'camps') renderOpsCamps(body);

  if (
    !opsState.loading &&
    (opsState.mode === 'wh' || opsState.mode === 'camps' || shouldAutoLoadOps())
  ) {
    loadOpsMode();
  }
}

function shouldAutoLoadOps() {
  if (opsState.mode === 'route') return !!opsState.route.data;
  if (opsState.mode === 'situational') return !!opsState.situational.data;
  if (opsState.mode === 'career') return !!opsState.career.data;
  if (opsState.mode === 'killmail') return !!opsState.killmail.data;
  if (opsState.mode === 'courier') return !!opsState.courier.data;
  if (opsState.mode === 'wh') return !!opsState.wh.data;
  if (opsState.mode === 'fleet') return !!opsState.fleet.data;
  if (opsState.mode === 'arbitrage') return !!opsState.arbitrage.data;
  if (opsState.mode === 'fit') return !!opsState.fit.data;
  if (opsState.mode === 'camps') return !!opsState.camps.data;
  return false;
}

function loadOpsMode() {
  if (opsState.mode === 'wh') return loadOpsWh();
  if (opsState.mode === 'camps') return loadOpsCamps();
  if (opsState.mode === 'situational' && !opsState.situational.data) return runOpsSituational();
  return Promise.resolve();
}

function opsRiskBadge(risk) {
  const r = String(risk || 'low').toLowerCase();
  return `<span class="ops-risk ops-risk-${r}">${r}</span>`;
}

function opsThreatBadge(level) {
  const l = String(level || 'green').toLowerCase();
  return `<span class="ops-threat ops-threat-${l}">${l}</span>`;
}

function renderOpsRoute(el) {
  el.innerHTML = `
    <div class="section-label">Jump-by-jump route brief</div>
    <div class="route-row">
      <input id="ops-route-from" class="search-box route-input" type="text" placeholder="From system" value="${escapeAttr(opsState.route.from)}" />
      <input id="ops-route-to" class="search-box route-input" type="text" placeholder="To system" value="${escapeAttr(opsState.route.to)}" />
      <select id="ops-route-flag" class="route-flag">
        <option value="shortest"${opsState.route.flag === 'shortest' ? ' selected' : ''}>fastest</option>
        <option value="secure"${opsState.route.flag === 'secure' ? ' selected' : ''}>safer</option>
        <option value="insecure"${opsState.route.flag === 'insecure' ? ' selected' : ''}>less safe</option>
      </select>
      <button class="primary-btn mini" id="ops-route-go">Brief</button>
    </div>
    <div class="setup-text ops-hint">Open the Map tab once to build the system index. Combines route + kills/hr + live zKill activity per jump.</div>
    <div id="ops-route-out"></div>
  `;
  el.querySelector('#ops-route-from').addEventListener('input', (e) => {
    opsState.route.from = e.target.value;
  });
  el.querySelector('#ops-route-to').addEventListener('input', (e) => {
    opsState.route.to = e.target.value;
  });
  el.querySelector('#ops-route-flag').addEventListener('change', (e) => {
    opsState.route.flag = e.target.value;
  });
  el.querySelector('#ops-route-go').addEventListener('click', runOpsRoute);
  renderOpsRouteOut();
}

async function runOpsRoute() {
  const out = document.getElementById('ops-route-out');
  if (!out) return;
  opsState.loading = true;
  out.innerHTML = '<div class="empty-state small">Plotting route + scanning kills…</div>';
  try {
    opsState.route.data = await window.ops.routeBrief(
      opsState.route.from,
      opsState.route.to,
      opsState.route.flag
    );
  } catch (e) {
    opsState.route.data = { ok: false, error: e.message || String(e) };
  }
  opsState.loading = false;
  renderOpsRouteOut();
}

function renderOpsRouteOut() {
  const out = document.getElementById('ops-route-out');
  if (!out) return;
  const d = opsState.route.data;
  if (!d) return;
  if (!d.ok) {
    out.innerHTML = `<div class="me-error">${escapeHtml(d.error || 'Route brief failed.')}</div>`;
    return;
  }
  const rows = (d.jumps || [])
    .map(
      (j) =>
        `<tr class="${j.camp ? 'ops-camp-row' : ''}${j.endpoint ? ' ops-endpoint' : ''}">
          <td>${escapeHtml(j.name)}</td>
          <td class="muted">${escapeHtml(j.region)}</td>
          <td class="${secClass(j.sec)}">${j.sec.toFixed(1)}</td>
          <td>${j.killsHr}${j.podHr ? ` <span class="muted">(${j.podHr} pod)</span>` : ''}</td>
          <td>${j.liveRecent ? `<span class="ops-live">${j.liveRecent}</span>` : '—'}</td>
          <td>${j.camp ? '<span class="rad-tag rad-camp">CAMP?</span>' : ''}</td>
        </tr>`
    )
    .join('');
  const hot = d.hotGate
    ? `<div class="ops-summary">Hot gate: <b>${escapeHtml(d.hotGate.name)}</b> — ${d.hotGate.killsHr} kills/hr</div>`
    : '';
  out.innerHTML = `
    <div class="ops-brief-head">
      <span><b>${escapeHtml(d.from)}</b> → <b>${escapeHtml(d.to)}</b> · ${d.jumpCount}j · ${opsRiskBadge(d.risk)}</span>
      <span class="muted">${d.totalKillsHr} ship/pod kills/hr on pipe</span>
    </div>
    ${hot}
    <table class="ops-table">
      <thead><tr><th>System</th><th>Region</th><th>Sec</th><th>Kills/hr</th><th>Live</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderOpsSituational(el) {
  el.innerHTML = `
    <div class="section-label">Situational threat fusion
      <select id="ops-sit-range" class="route-flag">
        ${[4, 6, 8, 10].map((j) => `<option value="${j}"${opsState.situational.range === j ? ' selected' : ''}>${j}j</option>`).join('')}
      </select>
      <button class="mini-btn" id="ops-sit-go">Scan</button>
    </div>
    <div class="setup-text ops-hint">Fuses radar, gate camps, and your current location into a single threat score. Log in for location-aware intel.</div>
    <div id="ops-sit-out"></div>
  `;
  el.querySelector('#ops-sit-range').addEventListener('change', (e) => {
    opsState.situational.range = Number(e.target.value) || 6;
  });
  el.querySelector('#ops-sit-go').addEventListener('click', runOpsSituational);
  renderOpsSituationalOut();
}

async function runOpsSituational() {
  const out = document.getElementById('ops-sit-out');
  if (!out) return;
  opsState.loading = true;
  out.innerHTML = '<div class="empty-state small">Fusing threat data…</div>';
  try {
    opsState.situational.data = await window.ops.situational(opsState.situational.range);
  } catch (e) {
    opsState.situational.data = { ok: false, error: e.message || String(e) };
  }
  opsState.loading = false;
  renderOpsSituationalOut();
}

function renderOpsSituationalOut() {
  const out = document.getElementById('ops-sit-out');
  if (!out) return;
  const d = opsState.situational.data;
  if (!d) return;
  if (!d.ok) {
    out.innerHTML = `<div class="me-error">${escapeHtml(d.error || 'Threat scan failed.')}</div>`;
    return;
  }
  const reasons = (d.reasons || []).map((r) => `<li>${escapeHtml(r)}</li>`).join('');
  const r = d.radar || {};
  const near = (r.nearby || [])
    .slice(0, 12)
    .map(
      (n) =>
        `<button class="rad-row lvl${n.level}"><span class="rad-j">${n.jumps}j</span><span class="rad-name">${escapeHtml(n.name)}</span><span class="rad-mid muted">${n.ship + n.pod} k/hr</span>${dangerTag(n)}</button>`
    )
    .join('');
  out.innerHTML = `
    <div class="ops-sit-head">
      <span>Threat score <b>${d.score}</b></span>
      ${opsThreatBadge(d.level)}
    </div>
    <ul class="ops-reasons">${reasons || '<li class="muted">No elevated threats detected.</li>'}</ul>
    ${r.location ? `<div class="rad-loc">You are in <b>${escapeHtml(r.location.name)}</b> <span class="${secClass(r.location.sec)}">${r.location.sec.toFixed(1)}</span></div>` : ''}
    ${near || ''}
  `;
}

function renderOpsCareer(el) {
  el.innerHTML = `
    <div class="section-label">Career analytics <button class="mini-btn" id="ops-career-go">Load</button></div>
    <div class="setup-text ops-hint">Wallet trends, SP growth, K/D, and a loss heatmap — same data as Me tab, tuned for quick review.</div>
    <div id="ops-career-out"></div>
  `;
  el.querySelector('#ops-career-go').addEventListener('click', runOpsCareer);
  if (opsState.career.data) renderOpsCareerOut();
}

async function runOpsCareer() {
  const out = document.getElementById('ops-career-out');
  if (!out) return;
  opsState.loading = true;
  out.innerHTML = '<div class="empty-state small">Reading wallet / SP / loss history…</div>';
  try {
    opsState.career.data = await window.ops.careerStats();
    out.innerHTML = renderCareer(opsState.career.data);
    const c = out.querySelector('#career-spark-net');
    if (c && opsState.career.data.history) drawSpark(c, opsState.career.data.history.map((h) => h.wallet));
    const c2 = out.querySelector('#career-spark-sp');
    if (c2 && opsState.career.data.history) drawSpark(c2, opsState.career.data.history.map((h) => h.sp));
  } catch (e) {
    out.innerHTML = `<div class="me-error">${escapeHtml(e.message || String(e))}</div>`;
  }
  opsState.loading = false;
}

function renderOpsCareerOut() {
  const out = document.getElementById('ops-career-out');
  if (!out || !opsState.career.data) return;
  out.innerHTML = renderCareer(opsState.career.data);
}

function renderOpsKillmail(el) {
  el.innerHTML = `
    <div class="section-label">Killmail counter-intel</div>
    <input id="ops-km-input" class="search-box" type="text" placeholder="zKill URL or kill ID…" value="${escapeAttr(opsState.killmail.input)}" />
    <button class="primary-btn mini" id="ops-km-go">Analyze</button>
    <div id="ops-km-out"></div>
  `;
  el.querySelector('#ops-km-input').addEventListener('input', (e) => {
    opsState.killmail.input = e.target.value;
  });
  el.querySelector('#ops-km-go').addEventListener('click', runOpsKillmail);
  renderOpsKillmailOut();
}

async function runOpsKillmail() {
  const out = document.getElementById('ops-km-out');
  if (!out) return;
  opsState.loading = true;
  out.innerHTML = '<div class="empty-state small">Pulling killmail from zKill + ESI…</div>';
  try {
    opsState.killmail.data = await window.ops.killmailAnalyze(opsState.killmail.input);
  } catch (e) {
    opsState.killmail.data = { ok: false, error: e.message || String(e) };
  }
  opsState.loading = false;
  renderOpsKillmailOut();
}

function renderOpsKillmailOut() {
  const out = document.getElementById('ops-km-out');
  if (!out) return;
  const d = opsState.killmail.data;
  if (!d) return;
  if (!d.ok) {
    out.innerHTML = `<div class="me-error">${escapeHtml(d.error || 'Analysis failed.')}</div>`;
    return;
  }
  const profile = (d.damageProfile || [])
    .map((p) => `<span class="dt-pill dt-${p.type === 'em' ? 'em' : p.type === 'thermal' ? 'th' : p.type === 'kinetic' ? 'ki' : 'ex'}">${p.type.toUpperCase()} ${p.pct}%</span>`)
    .join(' ');
  const top = (d.topDamage || [])
    .map(
      (t) =>
        `<div class="ops-km-row"><span>${escapeHtml(t.ship)}</span><span class="muted">${iskShortR(t.damage)}</span>${t.finalBlow ? '<span class="rad-tag rad-hot">FB</span>' : ''}</div>`
    )
    .join('');
  out.innerHTML = `
    <div class="ops-km-head">
      <button class="link-btn" data-url="${escapeAttr(d.url)}">${escapeHtml(d.victim)} lost in ${escapeHtml(d.system)}</button>
      <span class="muted">${iskShortR(d.value)} · ${d.attackers} attackers</span>
    </div>
    <div class="section-label small">Damage profile</div>
    <div class="ops-km-profile">${profile || '<span class="muted">—</span>'}</div>
    <div class="ops-hint muted">${escapeHtml(d.hint || '')}</div>
    <div class="section-label small">Top damage dealers</div>
    ${top || '<div class="empty-state small">—</div>'}
  `;
  out.querySelector('[data-url]')?.addEventListener('click', (e) => {
    const url = e.currentTarget.dataset.url;
    if (url && window.eve) window.eve.openExternal(url);
  });
}

function renderOpsCourier(el) {
  el.innerHTML = `
    <div class="section-label">Courier profit board
      <select id="ops-courier-region" class="route-flag">
        <option value="10000002"${opsState.courier.regionId === 10000002 ? ' selected' : ''}>The Forge</option>
        <option value="10000043"${opsState.courier.regionId === 10000043 ? ' selected' : ''}>Domain</option>
        <option value="10000032"${opsState.courier.regionId === 10000032 ? ' selected' : ''}>Sinq Laison</option>
        <option value="10000030"${opsState.courier.regionId === 10000030 ? ' selected' : ''}>Heimatar</option>
        <option value="10000042"${opsState.courier.regionId === 10000042 ? ' selected' : ''}>Metropolis</option>
      </select>
      <button class="mini-btn" id="ops-courier-go">Scan</button>
    </div>
    <div class="setup-text ops-hint">Ranks public courier contracts by ISK/m³ and flags risky collateral ratios.</div>
    <div id="ops-courier-out"></div>
  `;
  el.querySelector('#ops-courier-region').addEventListener('change', (e) => {
    opsState.courier.regionId = Number(e.target.value) || 10000002;
  });
  el.querySelector('#ops-courier-go').addEventListener('click', runOpsCourier);
  renderOpsCourierOut();
}

async function runOpsCourier() {
  const out = document.getElementById('ops-courier-out');
  if (!out) return;
  opsState.loading = true;
  out.innerHTML = '<div class="empty-state small">Scanning public courier contracts…</div>';
  try {
    opsState.courier.data = await window.ops.courierBoard(opsState.courier.regionId);
  } catch (e) {
    opsState.courier.data = { ok: false, error: e.message || String(e) };
  }
  opsState.loading = false;
  renderOpsCourierOut();
}

function courierGradeTag(grade) {
  const g = String(grade || 'fair');
  return `<span class="ops-grade ops-grade-${g}">${g}</span>`;
}

function renderOpsCourierOut() {
  const out = document.getElementById('ops-courier-out');
  if (!out) return;
  const d = opsState.courier.data;
  if (!d) return;
  if (!d.ok) {
    out.innerHTML = `<div class="me-error">${escapeHtml(d.error || 'Courier scan failed.')}</div>`;
    return;
  }
  const rows = (d.rows || [])
    .map(
      (c) =>
        `<div class="ops-courier-row">
          <span class="ops-courier-grade">${courierGradeTag(c.grade)}</span>
          <span class="ops-courier-main">
            <span class="ct-val">${iskShortR(c.reward)}</span>
            <span class="ct-sub muted">${escapeHtml(c.start)} → ${escapeHtml(c.end)} · ${volFmt(c.volume)} m³</span>
          </span>
          <span class="ops-courier-meta muted">${c.iskPerM3.toLocaleString()} ISK/m³ · col ${iskShortR(c.collateral)}</span>
        </div>`
    )
    .join('');
  out.innerHTML = rows || '<div class="empty-state small">No courier contracts found.</div>';
}

async function loadOpsWh() {
  try {
    opsState.wh.data = await window.ops.whGet();
  } catch (_e) {
    opsState.wh.data = { links: [] };
  }
  const body = document.getElementById('ops-body');
  if (body && opsState.mode === 'wh') renderOpsWh(body);
}

function renderOpsWh(el) {
  const data = opsState.wh.data || { links: [] };
  el.innerHTML = `
    <div class="section-label">WH chain log
      <button class="mini-btn" id="ops-wh-clear">Clear all</button>
    </div>
    <div class="ops-wh-form">
      <input id="ops-wh-from" class="search-box" type="text" placeholder="From sig (e.g. C3a)" />
      <input id="ops-wh-to" class="search-box" type="text" placeholder="To sig (e.g. HS)" />
      <input id="ops-wh-mass" class="search-box" type="text" placeholder="Mass (optional)" />
      <input id="ops-wh-static" class="search-box" type="text" placeholder="Static (optional)" />
      <button class="primary-btn mini" id="ops-wh-add">Add link</button>
    </div>
    <input id="ops-wh-note" class="search-box" type="text" placeholder="Note (optional)" style="margin-top:6px;width:100%" />
    <div id="ops-wh-out"></div>
  `;
  el.querySelector('#ops-wh-add').addEventListener('click', async () => {
    const link = {
      from: el.querySelector('#ops-wh-from').value,
      to: el.querySelector('#ops-wh-to').value,
      mass: el.querySelector('#ops-wh-mass').value,
      static: el.querySelector('#ops-wh-static').value,
      note: el.querySelector('#ops-wh-note').value
    };
    const res = await window.ops.whAdd(link);
    if (res && res.error) {
      alert(res.error);
      return;
    }
    opsState.wh.data = res;
    renderOpsWh(el);
  });
  el.querySelector('#ops-wh-clear').addEventListener('click', async () => {
    opsState.wh.data = await window.ops.whClear();
    renderOpsWh(el);
  });
  const out = el.querySelector('#ops-wh-out');
  const links = (data.links || [])
    .map(
      (l) =>
        `<div class="ops-wh-row">
          <span class="ops-wh-sig"><b>${escapeHtml(l.from)}</b> → <b>${escapeHtml(l.to)}</b></span>
          <span class="muted">${[l.mass, l.static, l.note].filter(Boolean).join(' · ')}</span>
          <span class="muted">${new Date(l.ts).toLocaleString()}</span>
          <button class="mini-btn ops-wh-del" data-id="${l.id}">×</button>
        </div>`
    )
    .join('');
  out.innerHTML = links || '<div class="empty-state small">No wormhole links logged yet.</div>';
  out.querySelectorAll('.ops-wh-del').forEach((b) =>
    b.addEventListener('click', async () => {
      opsState.wh.data = await window.ops.whRemove(Number(b.dataset.id));
      renderOpsWh(el);
    })
  );
}

function renderOpsFleet(el) {
  el.innerHTML = `
    <div class="section-label">Fleet intel rollup</div>
    <textarea id="ops-fleet-input" class="text-area" placeholder="Paste pilot names, one per line (up to 100)…">${escapeAttr(opsState.fleet.text)}</textarea>
    <button class="primary-btn mini" id="ops-fleet-go">Roll up</button>
    <button class="mini-btn" id="ops-fleet-copy">Copy export</button>
    <div id="ops-fleet-out"></div>
  `;
  el.querySelector('#ops-fleet-input').addEventListener('input', (e) => {
    opsState.fleet.text = e.target.value;
  });
  el.querySelector('#ops-fleet-go').addEventListener('click', runOpsFleet);
  el.querySelector('#ops-fleet-copy').addEventListener('click', () => {
    const t = opsState.fleet.data && opsState.fleet.data.exportText;
    if (t) navigator.clipboard.writeText(t).catch(() => {});
  });
  renderOpsFleetOut();
}

async function runOpsFleet() {
  const out = document.getElementById('ops-fleet-out');
  if (!out) return;
  opsState.loading = true;
  out.innerHTML = '<div class="empty-state small">Looking up pilots on zKill…</div>';
  try {
    opsState.fleet.data = await window.ops.fleetRollup(opsState.fleet.text);
  } catch (e) {
    opsState.fleet.data = { ok: false, error: e.message || String(e) };
  }
  opsState.loading = false;
  renderOpsFleetOut();
}

function renderOpsFleetOut() {
  const out = document.getElementById('ops-fleet-out');
  if (!out) return;
  const d = opsState.fleet.data;
  if (!d) return;
  if (!d.ok) {
    out.innerHTML = `<div class="me-error">${escapeHtml(d.error || 'Fleet rollup failed.')}</div>`;
    return;
  }
  const counts = d.counts || {};
  const summary = `high ${counts.high || 0} · med ${counts.medium || 0} · low ${counts.low || 0} · ${d.total} pilots`;
  const rows = (d.rows || [])
    .map(
      (r) =>
        `<div class="ops-fleet-row ops-threat-${r.threat}">
          <span class="ops-fleet-threat">${r.threat.toUpperCase()}</span>
          <span class="ops-fleet-name">${escapeHtml(r.name)}</span>
          <span class="muted">${r.kills}k · ${Math.round(r.danger)}%</span>
          <span class="muted">${escapeHtml(r.corporation || '')}</span>
        </div>`
    )
    .join('');
  out.innerHTML = `
    <div class="ops-fleet-summary">${summary}</div>
    ${rows}
  `;
}

function renderOpsArbitrage(el) {
  el.innerHTML = `
    <div class="section-label">Hub arbitrage + route risk
      <select id="ops-arb-flag" class="route-flag">
        <option value="shortest"${opsState.arbitrage.flag === 'shortest' ? ' selected' : ''}>fastest routes</option>
        <option value="secure"${opsState.arbitrage.flag === 'secure' ? ' selected' : ''}>safer routes</option>
      </select>
      <button class="mini-btn" id="ops-arb-go">Scan</button>
    </div>
    <div class="setup-text ops-hint">Best hauling spreads across the five trade hubs, annotated with pipe danger between hubs.</div>
    <div id="ops-arb-out"></div>
  `;
  el.querySelector('#ops-arb-flag').addEventListener('change', (e) => {
    opsState.arbitrage.flag = e.target.value;
  });
  el.querySelector('#ops-arb-go').addEventListener('click', runOpsArbitrage);
  renderOpsArbitrageOut();
}

async function runOpsArbitrage() {
  const out = document.getElementById('ops-arb-out');
  if (!out) return;
  opsState.loading = true;
  out.innerHTML = '<div class="empty-state small">Scanning hub spreads + route danger…</div>';
  try {
    opsState.arbitrage.data = await window.ops.arbitragePro(opsState.arbitrage.flag);
  } catch (e) {
    opsState.arbitrage.data = { ok: false, error: e.message || String(e) };
  }
  opsState.loading = false;
  renderOpsArbitrageOut();
}

function opsHubRisk(haul, danger) {
  if (!haul || !danger) return '';
  const key = `${haul.from}\u2192${haul.to}`;
  const r = danger[key];
  if (!r) return '';
  return `<span class="ops-route-risk muted">${r.kills || 0} k/hr on pipe</span>`;
}

function renderOpsArbitrageOut() {
  const out = document.getElementById('ops-arb-out');
  if (!out) return;
  const d = opsState.arbitrage.data;
  if (!d) return;
  if (!d.ok) {
    out.innerHTML = `<div class="me-error">${escapeHtml(d.error || 'Arbitrage scan failed.')}</div>`;
    return;
  }
  const danger = d.hubDanger || {};
  const rows = (d.deals || [])
    .filter((x) => x.haul)
    .map((x) => {
      const h = x.haul;
      return `<div class="ops-arb-row">
        <span class="ops-arb-name">${escapeHtml(x.name)}</span>
        <span class="ops-arb-route muted">${escapeHtml(h.from)} → ${escapeHtml(h.to)}</span>
        <span class="ops-arb-profit">${iskShortR(h.profit)} <span class="muted">(${h.margin.toFixed(1)}%)</span></span>
        ${opsHubRisk(h, danger)}
      </div>`;
    })
    .join('');
  out.innerHTML = rows || '<div class="empty-state small">No strong hauling spreads right now.</div>';
}

function renderOpsFit(el) {
  el.innerHTML = `
    <div class="section-label">Fit logistics</div>
    <textarea id="ops-fit-input" class="text-area" placeholder="Paste an EFT fit — skills check + Jita buy/sell cost…">${escapeAttr(opsState.fit.text)}</textarea>
    <button class="primary-btn mini" id="ops-fit-go">Check</button>
    <div id="ops-fit-out"></div>
  `;
  el.querySelector('#ops-fit-input').addEventListener('input', (e) => {
    opsState.fit.text = e.target.value;
  });
  el.querySelector('#ops-fit-go').addEventListener('click', runOpsFit);
  renderOpsFitOut();
}

async function runOpsFit() {
  const out = document.getElementById('ops-fit-out');
  if (!out) return;
  opsState.loading = true;
  out.innerHTML = '<div class="empty-state small">Checking skills + pricing…</div>';
  try {
    opsState.fit.data = await window.ops.fitLogistics(opsState.fit.text);
  } catch (e) {
    opsState.fit.data = { ok: false, error: e.message || String(e) };
  }
  opsState.loading = false;
  renderOpsFitOut();
}

function renderOpsFitOut() {
  const out = document.getElementById('ops-fit-out');
  if (!out) return;
  const d = opsState.fit.data;
  if (!d) return;
  if (!d.ok) {
    out.innerHTML = `<div class="me-error">${escapeHtml(d.error || 'Fit check failed.')}</div>`;
    return;
  }
  if (!d.items) {
    out.innerHTML = '<div class="empty-state small">No modules recognized.</div>';
    return;
  }
  const missing = (d.requirements || []).filter((r) => !r.ok);
  const status = !d.loggedIn
    ? '<div class="fc-note muted">Log in (Me tab) to compare against your trained skills.</div>'
    : missing.length === 0
      ? '<div class="fc-ok">✓ You can fly this fit — all skills trained.</div>'
      : `<div class="fc-bad">✗ Missing ${missing.length} skill(s) · ${volFmt(d.totalMissingSp)} SP to train</div>`;
  const reqRows = (d.requirements || [])
    .map(
      (r) =>
        `<div class="fc-skill ${r.ok ? 'ok' : 'bad'}"><span>${escapeHtml(r.name)}</span><span>${r.have}/${r.need}</span></div>`
    )
    .join('');
  const price = d.price
    ? `<div class="fc-price">Cost ${priceFmt(d.price.totalSell)} · sell value ${priceFmt(d.price.totalBuy)}</div>`
    : '';
  out.innerHTML = `${status}${price}<div class="fc-skills">${reqRows}</div>`;
}

function renderOpsCamps(el) {
  el.innerHTML = `
    <div class="section-label">Gate camp watch <button class="mini-btn" id="ops-camps-go">Refresh</button></div>
    <div class="setup-text ops-hint">Live gate camps and clustered battles from the threat radar — refreshes every 60s while this tab is open.</div>
    <div id="ops-camps-out"></div>
  `;
  el.querySelector('#ops-camps-go').addEventListener('click', loadOpsCamps);
  renderOpsCampsOut();
  if (!opsState.campsTimer) {
    opsState.campsTimer = setInterval(() => {
      if (opsState.mode === 'camps' && document.getElementById('ops-camps-out')) loadOpsCamps();
    }, 60000);
  }
}

async function loadOpsCamps() {
  const out = document.getElementById('ops-camps-out');
  if (!out) return;
  if (!opsState.camps.data) out.innerHTML = '<div class="empty-state small">Scanning for gate camps…</div>';
  try {
    opsState.camps.data = await window.ops.gateCamps();
  } catch (e) {
    opsState.camps.data = { ok: false, error: e.message || String(e) };
  }
  renderOpsCampsOut();
}

function renderOpsCampsOut() {
  const out = document.getElementById('ops-camps-out');
  if (!out) return;
  const d = opsState.camps.data;
  if (!d) return;
  if (!d.ok) {
    out.innerHTML = `<div class="me-error">${escapeHtml(d.error || 'Camp scan failed. Open Map tab first.')}</div>`;
    return;
  }
  const camps = (d.camps || [])
    .map(
      (b) =>
        `<button class="rad-row"><span class="rad-name">${escapeHtml(b.name)}</span><span class="rad-mid muted">${escapeHtml(b.region)} · ${(b.topShips || []).slice(0, 2).join(', ')}</span>${b.camp ? '<span class="rad-tag rad-camp">CAMP?</span>' : `<span class="rad-tag rad-battle">${b.kills}</span>`}</button>`
    )
    .join('');
  const hot = (d.nearbyHot || [])
    .map(
      (n) =>
        `<button class="rad-row lvl${n.level}"><span class="rad-j">${n.jumps}j</span><span class="rad-name">${escapeHtml(n.name)}</span><span class="rad-mid muted">${n.ship + n.pod} k/hr</span>${dangerTag(n)}</button>`
    )
    .join('');
  out.innerHTML = `
    <div class="section-label small">Likely gate camps</div>
    ${camps || '<div class="empty-state small">No obvious camps right now.</div>'}
    <div class="section-label small">Hot systems within 3j (if logged in)</div>
    ${hot || '<div class="empty-state small">—</div>'}
  `;
}

// ---------- Navigation ----------
function activateTab(name) {
  const navItems = document.querySelectorAll('.nav-item[data-tab]');
  const views = document.querySelectorAll('.view');
  navItems.forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  views.forEach((v) => v.classList.remove('active'));
  const view = document.getElementById(`${name}-view`);
  if (view) view.classList.add('active');

  if (name === 'me') loadCharacter();
  if (name === 'fits') loadCommunity().then(renderFits);
  if (name === 'market') loadCatalog().then(renderMarket);
  if (name === 'map') renderMap();
  if (name === 'intel') renderIntel();
  if (name === 'account') refreshAccountRoster().then(renderAccount);
  if (name === 'search') renderSearch();
  if (name === 'ops') renderOps();
  if (name === 'industry') renderIndustry();
  if (name === 'tools') renderTools();
}

function setTab(name) {
  activateTab(name);
}

function setupTabs() {
  document.querySelectorAll('.nav-item[data-tab]').forEach((tab) => {
    tab.addEventListener('click', () => activateTab(tab.dataset.tab));
  });
}

// ---------- Header buttons ----------
let headerLocked = false;

function setupHeader() {
  const hideBtn = document.getElementById('hide-btn');
  hideBtn.addEventListener('click', () => {
    if (window.shell && window.shell.hide) window.shell.hide();
    else {
      document.body.style.opacity = '0';
      setTimeout(() => (document.body.style.opacity = '1'), 150);
    }
  });

  const expandBtn = document.getElementById('expand-btn');
  if (expandBtn) {
    updateExpandButton();
    expandBtn.addEventListener('click', async () => {
      if (!window.shell || !window.shell.toggleExpand) return;
      const result = await window.shell.toggleExpand();
      await applyShellMode(result.mode);
      if (!isDesktopMode() && headerLocked && window.overlay) {
        headerLocked = false;
        const lockBtn = document.getElementById('lock-btn');
        if (lockBtn) {
          lockBtn.classList.remove('locked');
          lockBtn.textContent = 'Lock';
        }
        window.overlay.setIgnoreMouse(false);
      }
    });
  }

  if (shellState._headerLockHooked) return;
  shellState._headerLockHooked = true;

  const lockBtn = document.getElementById('lock-btn');
  if (!lockBtn || !window.overlay) return;

  lockBtn.addEventListener('click', () => {
    if (isDesktopMode()) return;
    headerLocked = !headerLocked;
    lockBtn.classList.toggle('locked', headerLocked);
    lockBtn.textContent = headerLocked ? 'Locked' : 'Lock';
    window.overlay.setIgnoreMouse(headerLocked);
    updateStatus(headerLocked);
  });

  const titlebar = document.getElementById('titlebar');
  titlebar.addEventListener('mouseenter', () => {
    if (headerLocked && !isDesktopMode()) window.overlay.setIgnoreMouse(false);
  });
  titlebar.addEventListener('mouseleave', () => {
    if (headerLocked && !isDesktopMode()) window.overlay.setIgnoreMouse(true);
  });

  window.overlay.onClickThroughChanged((value) => {
    if (isDesktopMode()) {
      headerLocked = false;
      lockBtn.classList.remove('locked');
      lockBtn.textContent = 'Lock';
      return;
    }
    headerLocked = value;
    lockBtn.classList.toggle('locked', headerLocked);
    lockBtn.textContent = headerLocked ? 'Locked' : 'Lock';
    updateStatus(headerLocked);
  });
}

function updateStatus(locked) {
  const status = document.getElementById('status-text');
  if (!status) return;
  if (isDesktopMode()) {
    status.textContent =
      'DESKTOP MODE · DRAG TITLEBAR · RESIZE EDGES · ALT+SHIFT+D COMPACT';
    return;
  }
  status.textContent = locked
    ? 'CLICK-THROUGH ACTIVE · HOVER TITLEBAR TO INTERACT · ALT+SHIFT+E'
    : 'TITLEBAR · DRAG · ALT+SHIFT+D EXPAND · ALT+E HIDE';
}

// ---------- Global status strip (EVE time / downtime / TQ status) ----------
function pad2(n) {
  return String(n).padStart(2, '0');
}

function updateEveClock() {
  const el = document.querySelector('#eve-status-strip .ess-clock');
  const dtEl = document.querySelector('#eve-status-strip .ess-dt');
  if (!el) return;
  const now = new Date();
  el.textContent = `${pad2(now.getUTCHours())}:${pad2(now.getUTCMinutes())}:${pad2(now.getUTCSeconds())}`;
  // EVE's classic daily downtime is 11:00 UTC — show a countdown to the next one.
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 11, 0, 0)
  );
  if (now.getTime() >= next.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  const diff = next.getTime() - now.getTime();
  const hh = Math.floor(diff / 3600000);
  const mm = Math.floor((diff % 3600000) / 60000);
  if (dtEl) dtEl.textContent = `DT ${hh}h${pad2(mm)}m`;
}

async function refreshTqStatus() {
  if (!window.serverStatus) return;
  let st;
  try {
    st = await window.serverStatus.get();
  } catch (_e) {
    return;
  }
  const dot = document.querySelector('#eve-status-strip .ess-dot');
  const txt = document.querySelector('#eve-status-strip .ess-tq-text');
  if (!txt) return;
  if (st && st.online) {
    const players = (st.players || 0).toLocaleString();
    txt.textContent = st.vip ? `VIP · ${players}` : `TQ ${players}`;
    if (dot) dot.className = 'ess-dot ' + (st.vip ? 'vip' : 'online');
  } else {
    txt.textContent = 'TQ offline';
    if (dot) dot.className = 'ess-dot offline';
  }
}

function setupStatusStrip() {
  updateEveClock();
  setInterval(updateEveClock, 1000);
  refreshTqStatus();
  setInterval(refreshTqStatus, 60000);
}

// ---------- Init ----------
(async function bootstrap() {
  await initShellMode();
  renderTips();
  renderFits();
  renderMarket();
  setupTabs();
  setupHeader();
  setupStatusStrip();
  loadCommunity().then(renderFits);
  if (window.market) loadCatalog().catch(() => {});
  if (esiAvailable()) {
    window.eve
      .authState()
      .then((state) => {
        const root = document.getElementById('me-view');
        if (!state.loggedIn) renderLoginPrompt(root, state);
      })
      .catch(() => {});
  }
})();
