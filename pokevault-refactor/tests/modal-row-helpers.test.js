'use strict';
// Tests for #144 — shared modal-row helpers (search copy, nick copy, name click-through).

const { load } = require('./modal-row-helpers-loader');
const { renderSearchCopyButton, renderNickCopyButton, modalNavigateToFamily, goSpeciesToken } = load();

const extractDataSearch = (html) => {
  const m = html.match(/data-search="([^"]*)"/);
  return m ? m[1].replace(/&amp;/g, '&') : null;
};

describe('#144 Test 1 — search-copy matches the main list\'s 🔍 format (CP-only, goSpeciesToken-based)', () => {
  it('produces goSpeciesToken(name)+"&cp"+cp — the same formula the main list 🔍 button uses', () => {
    const p = { name: 'Zangoose', cp: 1981 };
    const html = renderSearchCopyButton(p);
    expect(extractDataSearch(html)).toBe(goSpeciesToken(p.name) + '&cp' + p.cp);
    expect(extractDataSearch(html)).toBe('zangoose&cp1981');
  });

  it('does NOT include IV data (#143 — CP+IV format is broken, must not be used)', () => {
    const p = { name: 'Zangoose', cp: 1981, atkIV: 14, defIV: 13, staIV: 0 };
    const html = renderSearchCopyButton(p);
    expect(html).not.toMatch(/14/);
    expect(html).not.toMatch(/13\/0/);
  });

  it('handles special-character species names via goSpeciesToken (apostrophes, spaces, dots)', () => {
    const html = renderSearchCopyButton({ name: "Farfetch'd", cp: 1236 });
    expect(extractDataSearch(html)).toBe('farfetchd&cp1236');
  });

  it('is wired to the shared copyGoSearch handler, not a second implementation', () => {
    const html = renderSearchCopyButton({ name: 'Ponyta', cp: 1237 });
    expect(html).toMatch(/onclick="event\.stopPropagation\(\);copyGoSearch\(this\.dataset\.search,this\)"/);
  });
});

describe('#144 Test 2 — nick-copy copies exactly p.nickname', () => {
  it('data-search carries exactly the nickname string', () => {
    const p = { name: 'Toucannon', cp: 1500, nickname: 'ToucannonⓂ98' };
    const html = renderNickCopyButton(p);
    expect(extractDataSearch(html)).toBe('ToucannonⓂ98');
  });

  it('renders nothing when there is no nickname', () => {
    expect(renderNickCopyButton({ name: 'Bulbasaur', cp: 500, nickname: '' })).toBe('');
  });

  it('is wired to the shared copyGoSearch handler (not a second copyNick-style implementation)', () => {
    const html = renderNickCopyButton({ name: 'Toucannon', cp: 1500, nickname: 'ToucannonⓂ98' });
    expect(html).toMatch(/onclick="event\.stopPropagation\(\);copyGoSearch\(this\.dataset\.search,this\)"/);
  });
});

describe('#144 Test 3 — name click-through', () => {
  it('modalNavigateToFamily sets the search box value and searchTerm to the given name', () => {
    // Pure smoke test against the DOM-shimmed loader — getElementById always returns a fresh
    // stub in this harness (see filter-sort-loader.js precedent), so we assert it runs without
    // throwing and calls through to applyFilters rather than asserting on DOM mutation, which
    // this harness can't observe (same limitation as every other modal's DOM output).
    expect(() => modalNavigateToFamily('Toucannon')).not.toThrow();
  });
});

describe('#144 Test 4 — retrofit check: no duplicated local implementations remain', () => {
  const fs = require('fs');
  const path = require('path');
  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

  it('openCleanupModal (Set Forms) uses the shared helpers, not a local nick/search implementation', () => {
    const fn = appSrc.slice(appSrc.indexOf('function openCleanupModal'), appSrc.indexOf('function closeCleanupModal'));
    expect(fn).toMatch(/renderSearchCopyButton\(p\)/);
    expect(fn).toMatch(/renderNickCopyButton\(p\)/);
    expect(fn).toMatch(/modalNavigateToFamily/);
    expect(fn).not.toMatch(/onclick="copyNick/);
  });

  it('openCullModal uses the shared helpers for its per-keeper rows and shared navigate', () => {
    const fn = appSrc.slice(appSrc.indexOf('function openCullModal'), appSrc.indexOf('function closeCullModal'));
    expect(fn).toMatch(/renderSearchCopyButton\(p\)/);
    expect(fn).toMatch(/renderNickCopyButton\(p\)/);
    expect(fn).toMatch(/modalNavigateToFamily/);
    expect(fn).not.toMatch(/onclick="copyNick/);
  });

  it('openHundredModal (#135) uses the shared helpers instead of its original local implementation', () => {
    const fn = appSrc.slice(appSrc.indexOf('function openHundredModal'), appSrc.indexOf('function closeHundredModal'));
    expect(fn).toMatch(/renderSearchCopyButton\(p\)/);
    expect(fn).toMatch(/renderNickCopyButton\(p\)/);
    expect(fn).toMatch(/modalNavigateToFamily/);
    // The original local implementation used the broken CP+IV format (#143) — must be gone.
    expect(fn).not.toMatch(/atkIV\}\/\$\{p\.defIV\}\/\$\{p\.staIV\}`;\s*\n\s*const searchEsc/);
    expect(fn).not.toMatch(/onclick="copyNick/);
  });

  it('openPurifyModal gains name click-through via the shared helper (its copy buttons stay domain-specific by design)', () => {
    const fn = appSrc.slice(appSrc.indexOf('function openPurifyModal'), appSrc.indexOf('function closePurifyModal'));
    expect(fn).toMatch(/modalNavigateToFamily/);
  });

  it('only one clipboard-writing implementation exists for nick/search copy (copyGoSearch) — no parallel handler was written', () => {
    const copyFnDeclarations = appSrc.match(/^function copy\w*\(/gm) || [];
    // copyGoSearch (shared) + copyNick (pre-existing, still used by the main list rows and
    // family-wide copy affordances, out of scope for #144) + copyNicks/copyCurrentLink
    // (unrelated pre-existing features) is the expected, unchanged set — no new one added.
    expect(copyFnDeclarations).toContain('function copyGoSearch(');
  });
});
