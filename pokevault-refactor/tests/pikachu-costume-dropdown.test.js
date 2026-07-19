'use strict';
// #77 — Pikachu costume dropdown. Pokégenie doesn't export costume data, so Pikachu/Pichu/Raichu
// are added to FORM_DROPDOWNS as manual, human-readable labels. Data-only change — the dropdown
// mechanism (override panel render.js + Set Forms modal app.js) already keys off FORM_DROPDOWNS.

const fs = require('fs');
const path = require('path');
const renderLoader = require('./render-loader');

// FORM_DROPDOWNS lives in data.js as a bare `const` — load config + data into one scope to read it.
const jsDir = path.join(__dirname, '..', 'js');
const read = (n) => fs.readFileSync(path.join(jsDir, n), 'utf8');
const { FORM_DROPDOWNS } = new Function(
  read('config.js') + '\n' + read('data.js') + '\nreturn { FORM_DROPDOWNS };'
)();

// 'Unknown' pinned first, 'None' (if present, #82) pinned second, the rest alphabetical
// (case-insensitive, numeric-aware) — the invariant every costume dropdown must hold.
const isAlphabetical = (arr) => {
  expect(arr[0]).toBe('Unknown');
  const rest = arr[1] === 'None' ? arr.slice(2) : arr.slice(1);
  const sorted = [...rest].sort((a, b) =>
    a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true }));
  expect(rest).toEqual(sorted);
};

describe('#77 — Pikachu costume dropdown data', () => {
  it('Pikachu is a dropdown species starting with Unknown, with the full costume list', () => {
    const list = FORM_DROPDOWNS.Pikachu;
    expect(Array.isArray(list)).toBe(true);
    expect(list[0]).toBe('Unknown');
    expect(list.length).toBeGreaterThanOrEqual(80);
    // spot-check costumes across the source groups (incl. the newest additions)
    ['Santa Hat', 'Ash Hat', 'World Cap 2025', 'Detective', 'Pikachu Libre', 'Saree',
     'Lyra Hat', 'Serena Hat', 'Amethyst Crown', 'Party Hat Purple', 'Witch Hat',
     'Professor Willow Assistant', 'None', 'Party Top Hat New Years', 'Safari Cap']
      .forEach(c => expect(list).toContain(c));
    expect(list).toContain('Party Hat Red'); // distinct from Party Hat Purple
    // #82 renames + #77 rename: the old labels are gone
    ['Party Hat', 'Party Top Hat', 'Safari Hat', 'Professor']
      .forEach(c => expect(list).not.toContain(c));
    // no duplicate labels
    expect(new Set(list).size).toBe(list.length);
  });

  it('Pikachu includes the GO Fest 2026 Global team hats', () => {
    ['Team Instinct Hat', 'Team Mystic Hat', 'Team Valor Hat']
      .forEach(c => expect(FORM_DROPDOWNS.Pikachu).toContain(c));
  });

  it('Pikachu / Pichu / Raichu lists are alphabetical (Unknown first)', () => {
    isAlphabetical(FORM_DROPDOWNS.Pikachu);
    isAlphabetical(FORM_DROPDOWNS.Pichu);
    isAlphabetical(FORM_DROPDOWNS.Raichu);
  });

  it('Pichu and Raichu have their own (shorter) alphabetical lists', () => {
    expect(FORM_DROPDOWNS.Pichu).toEqual(
      ['Unknown', 'None', 'Fragment Hat', 'Meloetta Hat', 'Party Hat Red', 'Santa Hat', 'Witch Hat']);
    expect(FORM_DROPDOWNS.Raichu).toEqual(['Unknown', 'None', 'Pop Star', 'Rock Star']);
  });

  it('#82 — None pinned second for Pikachu/Pichu/Raichu; renames applied in order', () => {
    ['Pikachu', 'Pichu', 'Raichu'].forEach(sp => {
      expect(FORM_DROPDOWNS[sp][0]).toBe('Unknown');
      expect(FORM_DROPDOWNS[sp][1]).toBe('None');
    });
    // Kanto starters do NOT get 'None'
    expect(FORM_DROPDOWNS.Bulbasaur).not.toContain('None');
    // renames + new 'Party Top Hat New Years', alphabetical
    const seg = FORM_DROPDOWNS.Pikachu.filter(x => /^Party |^Safari/.test(x));
    expect(seg).toEqual(['Party Hat Purple', 'Party Hat Red',
      'Party Top Hat New Years', 'Party Top Hat Purple', 'Safari Cap']);
  });

  it('Kanto starter families (all 3 stages) carry the Pikachu Visor — costume survives evolution', () => {
    ['Bulbasaur', 'Ivysaur', 'Venusaur', 'Charmander', 'Charmeleon', 'Charizard',
     'Squirtle', 'Wartortle', 'Blastoise'].forEach(sp => {
      expect(FORM_DROPDOWNS[sp]).toEqual(['Unknown', 'Pikachu Visor']);
    });
  });

  it('existing dropdowns are unchanged (regression)', () => {
    expect(FORM_DROPDOWNS.Squawkabilly).toEqual(
      ['Unknown', 'Green Plumage', 'Blue Plumage', 'Yellow Plumage', 'White Plumage']);
    expect(FORM_DROPDOWNS.Furfrou[0]).toBe('Unknown');
    expect(FORM_DROPDOWNS.Furfrou).toContain('Pharaoh');
    expect(FORM_DROPDOWNS.Deerling).toEqual(['Unknown', 'Spring', 'Summer', 'Autumn', 'Winter']);
  });
});

describe('#77 — Pikachu renders a dropdown (not free text) in the override panel', () => {
  const makeP = (name) => ({
    idx: 1, stableKey: 'k1', name, form: '', cp: 500, nickname: name,
    ivAvg: 90, atkIV: 14, defIV: 13, staIV: 13, decision: 'keep', slots: ['M'],
    reason: '', notes: '', specialForm: '', vivillonPattern: '',
    rankPctL: 0, rankPctG: 0, rankPctU: 0, rankPctM: 90,
    rankNumL: null, rankNumG: null, rankNumU: null, dustL: 0, dustG: 0, dustU: 0,
    isLucky: false, isShiny: false, isShadow: false, isCostumed: true,
    isDynamax: false, isGigantamax: false, quickMove: '', chargeMove1: '', chargeMove2: '',
  });

  it('Pikachu override panel renders a <select> with costume options', () => {
    const html = renderLoader.buildRow(makeP('Pikachu'));
    expect(html).toContain('<select');
    expect(html).toContain('value="Santa Hat"');
    expect(html).toContain('value="World Cap 2025"');
  });

  it('a species with no dropdown still renders the free-text form input', () => {
    const html = renderLoader.buildRow(makeP('Rattata')); // not in FORM_DROPDOWNS
    expect(html).toContain('placeholder="e.g. Polar"'); // the free-text fallback input
  });
});
