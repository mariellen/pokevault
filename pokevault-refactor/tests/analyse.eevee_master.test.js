'use strict';
// Regression tests for branching-evo Master + Dynamax/Gigantamax slot keying.
//
// Two issues from the eevee-master-dynamax-regression brief:
//
//   Issue 1 (Glaceon Master) — NOT a code bug. Traced against the live engine: a
//     final-stage Eeveelution wins the family's single non-shadow Master slot and
//     renders the CONFIRMED star (Ⓜ), not the lowercase ML placeholder (…98m). The
//     `…98m` symptom belonged to the *Jolteon* form of this bug, already fixed by the
//     non-shadow Master demotion reset (hasBattleSlot / wonMasterSlot / slotConfirmed
//     all cleared on demoted loop-winners). The v3.5.45 comparator change (removal of
//     `if (Math.abs(ra-rb) > 0.01) return rb-ra;`) does NOT mis-handle branching evo:
//     Master groups by stageName (the evo target), an actual Glaceon IS its own
//     stageName, and the rounded-rank + evolved-state tiebreak the new comparator falls
//     through to actually *favours* the evolved form in the rounding band. The only gap
//     was the missing non-shiny-Glaceon Master test — added here (Group A/B).
//
//   Issue 2 (Dynamax per Eevee evolution) — REAL bug, fixed. The Dmax/Gmax candidate
//     pools were keyed on `p.name`, collapsing every Eevee into one 'Eevee' pool that
//     competed for a single slot. Fix: key on the final evolution target
//     (`evolvedNameU || evolvedNameG || name`, via `maxTargetKey`) — the same base
//     buildNickname uses for the Dmax/Gmax nick. Each evolution target now surfaces its
//     own keeper (Group C/D). Already-evolved final forms key on their own name, so
//     single-stage Dynamax species are unaffected.
//
// Self-contained synthetic CSVs through the real csvParser + loader (same approach as
// analyse.master_league.test.js / analyse.branching_evo.test.js). Does NOT touch the
// shared poke_genie_fixture.csv. Run with:
//   npx jest tests/analyse.eevee_master.test.js --env=node

const loader = require('./loader');
const { analyse } = loader;
const { parseCSV } = require('./csvParser');

// Full 50-column Pokégenie export header (identical to the sibling suites).
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

// Pokégenie Pokémon Numbers for the Eevee line.
const NUM = { Eevee:133, Vaporeon:134, Jolteon:135, Flareon:136,
  Espeon:196, Umbreon:197, Leafeon:470, Glaceon:471, Sylveon:700 };

const ivAvgStr = (a, d, s) => ((a + d + s) / 45 * 100).toFixed(1);
const mon = (mons, name, cp) => mons.find(p => p.name === name && p.cp === cp);
const slotsOf = (p) => (p.slots || []).filter(s => ['L','G','U','M'].includes(s));
// stableKey used by overrides: pokeNum|form|gender|atk|def|sta|(_idx<Index>)  (no CP)
const keyFor = (num, a, d, s, idx) => [String(num), '', '', a, d, s, '_idx' + idx].join('|');

// An already-evolved final Eeveelution (no further evolutions → ML rank = ivAvg).
const evolved = (name, cp, a, d, s, opts = {}) => row({
  Index: String(opts.idx || 1), Name: name, 'Pokemon Number': String(NUM[name] || 0), CP: String(cp),
  'Atk IV': String(a), 'Def IV': String(d), 'Sta IV': String(s),
  'IV Avg': ivAvgStr(a, d, s), 'Level Min': '40',
  Lucky: opts.lucky ? '1' : '0',
  'Shadow/Purified': opts.shadow ? '1' : opts.purified ? '2' : '0',
  Favorite: opts.fav ? '1' : '0', Dust: '5000',
  // token Ultra rank so the row isn't treated as unanalysed; well below ML.
  'Rank % (U)': opts.ru || '40.0', 'Dust Cost (U)': '300000', 'Name (U)': name,
});

// An Eevee pre-evo whose final evolution target is `target`. Master rank (= ivAvg) is
// kept LOW (default) so these rows don't enter the confirmed-Master competition; the
// target is carried on Name (U) so maxTargetKey resolves to `target` for Dmax/Gmax.
// Leave Rank % (U) blank by default → rankPctU = 0 → no Ultra league slot is won, so the
// row's only possible slot is the dynamax/gigantamax one under test.
const eeveeTo = (target, cp, a, d, s, opts = {}) => row({
  Index: String(opts.idx || 1), Name: 'Eevee', 'Pokemon Number': String(NUM.Eevee), CP: String(cp),
  'Atk IV': String(a), 'Def IV': String(d), 'Sta IV': String(s),
  'IV Avg': ivAvgStr(a, d, s), 'Level Min': '5',
  Favorite: opts.fav ? '1' : '0', Dust: '1000',
  'Rank % (U)': opts.ru != null ? String(opts.ru) : '', 'Name (U)': target,
  'Rank % (L)': opts.rl != null ? String(opts.rl) : '', 'Name (L)': opts.el || '',
});

// ─── Group A — Glaceon wins a CONFIRMED Master slot (Issue 1 test gap) ────────
// This is the exact coverage whose absence let the original Jolteon regression ship:
// a non-shiny, final-stage Eeveelution winning Master must render Ⓜ, never …98m.

describe('Glaceon Master — confirmed slot, not the …m placeholder', () => {
  it('a lone Glaceon 15/15/14 (97.8%) wins Master and shows Ⓜ98 (not Glaceon98m)', () => {
    const res = analyse(toCSV([
      evolved('Glaceon', 2800, 15, 15, 14, { idx: 1 }),
    ]));
    const g = mon(res.pokemon, 'Glaceon', 2800);
    expect(g).toBeDefined();
    expect(g.wonMasterSlot).toBe(true);
    expect(g.slots).toContain('M');
    expect(g.nickname).toMatch(/Ⓜ98/);        // confirmed Master star + rounded rank
    expect(g.nickname).not.toMatch(/Ⓡ/);       // not the raid/holding star
    expect(g.nickname).not.toMatch(/\d+m$/);    // not the lowercase ML placeholder (…98m)
    expect(g.decision).toBe('keep');
  });

  it('Glaceon inside the full Eevee branching family still wins Ⓜ', () => {
    // Pre-evo Eevees pointing at other evolutions must not displace the actual Glaceon.
    const res = analyse(toCSV([
      evolved('Glaceon', 2800, 15, 15, 14, { idx: 1 }),                 // 97.8% — final form
      eeveeTo('Leafeon', 13, 5, 11, 13, { idx: 2, el: 'Leafeon', rl: 100.0, fav: true }), // LL Leafeon
      eeveeTo('Vaporeon', 14, 4, 12, 14, { idx: 3, ru: 60.0 }),         // low UL Vaporeon-target
    ]));
    const g = mon(res.pokemon, 'Glaceon', 2800);
    expect(g.wonMasterSlot).toBe(true);
    expect(g.nickname).toMatch(/Ⓜ/);
    expect(g.nickname).not.toMatch(/\d+m$/);
    // Exactly one non-shadow Master keeper in the whole family.
    const family = res.pokemon.filter(p => [ 'Eevee', ...Object.keys(NUM) ].includes(p.name));
    expect(family.filter(p => p.wonMasterSlot && !p.isShadow).length).toBe(1);
  });

  it('grey-star guard: a confirmed Glaceon Master winner never carries a tentative M', () => {
    const res = analyse(toCSV([ evolved('Glaceon', 2800, 15, 15, 14, { idx: 1 }) ]));
    const g = mon(res.pokemon, 'Glaceon', 2800);
    expect(g.slots).toContain('M');
    expect(g.slots).not.toContain('M_tentative');
  });
});

// ─── Group B — independent per-evolution Master consideration ────────────────
// Each final evo is its own Master stageName group; the family still keeps ONE
// non-shadow Master winner (highest), and the loser stays a keep (not …m / not trade).

describe('Branching Master — highest final-evo wins, loser stays keep', () => {
  it('Glaceon 97.8 beats Vaporeon 95.6 for the single non-shadow Master slot', () => {
    const res = analyse(toCSV([
      evolved('Glaceon', 2800, 15, 15, 14, { idx: 1 }),   // 97.8%
      evolved('Vaporeon', 2500, 15, 14, 14, { idx: 2 }),  // 95.6%
    ]));
    const g = mon(res.pokemon, 'Glaceon', 2800);
    const v = mon(res.pokemon, 'Vaporeon', 2500);
    expect(g.wonMasterSlot).toBe(true);
    expect(g.nickname).toMatch(/Ⓜ/);
    // The loser keeps (best_overall), it is NOT demoted to a review/…m placeholder.
    expect(v.wonMasterSlot).toBeFalsy();
    expect(v.decision).toBe('keep');
    expect(v.nickname).not.toMatch(/\d+m$/);
    // Two final evos considered, but only one non-shadow Master keeper survives.
    const winners = res.pokemon.filter(p => p.wonMasterSlot && !p.isShadow);
    expect(winners.length).toBe(1);
    expect(winners[0].name).toBe('Glaceon');
  });
});

// ─── Group C — Dynamax keyed per evolution target (the Issue 2 fix) ───────────
// is_dynamax is an override (no CSV column), applied via loader.createWithOverrides
// keyed by stableKey. Three Dynamax Eevees pointing at three evolutions must surface
// three independent keepers — pre-fix they collapsed into one 'Eevee' pool (one slot).

// IVs are kept under 70% so the Dynamax pre-evos win no league slot (Master's tentative
// floor is 70) — that isolates the dynamax/gigantamax keying, the behaviour under test.
describe('Dynamax — one keeper per evolution target', () => {
  it('three Dynamax Eevees (→Vaporeon/Flareon/Jolteon) each get their own dynamax slot', () => {
    const rows = [
      eeveeTo('Vaporeon', 500, 8, 10, 11, { idx: 1 }),   // 64.4% — no league slot
      eeveeTo('Flareon',  500, 10, 8, 11, { idx: 2 }),   // 64.4%
      eeveeTo('Jolteon',  500, 11, 10, 8, { idx: 3 }),   // 64.4%
    ];
    const overrides = {
      [keyFor(NUM.Eevee, 8, 10, 11, 1)]: { is_dynamax: true },
      [keyFor(NUM.Eevee, 10, 8, 11, 2)]: { is_dynamax: true },
      [keyFor(NUM.Eevee, 11, 10, 8, 3)]: { is_dynamax: true },
    };
    const { analyse: analyseOv } = loader.createWithOverrides(overrides);
    const eevees = analyseOv(toCSV(rows)).pokemon.filter(p => p.name === 'Eevee');
    const dmax = eevees.filter(p => p.slots.includes('dynamax'));
    expect(dmax.length).toBe(3);                    // one per evolution target (was 1 pre-fix)
    // each keeper carries its distinct evolution target on the nick base
    const targets = dmax.map(p => p.evolvedNameU).sort();
    expect(targets).toEqual(['Flareon', 'Jolteon', 'Vaporeon']);
  });

  it('two Dynamax Eevees pointing at the SAME target → best gets Ⓜ, the other kept as raid (Ⓡ)', () => {
    // Per the dynamax-master-flag brief: only ONE Ⓜ per max-evo target (best IV), but
    // every slot-less Dmax is kept as a raid candidate (Ⓡ) — both keep, neither traded.
    const rows = [
      eeveeTo('Vaporeon', 500, 10, 10, 9, { idx: 1 }),    // 64.4% IV — better → Ⓜ
      eeveeTo('Vaporeon', 500, 7, 8, 8, { idx: 2 }),      // 51.1% IV — worse → Ⓡ raid
    ];
    const overrides = {
      [keyFor(NUM.Eevee, 10, 10, 9, 1)]: { is_dynamax: true },
      [keyFor(NUM.Eevee, 7, 8, 8, 2)]: { is_dynamax: true },
    };
    const { analyse: analyseOv } = loader.createWithOverrides(overrides);
    const eevees = analyseOv(toCSV(rows)).pokemon.filter(p => p.name === 'Eevee');
    // Exactly one Ⓜ for the Vaporeon pool (the best IV); both slot-less Dmax are kept.
    const masters = eevees.filter(p => p.wonDynamaxMaster);
    expect(masters.length).toBe(1);
    expect(Math.round(masters[0].ivAvg)).toBe(64);  // best-IV keeper carries Ⓜ
    const dmax = eevees.filter(p => p.slots.includes('dynamax'));
    expect(dmax.length).toBe(2);                    // both kept as Dmax raid candidates
    eevees.forEach(p => expect(p.decision).toBe('keep'));
  });

  it('a single-stage Dynamax species is unaffected (keys on its own name)', () => {
    // Already-evolved Vaporeon, no evo target on Name (U): maxTargetKey falls back to
    // name = "Vaporeon". Low IV + no league ranks → no league slot → free to take dynamax.
    const rows = [ row({
      Index: '1', Name: 'Vaporeon', 'Pokemon Number': String(NUM.Vaporeon), CP: '1400',
      'Atk IV': '10', 'Def IV': '10', 'Sta IV': '10', 'IV Avg': ivAvgStr(10, 10, 10),
      'Level Min': '20', Dust: '5000',
    }) ];
    const { analyse: analyseOv } =
      loader.createWithOverrides({ [keyFor(NUM.Vaporeon, 10, 10, 10, 1)]: { is_dynamax: true } });
    const v = analyseOv(toCSV(rows)).pokemon.find(p => p.name === 'Vaporeon');
    expect(v.evolvedNameU).toBe('');                // no evo target → keys on its own name
    expect(slotsOf(v).length).toBe(0);              // holds no league slot
    expect(v.slots).toContain('dynamax');
  });
});

// ─── Group D — Gigantamax parity ─────────────────────────────────────────────
// Same maxTargetKey path for gigantamax. (Synthetic: the engine reads the flag and
// keys by evolution target; it does not validate Gmax legality.)

describe('Gigantamax — one keeper per evolution target (parity with Dynamax)', () => {
  it('two Gigantamax Eevees (→Vaporeon/Flareon) each get their own gigantamax slot', () => {
    const rows = [
      eeveeTo('Vaporeon', 500, 8, 11, 10, { idx: 1 }),   // 64.4% — no league slot
      eeveeTo('Flareon',  500, 10, 11, 8, { idx: 2 }),   // 64.4%
    ];
    const overrides = {
      [keyFor(NUM.Eevee, 8, 11, 10, 1)]: { is_gigantamax: true },
      [keyFor(NUM.Eevee, 10, 11, 8, 2)]: { is_gigantamax: true },
    };
    const { analyse: analyseOv } = loader.createWithOverrides(overrides);
    const eevees = analyseOv(toCSV(rows)).pokemon.filter(p => p.name === 'Eevee');
    const gmax = eevees.filter(p => p.slots.includes('gigantamax'));
    expect(gmax.length).toBe(2);
    expect(gmax.map(p => p.evolvedNameU).sort()).toEqual(['Flareon', 'Vaporeon']);
  });
});

// ─── Group E — branching league-slot separation unaffected by the keying change ─
// Guard that re-keying the Dmax/Gmax pools did not disturb the existing per-evo-target
// league-slot separation, and that a dynamax slot coexists with a league slot.

describe('Branching league separation still holds alongside Dynamax', () => {
  it('Eevee→Leafeon LL and Eevee→Jolteon LL both keep Little (different targets)', () => {
    const res = analyse(toCSV([
      eeveeTo('Leafeon', 13, 5, 11, 13, { idx: 1, el: 'Leafeon', rl: 100.0, fav: true }),
      eeveeTo('Jolteon', 14, 4, 12, 14, { idx: 2, el: 'Jolteon', rl: 99.0 }),
    ]));
    const leaf = mon(res.pokemon, 'Eevee', 13);
    const jolt = mon(res.pokemon, 'Eevee', 14);
    expect(slotsOf(leaf)).toContain('L');
    expect(slotsOf(jolt)).toContain('L');     // not displaced by the Leafeon
  });

  it('best-IV Dmax gets the Ⓜ flag; the slot-less sibling is kept as a raid candidate', () => {
    // Per the dynamax-master-flag brief: Dmax are excluded from the regular Master pass,
    // so the best-IV Vaporeon-target Eevee becomes the Ⓜ power-up candidate (wonDynamaxMaster)
    // rather than winning a regular M slot. The lower-IV sibling is kept as a Dmax raid (Ⓡ).
    const rows = [
      eeveeTo('Vaporeon', 1400, 14, 14, 13, { idx: 1 }),  // 91.1% → best Dmax → Ⓜ
      eeveeTo('Vaporeon', 500, 10, 10, 9, { idx: 2 }),    // 64.4% → slot-less raid → Ⓡ
    ];
    const overrides = {
      [keyFor(NUM.Eevee, 14, 14, 13, 1)]: { is_dynamax: true },
      [keyFor(NUM.Eevee, 10, 10, 9, 2)]: { is_dynamax: true },
    };
    const { analyse: analyseOv } = loader.createWithOverrides(overrides);
    const eevees = analyseOv(toCSV(rows)).pokemon.filter(p => p.name === 'Eevee');
    const best = eevees.find(p => p.cp === 1400);
    const sibling = eevees.find(p => p.cp === 500);
    expect(best.wonDynamaxMaster).toBe(true);           // the Master power-up candidate
    expect(best.wonMasterSlot).toBeFalsy();             // never a regular Master slot
    expect(best.decision).toBe('keep');
    expect(best.nickname).toContain('Ⓜ');
    expect(sibling.wonDynamaxMaster).toBeFalsy();
    expect(sibling.slots).toContain('dynamax');         // kept as a Dmax raid candidate
    expect(sibling.decision).toBe('keep');
  });
});

// ─── Group F — two-slot cap: one Shadow + one Non-Shadow Master per family ────

describe('Master two-slot cap — Shadow + Non-Shadow coexist', () => {
  it('non-shadow Glaceon keeps Ⓜ while a purifying shadow holds its own Master slot', () => {
    const res = analyse(toCSV([
      evolved('Glaceon', 2800, 15, 15, 14, { idx: 1 }),                    // non-shadow winner (97.8%)
      evolved('Vaporeon', 2000, 13, 11, 15, { idx: 2, shadow: true }),     // shadow 86.7% → purifies to ~96%
    ]));
    const g = mon(res.pokemon, 'Glaceon', 2800);
    const shadow = res.pokemon.find(p => p.isShadow);
    expect(g.wonMasterSlot).toBe(true);
    expect(g.nickname).toMatch(/Ⓜ/);
    // At most one NON-shadow Master keeper for the family.
    expect(res.pokemon.filter(p => p.wonMasterSlot && !p.isShadow).length).toBe(1);
    // The shadow qualifies for the purify-push (86.7% → ~96% purified) and holds its OWN
    // Master slot as Ⓜ…p, independent of the non-shadow winner — the two-slot cap
    // (one Shadow + one Non-Shadow) in action.
    expect(shadow.isPurifySlot).toBe(true);
    expect(shadow.purifyLeague).toBe('M');
    expect(shadow.slots).toContain('M');
    expect(shadow.nickname).toMatch(/Ⓜ.*p/);
  });
});

// ─── Group G2 — REGRESSION: demoted Master winner stranded as …98m ───────────
// Live repro (v3.5.48 UI, search "glaceon"): a 15/14/15 (98%) Glaceon rendered
// Glaceon98m instead of GlaceonⓇ98. Requires BOTH:
//   (1) the best-Master Glaceon is demoted by a higher-precedence sibling (a hundo
//       Eevee→Vaporeon wins the family's single non-shadow Master slot), AND
//   (2) another Glaceon already holds a confirmed league slot, putting 'Glaceon' in
//       best_overall's speciesWithConfirmedKeeper set → demoted Glaceon excluded.
// The demoted Glaceon then falls through every keeper path into the review/holding
// state. It must instead keep (GlaceonⓇ98), never the lowercase …m placeholder.

describe('Regression — demoted Master Glaceon must keep, not show …98m', () => {
  const glac = (cp, a, d, s, opts = {}) => row({
    Index: String(opts.idx), Name: 'Glaceon', 'Pokemon Number': String(NUM.Glaceon), CP: String(cp),
    'Atk IV': String(a), 'Def IV': String(d), 'Sta IV': String(s),
    'IV Avg': ivAvgStr(a, d, s), 'Level Min': '20', Dust: '5000',
    'Rank % (G)': opts.rg || '', 'Dust Cost (G)': opts.dg || '', 'Name (G)': opts.rg ? 'Glaceon' : '',
    'Rank % (U)': opts.ru || '', 'Dust Cost (U)': opts.du || '', 'Name (U)': opts.ru ? 'Glaceon' : '',
  });
  const hundoEeveeToVaporeon = (cp, idx) => row({
    Index: String(idx), Name: 'Eevee', 'Pokemon Number': String(NUM.Eevee), CP: String(cp),
    'Atk IV': '15', 'Def IV': '15', 'Sta IV': '15', 'IV Avg': '100.0', 'Level Min': '20',
    Dust: '5000', 'Name (U)': 'Vaporeon',
  });

  it('98% Glaceon demoted by a hundo, with a confirmed-Great sibling Glaceon, still keeps as Ⓡ', () => {
    const res = analyse(toCSV([
      glac(1500, 2, 9, 14, { idx: 1, rg: '99.7', dg: '84000', ru: '99.1', du: '84000' }), // confirmed Great/Ultra
      glac(2500, 2, 15, 15, { idx: 2, ru: '100.0', du: '2' }),                             // confirmed Ultra
      glac(1782, 15, 14, 15, { idx: 4 }),                                                  // 98% — best Master
      hundoEeveeToVaporeon(100, 5),                                                        // hundo → wins family Master
    ]));
    const g98 = mon(res.pokemon, 'Glaceon', 1782);
    const hundo = res.pokemon.find(p => p.atkIV === 15 && p.defIV === 15 && p.staIV === 15);
    // The hundo takes the single non-shadow Master slot…
    expect(hundo.wonMasterSlot).toBe(true);
    // …and the demoted 98% Glaceon must NOT be stranded as a review/…m placeholder.
    expect(g98.decision).toBe('keep');
    expect(g98.nickname).not.toMatch(/\d+m$/);     // ← currently fails: renders "Glaceon98m"
    expect(g98.nickname).toMatch(/Ⓡ/);             // best-overall raid keep (GlaceonⓇ98)
    expect(g98.slots.length).toBeGreaterThan(0);   // holds a keeper slot, not []
  });
});

// ─── Group G — global smoke test on the real export, if present ──────────────

describe('Eevee/Dynamax invariants on export187 (smoke test)', () => {
  const fs = require('fs');
  const path = require('path');
  const exportPath = path.join(__dirname, 'export187.csv');
  const maybe = fs.existsSync(exportPath) ? it : it.skip;

  maybe('no evolution target holds more than one gigantamax keeper', () => {
    // NOTE: Dynamax intentionally allows MULTIPLE keepers per target since the
    // dynamax-master-flag brief — the best gets Ⓜ (wonDynamaxMaster) and every other
    // slot-less Dmax is kept as a raid candidate (Ⓡ). Gigantamax still keeps one per target.
    const { loadCSV } = require('./csvParser');
    const res = analyse(loadCSV(exportPath));
    const targetOf = p => p.evolvedNameU || p.evolvedNameG || p.name;
    ['gigantamax'].forEach(slot => {
      const seen = {};
      res.pokemon.filter(p => p.slots.includes(slot)).forEach(p => {
        // family + target uniquely identifies a max pool
        const k = (p.familyKey || '') + '|' + targetOf(p);
        (seen[k] = seen[k] || []).push(p);
      });
      const dupes = Object.entries(seen).filter(([, g]) => g.length > 1)
        .map(([k, g]) => slot + ' ' + k + ' -> ' + g.map(p => p.name + 'CP' + p.cp).join(','));
      expect(dupes).toEqual([]);
    });
  });

  maybe('the best Dynamax per evolution target carries the Ⓜ power-up flag', () => {
    const { loadCSV } = require('./csvParser');
    const res = analyse(loadCSV(exportPath));
    const targetOf = p => p.evolvedNameU || p.evolvedNameG || p.name;
    const seen = {};
    res.pokemon.filter(p => p.isDynamax).forEach(p => {
      const k = (p.familyKey || '') + '|' + targetOf(p);
      (seen[k] = seen[k] || []).push(p);
    });
    // Exactly one wonDynamaxMaster per pool that has any Dynamax.
    const bad = Object.entries(seen)
      .filter(([, g]) => g.filter(p => p.wonDynamaxMaster).length !== 1)
      .map(([k, g]) => k + ' -> ' + g.filter(p => p.wonDynamaxMaster).length + ' Ⓜ');
    expect(bad).toEqual([]);
  });

  maybe('every confirmed non-shadow Master winner (non-nundo) shows Ⓜ', () => {
    const { loadCSV } = require('./csvParser');
    const res = analyse(loadCSV(exportPath));
    const bad = res.pokemon.filter(p =>
      p.wonMasterSlot && !p.isShadow && !p.slots.includes('nundo') && !/Ⓜ/.test(p.nickname));
    expect(bad.map(p => p.name + ' ' + p.nickname)).toEqual([]);
  });
});
