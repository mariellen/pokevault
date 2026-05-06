#!/usr/bin/env node
// Bulk-import move data from pvpoke rankings into the pokemon_moves table.
//
// Rules:
//   verified=true rows → never overwritten (manually verified data wins)
//   verified=false rows → updated with fresh pvpoke data
//   Missing rows → inserted as verified=false
//
// pvpoke moves.json has no legacy/CD/elite-TM flags; those fields default false
// and can be hand-corrected in the DB or via the verify script.
//
// Usage:
//   SUPABASE_SERVICE_KEY=your-key node scripts/import-moves-from-pvpoke.js
//   SUPABASE_SERVICE_KEY=your-key node scripts/import-moves-from-pvpoke.js --priority
//
// --priority: only processes species appearing in pokemon_collection with rank ≥ 90%
//   in any league. Run this first, then run without --priority for the full import.
//
// After import, run the verify script to confirm matches:
//   SUPABASE_SERVICE_KEY=your-key node scripts/verify-moves-against-pvpoke.js

'use strict';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jsozfpsfvvnnmipsksoh.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

const PVPOKE_URLS = {
  L: 'https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/rankings/all/overall/rankings-500.json',
  G: 'https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/rankings/all/overall/rankings-1500.json',
  U: 'https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/rankings/all/overall/rankings-2500.json',
  M: 'https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/rankings/all/overall/rankings-10000.json',
};

// Suffixes in pvpoke speciesId that should be skipped entirely
// (shadow = same moves as base; mega/xl/xs/buddy = irrelevant to PvP)
const SKIP_SUFFIX_RE = /_shadow|_mega|_xl$|_xs$|_buddy/;

// Regional prefix as it appears in pvpoke speciesName
const REGIONAL_PREFIX_RE = /^(Hisuian|Galarian|Alolan|Paldean)\s+/i;

// ── Pure helper functions (exported for unit tests) ───────────────────────────

// Map a pvpoke speciesId to the DB form column value.
function extractForm(speciesId) {
  if (speciesId.includes('_alolan'))            return 'Alolan';
  if (speciesId.includes('_galarian'))          return 'Galarian';
  if (speciesId.includes('_hisuian'))           return 'Hisuian';
  if (speciesId.includes('_paldean') ||
      speciesId.includes('_paldea'))            return 'Paldean';
  if (speciesId.includes('_mega'))              return 'Mega';
  if (speciesId.includes('_origin'))            return 'Origin';
  if (speciesId.includes('_altered'))           return 'Altered';
  if (speciesId.includes('_therian'))           return 'Therian';
  if (speciesId.includes('_primal'))            return 'Primal';
  if (speciesId.includes('_shadow'))            return '';  // skipped before use
  return '';
}

// Strip regional prefix from pvpoke speciesName to get the DB species value.
// "Alolan Sandslash" → "Sandslash"; "Swampert" → "Swampert"
function extractSpeciesName(speciesName) {
  return speciesName.replace(REGIONAL_PREFIX_RE, '').trim();
}

// Convert a pvpoke move ID to a display name for the DB.
// "MUD_SHOT" → "Mud Shot", "WEATHER_BALL_ICE" → "Weather Ball"
function pvpokeIdToDisplay(moveId) {
  if (!moveId) return null;
  const stripped = moveId.replace(/^(WEATHER_BALL)_[A-Z]+$/i, '$1');
  return stripped.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

// Build a DB row from pvpoke data. All move-flag fields default false
// because pvpoke's moves.json does not expose legacy/CD/elite-TM flags.
function buildRow(species, form, league, moveset, now) {
  const [fast, charged1, charged2] = moveset;
  return {
    species,
    league,
    form: form || '',
    fast_move_best:    pvpokeIdToDisplay(fast),
    fast_move_legacy:  false,
    fast_move_cd:      false,
    fast_move_elite_tm: false,
    charged1_move:     pvpokeIdToDisplay(charged1),
    charged1_legacy:   false,
    charged1_cd:       false,
    charged1_elite_tm: false,
    charged2_move:     charged2 ? pvpokeIdToDisplay(charged2) : null,
    charged2_legacy:   false,
    charged2_cd:       false,
    charged2_elite_tm: false,
    moveset_same_across_leagues: false,
    move_pool_limited: false,
    verified:          false,
    last_verified_at:  now || new Date().toISOString(),
  };
}

// ── Supabase helper ────────────────────────────────────────────────────────────

async function supabaseReq(method, path, body) {
  if (!SUPABASE_KEY) throw new Error('SUPABASE_SERVICE_KEY env var not set');
  const headers = {
    'apikey':        SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type':  'application/json',
  };
  if (method !== 'GET') {
    headers['Prefer'] = 'return=minimal,resolution=merge-duplicates';
  }
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Supabase ${method} ${path}: ${txt.slice(0, 300)}`);
  }
  return method === 'GET' ? res.json() : null;
}

// ── Priority species fetch ─────────────────────────────────────────────────────

async function getPrioritySpecies() {
  // Fetches distinct species names from pokemon_collection where any PvP rank ≥ 90%.
  // Column names: name, rank_pct_g, rank_pct_u, rank_pct_l (stored as 0–100 floats).
  // Adjust column names here if the Supabase table schema differs.
  const rows = await supabaseReq('GET',
    'pokemon_collection?select=name&or=(rank_pct_g.gte.90,rank_pct_u.gte.90,rank_pct_l.gte.90)&limit=5000'
  );
  return new Set(rows.map(r => r.name).filter(Boolean));
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('PokéVault — pvpoke Move Importer');
  console.log('=================================\n');

  if (!SUPABASE_KEY) {
    console.error('Error: SUPABASE_SERVICE_KEY environment variable is required.');
    console.error('Usage: SUPABASE_SERVICE_KEY=your-key node scripts/import-moves-from-pvpoke.js');
    process.exit(1);
  }

  const isPriority = process.argv.includes('--priority');

  // ── Step 1: Fetch all pvpoke rankings (fail fast — no DB writes until all succeed) ──
  console.log('Fetching pvpoke rankings from GitHub...');
  const pvpokeData = {};
  for (const [league, url] of Object.entries(PVPOKE_URLS)) {
    process.stdout.write(`  ${league}... `);
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`FAILED (HTTP ${res.status})`);
      console.error('\nAborting — no DB changes made.');
      process.exit(1);
    }
    pvpokeData[league] = await res.json();
    console.log(`${pvpokeData[league].length} entries`);
  }

  // ── Step 2: Fetch all existing pokemon_moves rows ─────────────────────────
  console.log('\nFetching existing pokemon_moves from Supabase...');
  const existingRows = await supabaseReq('GET',
    'pokemon_moves?select=species,league,form,verified&limit=5000&order=species,league'
  );
  // Map: "Species|League|form" → verified (true/false)
  const existingMap = new Map();
  for (const row of existingRows) {
    existingMap.set(`${row.species}|${row.league}|${row.form || ''}`, row.verified);
  }
  console.log(`  ${existingRows.length} existing rows.\n`);

  // ── Step 3: Priority filter ───────────────────────────────────────────────
  let prioritySpecies = null;
  if (isPriority) {
    console.log('Fetching priority species (rank ≥ 90% in any league)...');
    prioritySpecies = await getPrioritySpecies();
    console.log(`  ${prioritySpecies.size} priority species.\n`);
  }

  // ── Step 4: Build list of rows to upsert ──────────────────────────────────
  const now = new Date().toISOString();
  const toUpsert = [];
  const seen = new Set();
  const stats = { inserted: 0, updated: 0, skipped: 0, errors: 0 };

  for (const [league, rankings] of Object.entries(pvpokeData)) {
    for (const entry of rankings) {
      const id = (entry.speciesId || '').replace(/-/g, '_');

      if (SKIP_SUFFIX_RE.test(id)) continue;

      const moveset = entry.moveset || [];
      if (moveset.length < 2) continue;

      const form    = extractForm(id);
      const species = extractSpeciesName(entry.speciesName || '');
      if (!species) continue;

      if (prioritySpecies && !prioritySpecies.has(species)) continue;

      const key = `${species}|${league}|${form}`;
      if (seen.has(key)) continue;  // skip duplicates within same league file
      seen.add(key);

      const existingVerified = existingMap.get(key);
      if (existingVerified === true) {
        stats.skipped++;
        continue;
      }

      toUpsert.push({
        row: buildRow(species, form, league, moveset, now),
        isUpdate: existingVerified === false,
      });
    }
  }

  // ── Step 5: Upsert ────────────────────────────────────────────────────────
  const insertCount = toUpsert.filter(x => !x.isUpdate).length;
  const updateCount = toUpsert.filter(x => x.isUpdate).length;
  console.log(`Upserting ${toUpsert.length} rows (${insertCount} new, ${updateCount} updates)...`);

  let done = 0;
  for (const { row, isUpdate } of toUpsert) {
    try {
      await supabaseReq('POST', 'pokemon_moves?on_conflict=species,league,form', row);
      if (isUpdate) stats.updated++;
      else stats.inserted++;
    } catch (e) {
      console.error(`\nError: ${row.species} ${row.league} — ${e.message}`);
      stats.errors++;
    }
    done++;
    if (done % 50 === 0) process.stdout.write(`\r  ${done}/${toUpsert.length} processed`);
  }
  if (toUpsert.length) console.log(`\r  ${done}/${toUpsert.length} processed`);

  // ── Step 6: Summary ───────────────────────────────────────────────────────
  console.log('\n--- Summary ---');
  console.log(`Inserted: ${stats.inserted} new rows`);
  console.log(`Updated:  ${stats.updated} existing unverified rows`);
  console.log(`Skipped:  ${stats.skipped} already verified`);
  console.log(`Errors:   ${stats.errors}`);
  if (stats.errors === 0) {
    console.log('\nNext step: run verify-moves-against-pvpoke.js to confirm matches.');
  }
}

module.exports = { extractForm, extractSpeciesName, pvpokeIdToDisplay, buildRow };

if (require.main === module) {
  main().catch(e => { console.error('Fatal:', e); process.exit(1); });
}
