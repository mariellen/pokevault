'use strict';
// Loads config + data + base-stats + analyse.js + render.js, then splices in the
// real setOverride() from app.js so its nick-preview slot-routing (#67) can be
// unit-tested in Node. The DOM-mutation half of setOverride is guarded by
// `if (tr)`; our document stub returns null so that half is skipped and only the
// pure slot/nick derivation runs.
//
// setOverride is extracted by line-slice: it is a top-level function declaration,
// so its own closing brace is the first subsequent line that is exactly '}'
// (all inner braces are indented). This survives the template literals inside.

const fs = require('fs');
const path = require('path');

const jsDir = path.join(__dirname, '..', 'js');
const read = name => fs.readFileSync(path.join(jsDir, name), 'utf8');

function extractFn(src, signature) {
  const lines = src.split('\n').map(l => l.replace(/\r$/, ''));
  const start = lines.findIndex(l => l.startsWith(signature));
  if (start === -1) throw new Error('setOverride signature not found: ' + signature);
  const end = lines.findIndex((l, i) => i > start && l === '}');
  if (end === -1) throw new Error('setOverride closing brace not found');
  return lines.slice(start, end + 1).join('\n');
}

const setOverrideSrc = extractFn(read('app.js'), 'function setOverride(idx, field, value)');

const combined = [
  read('config.js'),
  read('data.js'),
  read('pokemon_go_base_stats.js'),
  read('analyse.js'),
  read('render.js'),
  setOverrideSrc,
].join('\n\n');

// Shims for the app-only globals setOverride reaches for. document.querySelector
// returns null so the row-mutation block is skipped; the Supabase/summary calls
// are no-ops. `allPokemon` is already declared by render.js (top-level); the
// returned setter reassigns that shared binding.
const shim = `
const overridesCache = {};
const document = { querySelector: () => null };
function saveOverride() {}
function updateSyncStatus() {}
function renderSummary() {}
function rerenderNickCell() {}
`;

const factory = new Function(
  shim + combined +
  '\nreturn {' +
  '  setOverride,' +
  '  setAllPokemon: (arr) => { allPokemon = arr; },' +
  '  setOverrideCache: (k, v) => { overridesCache[k] = v; },' +
  '  buildNickname,' +
  '};'
);

module.exports = factory();
