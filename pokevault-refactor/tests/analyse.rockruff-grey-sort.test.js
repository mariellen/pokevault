'use strict';
// #68 Rockruff formUnset + #69 grey-star sort order.

const fs = require('fs');
const path = require('path');
const loader = require('./loader');
const { parseCSV } = require('./csvParser');

// ─── Fix 1 (#69) — pokemonStarRank grey = 3.5 ────────────────────────────────
// app.js is browser-only (not a module); extract the pure function from source and test it.
const appSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const psrMatch = appSrc.match(/function pokemonStarRank\(p\)\s*\{[\s\S]*?\n\}/);
const pokemonStarRank = new Function('return (' + psrMatch[0] + ')')();

describe('#69 — grey stars sort at 3.5 (below blue, above red)', () => {
  const gold  = { suggestStar: true, isFavorite: true };
  const green = { suggestStar: true, isFavorite: false };
  const cyan  = { suggestStarCheaper: true };
  const blue  = { suggestStarExpensive: true };
  const grey  = { starType: 'grey' };
  const mlGrey = { isMlPlaceholder: true, starType: 'grey' };
  const red   = { isFavorite: true };
  const none  = {};

  it('grey ranks at 3.5', () => expect(pokemonStarRank(grey)).toBe(3.5));
  it('ML-placeholder grey also 3.5', () => expect(pokemonStarRank(mlGrey)).toBe(3.5));
  it('grey sits below blue and above red', () => {
    expect(pokemonStarRank(blue)).toBeLessThan(pokemonStarRank(grey));
    expect(pokemonStarRank(grey)).toBeLessThan(pokemonStarRank(red));
  });
  it('full order: gold<green<cyan<blue<grey<red<none', () => {
    const ranks = [gold, green, cyan, blue, grey, red, none].map(pokemonStarRank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(pokemonStarRank(red)).toBe(4);
    expect(pokemonStarRank(none)).toBe(6);
  });
});

// ─── Fix 2 (#68) — Rockruff formUnset ────────────────────────────────────────
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
const ROCK = 744, BURMY = 412;
const rockruff = (a, d, s, opts = {}) => row({
  Index: String(opts.idx), Name: 'Rockruff', 'Pokemon Number': String(ROCK), CP: String(opts.cp || 400),
  'Atk IV': String(a), 'Def IV': String(d), 'Sta IV': String(s), 'IV Avg': ((a+d+s)/45*100).toFixed(1),
  'Level Min': '20', Dust: '5000', Favorite: opts.fav ? '1' : '',
  'Rank % (G)': opts.rg || '', 'Name (G)': opts.ng || 'Lycanroc', 'Form (G)': opts.fg || 'Dusk',
  'Rank % (U)': opts.ru || '', 'Name (U)': 'Lycanroc', 'Form (U)': 'Dusk',
});
const find = (mons, cp) => mons.find(p => p.cp === cp);
const run = (rows, ov = {}) => loader.createWithOverrides(ov).analyse(toCSV(rows)).pokemon;

describe('#68 — Rockruff formUnset (📝) for untagged high-IV, no-league-slot', () => {
  it('high-IV untagged Rockruff that wins no league slot → formset star + review', () => {
    // Two Rockruffs; the hundo wins Master, the 91% one loses → no slot → formUnset.
    const mons = run([
      rockruff(15, 15, 15, { idx: 1, cp: 700 }),
      rockruff(14, 14, 13, { idx: 2, cp: 500 }),
    ]);
    const loser = find(mons, 500);
    expect(loser.formUnset).toBe(true);
    expect(loser.starType).toBe('formset');
    expect(loser.decision).toBe('review');
  });

  it('low-IV untagged Rockruff (no qualifying rank) → NO formset (trades as before)', () => {
    const mons = run([rockruff(12, 11, 13, { idx: 1, cp: 400 })]); // 80% IV, no capped rank
    expect(find(mons, 400).formUnset).toBe(false);
  });

  it('tagged Rockruff (specialForm set) → NO formset', () => {
    const mons = run([
      rockruff(15, 15, 15, { idx: 2, cp: 700 }),
      rockruff(14, 14, 13, { idx: 1, cp: 500 }),
    ], { [keyFor(ROCK, 14, 14, 13, 1)]: { special_form: 'Dusk' } });
    expect(find(mons, 500).formUnset).toBe(false);
  });

  it('#39 preserved: a Rockruff that holds a league slot is NOT converted to formset', () => {
    // A lone high-rank Rockruff wins a league slot (Master here) → keeps its form-aware keeper
    // nick, never the 📝 holding state. This is the gate that protects #39 DayⒼ/NightⒼ winners.
    const p = find(run([rockruff(14, 14, 13, { idx: 1, cp: 500, rg: '96.0', fg: 'Midnight' })]), 500);
    expect(p.slots.some(s => ['G', 'U', 'L', 'M'].includes(s))).toBe(true);
    expect(p.formUnset).toBe(false);
    expect(p.starType).not.toBe('formset');
    expect(p.nickname).not.toMatch(/^Rockruff/); // shows the evolved/form target, not the base
  });

  it('Burmy formUnset path unchanged (still fires via FORM_SET_REQUIRED_EVOS)', () => {
    const burmy = row({
      Index: '1', Name: 'Burmy', 'Pokemon Number': String(BURMY), Gender: '♀', CP: '300',
      'Atk IV': '14', 'Def IV': '14', 'Sta IV': '13', 'IV Avg': '91.1', 'Level Min': '20', Dust: '5000',
      'Rank % (G)': '95.0', 'Name (G)': 'Wormadam', 'Form (G)': '',
    });
    expect(find(run([burmy]), 300).formUnset).toBe(true);
  });
});
