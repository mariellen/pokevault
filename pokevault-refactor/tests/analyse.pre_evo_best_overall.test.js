'use strict';
// Tests for #46 — suppress best_overall for a pre-evo when the family already has a
// confirmed Master keeper (by ANY mechanism: ordinary pool winner, Dmax winner, Gmax winner —
// not a flag whitelist). Traced empirically against export 306 for two independent families:
// Corvisquire/Corviknight (original report) and Pikipek/Trumbeak/Toucannon (Sep 2026 report).
//
// Self-contained synthetic CSVs through the real csvParser + loader (same approach as
// analyse.branching_evo.test.js / analyse.gmax_master.test.js).
//   npx jest tests/analyse.pre_evo_best_overall.test.js --env=node

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
const rowStr = (o) => HEADER.map(c => (o[c] !== undefined ? o[c] : '')).join(',');
const toCSV = (rows) => parseCSV([HEADER.join(','), ...rows].join('\n'));

// A final-stage member (blank Name(G/U/L) — nothing to evolve to). ivAvg drives Master rank.
const finalMon = (o) => rowStr({
  Index: String(o.idx), Name: o.name, 'Pokemon Number': String(o.num), CP: String(o.cp),
  'Atk IV': String(o.a), 'Def IV': String(o.d), 'Sta IV': String(o.s),
  'IV Avg': o.iv.toFixed(1), 'Level Min': '20', Dust: '1000',
  Favorite: o.fav ? '1' : '0', Lucky: o.lucky ? '1' : '0',
});
// A pre-evo member (Name(U) points at the final-stage species — isFinalStage() becomes false
// for its species). ivAvg high enough (>=90) to satisfy best_overall's own qualifying-rank
// gate via rankPctM, WITHOUT entering the actual Master pool loop (gated on isFinalStage).
const preEvoMon = (o) => rowStr({
  Index: String(o.idx), Name: o.name, 'Pokemon Number': String(o.num), CP: String(o.cp),
  'Atk IV': String(o.a), 'Def IV': String(o.d), 'Sta IV': String(o.s),
  'IV Avg': o.iv.toFixed(1), 'Level Min': '20', Dust: '1000',
  Favorite: o.fav ? '1' : '0', Lucky: o.lucky ? '1' : '0',
  'Rank % (U)': o.evolvesToU ? '50.0' : '', 'Name (U)': o.evolvesToU || '',
});

const find = (mons, name, cp) => mons.find(p => p.name === name && p.cp === cp);

// ─── Test 1 — Corvisquire/Corviknight shape ──────────────────────────────────
describe('#46 Test 1 — Corvisquire/Corviknight: hundo Corviknight holds Master, Corvisquire suppressed', () => {
  it('hundo Corviknight wins confirmed Master', () => {
    const res = analyse(toCSV([
      finalMon({ idx: 1, name: 'Corviknight', num: 824, cp: 1474, a: 15, d: 15, s: 15, iv: 100.0, fav: true }),
      preEvoMon({ idx: 2, name: 'Corvisquire', num: 823, cp: 743, a: 15, d: 14, s: 13, iv: 93.3, evolvesToU: 'Corviknight' }),
    ]));
    const ck = find(res.pokemon, 'Corviknight', 1474);
    expect(ck.wonMasterSlot).toBe(true);
    expect(ck.slots).toContain('M');
  });

  it('Corvisquire does NOT get best_overall once Corviknight holds the family Master slot', () => {
    const res = analyse(toCSV([
      finalMon({ idx: 1, name: 'Corviknight', num: 824, cp: 1474, a: 15, d: 15, s: 15, iv: 100.0, fav: true }),
      preEvoMon({ idx: 2, name: 'Corvisquire', num: 823, cp: 743, a: 15, d: 14, s: 13, iv: 93.3, evolvesToU: 'Corviknight' }),
    ]));
    const cs = find(res.pokemon, 'Corvisquire', 743);
    expect(cs.slots).not.toContain('best_overall');
  });
});

// ─── Test 2 — Pikipek/Trumbeak/Toucannon shape (the case a flag whitelist misses) ──
describe('#46 Test 2 — Pikipek/Trumbeak/Toucannon: ordinary IV/favourited Master winner (no special flag)', () => {
  it('Toucannon wins Master via the ordinary pool — not wonDynamaxMaster/wonGigantamaxMaster', () => {
    const res = analyse(toCSV([
      finalMon({ idx: 1, name: 'Toucannon', num: 733, cp: 1500, a: 14, d: 15, s: 15, iv: 97.8, fav: true }),
      preEvoMon({ idx: 2, name: 'Trumbeak', num: 732, cp: 611, a: 15, d: 14, s: 13, iv: 93.3, evolvesToU: 'Toucannon' }),
    ]));
    const tc = find(res.pokemon, 'Toucannon', 1500);
    expect(tc.wonMasterSlot).toBe(true);
    expect(tc.slots).toContain('M');
    expect(tc.wonDynamaxMaster).toBeFalsy();
    expect(tc.wonGigantamaxMaster).toBeFalsy();
  });

  it('Trumbeak does NOT get best_overall — this is the case a flag-whitelist fix would miss', () => {
    const res = analyse(toCSV([
      finalMon({ idx: 1, name: 'Toucannon', num: 733, cp: 1500, a: 14, d: 15, s: 15, iv: 97.8, fav: true }),
      preEvoMon({ idx: 2, name: 'Trumbeak', num: 732, cp: 611, a: 15, d: 14, s: 13, iv: 93.3, evolvesToU: 'Toucannon' }),
    ]));
    const tb = find(res.pokemon, 'Trumbeak', 611);
    expect(tb.slots).not.toContain('best_overall');
  });
});

// ─── Test 3 — Lucky regression: untouched by this fix ────────────────────────
describe('#46 Test 3 — Lucky Pikipek untouched', () => {
  it('two Lucky Pikipek still show with correct Lucky handling alongside a confirmed Toucannon Master keeper', () => {
    const res = analyse(toCSV([
      finalMon({ idx: 1, name: 'Toucannon', num: 733, cp: 1500, a: 14, d: 15, s: 15, iv: 97.8, fav: true }),
      preEvoMon({ idx: 2, name: 'Trumbeak', num: 732, cp: 611, a: 15, d: 14, s: 13, iv: 93.3, evolvesToU: 'Toucannon' }),
      finalMon({ idx: 3, name: 'Pikipek', num: 731, cp: 685, a: 12, d: 15, s: 14, iv: 91.1, lucky: true }),
      finalMon({ idx: 4, name: 'Pikipek', num: 731, cp: 66, a: 14, d: 12, s: 15, iv: 91.1, lucky: true }),
    ]));
    const luckies = res.pokemon.filter(p => p.name === 'Pikipek' && p.isLucky);
    expect(luckies).toHaveLength(2);
    // Every Lucky gets the 'lucky' slot regardless of this fix (untouched code path).
    luckies.forEach(p => expect(p.slots).toContain('lucky'));
    // Trumbeak still correctly suppressed alongside the Luckies being present.
    const tb = find(res.pokemon, 'Trumbeak', 611);
    expect(tb.slots).not.toContain('best_overall');
  });
});

// ─── Test 4 — no-keeper family still gets best_overall normally ──────────────
// Corviknight wins Great outright (its own ivAvg is kept low so it can't also win/tentatively
// place for Master — this family has NO confirmed Master keeper anywhere). Corvisquire loses
// that same Great-League evo-target pool to Corviknight's higher rank, but still qualifies for
// best_overall on its own 91% Great rank, holding no slot of its own.
describe('#46 Test 4 — no confirmed Master keeper anywhere -> best_overall unaffected', () => {
  it('Corvisquire (loses Great to Corviknight, no Master keeper in family) still gets best_overall', () => {
    const res = analyse(toCSV([
      rowStr({
        Index: '1', Name: 'Corviknight', 'Pokemon Number': '824', CP: '1200',
        'Atk IV': '10', 'Def IV': '10', 'Sta IV': '8', 'IV Avg': '62.2', 'Level Min': '20', Dust: '1000',
        'Rank % (G)': '99.0', 'Name (G)': 'Corviknight',
      }),
      rowStr({
        // Low ivAvg (well under the 70% Master floor) so Corvisquire can't also win/tentatively
        // place for Master on its own — its ONLY qualifying path here is the 91% Great rank.
        Index: '2', Name: 'Corvisquire', 'Pokemon Number': '823', CP: '743',
        'Atk IV': '5', 'Def IV': '6', 'Sta IV': '7', 'IV Avg': '40.0', 'Level Min': '20', Dust: '1000',
        'Rank % (G)': '91.0', 'Name (G)': 'Corviknight', 'Rank % (U)': '50.0', 'Name (U)': 'Corviknight',
      }),
    ]));
    const ck = find(res.pokemon, 'Corviknight', 1200);
    expect(ck.wonMasterSlot).toBeFalsy();
    expect(res.pokemon.some(p => p.slots.includes('M') && p.slotConfirmed)).toBe(false);
    const cs = find(res.pokemon, 'Corvisquire', 743);
    expect(cs.slots).not.toContain('G'); // lost Great to Corviknight
    expect(cs.slots).toContain('best_overall');
  });
});

// ─── Test 5 — Dmax/Gmax family: confirm or refute the "may also affect" note ──
describe('#46 Test 5 — Dmax Master winner also suppresses a pre-evo best_overall (traced, not guessed)', () => {
  it('a Dmax-flagged Toucannon winning Master via wonDynamaxMaster also suppresses Trumbeak best_overall', () => {
    const NUM = 733;
    const keyFor = (a, d, s, idx) => [String(NUM), '', '', a, d, s, '_idx' + idx].join('|');
    const rows = [
      finalMon({ idx: 1, name: 'Toucannon', num: 733, cp: 1500, a: 13, d: 12, s: 14, iv: 86.7 }),
      preEvoMon({ idx: 2, name: 'Trumbeak', num: 732, cp: 611, a: 15, d: 14, s: 13, iv: 93.3, evolvesToU: 'Toucannon' }),
    ];
    const overrides = { [keyFor(13, 12, 14, 1)]: { is_dynamax: true } };
    const res = loader.createWithOverrides(overrides).analyse(toCSV(rows));
    const tc = find(res.pokemon, 'Toucannon', 1500);
    expect(tc.wonDynamaxMaster).toBe(true);
    const tb = find(res.pokemon, 'Trumbeak', 611);
    expect(tb.slots).not.toContain('best_overall');
  });
});
