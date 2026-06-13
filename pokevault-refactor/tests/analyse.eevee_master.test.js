'use strict';
// Regression tests for the Eevee branching family — Master slot + Dynamax separation.
// Brief: eevee-master-dynamax-regression.
//
// Two issues are pinned here:
//
//   Issue 1 — A plain (non-shiny, non-shadow) Glaceon that is the best non-shadow
//     final-evo in its family MUST win a CONFIRMED Master slot (GlaceonⓂ98), not the
//     grey ML-placeholder holding nick (Glaceon98m). This was a previously-shipped
//     regression for the structurally-identical Jolteon case (master_league Group J),
//     fixed by resetting hasBattleSlot in the non-shadow Master demotion loop. No test
//     previously pinned the Glaceon variant — this suite closes that gap.
//
//   Issue 2 — Each Eevee final evolution must surface its own best Dynamax (and
//     Gigantamax) recommendation independently. Dynamax candidate pools were keyed on
//     the species NAME ('Eevee'), so several Dynamax Eevee rows pointing at DIFFERENT
//     final evolutions (→Vaporeon / →Flareon / →Jolteon) collapsed into one pool and
//     competed for a single dynamax slot — the surplus targets fell through to review
//     with no slot. The fix keys Dynamax/Gigantamax pools by evolution target (the same
//     base buildNickname uses for the dynamax nick), so each target gets its own keeper.
//
// Self-contained synthetic CSVs through the real csvParser + loader (same approach as
// analyse.branching_evo.test.js / analyse.master_league.test.js). Does NOT touch the
// shared poke_genie_fixture.csv. Run with:
//   npx jest tests/analyse.eevee_master.test.js --env=node

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

const NUM = {
  Eevee: '133', Vaporeon: '134', Jolteon: '135', Flareon: '136',
  Espeon: '196', Umbreon: '197', Leafeon: '470', Glaceon: '471', Sylveon: '700',
};

// An already-evolved Eeveelution (final form). ivAvg = Master rank. Token Ultra rank
// keeps it off the capped-league radar so the Master pass is what we exercise.
const evolved = (name, cp, opts = {}) => row({
  Index: String(opts.idx || 1), Name: name, 'Pokemon Number': NUM[name], CP: String(cp),
  'Atk IV': String(opts.a ?? 15), 'Def IV': String(opts.d ?? 14), 'Sta IV': String(opts.s ?? 15),
  'IV Avg': (opts.iv ?? 97.8).toFixed(1), 'Level Min': String(opts.lvl ?? 30),
  Lucky: opts.lucky ? '1' : '0',
  'Shadow/Purified': opts.shadow ? '1' : opts.purified ? '2' : '0',
  Favorite: opts.fav ? '1' : '0', Dust: '5000',
  'Rank % (U)': String(opts.ru ?? 38.0), 'Dust Cost (U)': '200000', 'Name (U)': name,
});

// An Eevee pre-evo pointing at a given evolution target per league.
const eevee = (opts) => row({
  Index: String(opts.idx), Name: 'Eevee', 'Pokemon Number': NUM.Eevee, CP: String(opts.cp ?? 500),
  'Atk IV': String(opts.a ?? 5), 'Def IV': String(opts.d ?? 11), 'Sta IV': String(opts.s ?? 13),
  'IV Avg': (opts.iv ?? 64.4).toFixed(1), 'Level Min': String(opts.lvl ?? 5),
  Lucky: opts.lucky ? '1' : '0',
  'Shadow/Purified': opts.shadow ? '1' : opts.purified ? '2' : '0',
  Favorite: opts.fav ? '1' : '0', Dust: '1000',
  'Rank % (L)': opts.rl != null ? String(opts.rl) : '', 'Name (L)': opts.el || '',
  'Rank % (U)': opts.ru != null ? String(opts.ru) : '', 'Name (U)': opts.eu || '',
  'Rank % (G)': opts.rg != null ? String(opts.rg) : '', 'Name (G)': opts.eg || '',
});

const mon = (mons, name, cp) => mons.find(p => p.name === name && p.cp === cp);
const slotsOf = (p) => (p.slots || []).filter(s => ['L', 'G', 'U', 'M'].includes(s));
// stableKey for a synthetic row with no catch date: pokeNum|form|gender|atk|def|sta|_idx<Index>
const keyFor = (num, a, d, s, idx) => [num, '', '', a, d, s, '_idx' + idx].join('|');

// ─── Issue 1 — Glaceon wins a confirmed Master slot ──────────────────────────

describe('Eevee Master — Glaceon wins confirmed Master slot', () => {
  it('a plain Glaceon 15/14/15 (98% IV) wins Master → GlaceonⓂ98, not Glaceon98m', () => {
    const res = analyse(toCSV([
      evolved('Glaceon', 1762, { a: 15, d: 14, s: 15, iv: 97.8, idx: 1 }),
    ]));
    const g = mon(res.pokemon, 'Glaceon', 1762);
    expect(g.wonMasterSlot).toBe(true);
    expect(g.slots).toContain('M');
    expect(g.nickname).toMatch(/GlaceonⓂ98/);
    expect(g.nickname).not.toMatch(/\d+m$/);   // NOT the …98m ML-placeholder holding nick
    expect(g.starType).not.toBe('grey');       // grey star = ML placeholder
    expect(g.decision).toBe('keep');
  });

  it('Glaceon still wins Master inside the full Eevee branching family', () => {
    // Pre-evo Eevees pointing at other evolutions must not steal Glaceon's Master slot.
    const res = analyse(toCSV([
      evolved('Glaceon', 1762, { a: 15, d: 14, s: 15, iv: 97.8, idx: 1 }),
      eevee({ idx: 2, cp: 13, el: 'Leafeon', rl: 100.0, fav: true }),
      eevee({ idx: 3, cp: 14, a: 4, d: 12, s: 14, iv: 66.7, el: 'Jolteon', rl: 60.0 }),
    ]));
    const g = mon(res.pokemon, 'Glaceon', 1762);
    expect(g.wonMasterSlot).toBe(true);
    expect(g.slots).toContain('M');
    expect(g.nickname).toMatch(/Ⓜ/);
    expect(g.nickname).not.toMatch(/\d+m$/);
  });
});

// ─── Issue 1 (cont.) — each final evo gets independent Master consideration ───

describe('Eevee Master — independent per-evolution Master consideration', () => {
  it('highest-IV final evo wins Master; the loser keeps (not a 98m placeholder)', () => {
    // Glaceon 98% vs Leafeon 96% — both final evos in one family. One non-shadow Master
    // keeper per family: Glaceon wins; Leafeon must still be a keep (best_overall), NOT
    // frozen into a review/ML-placeholder nick.
    const res = analyse(toCSV([
      evolved('Glaceon', 1762, { a: 15, d: 14, s: 15, iv: 97.8, idx: 1 }),
      evolved('Leafeon', 1800, { a: 15, d: 15, s: 13, iv: 95.6, idx: 2 }),
    ]));
    const g = mon(res.pokemon, 'Glaceon', 1762);
    const l = mon(res.pokemon, 'Leafeon', 1800);
    expect(g.wonMasterSlot).toBe(true);
    expect(g.nickname).toMatch(/Ⓜ/);
    // Leafeon lost the single non-shadow Master slot but is still a family keeper.
    expect(l.wonMasterSlot).toBeFalsy();
    expect(l.decision).toBe('keep');
    expect(l.nickname).not.toMatch(/\d+m$/);
  });

  it('a Glaceon beaten by a hundo Eevee→Vaporeon falls to a keep, not review/98m', () => {
    const res = analyse(toCSV([
      evolved('Glaceon', 1762, { a: 15, d: 14, s: 15, iv: 97.8, idx: 1 }),
      eevee({ idx: 2, cp: 100, a: 15, d: 15, s: 15, iv: 100.0, eu: 'Vaporeon', ru: 60.0 }),
    ]));
    const g = mon(res.pokemon, 'Glaceon', 1762);
    const ev = mon(res.pokemon, 'Eevee', 100);
    expect(ev.wonMasterSlot).toBe(true);          // hundo takes the non-shadow Master slot
    expect(g.wonMasterSlot).toBeFalsy();
    expect(g.decision).toBe('keep');              // demoted Glaceon is still kept…
    expect(g.nickname).not.toMatch(/\d+m$/);      // …and not an Xm review nick
  });

  it('each of several distinct final evos is kept (no evo target silently dropped)', () => {
    const res = analyse(toCSV([
      evolved('Vaporeon', 1801, { iv: 95.6, idx: 1 }),
      evolved('Jolteon', 1802, { iv: 93.3, idx: 2 }),
      evolved('Flareon', 1803, { iv: 91.1, idx: 3 }),
      evolved('Glaceon', 1804, { a: 15, d: 14, s: 15, iv: 97.8, idx: 4 }),
    ]));
    ['Vaporeon', 'Jolteon', 'Flareon', 'Glaceon'].forEach((n, i) => {
      const p = mon(res.pokemon, n, 1801 + i);
      expect(p.decision).toBe('keep');            // every distinct final evo survives the cull
    });
    // Exactly ONE of them holds the non-shadow Master slot (the highest IV — Glaceon).
    const masters = res.pokemon.filter(p => p.wonMasterSlot && !p.isShadow);
    expect(masters.length).toBe(1);
    expect(masters[0].name).toBe('Glaceon');
  });
});

// ─── Issue 2 — Dynamax surfaces per evolution target ─────────────────────────

describe('Eevee Dynamax — best surfaces per evolution target', () => {
  it('Dynamax Eevees pointing at different evos each get their own Dynamax keep', () => {
    // Three Dynamax Eevee rows → Vaporeon / Flareon / Jolteon. The Vaporeon hundo wins the
    // single non-shadow Master slot (shows Ⓓ in its M nick); the Flareon- and Jolteon-target
    // Eevees must EACH hold their own 'dynamax' slot and be kept — not collapse into one pool.
    const rows = [
      eevee({ idx: 10, cp: 500, a: 15, d: 15, s: 15, iv: 100.0, eu: 'Vaporeon', ru: 60.0 }),
      eevee({ idx: 11, cp: 500, a: 15, d: 14, s: 15, iv: 97.8, eu: 'Flareon', ru: 60.0 }),
      eevee({ idx: 12, cp: 500, a: 14, d: 15, s: 15, iv: 97.8, eu: 'Jolteon', ru: 60.0 }),
    ];
    const ovr = {
      [keyFor(NUM.Eevee, 15, 15, 15, 10)]: { is_dynamax: true },
      [keyFor(NUM.Eevee, 15, 14, 15, 11)]: { is_dynamax: true },
      [keyFor(NUM.Eevee, 14, 15, 15, 12)]: { is_dynamax: true },
    };
    const { analyse: a2 } = loader.createWithOverrides(ovr);
    const mons = a2(toCSV(rows)).pokemon;

    const vap = mon(mons, 'Eevee', 500) && mons.find(p => p.idx === '10');
    const fla = mons.find(p => p.idx === '11');
    const jol = mons.find(p => p.idx === '12');

    // The Vaporeon-target hundo wins Master — kept, with the Dynamax Ⓓ marker on its nick.
    expect(vap.wonMasterSlot).toBe(true);
    expect(vap.nickname).toMatch(/Ⓓ/);

    // Flareon- and Jolteon-target Eevees each get an independent Dynamax keeper.
    expect(fla.slots).toContain('dynamax');
    expect(fla.decision).toBe('keep');
    expect(fla.nickname).toMatch(/Flareon/);
    expect(fla.nickname).toMatch(/Ⓓ/);

    expect(jol.slots).toContain('dynamax');
    expect(jol.decision).toBe('keep');
    expect(jol.nickname).toMatch(/Jolteon/);
    expect(jol.nickname).toMatch(/Ⓓ/);

    // Every Dynamax Eevee is kept — none silently dropped to review/trade.
    [vap, fla, jol].forEach(p => expect(p.decision).toBe('keep'));
  });

  it('two Dynamax Eevees → the SAME evo target share one pool (one keeper)', () => {
    // Two Eevee→Vaporeon Dynamax rows (same target). Keying by target must not spuriously
    // create two Vaporeon Dynamax slots: the best Vaporeon (idx30) takes Master and shows Ⓓ;
    // the surplus same-target Eevee (idx31) is the single dedicated 'dynamax' keeper
    // (best-without-league-slot, mirroring shadow behaviour). Exactly ONE dynamax slot.
    const rows = [
      eevee({ idx: 30, cp: 500, a: 15, d: 14, s: 15, iv: 97.8, eu: 'Vaporeon' }),
      eevee({ idx: 31, cp: 500, a: 12, d: 11, s: 13, iv: 80.0, eu: 'Vaporeon' }),
    ];
    const ovr = {
      [keyFor(NUM.Eevee, 15, 14, 15, 30)]: { is_dynamax: true },
      [keyFor(NUM.Eevee, 12, 11, 13, 31)]: { is_dynamax: true },
    };
    const { analyse: a2 } = loader.createWithOverrides(ovr);
    const mons = a2(toCSV(rows)).pokemon;
    const dmaxKeepers = mons.filter(p => p.slots.includes('dynamax'));
    expect(dmaxKeepers.length).toBe(1);                 // exactly one Vaporeon Dynamax slot
    expect(dmaxKeepers[0].idx).toBe('31');              // the best-without-league-slot one
    expect(mons.find(p => p.idx === '30').wonMasterSlot).toBe(true);
    expect(mons.every(p => p.decision === 'keep')).toBe(true);
  });

  it('already-evolved Dynamax Eeveelutions each keep (regression guard)', () => {
    // Vaporeon + Flareon already evolved (final forms) — distinct names → distinct pools,
    // unchanged by the evolution-target keying.
    const rows = [
      evolved('Vaporeon', 1800, { a: 15, d: 15, s: 14, iv: 97.8, idx: 40, ru: 40.0 }),
      evolved('Flareon', 1801, { a: 15, d: 14, s: 15, iv: 97.8, idx: 41, ru: 40.0 }),
    ];
    const ovr = {
      [keyFor(NUM.Vaporeon, 15, 15, 14, 40)]: { is_dynamax: true },
      [keyFor(NUM.Flareon, 15, 14, 15, 41)]: { is_dynamax: true },
    };
    const { analyse: a2 } = loader.createWithOverrides(ovr);
    const mons = a2(toCSV(rows)).pokemon;
    const vap = mon(mons, 'Vaporeon', 1800);
    const fla = mon(mons, 'Flareon', 1801);
    expect(vap.decision).toBe('keep');
    expect(fla.decision).toBe('keep');
    // Vaporeon (highest IV) wins Master; Flareon (no league slot) holds its own dynamax slot.
    expect(fla.slots).toContain('dynamax');
  });
});

// ─── Issue 2 (cont.) — Gigantamax parity ─────────────────────────────────────

describe('Eevee Gigantamax — best surfaces per evolution target', () => {
  it('Gigantamax Eevees pointing at different evos each get their own keeper', () => {
    // A plain hundo Vaporeon takes the single non-shadow Master slot, so both Gigantamax
    // Eevees (→Flareon, →Jolteon) are freed to hold their own per-target gigantamax slots.
    const rows = [
      evolved('Vaporeon', 1900, { a: 15, d: 15, s: 15, iv: 100.0, idx: 49, ru: 40.0 }),
      eevee({ idx: 50, cp: 500, a: 15, d: 14, s: 15, iv: 97.8, eu: 'Flareon', ru: 60.0 }),
      eevee({ idx: 51, cp: 500, a: 14, d: 15, s: 15, iv: 97.8, eu: 'Jolteon', ru: 60.0 }),
    ];
    const ovr = {
      [keyFor(NUM.Eevee, 15, 14, 15, 50)]: { is_gigantamax: true },
      [keyFor(NUM.Eevee, 14, 15, 15, 51)]: { is_gigantamax: true },
    };
    const { analyse: a2 } = loader.createWithOverrides(ovr);
    const mons = a2(toCSV(rows)).pokemon;
    const fla = mons.find(p => p.idx === '50');
    const jol = mons.find(p => p.idx === '51');
    expect(fla.slots).toContain('gigantamax');
    expect(jol.slots).toContain('gigantamax');
    expect(fla.decision).toBe('keep');
    expect(jol.decision).toBe('keep');
  });
});

// ─── Issue 1/2 — branching slot separation must not regress ──────────────────

describe('Eevee branching — slot separation unaffected by the fix', () => {
  it('a Leafeon-LL Eevee and a Jolteon-LL Eevee both keep Little (different evo targets)', () => {
    const res = analyse(toCSV([
      eevee({ idx: 1, cp: 13, el: 'Leafeon', rl: 100.0, eu: 'Jolteon', ru: 70.0, fav: true }),
      eevee({ idx: 2, cp: 14, a: 4, d: 12, s: 14, iv: 66.7, el: 'Jolteon', rl: 99.0 }),
    ]));
    const leaf = mon(res.pokemon, 'Eevee', 13);
    const jolt = mon(res.pokemon, 'Eevee', 14);
    expect(slotsOf(leaf)).toContain('L');
    expect(slotsOf(jolt)).toContain('L');
    expect(leaf.nickname).toMatch(/Leafeon/);
    expect(jolt.nickname).toMatch(/Jolteon/);
  });
});

// ─── Two-slot cap — one Shadow + one Non-Shadow Master per family ─────────────

describe('Eevee Master — two-slot cap (one Shadow + one Non-Shadow)', () => {
  it('a non-shadow Glaceon and a shadow Eeveelution each hold their own Master slot', () => {
    // Non-shadow hundo Vaporeon wins the non-shadow Master slot.
    // Shadow Glaceon 13/12/13 (84.4% IV) purifies to 15/14/15 (97.8%) → holds its own
    // Master slot via the purify-push. Two Master keepers total: one shadow + one non-shadow.
    const res = analyse(toCSV([
      evolved('Vaporeon', 1900, { a: 15, d: 15, s: 15, iv: 100.0, idx: 1, ru: 40.0 }),
      evolved('Glaceon', 1300, { a: 13, d: 12, s: 13, iv: 84.4, shadow: true, idx: 2, ru: 40.0 }),
    ]));
    const vap = mon(res.pokemon, 'Vaporeon', 1900);
    const gla = mon(res.pokemon, 'Glaceon', 1300);

    // Exactly one non-shadow Master keeper in the family.
    const nsMasters = res.pokemon.filter(p => p.wonMasterSlot && !p.isShadow);
    expect(nsMasters.length).toBe(1);
    expect(nsMasters[0].name).toBe('Vaporeon');
    expect(vap.nickname).toMatch(/Ⓜ/);

    // The shadow holds its own Master slot via the purify-push (independent of the cap).
    expect(gla.isShadow).toBe(true);
    expect(gla.slots).toContain('M');
    expect(gla.isPurifySlot).toBe(true);
    expect(gla.nickname).toMatch(/Ⓜ.*p/);
  });

  it('never more than one non-shadow Master keeper across many final evos', () => {
    const res = analyse(toCSV([
      evolved('Vaporeon', 1801, { iv: 95.6, idx: 1 }),
      evolved('Jolteon', 1802, { iv: 93.3, idx: 2 }),
      evolved('Flareon', 1803, { iv: 91.1, idx: 3 }),
      evolved('Espeon', 1804, { iv: 97.8, a: 15, d: 14, s: 15, idx: 4 }),
      evolved('Umbreon', 1805, { iv: 88.9, idx: 5 }),
    ]));
    const nsMasters = res.pokemon.filter(p => p.wonMasterSlot && !p.isShadow);
    expect(nsMasters.length).toBe(1);
    expect(nsMasters[0].name).toBe('Espeon');   // highest IV (97.8%)
  });
});
