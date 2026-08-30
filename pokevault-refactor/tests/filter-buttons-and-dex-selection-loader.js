'use strict';
// Loads config+data+base-stats+analyse+render+app into one Function scope (same combo as
// set-override-loader.js) so the REAL applyFilters()/toggle*Filter()/dex-selection functions
// can be exercised in Node — not reimplementations of the same logic.
//
// renderPage() is neutralized to a no-op AFTER app.js's own declaration (same-scope function
// bindings are shared, so reassigning the identifier here is visible to applyFilters' internal
// call). renderPage's real body needs a full DOM + buildNickname/family-card render pipeline
// that isn't worth stubbing just to unit-test filter predicates — the family-level filtering in
// applyFilters (the part under test) runs before renderPage is ever called.

const fs = require('fs');
const path = require('path');

const jsDir = path.join(__dirname, '..', 'js');
const read = name => fs.readFileSync(path.join(jsDir, name), 'utf8');

const combined = [
  read('config.js'),
  read('data.js'),
  read('pokemon_go_base_stats.js'),
  read('analyse.js'),
  read('render.js'),
  read('app.js'),
].join('\n\n');

function buildStubEl() {
  const classes = new Set();
  return {
    classList: {
      add: c => classes.add(c),
      remove: c => classes.delete(c),
      toggle: (c, force) => {
        if (force === undefined) {
          if (classes.has(c)) { classes.delete(c); return false; }
          classes.add(c); return true;
        }
        if (force) classes.add(c); else classes.delete(c);
        return force;
      },
      contains: c => classes.has(c),
    },
    style: {}, dataset: {}, textContent: '', innerHTML: '', value: '', checked: false,
    setAttribute() {}, addEventListener() {}, removeEventListener() {},
    appendChild() {}, prepend() {}, removeChild() {}, remove() {}, focus() {}, select() {}, click() {},
    dispatchEvent() {}, querySelector: () => null, querySelectorAll: () => [],
  };
}

function makeEnv() {
  const elCache = new Map();
  const documentShim = {
    getElementById: id => {
      if (!elCache.has(id)) elCache.set(id, buildStubEl());
      return elCache.get(id);
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => buildStubEl(),
    body: { appendChild() {}, prepend() {}, removeChild() {}, classList: { add() {}, remove() {}, toggle() {} } },
  };
  const windowShim = {
    addEventListener() {}, location: { hash: '', origin: '', pathname: '' },
    scrollTo() {}, console,
  };
  const localStorageShim = { getItem: () => null, setItem() {}, removeItem() {} };
  const writeTextCalls = [];
  const navigatorShim = { clipboard: { writeText: s => { writeTextCalls.push(s); return Promise.resolve(); } } };
  const historyShim = { replaceState() {}, pushState() {} };
  return { documentShim, windowShim, localStorageShim, navigatorShim, historyShim, elCache, writeTextCalls };
}

function load() {
  const { documentShim, windowShim, localStorageShim, navigatorShim, historyShim, elCache, writeTextCalls } = makeEnv();
  const shim = `const overridesCache = {};\n`;
  const RETURN = `
return {
  setFamilies: (arr) => { families = arr; },
  getFilteredFamilies: () => filteredFamilies,
  applyFilters,
  toggleLuckyFilter, toggleShinyFilter, toggle100Filter, toggleDmaxFilter, toggleGmaxFilter,
  is100PctPokemon,
  getFilterState: () => ({ showLuckyOnly, showShinyOnly, show100Only, showDynamaxOnly, showGigantamaxOnly }),
  toggleDexSelection, updateDexSelectionBar, copyDexSelection, copyDexRowName, clearDexSelection,
  getDexSelected: () => dexSelected,
};
`;
  const factory = new Function(
    'document', 'window', 'localStorage', 'navigator', 'history',
    shim + combined + '\nrenderPage = function(){};\n' + RETURN
  );
  const api = factory(documentShim, windowShim, localStorageShim, navigatorShim, historyShim);
  return { api, documentShim, elCache, writeTextCalls };
}

module.exports = { load };
