'use strict';
// Loads config.js + data.js + analyse.js into a single Function scope, shimming
// browser globals that analyse.js expects (overridesCache from supabase.js).
// Usage: const { analyse, buildFamilyMap } = require('./loader');

const fs = require('fs');
const path = require('path');

const jsDir = path.join(__dirname, '..', 'js');
const read = name => fs.readFileSync(path.join(jsDir, name), 'utf8');

// Load in the same order as index.html: config → data → analyse
const combined = [
  read('config.js'),
  read('data.js'),
  read('analyse.js'),
].join('\n\n');

// Shim browser globals that analyse.js references at runtime.
// overridesCache is populated by supabase.js in the browser; empty object = no overrides.
const shim = `const overridesCache = {};\n`;

// All const/function declarations share one function scope, so analyse and
// buildFamilyMap (declared inside that scope) are visible to the return statement.
const factory = new Function(shim + combined + '\nreturn { analyse, buildFamilyMap };');
module.exports = factory();
