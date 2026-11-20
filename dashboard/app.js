// SPDX-License-Identifier: MIT
// Pre-Token Radar page: reads window.RADAR (written by main.ts into ../data.js), no network, no framework.
// State lives in the URL hash (tab, filters, sort, open protocol) so every view can be linked.
(function () {
  'use strict';
  const D = window.RADAR;
  const app = document.getElementById('app');
  const drawer = document.getElementById('drawer');
  if (!D) { app.textContent = 'data.js is missing: run main.ts first.'; return; }

  const SEGMENTS = [
    ['all', 'All'],
    ['watchlist', 'Watchlist'],
    ['early', 'Early (< floor)'],
    ['off-list', 'Off-list > floor'],
    ['derivative', 'Wrapper / staked'],
  ];
  const COLS = [
    ['rank', 'Rank', 'num'],
    ['name', 'Protocol', ''],
    ['segment', 'Set', ''],
    ['tvl_usd', 'TVL', 'num'],
    ['change_7d', '7d', 'num'],
    ['age_days', 'Days, no token', 'num'],
    ['multiple', 'Cat. mcap/TVL', 'num'],
    ['implied_value_usd', 'Implied value', 'num'],
    ['airdrop_per_1k_usd', 'Drop / $1k', 'num'],
    ['farm_cost', 'Farm: capital · gas · hold', ''],
  ];

  // ---------- formatting ----------
  function usd(n) {
    if (n === null || n === undefined) return '–';
    const a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(a >= 1e10 ? 1 : 2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(a >= 1e8 ? 0 : 1) + 'M';
    if (a >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + n.toFixed(2);
  }
  const pct = (n) => (n === null || n === undefined ? '–' : (n >= 0 ? '+' : '') + n.toFixed(1) + '%');
  const x = (n) => '×' + n.toFixed(n < 0.1 ? 3 : 2);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content; };

  // ---------- state ----------
  const S = { tab: 'board', q: '', seg: 'all', cat: '', chain: '', min: 0, grow: false, sort: 'rank', dir: 'asc', p: '' };
  function readHash() {
    const h = new URLSearchParams(location.hash.slice(1));
    for (const k of Object.keys(S)) {
      if (!h.has(k)) continue;
      const v = h.get(k);
      S[k] = k === 'min' ? Number(v) || 0 : k === 'grow' ? v === '1' : v;
    }
  }
  function writeHash() {
    const h = new URLSearchParams();
    if (S.tab !== 'board') h.set('tab', S.tab);
    if (S.q) h.set('q', S.q);
    if (S.seg !== 'all') h.set('seg', S.seg);
    if (S.cat) h.set('cat', S.cat);
    if (S.chain) h.set('chain', S.chain);
    if (S.min) h.set('min', String(S.min));
    if (S.grow) h.set('grow', '1');
    if (S.sort !== 'rank') h.set('sort', S.sort);
    if (S.dir !== 'asc') h.set('dir', S.dir);
    if (S.p) h.set('p', S.p);
    history.replaceState(null, '', '#' + h.toString());
  }

  const bySlug = new Map(D.rows.map((r) => [r.slug, r]));
  const calByCat = new Map(D.calibration.map((c) => [c.category, c]));
  const maxVal = D.rows[0].implied_value_usd;
  const cats = [...new Set(D.rows.map((r) => r.category || 'Uncategorised'))].sort();
  const chainCount = new Map();
  D.rows.forEach((r) => r.chains.forEach((c) => chainCount.set(c, (chainCount.get(c) || 0) + 1)));
  const chains = [...chainCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map((e) => e[0]);

  function sortKey(r, k) {
    if (k === 'multiple') return r.factors.multiple;
    if (k === 'name') return r.name.toLowerCase();
    if (k === 'farm_cost') return r.farm.capital_usd + r.farm.gas_usd;
    return r[k];
  }

  function filtered() {
    const q = S.q.trim().toLowerCase();
    const rows = D.rows.filter((r) =>
      (S.seg === 'all' || r.segment === S.seg) &&
      (!S.cat || (r.category || 'Uncategorised') === S.cat) &&
      (!S.chain || r.chains.includes(S.chain)) &&
      r.tvl_usd >= S.min &&
      (!S.grow || (r.change_7d !== null && r.change_7d > 0)) &&
      (!q || r.name.toLowerCase().includes(q) || r.slug.includes(q) || (r.category || '').toLowerCase().includes(q)));
    const sign = S.dir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      const va = sortKey(a, S.sort), vb = sortKey(b, S.sort);
      if (va === vb) return a.rank - b.rank;
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      return va < vb ? -sign : sign;
    });
    return rows;
  }

  // ---------- header ----------
  function renderMeta() {
    document.getElementById('meta').textContent = `snapshot ${D.as_of} · ${D.protocol_count} protocols · model ${D.model.version}`;
    const top = D.rows[0];
    const wl = D.rows.filter((r) => r.segment === 'watchlist');
    const wlVal = wl.reduce((s, r) => s + r.implied_value_usd, 0);
    const kp = [
      [D.rows.length, 'pre-token protocols ranked'],
      [`${wl.length}/${D.watchlist_size}`, 'watchlist covered'],
      [usd(wlVal), 'implied value of the watchlist'],
      [top.name, `top implied value, ${usd(top.implied_value_usd)}`],
      [D.live.length, 'live tokens calibrate the model'],
    ];
    document.getElementById('kpis').innerHTML = kp.map((k) => `<div class="kpi"><b>${esc(k[0])}</b><span>${esc(k[1])}</span></div>`).join('');
    document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === S.tab)));
  }

  // ---------- board ----------
  function renderBoard() {
    const rows = filtered();
    const segCount = (s) => (s === 'all' ? D.rows.length : D.rows.filter((r) => r.segment === s).length);
    const f = el(`<div class="filters">
      <input type="search" id="q" placeholder="Search name, slug or category" value="${esc(S.q)}" aria-label="Search">
      <div class="chips">${SEGMENTS.map(([k, l]) => `<button class="chip" data-seg="${k}" aria-pressed="${S.seg === k}">${l}<small>${segCount(k)}</small></button>`).join('')}</div>
      <select id="cat" aria-label="Category"><option value="">All categories</option>${cats.map((c) => `<option ${c === S.cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <select id="chain" aria-label="Chain"><option value="">All chains</option>${chains.map((c) => `<option ${c === S.chain ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <select id="min" aria-label="Minimum TVL">${[[0, 'Any TVL'], [1e7, 'TVL ≥ $10M'], [2.5e7, 'TVL ≥ $25M'], [5e7, 'TVL ≥ $50M'], [2e8, 'TVL ≥ $200M']].map(([v, l]) => `<option value="${v}" ${v === S.min ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <label><input type="checkbox" id="grow" ${S.grow ? 'checked' : ''}> growing this week</label>
      <button class="reset" id="reset">Reset</button>
      <span class="count">${rows.length} of ${D.rows.length} shown</span>
    </div>`);
    const head = COLS.map(([k, l, c]) => `<th data-k="${k}" class="${c}" ${S.sort === k ? `aria-sort="${S.dir === 'asc' ? 'ascending' : 'descending'}"` : ''}>${l}</th>`).join('');
    const body = rows.map((r) => `<tr data-slug="${esc(r.slug)}" class="${r.slug === S.p ? 'sel' : ''}">
      <td class="num rank">${r.rank}</td>
      <td class="name"><b>${esc(r.name)}</b><small>${esc(r.category || 'Uncategorised')} · ${esc(r.chains.slice(0, 2).join(', '))}${r.chains.length > 2 ? ' +' + (r.chains.length - 2) : ''}</small></td>
      <td><span class="tag ${r.segment}">${r.segment}</span></td>
      <td class="num">${usd(r.tvl_usd)}</td>
      <td class="num ${r.change_7d > 0 ? 'up' : r.change_7d < 0 ? 'down' : ''}">${pct(r.change_7d)}</td>
      <td class="num">${r.age_days === null ? '<span class="muted">unknown</span>' : r.age_days}</td>
      <td class="num">${x(r.factors.multiple)}</td>
      <td class="num"><span class="val">${usd(r.implied_value_usd)}</span> <span class="bar"><i style="width:${Math.max(2, Math.sqrt(r.implied_value_usd / maxVal) * 100).toFixed(1)}%"></i></span></td>
      <td class="num">${usd(r.airdrop_per_1k_usd)}</td>
      <td class="farm"><b>${esc(r.farm.play)}</b><small>$${r.farm.capital_usd.toLocaleString('en-US')} · ~$${r.farm.gas_usd} gas · ${r.farm.hold_days} d</small></td>
    </tr>`).join('');
    app.replaceChildren(f, el(`<div class="tablewrap"><table><thead><tr>${head}</tr></thead><tbody>${body || '<tr><td colspan="10" class="muted">No protocol matches these filters.</td></tr>'}</tbody></table></div>`));
    wireBoard();
  }

  function wireBoard() {
    const set = (k, v) => { S[k] = v; update(); };
    const q = app.querySelector('#q');
    q.addEventListener('input', () => { S.q = q.value; writeHash(); const pos = q.selectionStart; renderBoard(); const n = app.querySelector('#q'); n.focus(); n.setSelectionRange(pos, pos); });
    app.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => set('seg', b.dataset.seg)));
    app.querySelector('#cat').addEventListener('change', (e) => set('cat', e.target.value));
    app.querySelector('#chain').addEventListener('change', (e) => set('chain', e.target.value));
    app.querySelector('#min').addEventListener('change', (e) => set('min', Number(e.target.value)));
    app.querySelector('#grow').addEventListener('change', (e) => set('grow', e.target.checked));
    app.querySelector('#reset').addEventListener('click', () => { Object.assign(S, { q: '', seg: 'all', cat: '', chain: '', min: 0, grow: false, sort: 'rank', dir: 'asc' }); update(); });
    app.querySelectorAll('th').forEach((th) => th.addEventListener('click', () => {
      const k = th.dataset.k;
      if (S.sort === k) S.dir = S.dir === 'asc' ? 'desc' : 'asc';
      else { S.sort = k; S.dir = k === 'rank' || k === 'name' ? 'asc' : 'desc'; }
      update();
    }));
    app.querySelectorAll('tbody tr[data-slug]').forEach((tr) => tr.addEventListener('click', () => set('p', tr.dataset.slug)));
  }

  // ---------- detail ----------
  function renderDrawer() {
    const r = bySlug.get(S.p);
    if (!r) { drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); return; }
    const f = r.factors;
    const cal = calByCat.get(r.category || 'Uncategorised');
    const m = D.model;
    const steps = [
      ['TVL', usd(r.tvl_usd), 'DefiLlama, ' + D.as_of],
      ['× category multiple', x(f.multiple), cal && cal.live_count ? `median mcap/TVL of ${cal.live_count} live ${esc(r.category)} token${cal.live_count > 1 ? 's' : ''} (raw ×${cal.raw_median}), shrunk to all-token ×${D.global_multiple}` : `no live ${esc(r.category || 'uncategorised')} token: all-token median ×${D.global_multiple}`],
      ['× momentum', x(f.momentum), `7-day TVL change ${pct(r.change_7d)}, clamped to ${m.mom_floor}..+${m.mom_cap}%, weight ${m.momentum_weight}`],
      ['× track record', x(f.track), f.age_days === null ? 'no listing date: held at ' + m.unknown_track : `${f.age_days} days listed with no token (full credit at ${m.track_days})`],
      ['× structure', x(f.structure), r.structure_note ? esc(r.structure_note) : 'stand-alone protocol'],
    ];
    const chainHtml = steps.map((s) => `<div>${s[0]}<div class="why">${s[2]}</div></div><div></div><div class="num">${s[1]}</div>`).join('') +
      `<div class="total">= implied value</div><div></div><div class="num total">${usd(r.implied_value_usd)}</div>`;
    const plan = r.farm_plan.map((s) => `<li><div class="ph">${s.phase}</div>${esc(s.text)}<div class="ct"><span>Cost <b>${esc(s.cost)}</b></span><span>Time <b>${esc(s.time)}</b></span></div></li>`).join('');
    drawer.innerHTML = `<button class="close" id="close">Close ✕</button>
      <div class="muted">#${r.rank} of ${D.rows.length} · <span class="tag ${r.segment}">${r.segment}</span> · records no token</div>
      <h2>${esc(r.name)}</h2>
      <div class="muted">${esc(r.category || 'Uncategorised')} · ${esc(r.chains.join(', '))}</div>
      <h3>Record</h3>
      <div class="facts">
        <div><b>${usd(r.tvl_usd)}</b><span>TVL</span></div>
        <div><b class="${r.change_7d > 0 ? 'up' : 'down'}">${pct(r.change_7d)}</b><span>7-day change</span></div>
        <div><b>${r.listed_at || 'unknown'}</b><span>listed on DefiLlama</span></div>
        <div><b class="val">${usd(r.implied_value_usd)}</b><span>implied value</span></div>
        <div><b>${x(r.implied_mcap_to_tvl)}</b><span>implied mcap / TVL</span></div>
        <div><b>${usd(r.airdrop_per_1k_usd)}</b><span>per $1k if ${Math.round(m.airdrop_share * 100)}% goes to TVL</span></div>
      </div>
      <div class="dgrid"><div>
      <h3>How the value is built</h3><div class="chain">${chainHtml}</div>
      ${cal && cal.examples.length ? `<p class="muted">Category peers that trade: ${cal.examples.map(esc).join(', ')}.</p>` : ''}
      </div><div>
      <h3>Farm plan · ${esc(r.farm.play)}</h3>
      <div class="sum"><div><b>$${r.farm.capital_usd.toLocaleString('en-US')}</b><span>capital, recoverable</span></div><div><b>~$${r.farm.gas_usd}</b><span>gas, whole window</span></div><div><b>${r.farm.hold_days} days</b><span>hold</span></div><div><b>${Math.round(r.farm.hands_on_minutes / 6) / 10} h</b><span>hands-on time</span></div></div>
      <ol class="plan">${plan}</ol></div></div>`;
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    drawer.querySelector('#close').addEventListener('click', () => { S.p = ''; update(); });
  }

  // ---------- live + model ----------
  function renderLive() {
    const calRows = D.calibration.map((c) => `<tr><td>${esc(c.category)}</td><td class="num">${c.live_count}</td><td class="num">${c.raw_median === null ? '–' : x(c.raw_median)}</td><td class="num val">${x(c.multiple)}</td><td class="muted">${c.examples.map(esc).join(', ') || 'none: uses the all-token median'}</td></tr>`).join('');
    const liveRows = D.live.slice(0, 60).map((p) => `<tr><td><b>${esc(p.name)}</b> <span class="muted">${esc(p.symbol || '')}</span></td><td>${esc(p.category || '')}</td><td class="num">${usd(p.mcap_usd)}</td><td class="num">${usd(p.tvl_usd)}</td><td class="num">${p.mcap_usd ? x(p.mcap_usd / p.tvl_usd) : '–'}</td></tr>`).join('');
    app.replaceChildren(el(`<div class="cards">
      <div class="card"><h2>Category multiples the board uses</h2><p class="muted">Read from the snapshot's ${D.live.length} protocols whose token already trades: these are never ranked, only used as the market's price of a dollar of TVL.</p>
        <div class="tablewrap"><table><thead><tr><th>Category</th><th class="num">Live tokens</th><th class="num">Raw median</th><th class="num">Used</th><th>Largest peers</th></tr></thead><tbody>${calRows}</tbody></table></div></div>
      <div class="card"><h2>Live tokens (market values, not modelled)</h2><p class="muted">Top 60 by market cap. Kept apart from the pre-token board.</p>
        <div class="tablewrap"><table><thead><tr><th>Protocol</th><th>Category</th><th class="num">Mcap</th><th class="num">TVL</th><th class="num">Mcap/TVL</th></tr></thead><tbody>${liveRows}</tbody></table></div></div>
    </div>`));
  }

  function renderModel() {
    const m = D.model;
    app.replaceChildren(el(`<div class="cards">
      <div class="card"><h2>Implied value, model ${esc(m.version)}</h2>
        <div class="formula">implied = TVL × categoryMultiple × momentum × track × structure

categoryMultiple = exp(w·ln(catMedian) + (1−w)·ln(allMedian)),  w = n/(n+${m.shrink}),  clamp ${m.mult_min}..${m.mult_max}
momentum         = 1 + ${m.momentum_weight} × clamp(change_7d, ${m.mom_floor}, ${m.mom_cap}) / 100
track            = ${m.track_floor} + ${(1 - m.track_floor).toFixed(2)} × min(days listed, ${m.track_days}) / ${m.track_days}   (unknown: ${m.unknown_track})
structure        = ${m.derivative_haircut} for wrapped / staked / bridged / versioned products and exchanges' own products, else 1</div>
        <p>Every input is a figure in the snapshot: TVL, the seven-day change, the listing date and, for calibration, the market caps of the protocols whose token trades. No protocol is named anywhere in the model. The all-token median multiple is <b>×${D.global_multiple}</b>.</p></div>
      <div class="card"><h2>How to read the board</h2>
        <p><span class="tag watchlist">watchlist</span> the house's ${D.watchlist_size} protocols over ${usd(D.floor_usd)} with no token recorded: all are on the board.</p>
        <p><span class="tag early">early</span> protocols under the floor that record no token: the ones a radar exists to find.</p>
        <p><span class="tag off-list">off-list</span> over the floor, no token recorded, left off the watchlist by its name rule.</p>
        <p><span class="tag derivative">derivative</span> wrappers, liquid staking and bridges: discounted, since their value rides on a token that already trades.</p>
        <p><b>Drop / $1k</b> is what $1,000 of TVL would earn if ${Math.round(m.airdrop_share * 100)}% of the implied value went to TVL providers pro rata: implied/TVL × $1,000 × ${m.airdrop_share}. It compares farms; it is not a forecast.</p>
        <p>A farm plan is built from the record too: capital scales with TVL, gas with the chain, the hold window with the days listed, and the play with the category.</p></div>
    </div>`));
  }

  function update() {
    writeHash();
    renderMeta();
    if (S.tab === 'live') renderLive();
    else if (S.tab === 'model') renderModel();
    else renderBoard();
    renderDrawer();
  }

  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => { S.tab = b.dataset.tab; S.p = ''; update(); }));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.p) { S.p = ''; update(); } });
  window.addEventListener('hashchange', () => { readHash(); update(); });
  readHash();
  update();
})();
