'use strict';
// Tests for the dmax-gmax-league-rules-refinement brief (v3.5.54 / GitHub #30).
//
// Confirmed game mechanics (Mariellen, 21 Jun 2026):
//   • Dynamax + Gigantamax battle in NORMAL form in PvP (Max moves unavailable),
//     so they compete in the SAME capped-league pool as normals — best rank wins.
//   • Gmax is a universal soldier (PvP + Gmax Max Battles); Dmax covers PvP + its
//     own Max Battle pool; Normal covers PvP only. → THREE independent Master slots.
//
// Capped leagues (GL/UL/LL) — ONE slot per league, all types in one pool. Tiebreak
// on equal ROUNDED rank, highest priority wins:
//   Shiny Gmax(6) > Gmax(5) > Shiny Dmax(4) > Dmax(3) > Shiny Normal(2) > Normal(1)
//   (Lucky is not in the ladder — it wins ties via the existing half-dust tiebreak,
//    inside its own |lucky sub-group.)
//
// Master league — THREE independent slots:
//   Best Gmax per evo target → wonGigantamaxMaster → NameⓂ{IV%}Ⓧ
//   Best Dmax  per evo target → wonDynamaxMaster   → NameⓂ{IV%}Ⓓ
//   Best Normal (existing ML winner) → NameⓂ{IV%}  — ONLY if no Gmax in the family.
//     If ANY Gmax exists: Normal Master slot suppressed (categorical).
//       • hundo → kept, NO Ⓜ/star, NameⓇ{IV%}Ⓗ, grey star
//       • non-hundo → loses Ⓜ + star (existing cull/review rules)
//
// Self-contained synthetic CSVs through the real csvParser + loader, same approach
// as analyse.dynamax_master.test.js / analyse.eevee_master.test.js.
//   npx jest tests/analyse.gmax_master.test.js --env=node

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

const NUM = 125; // Electabuzz — treated single-stage here (Name (U)=self → final, maxTargetKey='Electabuzz')
const ivAvg = (a, d, s) => (a + d + s) / 45 * 100;
const ivPct = (a, d, s) => Math.round(ivAvg(a, d, s));
// stableKey used by overrides: pokeNum|form|gender|atk|def|sta|_idx<Index>  (no CP)
const keyFor = (a, d, s, idx) => [String(NUM), '', '', a, d, s, '_idx' + idx].join('|');

// Flexible Electabuzz row. Name (U)='Electabuzz' always → final stage → enters Master pass.
// Optional capped ranks: rg/ru/rl (with affordable dust by default).
const elec = (o) => row({
  Index: String(o.idx), Name: 'Electabuzz', 'Pokemon Number': String(NUM),
  CP: String(o.cp != null ? o.cp : 1300),
  'Atk IV': String(o.a), 'Def IV': String(o.d), 'Sta IV': String(o.s),
  'IV Avg': ivAvg(o.a, o.d, o.s).toFixed(1), 'Level Min': '20', Dust: '5000',
  Favorite: o.fav ? '1' : '0', Lucky: o.lucky ? '1' : '0',
  'Rank % (G)': o.rg != null ? String(o.rg) : '', 'Dust Cost (G)': o.rg != null ? String(o.dg != null ? o.dg : 10000) : '', 'Name (G)': o.rg != null ? 'Electabuzz' : '',
  'Rank % (U)': o.ru != null ? String(o.ru) : '', 'Dust Cost (U)': o.ru != null ? String(o.du != null ? o.du : 10000) : '', 'Name (U)': 'Electabuzz',
  'Rank % (L)': o.rl != null ? String(o.rl) : '', 'Dust Cost (L)': o.rl != null ? String(o.dl != null ? o.dl : 10000) : '', 'Name (L)': o.rl != null ? 'Electabuzz' : '',
});

// Build the override map from a list of rows carrying flag keys (dmax/gmax/shiny).
const buildOverrides = (specs) => {
  const m = {};
  specs.forEach(o => {
    const ov = {};
    if (o.dmax) ov.is_dynamax = true;
    if (o.gmax) ov.is_gigantamax = true;
    if (o.shiny) ov.is_shiny = true;
    if (Object.keys(ov).length) m[keyFor(o.a, o.d, o.s, o.idx)] = ov;
  });
  return m;
};

// Run analyse with overrides, return Electabuzz members keyed by idx (via cp lookup helper).
const run = (specs) => {
  const rows = specs.map(elec);
  const mons = loader.createWithOverrides(buildOverrides(specs))
    .analyse(toCSV(rows)).pokemon.filter(p => p.name === 'Electabuzz');
  return mons;
};
const byIdx = (mons, specs, idx) => {
  const spec = specs.find(s => s.idx === idx);
  return mons.find(p => p.cp === (spec.cp != null ? spec.cp : 1300));
};

// ───────────────────────────────────────────────────────────────────────────
// Test 1 — variantKey no longer embeds dynamax: Dmax + Normal share one evo pool
// ───────────────────────────────────────────────────────────────────────────
describe('Test 1 — Dmax competes in the main capped pool (no |dynamax sub-group)', () => {
  it('a higher-rank Normal beats a lower-rank Dmax for the single UL slot', () => {
    const specs = [
      { idx: 1, cp: 1500, a: 13, d: 13, s: 12, ru: 99.0 },             // Normal (84% IV — UL only), UL 99
      { idx: 2, cp: 1400, a: 12, d: 11, s: 12, ru: 42.0, dmax: true },  // Dmax, UL 42 (brief: loses on rank)
    ];
    const mons = run(specs);
    const normal = byIdx(mons, specs, 1);
    const dmax = byIdx(mons, specs, 2);
    expect(normal.slots).toContain('U');         // Normal wins UL on rank
    expect(dmax.slots).not.toContain('U');        // Dmax does NOT get a private slot
    expect(dmax.decision).toBe('keep');           // still kept (raid candidate)
    expect(dmax.nickname).toContain('Ⓓ');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Test 2 — type-priority tiebreak ladder (fires only on equal ROUNDED rank)
// ───────────────────────────────────────────────────────────────────────────
describe('Test 2 — type-priority tiebreak on equal rounded rank', () => {
  const cappedWinner = (specs, league) => {
    const mons = run(specs);
    const lg = league;
    const winner = mons.find(p => p.slots.includes(lg));
    return { mons, winner };
  };

  it('Shiny Gmax(6) beats Gmax(5)', () => {
    const specs = [
      { idx: 1, cp: 1500, a: 15, d: 15, s: 14, ru: 98.0, gmax: true, shiny: true },
      { idx: 2, cp: 1490, a: 15, d: 14, s: 14, ru: 98.0, gmax: true },
    ];
    const { winner } = cappedWinner(specs, 'U');
    expect(winner).toBeDefined();
    expect(winner.isShiny).toBe(true);
    expect(winner.isGigantamax).toBe(true);
  });

  it('Gmax(5) beats Dmax(3)', () => {
    const specs = [
      { idx: 1, cp: 1500, a: 15, d: 14, s: 14, ru: 98.0, gmax: true },
      { idx: 2, cp: 1490, a: 15, d: 15, s: 14, ru: 98.0, dmax: true },
    ];
    const { winner } = cappedWinner(specs, 'U');
    expect(winner.isGigantamax).toBe(true);
    expect(winner.isDynamax).toBeFalsy();
  });

  it('Dmax(3) beats Normal(1)', () => {
    const specs = [
      { idx: 1, cp: 1500, a: 14, d: 14, s: 14, ru: 98.0, dmax: true },
      { idx: 2, cp: 1490, a: 15, d: 15, s: 15, ru: 98.0 },
    ];
    const { winner } = cappedWinner(specs, 'U');
    expect(winner.isDynamax).toBe(true);
  });

  it('Shiny Normal(2) beats Normal(1)', () => {
    const specs = [
      { idx: 1, cp: 1500, a: 15, d: 14, s: 14, ru: 98.0, shiny: true },
      { idx: 2, cp: 1490, a: 15, d: 15, s: 14, ru: 98.0 },
    ];
    const { winner } = cappedWinner(specs, 'U');
    expect(winner.isShiny).toBe(true);
    expect(winner.isDynamax).toBeFalsy();
    expect(winner.isGigantamax).toBeFalsy();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Test 3 — wonGigantamaxMaster set per maxTargetKey (best Gmax per evo target)
// Test 17 — multiple Gmax: suppression categorical, one Ⓜ per evo target
// ───────────────────────────────────────────────────────────────────────────
describe('Test 3 — best Gmax per evo target carries wonGigantamaxMaster', () => {
  it('two Gmax, only the higher-IV one is wonGigantamaxMaster', () => {
    const specs = [
      { idx: 1, cp: 1500, a: 15, d: 15, s: 14, gmax: true },   // 98% best → Ⓜ
      { idx: 2, cp: 1490, a: 13, d: 13, s: 13, gmax: true },   // 87% → raid Ⓡ
    ];
    const mons = run(specs);
    const best = byIdx(mons, specs, 1);
    const other = byIdx(mons, specs, 2);
    expect(best.wonGigantamaxMaster).toBe(true);
    expect(other.wonGigantamaxMaster).toBeFalsy();
    expect(mons.filter(p => p.wonGigantamaxMaster).length).toBe(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Test 4 — Gmax excluded from the regular Master pass
// ───────────────────────────────────────────────────────────────────────────
describe('Test 4 — Gmax never enters the regular Master pool / extraCandidates', () => {
  it('a high-IV Gmax never sets wonMasterSlot and a lone Normal still wins Master', () => {
    const specs = [
      { idx: 1, cp: 1500, a: 15, d: 14, s: 14, gmax: true },   // 96% Gmax — excluded from regular Master
      { idx: 2, cp: 1490, a: 14, d: 14, s: 13, ru: 60.0 },     // 91% Normal — wins regular Master? (Gmax exists → suppressed)
    ];
    const mons = run(specs);
    const gmax = byIdx(mons, specs, 1);
    expect(gmax.wonMasterSlot).toBeFalsy();
    expect(gmax.slots).not.toContain('M');
    expect(gmax.wonGigantamaxMaster).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Test 5 — decision routing: wonGigantamaxMaster fires above hasLeagueSlot
// Test 6 — buildNickname Gmax winner → LC.M + {IV%} + Ⓧ
// ───────────────────────────────────────────────────────────────────────────
describe('Test 5 / 6 — wonGigantamaxMaster decision + nick', () => {
  it('best Gmax → keep, NameⓂ{IV%}Ⓧ, never Ⓡ; routes above any capped slot', () => {
    const specs = [
      { idx: 1, cp: 1500, a: 15, d: 15, s: 14, ru: 99.0, gmax: true }, // best Gmax AND wins UL on rank
    ];
    const mons = run(specs);
    const g = byIdx(mons, specs, 1);
    expect(g.wonGigantamaxMaster).toBe(true);
    expect(g.decision).toBe('keep');
    expect(g.nickname).toContain('Ⓜ');
    expect(g.nickname).toContain('Ⓧ');
    expect(g.nickname).not.toContain('Ⓡ');
    expect(g.nickname).toContain(String(ivPct(15, 15, 14))); // IV-based, not rank
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Test 7 — non-winning Gmax → NameⓇ{IV%}Ⓧ (keep, no star)
// ───────────────────────────────────────────────────────────────────────────
describe('Test 7 — non-winning Gmax → NameⓇ{IV%}Ⓧ', () => {
  it('a Gmax beaten for its slot by a better Gmax is kept as a raid candidate', () => {
    const specs = [
      { idx: 1, cp: 1500, a: 15, d: 15, s: 14, ru: 100.0, gmax: true }, // best → Ⓜ
      { idx: 2, cp: 1490, a: 13, d: 12, s: 12, ru: 97.0, gmax: true },  // loses → Ⓡ82X-style
    ];
    const mons = run(specs);
    const loser = byIdx(mons, specs, 2);
    expect(loser.wonGigantamaxMaster).toBeFalsy();
    expect(loser.decision).toBe('keep');
    expect(loser.nickname).toContain('Ⓡ');
    expect(loser.nickname).toContain('Ⓧ');
    expect(loser.nickname).toContain(String(ivPct(13, 12, 12))); // IV-based Ⓡ, not the UL rank
    expect(loser.suggestStar).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Test 8 — non-hundo Normal suppressed when family has Gmax
// (loses M + star; existing cull/review rules — never a Master keeper)
// ───────────────────────────────────────────────────────────────────────────
describe('Test 8 — non-hundo Normal Master suppressed by a Gmax in the family', () => {
  it('Normal Master candidate loses Ⓜ + star; a same-species capped winner is unchanged', () => {
    const specs = [
      { idx: 1, cp: 1500, a: 14, d: 13, s: 13, gmax: true },           // 89% Gmax → owns Master PvP slot
      { idx: 2, cp: 1490, a: 13, d: 14, s: 14, rg: 99.0, dg: 10000 },  // capped GL winner (unchanged)
      { idx: 3, cp: 1480, a: 15, d: 14, s: 14 },                       // 96% Normal — Master-only candidate → suppressed
    ];
    const mons = run(specs);
    const cappedWinner = byIdx(mons, specs, 2);
    const suppressed = byIdx(mons, specs, 3);
    // Gmax owns the Master role
    const gmax = byIdx(mons, specs, 1);
    expect(gmax.wonGigantamaxMaster).toBe(true);
    // Capped GL winner unchanged
    expect(cappedWinner.slots).toContain('G');
    expect(cappedWinner.decision).toBe('keep');
    // Suppressed Normal: no Master slot, no Ⓜ, no star
    expect(suppressed.slots).not.toContain('M');
    expect(suppressed.wonMasterSlot).toBeFalsy();
    expect(suppressed.hasBattleSlot).toBe(false);
    expect(suppressed.gmaxSuppressedNormal).toBe(true);
    expect(suppressed.nickname).not.toContain('Ⓜ');
    expect(suppressed.suggestStar).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Test 9 — Hundo Normal suppressed when Gmax exists → NameⓇ{IV%}Ⓗ, grey star, keep
// Test 14 — Gmax Ⓜ + suppressed Normal hundo coexist
// ───────────────────────────────────────────────────────────────────────────
describe('Test 9 / 14 — Hundo Normal suppressed by Gmax: keep, grey star, NameⓇ100Ⓗ', () => {
  it('hundo loses Ⓜ + suggestStar but is never traded; gets grey star + NameⓇ100Ⓗ', () => {
    const specs = [
      { idx: 1, cp: 1500, a: 15, d: 14, s: 13, gmax: true },   // 93% Gmax → Ⓜ
      { idx: 2, cp: 1490, a: 15, d: 15, s: 15 },               // hundo Normal → suppressed
    ];
    const mons = run(specs);
    const gmax = byIdx(mons, specs, 1);
    const hundo = byIdx(mons, specs, 2);
    expect(gmax.wonGigantamaxMaster).toBe(true);
    expect(gmax.nickname).toContain('Ⓜ');
    // suppressed hundo
    expect(hundo.slots).not.toContain('M');
    expect(hundo.wonMasterSlot).toBeFalsy();
    expect(hundo.gmaxSuppressedHundo).toBe(true);
    expect(hundo.decision).toBe('keep');           // hundos never traded
    expect(hundo.starType).toBe('grey');
    expect(hundo.suggestStar).toBe(false);
    expect(hundo.nickname).toContain('Ⓡ');
    expect(hundo.nickname).toContain('Ⓗ');
    expect(hundo.nickname).not.toContain('Ⓜ');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Test 10 — masterDemoted (normal-vs-normal) never forces trade
// ───────────────────────────────────────────────────────────────────────────
describe('Test 10 — normal-vs-normal Master demotion never forces trade', () => {
  it('the lower Master Normal is demoted but kept (best_overall), not traded', () => {
    const specs = [
      { idx: 1, cp: 1500, a: 15, d: 15, s: 15 },   // hundo → wins single non-shadow Master slot
      { idx: 2, cp: 1490, a: 15, d: 14, s: 14 },   // 96% → demoted, kept as best_overall
    ];
    const mons = run(specs);
    const winner = byIdx(mons, specs, 1);
    const demoted = byIdx(mons, specs, 2);
    expect(winner.wonMasterSlot).toBe(true);
    expect(demoted.wonMasterSlot).toBeFalsy();
    expect(demoted.decision).not.toBe('trade');
    // no masterDemoted member is ever traded
    mons.filter(p => p.masterDemoted).forEach(p => expect(p.decision).not.toBe('trade'));
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Test 11 — Lucky non-winner (multi-lucky): luckyNonWinner, no lucky slot, no star, keep
// Test 12 — Lucky winner unchanged
// ───────────────────────────────────────────────────────────────────────────
describe('Test 11 / 12 — Lucky winner keeps slot; the losing Lucky → NameⓇ{IV%} no star', () => {
  it('two Luckies for one UL slot: one wins, the other becomes luckyNonWinner', () => {
    const specs = [
      { idx: 1, cp: 1500, a: 13, d: 13, s: 12, ru: 99.0, lucky: true }, // 84% IV (UL-only), wins UL among luckies
      { idx: 2, cp: 1490, a: 12, d: 12, s: 12, ru: 95.0, lucky: true }, // 80% IV, loses → luckyNonWinner
    ];
    const mons = run(specs);
    const winner = byIdx(mons, specs, 1);
    const loser = byIdx(mons, specs, 2);
    // winner: keeps its capped slot + lucky slot, normal keep
    expect(winner.slots).toContain('U');
    expect(winner.slots).toContain('lucky');
    expect(winner.decision).toBe('keep');
    // loser: no lucky slot, no star, NameⓇ{IV%}, still keep (Lucky never traded)
    expect(loser.luckyNonWinner).toBe(true);
    expect(loser.slots).not.toContain('lucky');
    expect(loser.decision).toBe('keep');
    expect(loser.suggestStar).toBe(false);
    expect(loser.nickname).toContain('Ⓡ');
    expect(loser.nickname).toContain(String(ivPct(12, 12, 12)));
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Test 13 — Pure raid/master Lucky (no capped claim) unchanged
// ───────────────────────────────────────────────────────────────────────────
describe('Test 13 — Lucky with no capped claim keeps its lucky slot + star', () => {
  it('a Lucky with no qualifying capped rank is kept normally (lucky slot, star)', () => {
    const specs = [
      { idx: 1, cp: 1500, a: 13, d: 13, s: 13, lucky: true }, // no capped rank at all
    ];
    const mons = run(specs);
    const p = byIdx(mons, specs, 1);
    expect(p.luckyNonWinner).toBeFalsy();
    expect(p.slots).toContain('lucky');
    expect(p.decision).toBe('keep');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Test 11b (BLOCKING) — Dmax vs Normal at identical rounded rank for one GL slot.
// Dmax wins (typePriority 3 > 1); exactly one keeper holds 'G'. Proves the
// over-keep bug (phantom |dynamax slot) is fixed.
// ───────────────────────────────────────────────────────────────────────────
describe('Test 11b — Dmax beats Normal on the type tiebreak for a single GL slot', () => {
  it('one GL slot only: Dmax takes it, Normal does not — no phantom double-keep', () => {
    const specs = [
      { idx: 1, cp: 1490, a: 15, d: 14, s: 14, rg: 99.0, dg: 10000, dmax: true }, // Dmax, GL 99
      { idx: 2, cp: 1480, a: 15, d: 15, s: 14, rg: 99.0, dg: 10000 },             // Normal, GL 99 (tie)
    ];
    const mons = run(specs);
    const dmax = byIdx(mons, specs, 1);
    const normal = byIdx(mons, specs, 2);
    expect(dmax.slots).toContain('G');           // Dmax wins on type priority
    expect(normal.slots).not.toContain('G');      // Normal loses — no separate slot
    // exactly one GL keeper for the Electabuzz evo target
    expect(mons.filter(p => p.slots.includes('G')).length).toBe(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Test 15 — star ladder: gmaxSuppressedHundo beats a gold favourite (grey, not gold)
// ───────────────────────────────────────────────────────────────────────────
describe('Test 15 — gmaxSuppressedHundo beats gold favourite → grey', () => {
  it('a favourited suppressed hundo gets grey, not gold', () => {
    const specs = [
      { idx: 1, cp: 1500, a: 15, d: 14, s: 13, gmax: true },           // Gmax → Ⓜ
      { idx: 2, cp: 1490, a: 15, d: 15, s: 15, fav: true },            // favourite hundo → suppressed
    ];
    const mons = run(specs);
    const hundo = byIdx(mons, specs, 2);
    expect(hundo.isFavorite).toBe(true);
    expect(hundo.gmaxSuppressedHundo).toBe(true);
    expect(hundo.starType).toBe('grey');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Test 16 — star ladder: luckyNonWinner beats gold (favourite Lucky non-winner → none)
// ───────────────────────────────────────────────────────────────────────────
describe('Test 16 — favourite Lucky non-winner → starType none (not gold)', () => {
  it('a favourited losing Lucky gets no star', () => {
    const specs = [
      { idx: 1, cp: 1500, a: 13, d: 13, s: 12, ru: 99.0, lucky: true },             // 84% IV (UL-only) winner
      { idx: 2, cp: 1490, a: 12, d: 12, s: 12, ru: 95.0, lucky: true, fav: true },  // favourite loser
    ];
    const mons = run(specs);
    const loser = byIdx(mons, specs, 2);
    expect(loser.isFavorite).toBe(true);
    expect(loser.luckyNonWinner).toBe(true);
    expect(loser.starType).toBe('none');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Test 17 — multiple Gmax in one family: Normal suppression categorical;
// wonGigantamaxMaster per evo target (here single target → exactly one)
// ───────────────────────────────────────────────────────────────────────────
describe('Test 17 — multiple Gmax: categorical Normal suppression, one Ⓜ per target', () => {
  it('three Gmax + a Normal master candidate: Normal suppressed, one Gmax Ⓜ', () => {
    const specs = [
      { idx: 1, cp: 1500, a: 15, d: 15, s: 14, gmax: true },  // best Gmax → Ⓜ
      { idx: 2, cp: 1490, a: 14, d: 14, s: 14, gmax: true },  // Gmax → raid Ⓡ
      { idx: 3, cp: 1480, a: 13, d: 13, s: 13, gmax: true },  // Gmax → raid Ⓡ
      { idx: 4, cp: 1470, a: 15, d: 15, s: 13, fav: true },   // 96% Normal master candidate → suppressed
    ];
    const mons = run(specs);
    expect(mons.filter(p => p.wonGigantamaxMaster).length).toBe(1);
    const normal = byIdx(mons, specs, 4);
    expect(normal.slots).not.toContain('M');
    expect(normal.gmaxSuppressedNormal).toBe(true);
    expect(normal.nickname).not.toContain('Ⓜ');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Test 18 — Lucky hundo in a Gmax family: gmaxSuppressedHundo wins over
// luckyNonWinner → grey star (the hundo+grey treatment takes precedence)
// ───────────────────────────────────────────────────────────────────────────
describe('Test 18 — a suppressed Lucky hundo in a Gmax family → grey star', () => {
  it('gmaxSuppressedHundo precedence over luckyNonWinner: grey, keep, NameⓇ100Ⓗ', () => {
    const specs = [
      { idx: 1, cp: 1500, a: 15, d: 14, s: 13, gmax: true },              // Gmax → Ⓜ
      { idx: 2, cp: 1490, a: 15, d: 15, s: 15, lucky: true },             // lucky hundo → suppressed
    ];
    const mons = run(specs);
    const hundo = byIdx(mons, specs, 2);
    expect(hundo.gmaxSuppressedHundo).toBe(true);
    expect(hundo.decision).toBe('keep');
    expect(hundo.starType).toBe('grey');
    expect(hundo.nickname).toContain('Ⓡ');
    expect(hundo.nickname).toContain('Ⓗ');
    expect(hundo.nickname).not.toContain('Ⓜ');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Real-example assertions (Mariellen's collection — the acceptance criteria)
// ───────────────────────────────────────────────────────────────────────────
describe('Real example — Electabuzz Dmax non-winners', () => {
  it('best Dmax → Ⓜ; Dmax beaten on rank by a Normal → NameⓇ{IV%}Ⓓ', () => {
    const specs = [
      { idx: 1, cp: 1500, a: 15, d: 15, s: 13, dmax: true },            // 96% best Dmax → Ⓜ
      { idx: 2, cp: 1490, a: 13, d: 13, s: 12, ru: 100.0 },             // Normal (84% IV, UL-only) U100 wins UL
      { idx: 3, cp: 1480, a: 14, d: 13, s: 13, ru: 95.1, dmax: true },  // 89% Dmax, UL 95.1 → loses → Ⓡ89Ⓓ
    ];
    const mons = run(specs);
    const best = byIdx(mons, specs, 1);
    const u100 = byIdx(mons, specs, 2);
    const loser = byIdx(mons, specs, 3);
    expect(best.wonDynamaxMaster).toBe(true);
    expect(best.nickname).toContain('Ⓜ');
    expect(u100.slots).toContain('U');
    expect(loser.slots).not.toContain('U');
    expect(loser.decision).toBe('keep');
    expect(loser.nickname).toContain('Ⓡ');
    expect(loser.nickname).toContain(String(ivPct(14, 13, 13))); // Ⓡ89, IV-based not UL rank
    expect(loser.nickname).toContain('Ⓓ');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// gmax_master_overrides_capped_slot (GitHub #35) — direct equivalent of the Dmax
// "best Dmax that also wins a capped slot stays Ⓜ" group, but exercised on a
// TWO-STAGE species (Meowth → Persian). Every other gmax test above uses
// single-stage Electabuzz (Name (U)=self); this closes the two-stage coverage
// gap and reproduces Mariellen's real Meowth/Persian example from the brief:
//   • CP423 Gmax (98% IV, 100% UL rank) → wonGigantamaxMaster, NameⓂ98Ⓧ (NOT the
//     capped PersiU100Ⓧ nick — the Master power-up must route ABOVE hasLeagueSlot)
//   • CP410 Gmax (82% IV, 97% UL rank) → kept raid candidate, NameⓇ82Ⓧ, no star
// Regression guard for the deployed-v3.5.53 behaviour where a capped-slot-winning
// Gmax routed through hasLeagueSlot and showed the capped league nick.
// ───────────────────────────────────────────────────────────────────────────
describe('gmax_master_overrides_capped_slot (#35) — two-stage Meowth→Persian', () => {
  const MEOWTH = 52; // Meowth → Persian (Name (U)='Persian')
  const meowKey = (a, d, s, idx) => [String(MEOWTH), '', '', a, d, s, '_idx' + idx].join('|');
  // Meowth row: Name (U)='Persian' so evolvedNameU='Persian' (two-stage, unlike Electabuzz).
  const meow = (o) => row({
    Index: String(o.idx), Name: 'Meowth', 'Pokemon Number': String(MEOWTH),
    CP: String(o.cp), 'Atk IV': String(o.a), 'Def IV': String(o.d), 'Sta IV': String(o.s),
    'IV Avg': ivAvg(o.a, o.d, o.s).toFixed(1), 'Level Min': '20', Dust: '5000',
    'Rank % (U)': o.ru != null ? String(o.ru) : '', 'Dust Cost (U)': o.ru != null ? '10000' : '', 'Name (U)': 'Persian',
  });
  const runMeow = (specs) => {
    const m = {};
    specs.forEach(o => { if (o.gmax) m[meowKey(o.a, o.d, o.s, o.idx)] = { is_gigantamax: true }; });
    return loader.createWithOverrides(m)
      .analyse(toCSV(specs.map(meow))).pokemon.filter(p => p.name === 'Meowth');
  };
  const meowByIdx = (mons, specs, idx) => mons.find(p => p.cp === specs.find(s => s.idx === idx).cp);

  it('the best Gmax wins a capped slot AND still routes wonGigantamaxMaster → NameⓂ{IV%}Ⓧ', () => {
    const specs = [
      { idx: 1, cp: 423, a: 14, d: 15, s: 15, ru: 100.0, gmax: true }, // 98% IV, wins UL on rank
      { idx: 2, cp: 410, a: 14, d: 11, s: 12, ru: 97.0, gmax: true },  // 82% IV, loses → raid candidate
    ];
    const mons = runMeow(specs);
    const best = meowByIdx(mons, specs, 1);
    const loser = meowByIdx(mons, specs, 2);

    // evolvedNameU must resolve to Persian (two-stage) and feed maxTargetKey
    expect(best.evolvedNameU).toBe('Persian');
    expect(loser.evolvedNameU).toBe('Persian');

    // exactly one Master power-up candidate for the evo target
    expect(mons.filter(p => p.wonGigantamaxMaster).length).toBe(1);

    // best Gmax: Master override beats the capped slot it also won
    expect(best.wonGigantamaxMaster).toBe(true);
    expect(best.slots).toContain('U');                       // it DID win the capped slot
    expect(best.decision).toBe('keep');
    expect(best.nickname).toContain('Ⓜ');                   // routed above hasLeagueSlot
    expect(best.nickname).toContain('Ⓧ');
    expect(best.nickname).not.toContain('Ⓤ');               // NOT the capped league nick
    expect(best.nickname).toContain(String(ivPct(14, 15, 15))); // IV-based 98, not UL rank 100

    // lower-IV Gmax: kept raid candidate, no Master, no star, NOT traded
    expect(loser.wonGigantamaxMaster).toBeFalsy();
    expect(loser.decision).toBe('keep');
    expect(loser.slots).toContain('gigantamax');
    expect(loser.slots).not.toContain('U');
    expect(loser.nickname).toContain('Ⓡ');
    expect(loser.nickname).toContain('Ⓧ');
    expect(loser.nickname).toContain(String(ivPct(14, 11, 12))); // Ⓡ82, IV-based
    expect(loser.suggestStar).toBe(false);
  });
});
