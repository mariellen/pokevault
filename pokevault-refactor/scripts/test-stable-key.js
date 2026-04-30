/**
 * Stable-key audit — runs against consecutive Pokégenie CSV exports.
 * For each N→N+1 pair:
 *   1. Builds stable keys for both exports (matching analyse.js makeStableKey)
 *   2. Finds Pokémon present in both (by name + IVs + catch date)
 *   3. Verifies: same stable key? ✓ or ✗
 *   4. Detects powered-up Pokémon (CP changed) — key must survive
 *   5. Reports collisions (same key assigned to two different Pokémon)
 *
 * Usage: node scripts/test-stable-key.js "path/to/folder"
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ── CSV parser (mirrors app.js parseLine/parseCSV) ───────────────────────────
function parseLine(line) {
  const r = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') inQ = !inQ;
    else if (line[i] === ',' && !inQ) { r.push(cur); cur = ''; }
    else cur += line[i];
  }
  r.push(cur); return r;
}
function parseCSV(text) {
  const lines = text.split(/\r?\n/);
  const headers = parseLine(lines[0]);
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = parseLine(lines[i]);
    const obj = {};
    headers.forEach((h, idx) => obj[h.trim()] = (vals[idx] || '').trim());
    out.push(obj);
  }
  return out;
}

// ── Mirrors analyse.js makeStableKey exactly ─────────────────────────────────
function makeStableKey(r) {
  const form = (r['Form'] || '') === 'Normal' ? '' : (r['Form'] || '');
  const date = r['Catch Date'] || r['Original Scan Date'] || ('_idx' + r['Index']);
  return [
    r['Pokemon Number'] || '',
    form,
    r['Gender'] || '',
    r['Atk IV'] !== undefined ? r['Atk IV'] : '',
    r['Def IV'] !== undefined ? r['Def IV'] : '',
    r['Sta IV'] !== undefined ? r['Sta IV'] : '',
    date,
  ].join('|');
}

function buildKeyedMap(rows) {
  const seen = {};
  const keyed = rows.map(r => {
    const base = makeStableKey(r);
    seen[base] = (seen[base] || 0) + 1;
    return { r, base, key: base }; // key gets _2/_3 suffix below
  });
  // Second pass: apply dedup suffixes (mirrors deduplicateKeys)
  const seen2 = {};
  keyed.forEach(p => {
    seen2[p.base] = (seen2[p.base] || 0) + 1;
    if (seen2[p.base] > 1) p.key = p.base + '_' + seen2[p.base];
  });
  return keyed;
}

// ── "Natural identity" for cross-export matching ─────────────────────────────
// Two rows describe the same Pokémon if: same species + IVs + catch date.
// (CP is intentionally excluded — it changes when powered up.)
function naturalId(r) {
  const form = (r['Form'] || '') === 'Normal' ? '' : (r['Form'] || '');
  return [
    r['Pokemon Number'] || r['Name'] || '',
    form,
    r['Gender'] || '',
    r['Atk IV'], r['Def IV'], r['Sta IV'],
    r['Catch Date'] || '',  // empty = no catch date = less reliable match
  ].join('|');
}

// ── Main ─────────────────────────────────────────────────────────────────────
const folder = process.argv[2] || path.join(__dirname, '../../from Claude/20260430-1108');

const csvFiles = fs.readdirSync(folder)
  .filter(f => f.toLowerCase().endsWith('.csv'))
  .sort();

if (csvFiles.length < 2) {
  console.error(`Need at least 2 CSV files in: ${folder}`);
  process.exit(1);
}

console.log(`\nFound ${csvFiles.length} CSV exports in: ${folder}`);
csvFiles.forEach((f, i) => console.log(`  [${i}] ${f}`));
console.log('');

// Parse all files
const exports = csvFiles.map(f => {
  const text = fs.readFileSync(path.join(folder, f), 'utf8');
  const rows = parseCSV(text);
  const keyed = buildKeyedMap(rows);
  return { name: f, rows, keyed };
});

// ── Per-export: collision report ─────────────────────────────────────────────
console.log('══════════════════════════════════════════');
console.log('COLLISION REPORT (within each export)');
console.log('══════════════════════════════════════════');

exports.forEach(({ name, keyed }) => {
  // Before dedup: find base keys that appear more than once
  const baseCounts = {};
  keyed.forEach(({ base, r }) => {
    if (!baseCounts[base]) baseCounts[base] = [];
    baseCounts[base].push(r);
  });
  const collisions = Object.entries(baseCounts).filter(([, rows]) => rows.length > 1);
  if (collisions.length === 0) {
    console.log(`✓ ${name} — no collisions`);
  } else {
    console.log(`✗ ${name} — ${collisions.length} collision group(s):`);
    collisions.forEach(([key, rows]) => {
      console.log(`  Key: ${key}`);
      rows.forEach(r => console.log(`    → ${r['Name']} CP:${r['CP']} idx:${r['Index']} catch:${r['Catch Date']||'(none)'}`));
    });
  }
});

// ── Consecutive-pair comparisons ─────────────────────────────────────────────
console.log('\n══════════════════════════════════════════');
console.log('CONSECUTIVE-PAIR STABLE KEY AUDIT');
console.log('══════════════════════════════════════════');

let totalChecked = 0, totalOk = 0, totalFailed = 0;
let totalPoweredUp = 0, totalPuOk = 0, totalPuFailed = 0;

for (let i = 0; i < exports.length - 1; i++) {
  const A = exports[i];
  const B = exports[i + 1];

  // Build natural-id → keyed entry maps
  const natA = {};
  A.keyed.forEach(p => {
    const nid = naturalId(p.r);
    if (!natA[nid]) natA[nid] = [];
    natA[nid].push(p);
  });
  const natB = {};
  B.keyed.forEach(p => {
    const nid = naturalId(p.r);
    if (!natB[nid]) natB[nid] = [];
    natB[nid].push(p);
  });

  // Pokémon present in both exports
  const sharedNids = Object.keys(natA).filter(nid => natB[nid]);

  let ok = 0, failed = 0, powered = 0, puOk = 0, puFailed = 0;
  const failures = [];
  const puFailures = [];

  sharedNids.forEach(nid => {
    const as = natA[nid];
    const bs = natB[nid];
    // Pair them up by position (same order in both exports)
    const pairs = Math.min(as.length, bs.length);
    for (let j = 0; j < pairs; j++) {
      const a = as[j], b = bs[j];
      const cpChanged = a.r['CP'] !== b.r['CP'];
      const keyMatch = a.key === b.key;

      if (cpChanged) {
        powered++;
        if (keyMatch) puOk++;
        else {
          puFailed++;
          puFailures.push({ a, b });
        }
      } else {
        if (keyMatch) ok++;
        else {
          failed++;
          failures.push({ a, b });
        }
      }
    }
  });

  const added = B.rows.length - A.rows.length;
  const addedSign = added >= 0 ? '+' + added : String(added);
  console.log(`\n[${i}→${i+1}] ${A.name} → ${B.name}`);
  console.log(`  Collection size: ${A.rows.length} → ${B.rows.length} (${addedSign})`);
  console.log(`  Shared Pokémon matched: ${sharedNids.length} natural-ID groups`);
  console.log(`  Stable (CP unchanged): ${ok}✓  ${failed}✗`);
  console.log(`  Powered-up (CP changed): ${powered} total  ${puOk}✓ key survived  ${puFailed}✗ key changed`);

  if (failures.length) {
    console.log(`\n  ✗ KEY CHANGED (no CP change) — these are bugs:`);
    failures.slice(0, 10).forEach(({ a, b }) => {
      console.log(`    ${a.r['Name']} CP:${a.r['CP']} idx:${a.r['Index']}`);
      console.log(`      A key: ${a.key}`);
      console.log(`      B key: ${b.key}`);
    });
    if (failures.length > 10) console.log(`    ... and ${failures.length - 10} more`);
  }

  if (puFailures.length) {
    console.log(`\n  ✗ KEY CHANGED after power-up — should survive:`);
    puFailures.slice(0, 10).forEach(({ a, b }) => {
      console.log(`    ${a.r['Name']} CP:${a.r['CP']}→${b.r['CP']} idx:${a.r['Index']}`);
      console.log(`      A key: ${a.key}`);
      console.log(`      B key: ${b.key}`);
    });
    if (puFailures.length > 10) console.log(`    ... and ${puFailures.length - 10} more`);
  }

  if (failures.length === 0 && puFailures.length === 0) {
    console.log(`  ✓ ALL KEYS STABLE`);
  }

  totalChecked += ok + failed;
  totalOk += ok;
  totalFailed += failed;
  totalPoweredUp += powered;
  totalPuOk += puOk;
  totalPuFailed += puFailed;
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════');
console.log('OVERALL SUMMARY');
console.log('══════════════════════════════════════════');
console.log(`Stable (no CP change): ${totalOk}/${totalChecked} correct (${totalFailed} failed)`);
console.log(`Powered-up:            ${totalPuOk}/${totalPoweredUp} survived (${totalPuFailed} broken)`);

const totalProblems = totalFailed + totalPuFailed;
if (totalProblems === 0) {
  console.log('\n✅ Stable key is working correctly across all exports');
} else {
  console.log(`\n⚠️  ${totalProblems} key stability problem(s) found`);
}
console.log('');
