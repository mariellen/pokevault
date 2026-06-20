'use strict';
// Feature Batch June 2026 — F1 (🔍⭐ bulk keeper search) + F2 (🔍🔀 bulk merge search)
// Unit tests for the render.js helpers that build GO-compatible bulk CP search strings.
//
// Loaded via render-loader so the pure helpers run in Node with no DOM.

const render = require('./render-loader');
const { goSpeciesToken, buildBulkCpSearch, familyStarKeepers, familyMergeCandidates, mergeCandidateKeys } = render;

describe('goSpeciesToken — GO search compatibility', () => {
  it('lowercases a simple name', () => {
    expect(goSpeciesToken('Pikachu')).toBe('pikachu');
  });
  it('keeps a hyphen (Ho-Oh stays ho-oh — GO accepts the hyphen)', () => {
    expect(goSpeciesToken('Ho-Oh')).toBe('ho-oh');
  });
  it('strips spaces so comma-joined search does not break (Tapu Koko)', () => {
    expect(goSpeciesToken('Tapu Koko')).toBe('tapukoko');
  });
  it('strips the dot and space in "Mr. Mime"', () => {
    expect(goSpeciesToken('Mr. Mime')).toBe('mrmime');
  });
  it('strips the colon and space in "Type: Null"', () => {
    expect(goSpeciesToken('Type: Null')).toBe('typenull');
  });
  it("strips the apostrophe in Farfetch'd", () => {
    expect(goSpeciesToken("Farfetch'd")).toBe('farfetchd');
  });
  it('replaces é with e (Flabébé)', () => {
    expect(goSpeciesToken('Flabébé')).toBe('flabebe');
  });
  it('is null-safe', () => {
    expect(goSpeciesToken(null)).toBe('');
    expect(goSpeciesToken(undefined)).toBe('');
  });
});

describe('buildBulkCpSearch — species&cpNNN comma-joined, no spaces', () => {
  it('builds the brief example format', () => {
    const members = [
      { name: 'Ho-Oh', cp: 2169 },
      { name: 'Ho-Oh', cp: 2727 },
      { name: 'Ho-Oh', cp: 2144 },
    ];
    expect(buildBulkCpSearch(members)).toBe('ho-oh&cp2169,ho-oh&cp2727,ho-oh&cp2144');
  });
  it('contains no spaces even for spaced species names', () => {
    const members = [{ name: 'Tapu Koko', cp: 1500 }];
    const str = buildBulkCpSearch(members);
    expect(str).toBe('tapukoko&cp1500');
    expect(str).not.toMatch(/\s/);
  });
  it('de-dupes identical name+cp tokens', () => {
    const members = [
      { name: 'Magikarp', cp: 100 },
      { name: 'Magikarp', cp: 100 },
      { name: 'Magikarp', cp: 101 },
    ];
    expect(buildBulkCpSearch(members)).toBe('magikarp&cp100,magikarp&cp101');
  });
  it('treats missing cp as 0', () => {
    expect(buildBulkCpSearch([{ name: 'Ditto' }])).toBe('ditto&cp0');
  });
  it('returns empty string for empty / null input', () => {
    expect(buildBulkCpSearch([])).toBe('');
    expect(buildBulkCpSearch(null)).toBe('');
  });
});

describe('familyStarKeepers — F1 selector (gold + green stars)', () => {
  it('includes keep members with suggestStar (gold and green)', () => {
    const gold  = { name: 'A', cp: 1, decision: 'keep', suggestStar: true, isFavorite: true };
    const green = { name: 'B', cp: 2, decision: 'keep', suggestStar: true, isFavorite: false };
    const out = familyStarKeepers([gold, green]);
    expect(out).toContain(gold);
    expect(out).toContain(green);
  });
  it('excludes a starred-but-not-suggested member (red star)', () => {
    const red = { name: 'C', cp: 3, decision: 'keep', suggestStar: false, isFavorite: true };
    expect(familyStarKeepers([red])).toEqual([]);
  });
  it('excludes non-keep members even if suggestStar somehow set', () => {
    const trade = { name: 'D', cp: 4, decision: 'trade', suggestStar: true };
    expect(familyStarKeepers([trade])).toEqual([]);
  });
  it('null-safe', () => {
    expect(familyStarKeepers(null)).toEqual([]);
  });
});

describe('familyMergeCandidates — F2 selector (mergeCandidateKeys set)', () => {
  beforeEach(() => { mergeCandidateKeys.clear(); });
  it('includes members whose stableKey is in mergeCandidateKeys', () => {
    mergeCandidateKeys.add('k1');
    const a = { name: 'A', cp: 1, stableKey: 'k1' };
    const b = { name: 'B', cp: 2, stableKey: 'k2' };
    expect(familyMergeCandidates([a, b])).toEqual([a]);
  });
  it('returns empty when no members flagged', () => {
    const a = { name: 'A', cp: 1, stableKey: 'k9' };
    expect(familyMergeCandidates([a])).toEqual([]);
  });
});

describe('F1+F2 end to end — keeper + merge bulk strings', () => {
  beforeEach(() => { mergeCandidateKeys.clear(); });
  it('produces a GO-paste-ready keeper string', () => {
    const members = [
      { name: 'Ho-Oh', cp: 2169, decision: 'keep', suggestStar: true,  isFavorite: true },
      { name: 'Ho-Oh', cp: 2727, decision: 'keep', suggestStar: true,  isFavorite: false },
      { name: 'Ho-Oh', cp: 1200, decision: 'trade', suggestStar: false, isFavorite: false },
    ];
    expect(buildBulkCpSearch(familyStarKeepers(members)))
      .toBe('ho-oh&cp2169,ho-oh&cp2727');
  });
  it('produces a GO-paste-ready merge string', () => {
    mergeCandidateKeys.add('m1');
    mergeCandidateKeys.add('m2');
    const members = [
      { name: 'Eevee', cp: 500, stableKey: 'm1' },
      { name: 'Eevee', cp: 600, stableKey: 'm2' },
      { name: 'Eevee', cp: 700, stableKey: 'x'  },
    ];
    expect(buildBulkCpSearch(familyMergeCandidates(members)))
      .toBe('eevee&cp500,eevee&cp600');
  });
});
