'use strict';
// Loads the nick inline-edit helpers out of app.js into a Node-testable scope.
// Same shim technique as sort-loader.js — app.js is a browser classic script with
// DOM side-effects at the bottom, so we stub document/window/etc. and inject the
// cross-file globals it calls (saveNickOverride, allPokemon) as parameters.

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

function buildStubEl() {
  const el = {
    addEventListener() {}, removeEventListener() {},
    appendChild() {}, prepend() {}, removeChild() {}, remove() {},
    replaceWith() {},
    classList: { add() {}, remove() {}, toggle() { return false; }, contains() { return false; } },
    style: {}, dataset: {}, cells: [],
    setAttribute() {}, getAttribute() { return null; },
    focus() {}, select() {}, click() {}, dispatchEvent() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    textContent: '', innerHTML: '', value: '',
  };
  return el;
}

function makeEnv() {
  const documentShim = {
    getElementById: () => buildStubEl(),
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => buildStubEl(),
    body: { appendChild() {}, prepend() {}, removeChild() {} },
  };
  const windowShim = { addEventListener() {}, location: { hash: '', origin: '', pathname: '' }, scrollTo() {}, console };
  const localStorageShim = { getItem: () => null, setItem() {}, removeItem() {} };
  const navigatorShim = { clipboard: { writeText: () => Promise.resolve() } };
  const historyShim = { replaceState() {}, pushState() {} };
  return { documentShim, windowShim, localStorageShim, navigatorShim, historyShim };
}

/**
 * @param {{ saveNickOverride?: Function, allPokemon?: Array }} opts
 */
function load({ saveNickOverride = async () => true, allPokemon = [] } = {}) {
  const { documentShim, windowShim, localStorageShim, navigatorShim, historyShim } = makeEnv();
  const factory = new Function(
    'document', 'window', 'localStorage', 'navigator', 'history', 'saveNickOverride', 'allPokemon',
    src + '\nreturn { nickEditKey, commitNickEdit, cancelNickEdit, resetNick };'
  );
  return factory(documentShim, windowShim, localStorageShim, navigatorShim, historyShim, saveNickOverride, allPokemon);
}

module.exports = { load };
