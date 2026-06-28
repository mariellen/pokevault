'use strict';
// #64 — Per-form collection keepers for cosmetic-form species.
// Forms (Squawkabilly plumage / Furfrou trims / Vivillon patterns / Flabébé colours) are NOT in
// the Pokégenie export — they're set via the special_form override. So these fixtures attach
// forms through loader.createWithOverrides, keyed by stableKey (pokeNum|form|gender|a|d|s|_idx).

const loader = require('./loader');
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
const keyFor = (num, a, d, s, idx) => [String(num), '', '', a, d, s, '_idx' + idx].join('|');

const NUM = { Squawkabilly: 931, Furfrou: 676, Vivillon: 666, Florges: 671 };

// Generic cosmetic-form mon (no PvP rank columns → pure collection candidate).
const mon = (name, num, cp, a, d, s, opts = {}) => row({
  Index: String(opts.idx), Name: name, 'Pokemon Number': String(num),
  CP: String(cp), 'Atk IV': String(a), 'Def IV': String(d), 'Sta IV': String(s),
  'IV Avg': ((a + d + s) / 45 * 100).toFixed(1), 'Level Min': '20', Dust: '5000',
  Favorite: opts.fav ? '1' : '', Lucky: opts.lucky ? '1' : '',
});
const analyseWith = (rows, overrides) =>
  loader.createWithOverrides(overrides).analyse(toCSV(rows)).pokemon;
const find = (mons, cp) => mons.find(p => p.cp === cp);

// ─── Case 2 — per-form keeper (the core rewrite) ─────────────────────────────
describe('#64 Case 2 — Squawkabilly: best IV of each tagged form is kept', () => {
  const S = NUM.Squawkabilly;
  // 2 Green (91%, 80%), 2 Yellow (93%, 84%), 1 Blue (84%) — all tagged.
  const rows = [
    mon('Squawkabilly', S, 500, 14, 14, 13, { idx: 1 }), // Green 91.1
    mon('Squawkabilly', S, 480, 12, 12, 12, { idx: 2 }), // Green 80.0
    mon('Squawkabilly', S, 510, 14, 14, 14, { idx: 3 }), // Yellow 93.3
    mon('Squawkabilly', S, 470, 12, 13, 13, { idx: 4 }), // Yellow 84.4
    mon('Squawkabilly', S, 460, 12, 13, 13, { idx: 5 }), // Blue 84.4
  ];
  const ov = {
    [keyFor(S, 14, 14, 13, 1)]: { special_form: 'Green Plumage' },
    [keyFor(S, 12, 12, 12, 2)]: { special_form: 'Green Plumage' },
    [keyFor(S, 14, 14, 14, 3)]: { special_form: 'Yellow Plumage' },
    [keyFor(S, 12, 13, 13, 4)]: { special_form: 'Yellow Plumage' },
    [keyFor(S, 12, 13, 13, 5)]: { special_form: 'Blue Plumage' },
  };
  let mons;
  beforeAll(() => { mons = analyseWith(rows, ov); });

  it('best Green (91%) kept, green star (power-up candidate)', () => {
    const p = find(mons, 500);
    expect(p.decision).toBe('keep');
    expect(p.slots).toContain('collection');
    expect(p.starType).toBe('green');
  });
  it('best Yellow (93%) kept, green star', () => {
    expect(find(mons, 510).decision).toBe('keep');
    expect(find(mons, 510).starType).toBe('green');
  });
  it('lone Blue (84%, below threshold) still kept — grey star, no PvP slot', () => {
    const p = find(mons, 460);
    expect(p.decision).toBe('keep');
    expect(p.slots).toContain('collection');
    expect(p.starType).toBe('grey');
    expect(p.nickname).toMatch(/^Squawkab/);   // own species name, no colour prefix
    expect(p.nickname).toContain('Ⓡ84');       // collection nick, not Ⓜ
  });
  it('non-best Green (80%) is NOT a collection keeper → trade', () => {
    const p = find(mons, 480);
    expect(p.slots).not.toContain('collection');
    expect(p.decision).toBe('trade');
  });
  it('non-best Yellow (84%) → trade (only best-per-form kept)', () => {
    expect(find(mons, 470).slots).not.toContain('collection');
    expect(find(mons, 470).decision).toBe('trade');
  });
});

describe('#64 — favourite & untagged paths', () => {
  const S = NUM.Squawkabilly;
  it('favourited sub-threshold form keeper → gold (not grey)', () => {
    const rows = [mon('Squawkabilly', S, 460, 12, 13, 13, { idx: 1, fav: true })];
    const mons = analyseWith(rows, { [keyFor(S, 12, 13, 13, 1)]: { special_form: 'White Plumage' } });
    const p = find(mons, 460);
    expect(p.decision).toBe('keep');
    expect(p.starType).toBe('gold');
  });
  it('untagged collection member → review ("set pattern"), not a collection keeper', () => {
    const rows = [mon('Squawkabilly', S, 460, 12, 13, 13, { idx: 1 })];
    const mons = analyseWith(rows, {});
    const p = find(mons, 460);
    expect(p.decision).toBe('review');
    expect(p.slots).not.toContain('collection');
  });
});

describe('#64 — Florges colour keeper carries NO colour nick prefix (#55 interaction)', () => {
  const F = NUM.Florges;
  it('Blue Florges 84% → FlorgesⓇ84 grey star, not BlueⓇ84', () => {
    const rows = [mon('Florges', F, 1200, 12, 13, 13, { idx: 1 })];
    const mons = analyseWith(rows, { [keyFor(F, 12, 13, 13, 1)]: { special_form: 'Blue' } });
    const p = find(mons, 1200);
    expect(p.starType).toBe('grey');
    expect(p.nickname).toMatch(/^Florges/);
    expect(p.nickname).not.toMatch(/^Blue/);
  });
});

// ─── Poké Ball string normalisation (four-way split fix) ─────────────────────
describe('#64 — legacy Poké Ball form string normalises on read', () => {
  const V = NUM.Vivillon;
  it("override special_form='Poke Ball' (legacy) → matches COLLECTION_SETS, kept", () => {
    const rows = [mon('Vivillon', V, 700, 14, 14, 13, { idx: 1 })];
    const mons = analyseWith(rows, { [keyFor(V, 14, 14, 13, 1)]: { special_form: 'Poke Ball' } });
    const p = find(mons, 700);
    expect(p.specialForm).toBe('Poké Ball'); // normalised
    expect(p.slots).toContain('collection');
    expect(p.starType).toBe('green'); // 91% IV
  });
});

// ─── Lucky per-form (Q6: no code change — Luckies always keep; verify coexistence) ──
describe('#64 — Lucky Furfrou of different trims all keep (Q6 coexistence)', () => {
  const F = NUM.Furfrou;
  const rows = [
    mon('Furfrou', F, 1000, 12, 12, 12, { idx: 1, lucky: true }), // Dandy 80%
    mon('Furfrou', F, 1010, 12, 12, 12, { idx: 2, lucky: true }), // Kabuki 80%
  ];
  const ov = {
    [keyFor(F, 12, 12, 12, 1)]: { special_form: 'Dandy' },
    [keyFor(F, 12, 12, 12, 2)]: { special_form: 'Kabuki' },
  };
  it('both Lucky trims kept (Lucky never traded), each its own form keeper', () => {
    const mons = analyseWith(rows, ov);
    expect(find(mons, 1000).decision).toBe('keep');
    expect(find(mons, 1010).decision).toBe('keep');
    expect(find(mons, 1000).slots).toContain('lucky');
    expect(find(mons, 1010).slots).toContain('lucky');
  });
});

// ─── Case 1 — decision-forms (Lycanroc): slotEvoTarget already form-aware (#39) — VERIFY ─────
// Full coverage lives in analyse.fixture.test.js Group E (lycanroc_fixture.csv). This is a
// lightweight guard that the per-battle-form plumbing survives and the keeper is form-aware.
describe('#64 Case 1 — Lycanroc decision-forms keep per battle form (verify)', () => {
  it('Rockruff G=Midnight / U=Midday → form-aware evo targets, kept with a league slot', () => {
    const r = row({
      Index: '1', Name: 'Rockruff', 'Pokemon Number': '744', CP: '500',
      'Atk IV': '14', 'Def IV': '14', 'Sta IV': '14', 'IV Avg': '93.3', 'Level Min': '20', Dust: '5000',
      'Rank % (G)': '96.0', 'Name (G)': 'Lycanroc', 'Form (G)': 'Midnight',
      'Rank % (U)': '95.0', 'Name (U)': 'Lycanroc', 'Form (U)': 'Midday',
    });
    const p = loader.createWithOverrides({}).analyse(toCSV([r])).pokemon[0];
    // Form-aware plumbing intact: the per-league evolved battle form is captured so slotEvoTarget
    // keys Great-as-Midnight and Ultra-as-Midday distinctly (#39). Per-form slot-win specifics
    // (one physical Rockruff per form, one-slot rule) are covered by Group E in
    // analyse.fixture.test.js — NOT re-asserted here (decision-forms are verify-only for #64).
    expect(p.evolvedFormG).toBe('Midnight');
    expect(p.evolvedFormU).toBe('Midday');
    expect(p.decision).toBe('keep');
  });
});
