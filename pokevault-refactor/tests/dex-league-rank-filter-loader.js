'use strict';
// Loads the #145 dex league-rank-100 filter (renderDexHaveView, renderDexMissingView,
// applyDexFilters, encodeStateToHash, applyHashState, toggleDexLeagueRank100) out of
// render.js + app.js into a Node-testable scope. Same DOM-shim technique as
// modal-row-helpers-loader.js. Exposes setters/getters for the `let`-declared module state
// these functions read/write, since they aren't parameters.

const fs = require('fs');
const path = require('path');

const jsDir = path.join(__dirname, '..', 'js');
const read = name => fs.readFileSync(path.join(jsDir, name), 'utf8');
const src = read('render.js') + '\n\n' + read('app.js');

function buildStubEl(overrides) {
  return Object.assign({
    addEventListener() {}, removeEventListener() {}, appendChild() {},
    prepend() {}, removeChild() {}, remove() {},
    classList: { add() {}, remove() {}, toggle() { return false; }, contains() { return false; } },
    style: {}, dataset: {}, setAttribute() {}, focus() {}, select() {}, click() {},
    dispatchEvent() {}, querySelector() { return null; }, querySelectorAll() { return []; },
    textContent: '', innerHTML: '', value: '',
  }, overrides || {});
}

function makeEnv() {
  // dex-modal is special-cased to report style.display='flex' — encodeStateToHash() gates its
  // whole dex-branch on this, and in real usage it's only ever called while the modal is open.
  const dexModalStub = buildStubEl({ style: { display: 'flex' } });
  const windowShim = {
    addEventListener() {}, location: { hash: '', origin: '', pathname: '' },
    scrollTo() {}, console,
  };
  const documentShim = {
    getElementById: (id) => id === 'dex-modal' ? dexModalStub : buildStubEl(),
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => buildStubEl(),
    body: { appendChild() {}, prepend() {}, removeChild() {} },
  };
  const localStorageShim = { getItem: () => null, setItem() {}, removeItem() {} };
  const navigatorShim = { clipboard: { writeText: () => Promise.resolve() } };
  const historyShim = { replaceState() {}, pushState() {} };
  return { documentShim, windowShim, localStorageShim, navigatorShim, historyShim };
}

function load() {
  const env = makeEnv();
  const factory = new Function(
    'document', 'window', 'localStorage', 'navigator', 'history',
    src + `
    \nreturn {
      renderDexHaveView, renderDexMissingView, applyDexFilters,
      encodeStateToHash, applyHashState, toggleDexLeagueRank100,
      setAllPokemon: v => { allPokemon = v; },
      setAllSpecies: v => { allSpecies = v; },
      setDexLeagueRank100: v => { dexLeagueRank100 = v; },
      setDexQualHundo: v => { dexQualHundo = v; },
      setDexQualLucky: v => { dexQualLucky = v; },
      setDexView: v => { dexView = v; },
      getDexLeagueRank100: () => dexLeagueRank100,
      getDexQualHundo: () => dexQualHundo,
      getDexView: () => dexView,
      window: window,
    };`
  );
  const mod = factory(env.documentShim, env.windowShim, env.localStorageShim, env.navigatorShim, env.historyShim);
  mod.__window = env.windowShim;
  return mod;
}

module.exports = { load };
