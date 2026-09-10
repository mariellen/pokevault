'use strict';
// Tests for the #135 100% worklist modal — computeHundredPercentWorklist()/
// isHundredPercentPokemon() in app.js. Pure-function tests only, per the established
// pattern (filter-sort-loader.js) — app.js DOM rendering isn't testable under Node/jsdom-free
// Jest, so openHundredModal()'s HTML output isn't asserted directly; the empty-state and
// row-content decisions it makes are driven entirely by these pure functions.

const { load } = require('./hundred-percent-modal-loader');
const { computeHundredPercentWorklist, isHundredPercentPokemon } = load();

const mon = (o) => ({
  name: 'Test', form: '', cp: 500,
  atkIV: 10, defIV: 10, staIV: 10, ivAvg: 66.7,
  rankPctL: 0, rankPctG: 0, rankPctU: 0, rankPctM: 0,
  starType: 'none', nickname: 'TestNick',
  ...o,
});

describe('#135 — 100% worklist inclusion rule', () => {
  it('Test 1: rounded rank 100 in Great + green star -> included', () => {
    const p = mon({ name: 'Chespin', rankPctG: 99.6, starType: 'green' });
    const list = computeHundredPercentWorklist([p]);
    expect(list).toHaveLength(1);
    expect(list[0].p).toBe(p);
    expect(list[0].leagues100).toEqual(['G']);
    expect(list[0].isHundoOnly).toBe(false);
  });

  it('Test 2: hundo (15/15/15) with blue star -> included', () => {
    const p = mon({ name: 'Wynaut', atkIV: 15, defIV: 15, staIV: 15, starType: 'blue' });
    const list = computeHundredPercentWorklist([p]);
    expect(list).toHaveLength(1);
    expect(list[0].isHundoOnly).toBe(true);
    expect(list[0].leagues100).toEqual([]);
  });

  it('Test 3: rank 100 but gold star -> excluded', () => {
    const p = mon({ rankPctG: 100, starType: 'gold' });
    expect(computeHundredPercentWorklist([p])).toHaveLength(0);
  });

  it('Test 4: rank 100 but no star -> excluded', () => {
    const p = mon({ rankPctU: 100, starType: 'none' });
    expect(computeHundredPercentWorklist([p])).toHaveLength(0);
  });

  it('Test 5: 99% rank, non-hundo, green star -> excluded', () => {
    const p = mon({ rankPctG: 99, atkIV: 10, defIV: 10, staIV: 10, starType: 'green' });
    expect(computeHundredPercentWorklist([p])).toHaveLength(0);
  });

  it('red star is excluded even at rank 100', () => {
    expect(computeHundredPercentWorklist([mon({ rankPctL: 100, starType: 'red' })])).toHaveLength(0);
  });

  it('grey star is excluded even at rank 100', () => {
    expect(computeHundredPercentWorklist([mon({ rankPctM: 100, starType: 'grey' })])).toHaveLength(0);
  });

  it('rank 99.5 rounds to 100 (Math.round boundary) and qualifies', () => {
    const p = mon({ rankPctG: 99.5, starType: 'cyan' });
    expect(computeHundredPercentWorklist([p])).toHaveLength(1);
  });
});

describe('#135 — Test 6: copy affordances match the main list', () => {
  it('nick shown is exactly p.nickname (same source main list uses for copyNick)', () => {
    const p = mon({ rankPctU: 100, starType: 'cyan', nickname: 'SpecialⓊ100' });
    const [{ p: rowP }] = computeHundredPercentWorklist([p]);
    expect(rowP.nickname).toBe('SpecialⓊ100');
  });

  it('search string components (cp/atk/def/sta) match main list #107 format ({cp} {atk}/{def}/{sta})', () => {
    const p = mon({ cp: 1234, atkIV: 3, defIV: 15, staIV: 14, rankPctL: 100, starType: 'green' });
    const [{ p: rowP }] = computeHundredPercentWorklist([p]);
    const expectedSearch = `${rowP.cp} ${rowP.atkIV}/${rowP.defIV}/${rowP.staIV}`;
    expect(expectedSearch).toBe('1234 3/15/14');
  });
});

describe('#135 — Test 7: empty state', () => {
  it('empty pokemon list -> empty worklist (drives the empty-state branch in openHundredModal)', () => {
    expect(computeHundredPercentWorklist([])).toEqual([]);
  });

  it('non-empty pokemon list with nothing qualifying -> empty worklist', () => {
    const p = mon({ rankPctG: 95, starType: 'gold' });
    expect(computeHundredPercentWorklist([p])).toEqual([]);
  });
});

describe('#135 — sort order: league priority (M,U,G,L) then rank desc, hundo-only last', () => {
  it('orders by league priority M > U > G > L', () => {
    const l = mon({ name: 'L-mon', rankPctL: 100, starType: 'green' });
    const g = mon({ name: 'G-mon', rankPctG: 100, starType: 'green' });
    const u = mon({ name: 'U-mon', rankPctU: 100, starType: 'green' });
    const m = mon({ name: 'M-mon', rankPctM: 100, starType: 'green' });
    const list = computeHundredPercentWorklist([l, g, u, m]);
    expect(list.map(r => r.p.name)).toEqual(['M-mon', 'U-mon', 'G-mon', 'L-mon']);
  });

  it('within the same league, sorts by rank descending', () => {
    const lo = mon({ name: 'Lower', rankPctG: 99.6, starType: 'green' });
    const hi = mon({ name: 'Higher', rankPctG: 100, starType: 'green' });
    const list = computeHundredPercentWorklist([lo, hi]);
    expect(list.map(r => r.p.name)).toEqual(['Higher', 'Lower']);
  });

  it('hundo-only entries (no 100 rank) sort after any league-ranked 100', () => {
    const hundo = mon({ name: 'HundoOnly', atkIV: 15, defIV: 15, staIV: 15, starType: 'blue' });
    const ranked = mon({ name: 'RankedL', rankPctL: 100, starType: 'green' });
    const list = computeHundredPercentWorklist([hundo, ranked]);
    expect(list.map(r => r.p.name)).toEqual(['RankedL', 'HundoOnly']);
  });
});

describe('#135 — isHundredPercentPokemon (the 100% measure itself)', () => {
  it('true for rounded rank 100 in any league', () => {
    expect(isHundredPercentPokemon(mon({ rankPctM: 99.5 }))).toBe(true);
  });
  it('true for hundo IV regardless of rank', () => {
    expect(isHundredPercentPokemon(mon({ atkIV: 15, defIV: 15, staIV: 15 }))).toBe(true);
  });
  it('false when neither condition holds', () => {
    expect(isHundredPercentPokemon(mon({ rankPctG: 95, atkIV: 10, defIV: 10, staIV: 10 }))).toBe(false);
  });
});
