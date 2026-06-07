'use strict';
// Regression tests for the Master League special-categories ruleset (v3.5.x).
//
// Approved ruleset (see Master_League_Special_Categories_Ruleset.md):
//   • Two Master slots per family: one Shadow (purify-push, unchanged) + one Non-Shadow.
//   • Non-shadow winner precedence: Hundo > Lucky-adjusted IV (5pp margin) >
//     shiny-lucky > purified > normal.
//   • Master winner shows Ⓜ; non-winners keep Ⓡ.
//   • Purified '*' always trails everything, including shiny ※ (…※*).
//
// These build tiny in-memory CSVs through the real csvParser + loader (same approach as
// analyse.expensive_winner.test.js), so the exact IV / category conditions are pinned and
// independent of the shared poke_genie_fixture.csv. Run with:
//   npx jest tests/analyse.master_league.test.js --env=node

const loader = require('./loader');
const { analyse } = loader;
const { parseCSV } = require('./csvParser');

// Full 50-column Pokégenie export header.
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
// Use a small table of round-ish values; def/sta padded to hit the target.
const ivFor = (pct) => {
  // total IV points needed (0..45)
  const total = Math.round(pct/100*45);
  const atk = Math.min(15, total), rem = total - atk;
  const def = Math.min(15, rem), sta = rem - def;
  return { atk, def, sta };
};

// Build a Legendary-style single-stage species row (no evolutions → ML uses ivAvg as rank).
// Raikou is Legendary in data.js, so use it as the canonical single-stage Master species.
const raikou = (cp, pct, opts = {}) => {
  const iv = opts.iv || ivFor(pct);
  return row({
    Index: String(opts.idx || Math.floor(Math.random()*1e6)),
    Name: 'Raikou', 'Pokemon Number': '243', CP: String(cp),
    'Atk IV': String(iv.atk), 'Def IV': String(iv.def), 'Sta IV': String(iv.sta),
    'IV Avg': pct.toFixed(1), 'Level Min': '20',
    Lucky: opts.lucky ? '1' : '0',
    'Shadow/Purified': opts.shadow ? '1' : opts.purified ? '2' : '0',
    Favorite: opts.fav ? '1' : '0', Dust: '5000',
    // Give it a token Ultra rank so it isn't filtered as unanalysed; well below ML.
    'Rank % (U)': '40.0', 'Dust Cost (U)': '300000', 'Name (U)': 'Raikou',
  });
};

const analyseRaikou = (rows) => {
  const res = analyse(toCSV(rows));
  return res.pokemon.filter(p => p.name === 'Raikou');
};
const masterKeeper = (mons, pred) => mons.find(p => p.slots.includes('M') && (pred ? pred(p) : true));

// ─── Group A — basic non-shadow Master winner ───────────────────────────────

describe('Master non-shadow winner — basic', () => {
  it('a single high-IV Legendary wins the non-shadow Master slot with Ⓜ', () => {
    const mons = analyseRaikou([ raikou(2400, 91.1, { fav: true, idx: 1 }) ]);
    const w = mons.find(p => p.wonMasterSlot);
    expect(w).toBeDefined();
    expect(w.slots).toContain('M');
    expect(w.nickname).toMatch(/Ⓜ/);
    expect(w.nickname).not.toMatch(/Ⓡ/);
  });

  it('exactly one non-shadow Master keeper per family (two-slot cap)', () => {
    const mons = analyseRaikou([
      raikou(2400, 91.1, { idx: 1 }),
      raikou(2401, 93.3, { idx: 2 }),
      raikou(2402, 88.9, { idx: 3 }),
    ]);
    const nsWinners = mons.filter(p => p.wonMasterSlot && !p.isShadow);
    expect(nsWinners.length).toBe(1);
    // highest IV wins among plain normals
    expect(Math.round(nsWinners[0].ivAvg)).toBe(93);
  });
});

// ─── Group B — Hundo always wins ─────────────────────────────────────────────

describe('Master non-shadow winner — Hundo precedence', () => {
  it('a 15/15/15 Hundo wins over a higher-category Lucky', () => {
    const mons = analyseRaikou([
      raikou(2466, 100.0, { iv: { atk:15, def:15, sta:15 }, idx: 1 }),     // hundo, not lucky
      raikou(2439, 91.1, { lucky: true, fav: true, idx: 2 }),               // lucky 91
    ]);
    const w = mons.find(p => p.wonMasterSlot);
    expect(w.atkIV).toBe(15); expect(w.defIV).toBe(15); expect(w.staIV).toBe(15);
    expect(w.nickname).toMatch(/Ⓜ100/);
    expect(w.nickname).toMatch(/Ⓗ/);          // hundo suffix present
    // the lucky did NOT win → keeps Ⓡ
    const lucky = mons.find(p => p.isLucky);
    expect(lucky.wonMasterSlot).toBeFalsy();
    expect(lucky.nickname).toMatch(/Ⓡ/);
  });
});

// ─── Group C — Lucky-adjusted IV (5pp margin) ────────────────────────────────

describe('Master non-shadow winner — Lucky 5pp margin', () => {
  it('Lucky 91% beats non-Lucky 95% (within 5pp)', () => {
    const mons = analyseRaikou([
      raikou(2439, 91.1, { lucky: true, idx: 1 }),
      raikou(2450, 95.6, { idx: 2 }),
    ]);
    const w = mons.find(p => p.wonMasterSlot);
    expect(w.isLucky).toBe(true);
    expect(w.nickname).toMatch(/Ⓜ/);
  });

  it('non-Lucky 97.8% beats Lucky 91.1% (gap > 5pp)', () => {
    const mons = analyseRaikou([
      raikou(2439, 91.1, { lucky: true, idx: 1 }),
      raikou(2460, 97.8, { idx: 2 }),
    ]);
    const w = mons.find(p => p.wonMasterSlot);
    expect(w.isLucky).toBeFalsy();
    expect(Math.round(w.ivAvg)).toBe(98);
    expect(w.nickname).toMatch(/Ⓜ/);
    // the lucky loser keeps Ⓡ (no league slot here)
    const lucky = mons.find(p => p.isLucky);
    expect(lucky.wonMasterSlot).toBeFalsy();
  });
});

// ─── Group D — Shiny Lucky over plain Lucky at equal IV ──────────────────────
// isShiny is not a Pokégenie CSV column — it's set via an override. So we drive shiny
// through loader.createWithOverrides, keyed by the synthetic row's stableKey
// (pokeNum|form|gender|atk|def|sta|date; date falls back to "_idx<Index>").

describe('Master non-shadow winner — Shiny Lucky tie-break', () => {
  it('Shiny Lucky beats plain Lucky at equal IV', () => {
    // Two lucky Raikou at equal IV (91.1 → 14/14/13). Tag idx=2 as shiny.
    const iv = { atk:14, def:14, sta:13 };
    const rows = [
      raikou(2439, 91.1, { iv, lucky: true, idx: 1 }),               // plain lucky
      raikou(2440, 91.1, { iv, lucky: true, idx: 2 }),               // will be shiny
    ];
    const shinyKey = ['243','','', iv.atk, iv.def, iv.sta, '_idx2'].join('|');
    const { analyse: analyseOv } = loader.createWithOverrides({ [shinyKey]: { is_shiny: true } });
    const mons = analyseOv(toCSV(rows)).pokemon.filter(p => p.name === 'Raikou');
    const w = mons.find(p => p.wonMasterSlot);
    expect(w.isShiny).toBe(true);
    expect(w.isLucky).toBe(true);
    expect(w.nickname).toMatch(/Ⓜ/);
    expect(w.nickname).toMatch(/※/);   // shiny suffix present
  });
});

// ─── Group E — Purified asterisk: always present, always trailing ────────────

describe('Purified asterisk (Decision 2, option a)', () => {
  it('a purified Master winner ends with * after Ⓗ', () => {
    const mons = analyseRaikou([
      raikou(2466, 100.0, { iv: { atk:15,def:15,sta:15 }, purified: true, idx: 1 }),
    ]);
    const w = mons.find(p => p.slots.includes('M'));
    expect(w.nickname).toMatch(/Ⓜ100Ⓗ\*$/);   // …Ⓜ100Ⓗ*
    expect(w.nickname.endsWith('*')).toBe(true);
  });

  it('a purified non-winner still carries a trailing *', () => {
    const mons = analyseRaikou([
      raikou(2466, 100.0, { iv: { atk:15,def:15,sta:15 }, idx: 1 }),  // hundo wins M
      raikou(2450, 95.6, { purified: true, idx: 2 }),                 // purified loser
    ]);
    const purifiedLoser = mons.find(p => p.isPurified);
    expect(purifiedLoser.wonMasterSlot).toBeFalsy();
    expect(purifiedLoser.nickname.endsWith('*')).toBe(true);
  });
});

// ─── Group F — Shadow Master keeper unchanged + coexists with non-shadow ─────

describe('Shadow Master (regression) + two-slot coexistence', () => {
  // A shadow that purifies into Master at ≥90% holds its own Master slot via the
  // purify-push and must still render Ⓜ…p, independent of the non-shadow winner.
  it('shadow purifies into Master → Ⓜ…p, and a non-shadow hundo also keeps Master', () => {
    const mons = analyseRaikou([
      raikou(2466, 100.0, { iv: { atk:15,def:15,sta:15 }, idx: 1 }),   // non-shadow hundo
      // shadow with high IV so purifyRankPct ≥ 90
      raikou(1938, 95.6, { shadow: true, idx: 2 }),
    ]);
    const shadow = mons.find(p => p.isShadow);
    const nonShadow = mons.find(p => p.wonMasterSlot && !p.isShadow);
    // both hold M — one shadow keeper + one non-shadow keeper
    expect(nonShadow).toBeDefined();
    expect(nonShadow.nickname).toMatch(/Ⓜ/);
    // shadow keeper (if it qualified for purify-M) shows Ⓜ…p; if it didn't qualify it's a raid Ⓡ
    if (shadow.slots.includes('M') && shadow.isPurifySlot) {
      expect(shadow.nickname).toMatch(/Ⓜ.*p/);
    }
    // cap: at most one shadow + one non-shadow M keeper
    expect(mons.filter(p => p.wonMasterSlot && !p.isShadow).length).toBe(1);
  });
});

// ─── Group G — Raikou golden-path (the brief's acceptance case) ──────────────

describe('Raikou family — approved acceptance output', () => {
  it('purified hundo / lucky / shadow produce the approved nicks', () => {
    const mons = analyseRaikou([
      raikou(2466, 100.0, { iv: { atk:15,def:15,sta:15 }, purified: true, fav: true, idx: 1 }),
      raikou(2439, 91.1, { iv: { atk:14,def:14,sta:13 }, lucky: true, fav: true, idx: 2 }),
      raikou(1938, 86.7, { iv: { atk:13,def:11,sta:15 }, shadow: true, idx: 3 }),
    ]);
    const hundo  = mons.find(p => p.isPurified);
    const lucky  = mons.find(p => p.isLucky);
    const shadow = mons.find(p => p.isShadow);

    // Purified hundo wins non-shadow Master → RaikouⓂ100Ⓗ*
    expect(hundo.nickname).toBe('RaikouⓂ100Ⓗ*');
    // Lucky loses to the hundo → keeps Ⓡ
    expect(lucky.wonMasterSlot).toBeFalsy();
    expect(lucky.nickname).toMatch(/RaikouⓇ91/);
    // Shadow keeps its own Master slot (purify-push) → Ⓜ…p
    expect(shadow.slots).toContain('M');
    expect(shadow.nickname).toMatch(/RaikouⓂ87p/);
  });
});

// ─── Group H — Non-Legendary special categories also get Master picks ────────

describe('Non-Legendary special categories', () => {
  // Snorlax is a non-Legendary final-evo single-stage species; a hundo Snorlax should win
  // a non-shadow Master slot just like a Legendary would.
  const snorlax = (cp, pct, opts = {}) => {
    const iv = opts.iv || ivFor(pct);
    return row({
      Index: String(opts.idx||1), Name: 'Snorlax', 'Pokemon Number': '143', CP: String(cp),
      'Atk IV': String(iv.atk), 'Def IV': String(iv.def), 'Sta IV': String(iv.sta),
      'IV Avg': pct.toFixed(1), 'Level Min': '20',
      Lucky: opts.lucky?'1':'0', 'Shadow/Purified': opts.shadow?'1':opts.purified?'2':'0',
      Favorite: '1', Dust: '5000',
      'Rank % (U)': '42.0', 'Dust Cost (U)': '300000', 'Name (U)': 'Snorlax',
    });
  };
  it('a non-Legendary Hundo wins a non-shadow Master slot with Ⓜ', () => {
    const res = analyse(toCSV([ snorlax(1490, 100.0, { iv:{atk:15,def:15,sta:15}, idx:1 }) ]));
    const w = res.pokemon.find(p => p.name === 'Snorlax' && p.slots.includes('M'));
    expect(w).toBeDefined();
    expect(w.nickname).toMatch(/Ⓜ100/);
    expect(w.nickname).toMatch(/Ⓗ/);
  });
});

// ─── Group J — Non-Legendary branching-evo final form wins Master ─────────────
// Regression for: Jolteon 15/15/14 (98% IV) was showing as ML placeholder (…98m)
// instead of confirmed Master keeper (…Ⓜ98). Root cause: the non-shadow Master pick
// demotion loop did not reset hasBattleSlot=false, leaving demoted pokemon frozen out
// of capped-league reconsideration and best_overall (via speciesWithConfirmedKeeper).

describe('Non-Legendary branching-evo final form — Master slot', () => {
  // Helper: actual Jolteon (already evolved, no further evolutions).
  const jolteon = (cp, pct, opts = {}) => {
    const total = Math.round(pct / 100 * 45);
    const atk = Math.min(15, total), rem = total - atk;
    const def = Math.min(15, rem), sta = rem - def;
    const iv = opts.iv || { atk, def, sta };
    return row({
      Index: String(opts.idx || 1),
      Name: 'Jolteon', 'Pokemon Number': '135', CP: String(cp),
      'Atk IV': String(iv.atk), 'Def IV': String(iv.def), 'Sta IV': String(iv.sta),
      'IV Avg': pct.toFixed(1), 'Level Min': '40',
      Lucky: opts.lucky ? '1' : '0',
      'Shadow/Purified': opts.shadow ? '1' : opts.purified ? '2' : '0',
      Favorite: opts.fav ? '1' : '0', Dust: '5000',
      // Jolteon has no capped-league evo targets (final form); give it token U rank.
      'Rank % (U)': '38.0', 'Dust Cost (U)': '200000', 'Name (U)': 'Jolteon',
    });
  };
  // Helper: Eevee pre-evo pointing at a given evo target for UL.
  const eeveeForU = (cp, pct, evoU, opts = {}) => {
    const total = Math.round(pct / 100 * 45);
    const atk = Math.min(15, total), rem = total - atk;
    const def = Math.min(15, rem), sta = rem - def;
    const iv = opts.iv || { atk, def, sta };
    return row({
      Index: String(opts.idx || 99),
      Name: 'Eevee', 'Pokemon Number': '133', CP: String(cp),
      'Atk IV': String(iv.atk), 'Def IV': String(iv.def), 'Sta IV': String(iv.sta),
      'IV Avg': pct.toFixed(1), 'Level Min': '5',
      Dust: '1000',
      'Rank % (U)': '60.0', 'Dust Cost (U)': '150000', 'Name (U)': evoU,
    });
  };

  it('Jolteon 15/15/14 (98% IV) wins confirmed Master slot and shows Ⓜ', () => {
    const res = analyse(toCSV([
      jolteon(1234, 97.8, { iv: { atk: 15, def: 15, sta: 14 }, idx: 1 }),
    ]));
    const w = res.pokemon.find(p => p.name === 'Jolteon' && p.slots.includes('M'));
    expect(w).toBeDefined();
    expect(w.wonMasterSlot).toBe(true);
    expect(w.nickname).toMatch(/Ⓜ/);
    expect(w.nickname).not.toMatch(/Ⓡ/);
  });

  it('Jolteon 98% beats lower-IV Eevee→Vaporeon for non-shadow Master slot', () => {
    // Eevee→Vaporeon 80% IV: lower adjIV than Jolteon 98% → Jolteon should win M.
    const res = analyse(toCSV([
      jolteon(1234, 97.8, { iv: { atk: 15, def: 15, sta: 14 }, idx: 1 }),
      eeveeForU(800, 80.0, 'Vaporeon', { idx: 2 }),
    ]));
    const j = res.pokemon.find(p => p.name === 'Jolteon' && p.cp === 1234);
    expect(j.wonMasterSlot).toBe(true);
    expect(j.nickname).toMatch(/Ⓜ/);
  });

  it('demoted M candidate (beaten by hundo) gets hasBattleSlot reset and keeps decision', () => {
    // Jolteon 98% wins M in main loop → hasBattleSlot=true.
    // Hundo Eevee→Vaporeon wins non-shadow Master pick → Jolteon demoted.
    // After fix: Jolteon.hasBattleSlot=false → eligible for best_overall → decision=keep.
    const res = analyse(toCSV([
      jolteon(1234, 97.8, { iv: { atk: 15, def: 15, sta: 14 }, idx: 1 }),
      eeveeForU(100, 100.0, 'Vaporeon', { iv: { atk: 15, def: 15, sta: 15 }, idx: 2 }),
    ]));
    const j = res.pokemon.find(p => p.name === 'Jolteon' && p.cp === 1234);
    // Jolteon lost M to the hundo, but should NOT fall to review with an Xm-format nick.
    expect(j.decision).toBe('keep');
    expect(j.nickname).not.toMatch(/\d+m$/); // no review-format trailing 'm'
    // The hundo Eevee should hold the confirmed M slot.
    const ev = res.pokemon.find(p => p.name === 'Eevee');
    expect(ev.wonMasterSlot).toBe(true);
  });
});

// ─── Group I — global invariant on the real export (smoke test) ──────────────
// If export_187 is available next to the tests, assert the family-level cap holds.
describe('Global cap invariant (export_187 smoke test)', () => {
  const fs = require('fs');
  const path = require('path');
  const exportPath = path.join(__dirname, 'export187.csv');
  const maybe = fs.existsSync(exportPath) ? it : it.skip;
  maybe('no family has more than one confirmed non-shadow Master keeper', () => {
    const { loadCSV } = require('./csvParser');
    const res = analyse(loadCSV(exportPath));
    let violations = 0;
    res.families.forEach(fam => {
      const ns = fam.members.filter(p => p.wonMasterSlot && !p.isShadow).length;
      if (ns > 1) violations++;
    });
    expect(violations).toBe(0);
  });
  maybe('every confirmed non-shadow Master winner (non-nundo) shows Ⓜ', () => {
    const { loadCSV } = require('./csvParser');
    const res = analyse(loadCSV(exportPath));
    const bad = res.pokemon.filter(p =>
      p.wonMasterSlot && !p.isShadow && !p.slots.includes('nundo') && !/Ⓜ/.test(p.nickname));
    expect(bad.map(p => p.name + ' ' + p.nickname)).toEqual([]);
  });
  maybe('every kept Purified ends with a trailing *', () => {
    const { loadCSV } = require('./csvParser');
    const res = analyse(loadCSV(exportPath));
    const bad = res.pokemon.filter(p => p.isPurified && p.decision === 'keep' && !p.nickname.endsWith('*'));
    expect(bad.map(p => p.name + ' ' + p.nickname)).toEqual([]);
  });
});
