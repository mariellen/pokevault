'use strict';
// Loads the GA4 tracking helpers out of app.js into a Node-testable scope.
//
// app.js is a browser classic script with DOM side-effects at the bottom
// (addEventListener bindings). We shim document/window/etc. so the top-level
// executes harmlessly, then return only the pure tracking helpers.
//
// `gtag` is intentionally NOT shimmed/passed: app.js references it as a free
// global, so it resolves against globalThis at call time. Tests set/delete
// `global.gtag` to exercise the undefined / throwing / working branches.

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

function buildStubEl() {
  return {
    addEventListener() {},
    removeEventListener() {},
    appendChild() {},
    prepend() {},
    removeChild() {},
    remove() {},
    classList: { add() {}, remove() {}, toggle() { return false; }, contains() { return false; } },
    style: {},
    dataset: {},
    setAttribute() {},
    focus() {},
    select() {},
    click() {},
    dispatchEvent() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    textContent: '',
    innerHTML: '',
    value: '',
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
    addEventListener() {},
    location: { hash: '', origin: '', pathname: '' },
    scrollTo() {},
    console,
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
    src + '\nreturn { trackEvent, buildNickShape, buildSearchShape, trackSearchDebounced };'
  );
  return factory(documentShim, windowShim, localStorageShim, navigatorShim, historyShim);
}

module.exports = { load };
