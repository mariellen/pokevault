'use strict';
// Regression tests for evolution-target slot separation in BRANCHING evolution families.
//
// Background: a user searching for Jolteon saw an Eevee CP:13 green-starred because its
// Leafeon 100% Little-League candidacy was (apparently) beating a Jolteon 99% LL keeper.
// Opus Review #6 confirmed the engine ALREADY separates slot pools by evolution target
// (each final evolution competes only against its own kind), but there were no regression
// tests pinning that behaviour. This suite locks it in for three branching families.
//
// Confirmed intent (from review, baked into assertions below):
//   • Eevee: each final evo is an independent slot pool (Leafeon LL ≠ Jolteon LL).
//   • Tyrogue: may hold N+1 Little slots — one per final evo PLUS one as the baby form.
//   • Wurmple: wins league slots as its base form when evolution is unknown.
//
// Self-contained synthetic CSVs through the real csvParser + loader (same approach as
// analyse.expensive_winner.test.js / analyse.master_league.test.js). Does NOT touch the
// shared poke_genie_fixture.csv. Run with:
//   npx jest tests/analyse.branching_evo.test.js --env=node

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

// Low-ish IVs keep Master rank (= ivAvg) below the keep threshold so the CAPPED-league
// competition is what we exercise. Per-league evo target is set via the Name (G/U/L) columns;
// per-league rank via Rank % (G/U/L).
const eevee = (o) => row({
  Index: String(o.idx), Name: 'Eevee', 'Pokemon Number': '133', CP: String(o.cp),
  'Atk IV': String(o.a ?? 5), 'Def IV': String(o.d ?? 11), 'Sta IV': String(o.s ?? 13),
  'IV Avg': (o.iv ?? 64.4).toFixed(1), 'Level Min': '5', Dust: '1000',
  Favorite: o.fav ? '1' : '0',
  'Rank % (L)': o.rl != null ? String(o.rl) : '', 'Name (L)': o.el || '',
  'Rank % (U)': o.ru != null ? String(o.ru) : '', 'Name (U)': o.eu || '',
  'Rank % (G)': o.rg != null ? String(o.rg) : '', 'Name (G)': o.eg || '',
});
const named = (o) => row({  // an already-evolved species (Jolteon, Leafeon, …) holding a slot
  Index: String(o.idx), Name: o.name, 'Pokemon Number': String(o.num || 0), CP: String(o.cp),
  'Atk IV': String(o.a ?? 10), 'Def IV': String(o.d ?? 10), 'Sta IV': String(o.s ?? 10),
  'IV Avg': (o.iv ?? 66.7).toFixed(1), 'Level Min': '5', Dust: '1000',
  Favorite: o.fav ? '1' : '0',
  'Rank % (L)': o.rl != null ? String(o.rl) : '', 'Name (L)': '',
  'Rank % (U)': o.ru != null ? String(o.ru) : '', 'Name (U)': '',
  'Rank % (G)': o.rg != null ? String(o.rg) : '', 'Name (G)': '',
});
const mon = (mons, name, cp) => mons.find(p => p.name === name && p.cp === cp);
const slotsOf = (p) => (p.slots || []).filter(s => ['L','G','U','M'].includes(s));

// ─── Eevee — independent per-evo slot pools ──────────────────────────────────

describe('Eevee family — evo-target slot separation', () => {
  it('a Leafeon-LL Eevee and a Jolteon-LL Eevee both keep Little (different evo targets)', () => {
    // The exact bug-report shape: Eevee→Leafeon LL 100% and Eevee→Jolteon LL 99%.
    const res = analyse(toCSV([
      eevee({ idx: 1, cp: 13, el: 'Leafeon', rl: 100.0, eu: 'Jolteon', ru: 70.0, fav: true }),
      eevee({ idx: 2, cp: 14, a: 4, d: 12, s: 14, iv: 66.7, el: 'Jolteon', rl: 99.0, eu: 'Jolteon', ru: 60.0 }),
    ]));
    const leaf = mon(res.pokemon, 'Eevee', 13);
    const jolt = mon(res.pokemon, 'Eevee', 14);
    expect(slotsOf(leaf)).toContain('L');
    expect(slotsOf(jolt)).toContain('L');           // not displaced by the Leafeon
    expect(leaf.nickname).toMatch(/Leafeon/);
    expect(jolt.nickname).toMatch(/Jolteon/);
  });

  it('Leafeon LL candidates compete only against other Leafeon LL candidates', () => {
    // Two Eevee→Leafeon LL: only the better one keeps; the Jolteon-LL Eevee is untouched.
    const res = analyse(toCSV([
      eevee({ idx: 1, cp: 13, el: 'Leafeon', rl: 100.0 }),
      eevee({ idx: 2, cp: 15, a: 6, d: 10, s: 12, iv: 62.2, el: 'Leafeon', rl: 95.0 }),   // weaker Leafeon
      eevee({ idx: 3, cp: 14, a: 4, d: 12, s: 14, iv: 66.7, el: 'Jolteon', rl: 99.0 }),   // different pool
    ]));
    const leafWin = mon(res.pokemon, 'Eevee', 13);
    const leafLose = mon(res.pokemon, 'Eevee', 15);
    const jolt = mon(res.pokemon, 'Eevee', 14);
    expect(slotsOf(leafWin)).toContain('L');         // best Leafeon keeps
    expect(slotsOf(leafLose)).not.toContain('L');    // weaker Leafeon displaced by the Leafeon winner
    expect(slotsOf(jolt)).toContain('L');            // Jolteon pool unaffected
  });

  it('a Jolteon UL winner is not displaced by a Leafeon LL winner', () => {
    const res = analyse(toCSV([
      eevee({ idx: 1, cp: 13, el: 'Leafeon', rl: 100.0 }),                              // Leafeon LL
      eevee({ idx: 2, cp: 600, a: 10, d: 12, s: 14, iv: 80.0, eu: 'Jolteon', ru: 99.0 }), // Jolteon UL
    ]));
    const leaf = mon(res.pokemon, 'Eevee', 13);
    const jolt = mon(res.pokemon, 'Eevee', 600);
    expect(slotsOf(leaf)).toContain('L');
    expect(slotsOf(jolt)).toContain('U');            // UL Jolteon keeps its own-league slot
    expect(slotsOf(jolt)).not.toContain('L');
  });

  it('green star fires only when a genuinely better same-evo / same-league candidate exists', () => {
    // Single Leafeon LL candidate → it is the best for that pool; nothing better exists,
    // so it should be a confirmed keep (gold/green per rank), NOT flagged as "act, better exists".
    const res = analyse(toCSV([
      eevee({ idx: 1, cp: 13, el: 'Leafeon', rl: 100.0, fav: true }),
      eevee({ idx: 2, cp: 14, a: 4, d: 12, s: 14, iv: 66.7, el: 'Jolteon', rl: 99.0, fav: true }),
    ]));
    const leaf = mon(res.pokemon, 'Eevee', 13);
    const jolt = mon(res.pokemon, 'Eevee', 14);
    // Each is the sole keeper of its own evo-target LL pool → both hold L, neither is a
    // cross-pool "displacement" suggestion. The Jolteon is not green-flagged BECAUSE of the Leafeon.
    expect(slotsOf(leaf)).toContain('L');
    expect(slotsOf(jolt)).toContain('L');
    // sanity: the favourited best-of-pool reads as a confirmed keep, not a trade
    expect(leaf.decision).toBe('keep');
    expect(jolt.decision).toBe('keep');
  });
});

// ─── Tyrogue — N+1 Little slots (baby + each final evo) ──────────────────────

describe('Tyrogue family — baby + final-evo slot coexistence', () => {
  it('Tyrogue-as-Tyrogue keeps Little independently of a Hitmonlee keeping Little', () => {
    const res = analyse(toCSV([
      // Tyrogue with a blank L-evo → competes in Little AS Tyrogue
      row({ Index: '1', Name: 'Tyrogue', 'Pokemon Number': '236', CP: '500',
        'Atk IV': '10', 'Def IV': '14', 'Sta IV': '15', 'IV Avg': '86.7', 'Level Min': '5', Dust: '1000',
        'Rank % (L)': '96.0', 'Name (L)': '' }),
      // an already-evolved Hitmonlee holding Little
      named({ idx: 2, name: 'Hitmonlee', num: 106, cp: 490, a: 12, d: 10, s: 14, iv: 80.0, rl: 98.0 }),
    ]));
    const tyr = mon(res.pokemon, 'Tyrogue', 500);
    const lee = mon(res.pokemon, 'Hitmonlee', 490);
    expect(slotsOf(tyr)).toContain('L');             // baby holds its own Little slot
    expect(slotsOf(lee)).toContain('L');             // final evo holds its own Little slot
    expect(tyr.nickname).toMatch(/Tyrogue/);
  });

  it('no cross-evo-target collision between the three final evos', () => {
    // One Eevee-style Tyrogue per branch, each routed to a different Hitmon via IVs.
    const res = analyse(toCSV([
      // ATK>DEF → Hitmonlee
      row({ Index: '1', Name: 'Tyrogue', 'Pokemon Number': '236', CP: '510',
        'Atk IV': '15', 'Def IV': '10', 'Sta IV': '12', 'IV Avg': '82.2', 'Level Min': '5', Dust: '1000',
        'Rank % (U)': '96.0', 'Name (U)': 'Hitmonlee' }),
      // DEF>ATK → Hitmonchan
      row({ Index: '2', Name: 'Tyrogue', 'Pokemon Number': '236', CP: '511',
        'Atk IV': '10', 'Def IV': '15', 'Sta IV': '12', 'IV Avg': '82.2', 'Level Min': '5', Dust: '1000',
        'Rank % (U)': '95.0', 'Name (U)': 'Hitmonchan' }),
      // ATK=DEF → Hitmontop
      row({ Index: '3', Name: 'Tyrogue', 'Pokemon Number': '236', CP: '512',
        'Atk IV': '13', 'Def IV': '13', 'Sta IV': '12', 'IV Avg': '84.4', 'Level Min': '5', Dust: '1000',
        'Rank % (U)': '94.0', 'Name (U)': 'Hitmontop' }),
    ]));
    const lee = mon(res.pokemon, 'Tyrogue', 510);
    const chan = mon(res.pokemon, 'Tyrogue', 511);
    const top = mon(res.pokemon, 'Tyrogue', 512);
    // Each routes to a DISTINCT evo target → each holds its own Ultra slot (no collision).
    expect(lee.evolvedNameU).toBe('Hitmonlee');
    expect(chan.evolvedNameU).toBe('Hitmonchan');
    expect(top.evolvedNameU).toBe('Hitmontop');
    expect(slotsOf(lee)).toContain('U');
    expect(slotsOf(chan)).toContain('U');
    expect(slotsOf(top)).toContain('U');
  });

  it('15/15/x → Hitmontop correction runs at parse time (before slot logic)', () => {
    // Pokégenie may report a Tyrogue→Hitmonlee/chan for a 15/15/x; the IV rule must override
    // to Hitmontop (ATK==DEF) regardless of the CSV evo name.
    const res = analyse(toCSV([
      row({ Index: '1', Name: 'Tyrogue', 'Pokemon Number': '236', CP: '520',
        'Atk IV': '15', 'Def IV': '15', 'Sta IV': '14', 'IV Avg': '97.8', 'Level Min': '5', Dust: '1000',
        'Rank % (U)': '95.0', 'Name (U)': 'Hitmonlee',     // CSV says Hitmonlee…
        'Rank % (G)': '93.0', 'Name (G)': 'Hitmonlee' }),
    ]));
    const t = mon(res.pokemon, 'Tyrogue', 520);
    // …but 15/15/x ⇒ Hitmontop on every league field.
    expect(t.evolvedNameU).toBe('Hitmontop');
    expect(t.evolvedNameG).toBe('Hitmontop');
    expect(t.nickname).toMatch(/Hitmontop|Hitmont/);
  });
});

// ─── Wurmple — base-form keep + split branch separation ──────────────────────

describe('Wurmple family — unknown-evo base-form keep + branch separation', () => {
  it('Wurmple wins a league slot as its base form when evolution is unknown', () => {
    const res = analyse(toCSV([
      row({ Index: '1', Name: 'Wurmple', 'Pokemon Number': '265', CP: '480',
        'Atk IV': '15', 'Def IV': '15', 'Sta IV': '14', 'IV Avg': '98.0', 'Level Min': '5', Dust: '1000',
        'Rank % (G)': '99.0', 'Name (G)': '' }),
    ]));
    const w = mon(res.pokemon, 'Wurmple', 480);
    expect(w.evolutionUnknown).toBe(true);
    expect(slotsOf(w).length).toBeGreaterThan(0);    // holds a real league slot…
    expect(w.nickname).toMatch(/Wurmple|Wurmpl/);    // …as Wurmple, not a guessed evolution
  });

  it('Silcoon/Beautifly and Cascoon/Dustox lines are separated (no cross-line collision)', () => {
    const res = analyse(toCSV([
      // Beautifly line
      named({ idx: 1, name: 'Beautifly', num: 267, cp: 1450, a: 14, d: 15, s: 15, iv: 80.0, rg: 95.0 }),
      // Dustox line
      named({ idx: 2, name: 'Dustox', num: 269, cp: 1400, a: 15, d: 14, s: 15, iv: 80.0, rg: 94.0 }),
    ]));
    const bea = mon(res.pokemon, 'Beautifly', 1450);
    const dus = mon(res.pokemon, 'Dustox', 1400);
    // Different terminal species → each holds its own Great slot, no displacement.
    expect(slotsOf(bea)).toContain('G');
    expect(slotsOf(dus)).toContain('G');
    expect(bea.nickname).toMatch(/Beautif/);
    expect(dus.nickname).toMatch(/Dustox/);
  });

  it('Silcoon (Beautifly line) and Cascoon (Dustox line) do not contend for one slot', () => {
    const res = analyse(toCSV([
      named({ idx: 1, name: 'Silcoon', num: 266, cp: 900, a: 13, d: 14, s: 15, iv: 80.0, rg: 92.0 }),
      named({ idx: 2, name: 'Cascoon', num: 268, cp: 900, a: 14, d: 13, s: 15, iv: 80.0, rg: 91.0 }),
    ]));
    const sil = mon(res.pokemon, 'Silcoon', 900);
    const cas = mon(res.pokemon, 'Cascoon', 900);
    expect(slotsOf(sil)).toContain('G');
    expect(slotsOf(cas)).toContain('G');             // distinct line → not displaced by Silcoon
  });
});

// ─── Eevee — actual evolved form wins Master slot ────────────────────────────

describe('Eevee family — actual Jolteon wins Master slot', () => {
  it('actual Jolteon 15/15/14 (98% IV) in Eevee family wins confirmed Master slot', () => {
    // Regression: non-Legendary branching-evo final form was showing Jolteon98m (placeholder)
    // instead of JolteonⓂ98 (confirmed M keeper). Jolteon must be the best non-shadow in family.
    const res = analyse(toCSV([
      named({ idx: 1, name: 'Jolteon', num: 135, cp: 1234, a: 15, d: 15, s: 14, iv: 97.8 }),
      eevee({ idx: 2, cp: 13, el: 'Leafeon', rl: 100.0, fav: true }),
      eevee({ idx: 3, cp: 14, a: 4, d: 12, s: 14, iv: 66.7, el: 'Jolteon', rl: 60.0 }),
    ]));
    const j = mon(res.pokemon, 'Jolteon', 1234);
    expect(j.wonMasterSlot).toBe(true);
    expect(j.slots).toContain('M');
    expect(j.nickname).toMatch(/Ⓜ/);
    expect(j.nickname).not.toMatch(/\d+m$/); // not the placeholder/review Xm format
    expect(j.decision).toBe('keep');
  });

  it('demoted-from-M Jolteon (lost to hundo Eevee→Vaporeon) keeps a keep decision', () => {
    // Jolteon 98% wins M in main loop. Hundo Eevee→Vaporeon takes the non-shadow Master pick.
    // After the hasBattleSlot-reset fix, demoted Jolteon must reach best_overall (keep), not review.
    const res = analyse(toCSV([
      named({ idx: 1, name: 'Jolteon', num: 135, cp: 1234, a: 15, d: 15, s: 14, iv: 97.8 }),
      eevee({ idx: 2, cp: 100, a: 15, d: 15, s: 15, iv: 100.0, eu: 'Vaporeon', ru: 60.0 }),
    ]));
    const j = mon(res.pokemon, 'Jolteon', 1234);
    // Hundo Eevee beats Jolteon in masterCmp — Jolteon loses M but must not fall to review.
    expect(j.decision).toBe('keep');
    expect(j.nickname).not.toMatch(/\d+m$/);
  });
});

// ─── Global smoke test on the real export, if present ────────────────────────

describe('Branching families — collision guard on export_187 (smoke test)', () => {
  const fs = require('fs');
  const path = require('path');
  const exportPath = path.join(__dirname, 'export187.csv');
  const maybe = fs.existsSync(exportPath) ? it : it.skip;

  maybe('no branching family has two members sharing one (league, evo-target) slot', () => {
    const { loadCSV } = require('./csvParser');
    const res = analyse(loadCSV(exportPath));
    const FAMILIES = [
      ['Eevee','Vaporeon','Jolteon','Flareon','Espeon','Umbreon','Leafeon','Glaceon','Sylveon'],
      ['Tyrogue','Hitmonlee','Hitmonchan','Hitmontop'],
      ['Wurmple','Silcoon','Beautifly','Cascoon','Dustox'],
    ];
    const evoFor = (p, lg) => {
      if (lg === 'L') return p.evolvedNameL || p.name;
      if (lg === 'G') return p.evolvedNameG || p.name;
      if (lg === 'U') return p.evolvedNameU || p.name;
      return p.evolvedNameU || p.evolvedNameG || p.name;
    };
    const collisions = [];
    FAMILIES.forEach(names => {
      const set = new Set(names);
      const mem = res.pokemon.filter(p => set.has(p.name));
      ['L','G','U','M'].forEach(lg => {
        const holders = mem.filter(p => p.slots.includes(lg));
        const seen = {};
        holders.forEach(p => {
          // variant + gender legitimately coexist; key on those too
          const vk = (p.isShadow?'s':p.isPurified?'p':p.isLucky?'l':'n') + '|' + (p.gender || '');
          const k = lg + '|' + evoFor(p, lg) + '|' + vk;
          (seen[k] = seen[k] || []).push(p);
        });
        Object.entries(seen).forEach(([k, g]) => {
          if (g.length > 1) collisions.push(k + ' -> ' + g.map(p => p.name + 'CP' + p.cp).join(','));
        });
      });
    });
    expect(collisions).toEqual([]);
  });
});
