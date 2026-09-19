'use strict';
// Loads the Trading Tracker feature (applyTradingShortcutSpecialTrades,
// applyTradingShortcutFriendshipFridays, openTradingTrackerModal, renderDexMissingView,
// applyDexFilters) out of render.js + app.js into a Node-testable scope. Same DOM-shim
// technique as dex-league-rank-filter-loader.js / modal-row-helpers-loader.js.

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
      renderDexHaveView, renderDexMissingView, applyDexFilters, encodeStateToHash, applyHashState,
      applyTradingShortcutSpecialTrades, applyTradingShortcutFriendshipFridays,
      setAllPokemon: v => { allPokemon = v; },
      setAllSpecies: v => { allSpecies = v; },
      setDexQualLucky: v => { dexQualLucky = v; },
      setDexQualNeedsBetterLucky: v => { dexQualNeedsBetterLucky = v; },
      setDexExcludeFamily: v => { dexExcludeFamily = v; },
      setDexView: v => { dexView = v; },
      getDexView: () => dexView,
      getDexQualShiny: () => dexQualShiny,
      getDexQualNeedsBetterLucky: () => dexQualNeedsBetterLucky,
      getDexExcludeEvolvable: () => dexExcludeEvolvable,
      getDexExcludeFamily: () => dexExcludeFamily,
      window: window,
    };`
  );
  const mod = factory(env.documentShim, env.windowShim, env.localStorageShim, env.navigatorShim, env.historyShim);
  mod.__window = env.windowShim;
  return mod;
}

module.exports = { load };
