'use strict';
// Regression tests for Bug Batch June 2026 (OPUS-FIRST: bug-batch-june-2026).
//
// Implements the Required Tests from the Opus pre-implementation review for the
// two bugs Opus fully diagnosed:
//   • Bug 1 — Leafeon Lucky Master winner showed Ⓡ instead of Ⓜ (branching Eevee).
//   • Bug 2 — Shiny showed a league-slot nick instead of Ⓡ when NOT a slot winner.
//
// Self-contained synthetic CSVs through the real csvParser + loader (same approach as
// analyse.master_league.test.js). Run with:
//   npx jest tests/analyse.bug_batch_june.test.js --env=node

const loader = require('./loader');
const { analyse } = loader;
const { parseCSV } = require('./csvParser');

const HEADER = [
  'Index','Name','Form','Pokemon Number','Gender','CP','HP',
  'Atk IV','Def IV','Sta IV','IV Avg','Level Min','Level Max',
  'Quick Move','Charge Move','Charge Move 2','Scan Date','Original Scan Date','Catch Date',
  'Weight','Height','Lucky','Shadow/Purified','Favorite','Dust',
  'Rank % (G)','Rank # (G)','Stat Prod (G)','Dust Cost (G)','Candy Cost (G)','Name (G)','Form (G)','Sha/Pur (G)',
  'Rank % (U)','Rank # (U)','Stat Prod (U)','Dust Cost (U)','Candy Cost (U)','Name (U)','Form (U)','Sha/Pur (U)',
  'Rank % (L)','Rank # (L)','Stat Prod (L)','Dust Cost (L)','Candy Cost (L)','Name (L)','Form (L)','Sha/Pur (L)',
  'Marked for PvP use',
];
const row = (o) => HEADER.map(c => (o[c] !== undefined ? o[c] : '')).join(',');
const toCSV = (rows) => parseCSV([HEADER.join(','), ...rows].join('\n'));

// IVs that produce a given ivAvg (= Master rank). ivAvg = (atk+def+sta)/45*100.
const ivFor = (pct) => {
  const total = Math.round(pct / 100 * 45);
  const atk = Math.min(15, total), rem = total - atk;
  const def = Math.min(15, rem), sta = rem - def;
  return { atk, def, sta };
};

// ── Bug 1 — Leafeon Lucky Master winner shows Ⓜ not Ⓡ (branching Eevee) ──────
// Leafeon (Pokémon #470) is a final Eevee evolution → single-stage Master candidate.
// A Lucky 93% wins the non-shadow Master slot over a plain 98% via the +5pp Lucky
// margin (Master_League_Special_Categories_Ruleset). The Lucky winner MUST render Ⓜ;
// the plain loser MUST render Ⓡ.

describe('Bug 1 — Leafeon Lucky Master winner shows Ⓜ (branching Eevee)', () => {
  const leafeon = (cp, pct, opts = {}) => {
    const iv = opts.iv || ivFor(pct);
    return row({
      Index: String(opts.idx || 1), Name: 'Leafeon', 'Pokemon Number': '470', CP: String(cp),
      'Atk IV': String(iv.atk), 'Def IV': String(iv.def), 'Sta IV': String(iv.sta),
      'IV Avg': pct.toFixed(1), 'Level Min': '20',
      Lucky: opts.lucky ? '1' : '0',
      'Shadow/Purified': opts.shadow ? '1' : opts.purified ? '2' : '0',
      Favorite: opts.fav ? '1' : '0', Dust: '5000',
      // token sub-90 Ultra rank so it isn't filtered as unanalysed; Leafeon is final → self-evo cleared.
      'Rank % (U)': '40.0', 'Dust Cost (U)': '300000', 'Name (U)': 'Leafeon',
    });
  };

  it('Lucky Leafeon 93% beats plain Leafeon 98% for Master → LeafeonⓂ93', () => {
    const mons = analyse(toCSV([
      leafeon(2400, 93.3, { iv: { atk: 15, def: 15, sta: 12 }, lucky: true, idx: 1 }),
      leafeon(2600, 97.8, { iv: { atk: 15, def: 15, sta: 14 }, idx: 2 }),
    ])).pokemon.filter(p => p.name === 'Leafeon');
    const lucky = mons.find(p => p.isLucky);
    const plain = mons.find(p => !p.isLucky);
    // Lucky wins Master outright.
    expect(lucky.wonMasterSlot).toBe(true);
    expect(lucky.slotConfirmed).toBe(true);
    expect(lucky.nickname).toMatch(/Ⓜ93/);
    expect(lucky.nickname).not.toMatch(/Ⓡ/);
  });

  // Opus Required Test: "plain Leafeon 98% loser → LeafeonⓇ98".
  // BLOCKED pending the completed Opus review + Mariellen decision. With ONLY the Bug 1
  // winner-affirmation fix applied, the demoted plain 98% loser is the best non-Master-winner of
  // species 'Leafeon' but is blocked from the best_overall (Ⓡ) slot by speciesWithConfirmedKeeper
  // (analyse.js ~L1200) — it strands as a review placeholder "Leafeon98m". Producing LeafeonⓇ98
  // (vs trading it) is the contested Bug 3 keep-vs-trade decision the Opus review flagged for
  // Mariellen sign-off, and the provided review is truncated after Bug 2 (no Bug 3 guidance).
  // Left as a non-guessing regression marker — un-skip once Bug 3 is decided & reviewed.
  it.skip('plain Leafeon 98% loser → LeafeonⓇ98 (BLOCKED on Bug 3 decision)', () => {
    const mons = analyse(toCSV([
      leafeon(2400, 93.3, { iv: { atk: 15, def: 15, sta: 12 }, lucky: true, idx: 1 }),
      leafeon(2600, 97.8, { iv: { atk: 15, def: 15, sta: 14 }, idx: 2 }),
    ])).pokemon.filter(p => p.name === 'Leafeon');
    const plain = mons.find(p => !p.isLucky);
    expect(plain.wonMasterSlot).toBeFalsy();
    expect(plain.nickname).toMatch(/Ⓡ98/);
    expect(plain.nickname).not.toMatch(/Ⓜ/);
  });

  // Behaviour we CAN assert today: the plain loser is not falsely flagged as a Master winner,
  // and the Lucky's Ⓜ win is not duplicated. (Its exact loser nick is Bug-3-gated, above.)
  it('plain Leafeon 98% loser does not win Master and does not show Ⓜ', () => {
    const mons = analyse(toCSV([
      leafeon(2400, 93.3, { iv: { atk: 15, def: 15, sta: 12 }, lucky: true, idx: 1 }),
      leafeon(2600, 97.8, { iv: { atk: 15, def: 15, sta: 14 }, idx: 2 }),
    ])).pokemon.filter(p => p.name === 'Leafeon');
    const plain = mons.find(p => !p.isLucky);
    expect(plain.wonMasterSlot).toBeFalsy();
    expect(plain.nickname).not.toMatch(/Ⓜ/);
  });

  it('exactly one non-shadow Master keeper for the Leafeon pair', () => {
    const mons = analyse(toCSV([
      leafeon(2400, 93.3, { iv: { atk: 15, def: 15, sta: 12 }, lucky: true, idx: 1 }),
      leafeon(2600, 97.8, { iv: { atk: 15, def: 15, sta: 14 }, idx: 2 }),
    ])).pokemon.filter(p => p.name === 'Leafeon');
    expect(mons.filter(p => p.wonMasterSlot && !p.isShadow).length).toBe(1);
  });

  // Group C re-validation (Opus): the single-species Raikou Lucky 5pp margin must still pass.
  it('Group C re-check — Lucky Raikou 91% beats non-Lucky 95% and shows Ⓜ', () => {
    const raikou = (cp, pct, opts = {}) => {
      const iv = opts.iv || ivFor(pct);
      return row({
        Index: String(opts.idx || 1), Name: 'Raikou', 'Pokemon Number': '243', CP: String(cp),
        'Atk IV': String(iv.atk), 'Def IV': String(iv.def), 'Sta IV': String(iv.sta),
        'IV Avg': pct.toFixed(1), 'Level Min': '20',
        Lucky: opts.lucky ? '1' : '0', Dust: '5000',
        'Rank % (U)': '40.0', 'Dust Cost (U)': '300000', 'Name (U)': 'Raikou',
      });
    };
    const mons = analyse(toCSV([
      raikou(2439, 91.1, { lucky: true, idx: 1 }),
      raikou(2450, 95.6, { idx: 2 }),
    ])).pokemon.filter(p => p.name === 'Raikou');
    const w = mons.find(p => p.wonMasterSlot);
    expect(w.isLucky).toBe(true);
    expect(w.slotConfirmed).toBe(true);
    expect(w.nickname).toMatch(/Ⓜ/);
  });
});

// ── Bug 2 — Shiny shows Ⓡ (not a league slot) when not a slot winner ─────────
// Rule: a shiny that did NOT win a league slot outright always renders NameⓇ{IV%}※,
// regardless of any sub-90 (tentative) rank in any league. League-slot nicks
// (Ⓛ/Ⓖ/Ⓤ/Ⓜ) are only for confirmed slot winners. Repro: Tapu Koko shiny 73% with a
// sub-90 Ultra rank was showing Tapu KokⓊ74※ instead of Tapu KokⓇ73※.

describe('Bug 2 — Shiny non-winner falls to Ⓡ, not a tentative league nick', () => {
  const tapuKoko = (cp, pct, opts = {}) => {
    const iv = opts.iv || ivFor(pct);
    return row({
      Index: String(opts.idx || 1), Name: 'Tapu Koko', 'Pokemon Number': '785', CP: String(cp),
      'Atk IV': String(iv.atk), 'Def IV': String(iv.def), 'Sta IV': String(iv.sta),
      'IV Avg': pct.toFixed(1), 'Level Min': '20',
      Lucky: opts.lucky ? '1' : '0', Dust: '5000',
      'Rank % (U)': opts.rankU || '74.0', 'Dust Cost (U)': '300000', 'Name (U)': 'Tapu Koko',
    });
  };

  it('shiny Tapu Koko 73% with sub-90 Ultra rank shows Ⓡ73※, not Ⓤ74※', () => {
    const iv73 = ivFor(73.3); // 15/15/3 → 73.3
    const shinyKey = ['785', '', '', iv73.atk, iv73.def, iv73.sta, '_idx5'].join('|');
    const { analyse: analyseOv } = loader.createWithOverrides({ [shinyKey]: { is_shiny: true } });
    const res = analyseOv(toCSV([ tapuKoko(2100, 73.3, { iv: iv73, idx: 5, rankU: '74.0' }) ]));
    const tk = res.pokemon.find(p => p.name === 'Tapu Koko');
    expect(tk.isShiny).toBe(true);
    expect(tk.wonMasterSlot).toBeFalsy();
    expect(tk.nickname).toMatch(/Ⓡ73/);   // Master/raid holding nick
    expect(tk.nickname).toMatch(/※/);      // shiny suffix present
    expect(tk.nickname).not.toMatch(/Ⓤ/); // NOT a tentative Ultra slot
    expect(tk.nickname).not.toMatch(/Ⓖ/);
    expect(tk.nickname).not.toMatch(/Ⓛ/);
    expect(tk.nickname).not.toMatch(/Ⓜ/);
  });

  it('a shiny WITH a confirmed (≥90) league slot still shows the league nick', () => {
    // Guard against over-correction: a genuine confirmed slot winner keeps its Ⓤ nick.
    // ivAvg < 90 (so it does NOT win Master) but a ≥90 Ultra rank → confirmed Ultra winner.
    const iv84 = ivFor(84.4); // sub-90 Master rank
    const shinyKey = ['785', '', '', iv84.atk, iv84.def, iv84.sta, '_idx6'].join('|');
    const { analyse: analyseOv } = loader.createWithOverrides({ [shinyKey]: { is_shiny: true } });
    const res = analyseOv(toCSV([ tapuKoko(2400, 84.4, { iv: iv84, idx: 6, rankU: '92.0' }) ]));
    const tk = res.pokemon.find(p => p.name === 'Tapu Koko');
    expect(tk.isShiny).toBe(true);
    expect(tk.wonMasterSlot).toBeFalsy();
    // Confirmed Ultra winner → keeps a real league slot nick (Ⓤ), with shiny ※ trailing.
    expect(tk.slots).toContain('U');
    expect(tk.slotConfirmed).toBe(true);
    expect(tk.nickname).toMatch(/Ⓤ92/);
    expect(tk.nickname).toMatch(/※/);
  });
});
