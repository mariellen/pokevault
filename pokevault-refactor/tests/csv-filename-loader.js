'use strict';
// Loads the F3 CSV-filename helper (setCsvFilename) out of app.js into a
// Node-testable scope with a STATEFUL localStorage and an inspectable
// #csvFilename element stub. Same shimming approach as tracking-loader.js.

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

function buildStubEl() {
  return {
    addEventListener() {}, removeEventListener() {}, appendChild() {}, prepend() {},
    removeChild() {}, remove() {},
    classList: { add() {}, remove() {}, toggle() { return false; }, contains() { return false; } },
    style: {}, dataset: {}, setAttribute() {}, focus() {}, select() {}, click() {},
    dispatchEvent() {}, querySelector() { return null; }, querySelectorAll() { return []; },
    textContent: '', innerHTML: '', value: '',
  };
}

function load() {
  const store = new Map();
  const localStorageShim = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  };
  const csvEl = buildStubEl();
  const documentShim = {
    getElementById: (id) => (id === 'csvFilename' ? csvEl : buildStubEl()),
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => buildStubEl(),
    body: { appendChild() {}, prepend() {}, removeChild() {} },
  };
  const windowShim = {
    addEventListener() {}, location: { hash: '', origin: '', pathname: '' },
    scrollTo() {}, console,
  };
  const navigatorShim = { clipboard: { writeText: () => Promise.resolve() } };
  const historyShim = { replaceState() {}, pushState() {} };

  const factory = new Function(
    'document', 'window', 'localStorage', 'navigator', 'history',
    src + '\nreturn { setCsvFilename };'
  );
  const api = factory(documentShim, windowShim, localStorageShim, navigatorShim, historyShim);
  return { setCsvFilename: api.setCsvFilename, store, csvEl };
}

module.exports = { load };
