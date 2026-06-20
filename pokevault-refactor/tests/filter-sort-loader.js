'use strict';
// Loads the row-visibility predicate isMemberVisible() out of app.js into a
// Node-testable scope. Same technique as sort-loader.js / tracking-loader.js:
// app.js is a browser classic script with DOM side-effects at the bottom, so we
// shim document/window/etc. so the top-level executes harmlessly, then return
// only the pure predicate.
//
// isMemberVisible reads its filter state (searchTerm, practicalMode) via `typeof`
// guards — those globals live in render.js and are absent here, so the predicate
// falls back to "no search / not practical" unless the test passes an `opts`
// override. The filters that matter for the sort-persistence regression
// (_leagueFiltered / hidden) are per-member flags, so no globals are needed.

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

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
    src + '\nreturn { isMemberVisible };'
  );
  return factory(documentShim, windowShim, localStorageShim, navigatorShim, historyShim);
}

module.exports = { load };
