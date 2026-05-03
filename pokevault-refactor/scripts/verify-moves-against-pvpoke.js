#!/usr/bin/env node
// Verify pokemon_moves table against pvpoke rankings data.
// MATCH rows: sets last_verified_at=now(), verified=true.
// DIFF rows:  printed to report only — no auto-update.
// Fetch failure: exits before any DB writes.
//
// Prerequisite — run once in Supabase SQL editor:
//   ALTER TABLE pokemon_moves ADD COLUMN last_verified_at timestamptz;
//
// Usage:
//   SUPABASE_URL=https://jsozfpsfvvnnmipsksoh.supabase.co \
//   SUPABASE_SERVICE_KEY=your-service-key \
//   node scripts/verify-moves-against-pvpoke.js

'use strict';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jsozfpsfvvnnmipsksoh.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

const PVPOKE_URLS = {
  L: 'https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/rankings/all/overall/rankings-500.json',
  G: 'https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/rankings/all/overall/rankings-1500.json',
  U: 'https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/rankings/all/overall/rankings-2500.json',
  M: 'https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/rankings/all/overall/rankings-10000.json',
};

// ── Normalisation helpers ──────────────────────────────────────────────────

// Convert a Pokégenie display name to a pvpoke-style lookup key for matching.
// "Mr. Mime" → "mr_mime", "Nidoran♀" → "nidoran_f", "Farfetch'd" → "farfetchd"
function normalizeSpecies(displayName) {
  return displayName
    .toLowerCase()
    .replace(/♀/g, '_f')
    .replace(/♂/g, '_m')
    .replace(/['.]/g, '')          // strip apostrophe and period
    .replace(/[:\s-]+/g, '_')      // colon, space, hyphen → underscore
    .replace(/_+/g, '_')           // collapse multiple underscores
    .replace(/^_|_$/g, '');        // trim leading/trailing underscores
}

// Convert a pvpoke move ID to a canonical form for comparison.
// "MUD_SHOT" → "mudshot", "HYDRO_CANNON" → "hydrocannon"
function normalizeMoveId(pvpokeId) {
  if (!pvpokeId) return '';
  return pvpokeId.toLowerCase().replace(/_/g, '');
}

// Convert a DB move display name to the same canonical form.
// "Mud Shot" → "mudshot", "Mud-Slap" → "mudslap", "Hydro Cannon" → "hydrocannon"
function normalizeMoveDisplay(name) {
  if (!name) return '';
  return name.toLowerCase().replace(/[-'.\s_]/g, '');
}

// Compare a DB row's moves against a pvpoke moveset array [fast, c1, c2?].
// Returns 'match', 'skip' (no pvpoke entry / too few moves), or array of diff strings.
function compareMoves(dbRow, pvpokeMoveset) {
  if (!pvpokeMoveset || pvpokeMoveset.length < 2) return 'skip';

  const diffs = [];

  const fast   = normalizeMoveDisplay(dbRow.fast_move_best);
  const pvFast = normalizeMoveId(pvpokeMoveset[0]);
  if (fast && pvFast && fast !== pvFast) {
    diffs.push(`fast: DB="${dbRow.fast_move_best}" pvpoke="${pvpokeMoveset[0]}"`);
  }

  const c1   = normalizeMoveDisplay(dbRow.charged1_move);
  const pvC1 = normalizeMoveId(pvpokeMoveset[1]);
  if (c1 && pvC1 && c1 !== pvC1) {
    diffs.push(`charged1: DB="${dbRow.charged1_move}" pvpoke="${pvpokeMoveset[1]}"`);
  }

  const c2   = normalizeMoveDisplay(dbRow.charged2_move || '');
  const pvC2 = normalizeMoveId(pvpokeMoveset[2] || '');
  if (c2 && pvC2 && c2 !== pvC2) {
    diffs.push(`charged2: DB="${dbRow.charged2_move}" pvpoke="${pvpokeMoveset[2]}"`);
  }

  return diffs.length ? diffs : 'match';
}

// Build a lookup map: normalizedSpeciesKey → pvpoke entry, for one league's data.
// Skips shadow/mega/xl variants (speciesId contains '_shadow', '_mega', '_xl', '_xs').
function buildSpeciesMap(rankings) {
  const map = new Map();
  for (const entry of rankings) {
    const id = entry.speciesId || '';
    if (/_shadow|_mega|_xl$|_xs$|_buddy/.test(id)) continue;
    // Index by both speciesId and normalised speciesName so we have two lookup paths
    map.set(id.replace(/-/g, '_'), entry);
    if (entry.speciesName) {
      map.set(normalizeSpecies(entry.speciesName), entry);
    }
  }
  return map;
}

// ── Supabase helpers ───────────────────────────────────────────────────────

async function supabaseReq(method, path, body) {
  if (!SUPABASE_KEY) throw new Error('SUPABASE_SERVICE_KEY env var not set');
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    method,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'return=minimal,resolution=merge-duplicates' : 'return=minimal',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Supabase ${method} ${path}: ${txt.slice(0, 300)}`);
  }
  if (method === 'GET') return res.json();
  return null;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('PokéVault — pvpoke Move Verifier');
  console.log('=================================\n');

  if (!SUPABASE_KEY) {
    console.error('Error: SUPABASE_SERVICE_KEY environment variable is required.');
    console.error('Usage: SUPABASE_SERVICE_KEY=your-key node scripts/verify-moves-against-pvpoke.js');
    process.exit(1);
  }

  // ── Step 1: Fetch all pvpoke rankings (fail fast, no DB writes yet) ──────
  console.log('Fetching pvpoke rankings from GitHub...');
  const pvpokeData = {};
  for (const [league, url] of Object.entries(PVPOKE_URLS)) {
    process.stdout.write(`  ${league}... `);
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`FAILED (HTTP ${res.status})`);
      console.error(`\nAborting — no DB changes made.`);
      process.exit(1);
    }
    pvpokeData[league] = await res.json();
    console.log(`${pvpokeData[league].length} entries`);
  }

  const speciesMaps = {};
  for (const [league, rankings] of Object.entries(pvpokeData)) {
    speciesMaps[league] = buildSpeciesMap(rankings);
  }

  // ── Step 2: Fetch all pokemon_moves rows ─────────────────────────────────
  console.log('\nFetching pokemon_moves from Supabase...');
  const dbRows = await supabaseReq('GET', 'pokemon_moves?select=*&limit=2000&order=species,league');
  console.log(`  ${dbRows.length} rows fetched.\n`);

  // ── Step 3: Compare ───────────────────────────────────────────────────────
  const matches = [], diffs = [], skips = [];
  const now = new Date().toISOString();

  for (const row of dbRows) {
    const map = speciesMaps[row.league];
    if (!map) { skips.push({ row, reason: `unknown league "${row.league}"` }); continue; }

    const key = normalizeSpecies(row.species);
    const pvEntry = map.get(key);

    if (!pvEntry) {
      skips.push({ row, reason: 'not in pvpoke rankings' });
      continue;
    }

    const result = compareMoves(row, pvEntry.moveset);

    if (result === 'match') {
      matches.push(row);
      const moves = [row.fast_move_best, row.charged1_move, row.charged2_move].filter(Boolean).join(' / ');
      console.log(`MATCH:  ${row.species} ${row.league} — ${moves} ✓`);
    } else if (result === 'skip') {
      skips.push({ row, reason: 'pvpoke moveset too short' });
    } else {
      diffs.push({ row, diffs: result });
      console.log(`DIFF:   ${row.species} ${row.league}`);
      result.forEach(d => console.log(`        ${d}`));
    }
  }

  skips.forEach(({ row, reason }) => {
    console.log(`SKIP:   ${row.species} ${row.league} — ${reason}`);
  });

  // ── Step 4: Summary ───────────────────────────────────────────────────────
  console.log(`\n---`);
  console.log(`${matches.length} matched, ${diffs.length} diffed, ${skips.length} skipped`);

  if (diffs.length) {
    console.log('\nDIFFS — review manually before updating DB:');
    diffs.forEach(({ row, diffs: ds }) => {
      console.log(`  ${row.species} ${row.league}: ${ds.join('; ')}`);
    });
  }

  // ── Step 5: Patch MATCH rows with last_verified_at + verified=true ────────
  if (!matches.length) {
    console.log('\nNo matches to update.');
    return;
  }

  console.log(`\nUpdating ${matches.length} matched rows (last_verified_at, verified=true)...`);
  let updated = 0;
  for (const row of matches) {
    await supabaseReq('PATCH',
      `pokemon_moves?species=eq.${encodeURIComponent(row.species)}&league=eq.${encodeURIComponent(row.league)}`,
      { last_verified_at: now, verified: true }
    );
    updated++;
    if (updated % 10 === 0) process.stdout.write(`\r  ${updated}/${matches.length} updated`);
  }
  console.log(`\r  ${updated}/${matches.length} updated`);
  console.log('\nDone!');
}

// Export pure functions for unit tests; run main() only when executed directly.
module.exports = { normalizeSpecies, normalizeMoveId, normalizeMoveDisplay, compareMoves, buildSpeciesMap };

if (require.main === module) {
  main().catch(e => { console.error('Fatal:', e); process.exit(1); });
}
