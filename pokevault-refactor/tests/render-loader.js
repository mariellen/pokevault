'use strict';
// Loads config.js + data.js + base-stats + analyse.js + render.js into one Function
// scope so buildRow / esc / nick-cell rendering can be tested in Node.
//
// render.js has no top-level DOM access (all document/window usage lives inside
// HTML-string templates that are never executed at load), so no shims are needed
// beyond overridesCache (referenced by analyse.js).

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
].join('\n\n');

const shim = `const overridesCache = {};\n`;

const factory = new Function(
  shim + combined +
  '\nreturn { buildRow, esc, buildNickname, applyNickOverride, clampNick,' +
  ' goSpeciesToken, buildBulkCpSearch, familyStarKeepers, familyMergeCandidates, mergeCandidateKeys };'
);

module.exports = factory();
