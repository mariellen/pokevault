'use strict';
// Loads the #144 shared modal-row helpers (renderSearchCopyButton, renderNickCopyButton,
// modalNavigateToFamily) out of render.js + app.js into a Node-testable scope. Same DOM-shim
// technique as filter-sort-loader.js, but combines render.js first (goSpeciesToken, esc,
// mergeCandidateKeys, …) then app.js on top, matching the real browser load order
// (index.html: config -> data -> supabase -> auth -> pokemon_go_base_stats -> analyse ->
// render -> app) closely enough for these specific functions' dependencies.

const fs = require('fs');
const path = require('path');

const jsDir = path.join(__dirname, '..', 'js');
const read = name => fs.readFileSync(path.join(jsDir, name), 'utf8');
const src = read('render.js') + '\n\n' + read('app.js');

function buildStubEl() {
  return {
    addEventListener() {}, removeEventListener() {}, appendChild() {},
    prepend() {}, removeChild() {}, remove() {},
    classList: { add() {}, remove() {}, toggle() { return false; }, contains() { return false; } },
    style: {}, dataset: {}, setAttribute() {}, focus() {}, select() {}, click() {},
    dispatchEvent() {}, querySelector() { return null; }, querySelectorAll() { return []; },
    textContent: '', innerHTML: '', value: '',
  };
}

function makeEnv() {
  const documentShim = {
    getElementById: () => buildStubEl(),
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => buildStubEl(),
    body: { appendChild() {}, prepend() {}, removeChild() {} },
  };
  const windowShim = {
    addEventListener() {}, location: { hash: '', origin: '', pathname: '' },
    scrollTo() {}, console,
  };
  const localStorageShim = { getItem: () => null, setItem() {}, removeItem() {} };
  const navigatorShim = { clipboard: { writeText: () => Promise.resolve() } };
  const historyShim = { replaceState() {}, pushState() {} };
  return { documentShim, windowShim, localStorageShim, navigatorShim, historyShim };
}

function load() {
  const { documentShim, windowShim, localStorageShim, navigatorShim, historyShim } = makeEnv();
  const factory = new Function(
    'document', 'window', 'localStorage', 'navigator', 'history',
    src + '\nreturn { renderSearchCopyButton, renderNickCopyButton, modalNavigateToFamily, goSpeciesToken, applyFilters: (typeof applyFilters==="function"?applyFilters:null) };'
  );
  return factory(documentShim, windowShim, localStorageShim, navigatorShim, historyShim);
}

module.exports = { load };
