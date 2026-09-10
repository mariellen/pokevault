'use strict';
// Tests for the #134/#95/#36 affordability-gate fix (2026-09-10).
//
// Bug: the old two-pass "affordable-first" pool selection REPLACED the eligible pool with
// the affordable subset whenever >=1 affordable candidate qualified at >=90%. Higher-ranked
// but expensive candidates were discarded before any comparison happened.
//
// Fix: the best-ranked candidate always wins the slot, regardless of cost. If the winner is
// unaffordable, the best affordable qualifier is additionally surfaced as an alternative
// (isAffordableWinner / <league>_affordable slot / cyan star), instead of stealing the slot.
//
// Self-contained synthetic CSVs through the real csvParser + loader, same approach as
// analyse.gmax_master.test.js / analyse.dynamax_master.test.js.
//   npx jest tests/analyse.affordability-gate.test.js --env=node

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

// Single-stage GL candidate: Name (G) = self, so it competes alone in its own family, no
// evolution complexity. `num` distinguishes families between describe blocks.
const glMon = (name, num, o) => row({
  Index: String(o.idx), Name: name, 'Pokemon Number': String(num),
  CP: String(o.cp), 'Atk IV': '10', 'Def IV': '10', 'Sta IV': '10', 'IV Avg': '66.7',
  'Level Min': '20', Dust: '5000', Favorite: o.fav ? '1' : '0',
  'Rank % (G)': String(o.rg), 'Dust Cost (G)': String(o.dg), 'Name (G)': name,
});

const run = (name, num, specs) => analyse(toCSV(specs.map(s => glMon(name, num, s))));
const find = (res, name, cp) => res.pokemon.find(p => p.name === name && p.cp === cp);

// DUST_THRESHOLDS.G.affordable = 150000 (see config.js)
const AFFORDABLE = 150000;

// ─── Test 1 — Noibat shape: expensive best + affordable qualifier ────────────
// Best-ranked candidate (99%, dust > affordable) wins with blue; the affordable
// qualifier (91%, dust <= affordable) surfaces alongside with cyan, not a stolen slot.
describe('Fix 1 Test 1 — expensive winner + affordable alternative (Noibat shape)', () => {
  let res;
  beforeAll(() => {
    res = run('Noibat', 9101, [
      { idx: 1, cp: 174, rg: 99, dg: 400000 },   // expensive, higher rank — should win
      { idx: 2, cp: 422, rg: 91, dg: 50000 },    // affordable, lower rank — should NOT win
    ]);
  });
  it('expensive 99% candidate wins the slot', () => {
    const p = find(res, 'Noibat', 174);
    expect(p.slots).toContain('G');
    expect(p.decision).toBe('keep');
  });
  it('expensive winner gets blue star (isExpensiveWinner)', () => {
    const p = find(res, 'Noibat', 174);
    expect(p.isExpensiveWinner).toBe(true);
    expect(p.starType).toBe('blue');
  });
  it('affordable 91% candidate does NOT steal the slot, gets G_affordable instead', () => {
    const p = find(res, 'Noibat', 422);
    expect(p.slots).not.toContain('G');
    expect(p.slots).toContain('G_affordable');
  });
  it('affordable alternative gets cyan star (isAffordableWinner)', () => {
    const p = find(res, 'Noibat', 422);
    expect(p.isAffordableWinner).toBe(true);
    expect(p.starType).toBe('cyan');
  });
});

// ─── Test 2 — Chespin/Great shape: pool of 8 collapsing to 1 under the old gate ──
// Old bug: only CP:8 (90%, affordable) qualified for the affordable-only subset, so the
// pool "collapsed" to that single candidate and it won unopposed. Fix: all 8 stay in
// contention and the true best (97.7%) wins.
describe('Fix 1 Test 2 — pool of 8 does not collapse to 1 (Chespin/Great shape)', () => {
  let res;
  beforeAll(() => {
    const specs = [];
    // 7 expensive candidates at ranks 90-96, none affordable.
    for (let i = 0; i < 7; i++) {
      specs.push({ idx: i + 1, cp: 400 + i, rg: 90 + i, dg: 300000 });
    }
    // 1 affordable candidate at exactly 90% — the only one that would have "qualified"
    // under the old affordable-only filter.
    specs.push({ idx: 8, cp: 488, rg: 90, dg: 20000 });
    // The true best: highest rank (97.7%), also expensive — must win despite cost.
    specs.push({ idx: 9, cp: 710, rg: 98, dg: 350000 });
    res = run('Chespin', 9102, specs);
  });
  it('the true best-ranked candidate (98%) wins, not the sole affordable one (90%)', () => {
    const winner = find(res, 'Chespin', 710);
    expect(winner.slots).toContain('G');
    expect(winner.isExpensiveWinner).toBe(true);
    expect(winner.starType).toBe('blue');
  });
  it('the sole affordable candidate surfaces as the alternative, not the winner', () => {
    const p = find(res, 'Chespin', 488);
    expect(p.slots).not.toContain('G');
    expect(p.slots).toContain('G_affordable');
    expect(p.starType).toBe('cyan');
  });
  it('none of the other 6 mid-pack expensive candidates win the slot (pool was not collapsed)', () => {
    for (let i = 1; i <= 6; i++) {
      const p = find(res, 'Chespin', 400 + i);
      expect(p.slots).not.toContain('G');
    }
  });
});

// ─── Test 3 — no affordable qualifier exists → expensive winner alone, no cyan ──
describe('Fix 1 Test 3 — expensive winner with no affordable alternative available', () => {
  let res;
  beforeAll(() => {
    res = run('Wynaut', 9103, [
      { idx: 1, cp: 303, rg: 99, dg: 400000 }, // only candidate, expensive
    ]);
  });
  it('the sole candidate wins despite being expensive', () => {
    const p = find(res, 'Wynaut', 303);
    expect(p.slots).toContain('G');
    expect(p.isExpensiveWinner).toBe(true);
    expect(p.starType).toBe('blue');
  });
  it('no G_affordable slot is created anywhere (no alternative exists)', () => {
    expect(res.pokemon.some(p => p.slots.includes('G_affordable'))).toBe(false);
  });
});

// ─── Test 4 — winner is affordable → plain green, no blue/cyan pairing ─────────
describe('Fix 1 Test 4 — affordable winner gets plain green, no blue/cyan partner', () => {
  let res;
  beforeAll(() => {
    res = run('Gothita', 9104, [
      { idx: 1, cp: 678, rg: 99, dg: 20000 }, // affordable and best — plain win
    ]);
  });
  it('the winner holds the slot and is affordable', () => {
    const p = find(res, 'Gothita', 678);
    expect(p.slots).toContain('G');
    expect(p.isAffordableWinner).toBe(true);
  });
  it('gets plain green star — not blue, not cyan', () => {
    const p = find(res, 'Gothita', 678);
    expect(p.starType).toBe('green');
    expect(p.isExpensiveWinner).toBeFalsy();
    expect(p.suggestStarCheaper).toBeFalsy();
  });
});
