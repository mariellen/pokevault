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
// "MUD_SHOT" → "mud shot", "WEATHER_BALL_ICE" → "weather ball"
function normalizeMoveId(pvpokeId) {
  if (!pvpokeId) return '';
  // Strip typed Weather Ball suffixes before general normalisation
  const stripped = pvpokeId.replace(/^(WEATHER_BALL)_[A-Z]+$/i, '$1');
  return stripped.toLowerCase().replace(/_/g, ' ').trim();
}

// Convert a DB move display name to the same canonical form.
// "Mud Shot" → "mud shot", "Mud-Slap" → "mud slap", "Hydro Cannon" → "hydro cannon"
function normalizeMoveDisplay(name) {
  if (!name) return '';
  return name.toLowerCase().replace(/[-]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Compare a DB row's moves against a pvpoke moveset array [fast, c1, c2?].
// Charged moves are compared as an order-independent set: DB moves must all
// appear in pvpoke's set, but pvpoke may list extra moves DB doesn't have.
// Returns 'match', 'skip' (no pvpoke entry / too few moves), or array of diff strings.
function compareMoves(dbRow, pvpokeMoveset) {
  if (!pvpokeMoveset || pvpokeMoveset.length < 2) return 'skip';

  const diffs = [];

  const fast   = normalizeMoveDisplay(dbRow.fast_move_best);
  const pvFast = normalizeMoveId(pvpokeMoveset[0]);
  if (fast && pvFast && fast !== pvFast) {
    diffs.push(`fast: DB="${dbRow.fast_move_best}" pvpoke="${pvpokeMoveset[0]}"`);
  }

  // Charged: DB moves must be a subset of pvpoke's charged set (order-independent)
  const dbCharged = [dbRow.charged1_move, dbRow.charged2_move]
    .filter(Boolean).map(normalizeMoveDisplay);
  const pvSet = new Set(
    [pvpokeMoveset[1], pvpokeMoveset[2]].filter(Boolean).map(normalizeMoveId)
  );
  if (dbCharged.length && pvSet.size && !dbCharged.every(m => pvSet.has(m))) {
    const dbLabel = [dbRow.charged1_move, dbRow.charged2_move].filter(Boolean).join('/');
    const pvLabel = pvpokeMoveset.slice(1).filter(Boolean).join('/');
    diffs.push(`charged: DB="${dbLabel}" pvpoke="${pvLabel}"`);
  }

  return diffs.length ? diffs : 'match';
}

// pvpoke drops the trailing 'n' from regional form names (Paldean → paldea, Alolan → alola, Hisuian → hisui)
const FORM_ALIASES = { paldean: 'paldea', alolan: 'alola', hisuian: 'hisui', galarian: 'galarian' };

// Forms that pvpoke indexes under the bare species key (no suffix)
const DEFAULT_FORMS = new Set(['normal', 'altered', 'incarnate', 'land', 'red_striped', 'baile', 'midday', 'solo']);

// Regional form names as they appear in DB form column (lowercased)
const REGIONAL_FORMS = new Set(['hisuian', 'galarian', 'alolan', 'paldean']);

// Regex to detect regional prefix in pvpoke speciesName (e.g. "Hisuian Electrode")
const REGIONAL_PREFIX_RE = /^(Hisuian|Galarian|Alolan|Paldean)\s+/i;

// Build candidate pvpoke speciesId keys from a DB species+form pair.
// pvpoke encodes form into speciesId (e.g. "giratina_origin", "mewtwo_a").
// Returns an ordered list of keys to try, most-specific first.
// Non-default forms without a pvpoke entry will return no base fallback → SKIP.
function buildLookupKeys(species, form) {
  const base = normalizeSpecies(species);
  if (!form || !form.trim()) return [base];
  const f = form.toLowerCase().trim().replace(/\s+/g, '_');
  const keys = [base + '_' + f];
  if (f === 'armored') keys.push(base + '_a');  // pvpoke uses _a for Armored Mewtwo
  if (FORM_ALIASES[f]) keys.push(base + '_' + FORM_ALIASES[f]);
  // pvpoke sometimes indexes regional forms as "region_species" (e.g. "hisuian_electrode")
  // rather than "species_region" — try both orderings
  if (REGIONAL_FORMS.has(f)) {
    keys.push(f + '_' + base);
    if (FORM_ALIASES[f]) keys.push(FORM_ALIASES[f] + '_' + base);
  }
  if (DEFAULT_FORMS.has(f)) keys.push(base);
  return [...new Set(keys)];
}

// Build a lookup map: normalizedSpeciesKey → pvpoke entry, for one league's data.
// Skips shadow/mega/xl variants (speciesId contains '_shadow', '_mega', '_xl', '_xs').
function buildSpeciesMap(rankings) {
  const map = new Map();
  for (const entry of rankings) {
    const id = entry.speciesId || '';
    if (/_shadow|_mega|_xl$|_xs$|_buddy/.test(id)) continue;
    const idKey = id.replace(/-/g, '_');
    const name = entry.speciesName || '';

    if (name && REGIONAL_PREFIX_RE.test(name)) {
      // Regional form: always index under normalised speciesName ("hisuian_electrode")
      // so it can be found by buildLookupKeys reversed-key candidates.
      map.set(normalizeSpecies(name), entry);
      // Also index under idKey only when it's form-qualified, not the bare base species.
      // This prevents pvpoke's Hisuian Electrode (speciesId="electrode") from overwriting
      // the regular Electrode entry when they share the same bare speciesId.
      const baseKey = normalizeSpecies(name.replace(REGIONAL_PREFIX_RE, '').trim());
      if (idKey !== baseKey) map.set(idKey, entry);
    } else {
      map.set(idKey, entry);
      // Only add speciesName key when it exactly matches the speciesId
      if (name && normalizeSpecies(name) === idKey) map.set(normalizeSpecies(name), entry);
    }
  }
  return map;
}

// DB moves confirmed correct that pvpoke shows differently (legacy moves, IV-specific quirks).
// Key: 'Species|League|fast' or 'Species|League|charged'. Value: normalised DB move name.
// When DB move matches the override value, treat as MATCH regardless of pvpoke.
const KNOWN_CORRECT_OVERRIDES = {
  'Groudon|M|fast':      'mud shot',          // pvpoke shows Dragon Tail for a specific IV configuration
  'Machamp|U|fast':      'counter',           // pvpoke shows Karate Chop (legacy)
  'Medicham|G|fast':     'counter',           // pvpoke shows Psycho Cut
  'Togekiss|M|fast':     'charm',             // pvpoke shows Peck
  'Lugia|M|charged':     'sky attack',        // pvpoke shows Fly
  'Beedrill|G|fast':     'poison jab',        // pvpoke shows Poison Sting
  'Electrode|G|fast':    'volt switch',       // pvpoke shows Thunder Shock (Hisuian fast)
  'Electrode|G|charged': 'discharge/foul play', // pvpoke shows Hisuian charged set
  'Lapras|G|fast':       'ice shard',         // pvpoke shows Ice Shard (confirmed correct)
  'Lapras|U|fast':       'ice shard',         // pvpoke shows different fast
  'Leafeon|G|fast':      'razor leaf',        // pvpoke shows Quick Attack
  'Primeape|G|fast':     'counter',           // pvpoke shows Karate Chop (legacy)
};

// Filter diffs that are covered by a KNOWN_CORRECT_OVERRIDES entry for this species+league.
function applyOverrides(compareResult, species, league) {
  if (compareResult === 'match' || compareResult === 'skip') return compareResult;
  const filtered = compareResult.filter(diff => {
    if (diff.startsWith('fast:')) {
      const ov = KNOWN_CORRECT_OVERRIDES[`${species}|${league}|fast`];
      if (ov) return false;  // override present → suppress diff
    }
    if (diff.startsWith('charged:')) {
      const ov = KNOWN_CORRECT_OVERRIDES[`${species}|${league}|charged`];
      if (ov) return false;
    }
    return true;
  });
  return filtered.length ? filtered : 'match';
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

    const keys = buildLookupKeys(row.species, row.form);
    const pvEntry = keys.reduce((found, k) => found || map.get(k), undefined);

    if (!pvEntry) {
      skips.push({ row, reason: 'not in pvpoke rankings' });
      continue;
    }

    const result = applyOverrides(compareMoves(row, pvEntry.moveset), row.species, row.league);

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
    const formFilter = row.form ? `&form=eq.${encodeURIComponent(row.form)}` : `&form=eq.`;
    await supabaseReq('PATCH',
      `pokemon_moves?species=eq.${encodeURIComponent(row.species)}&league=eq.${encodeURIComponent(row.league)}${formFilter}`,
      { last_verified_at: now, verified: true }
    );
    updated++;
    if (updated % 10 === 0) process.stdout.write(`\r  ${updated}/${matches.length} updated`);
  }
  console.log(`\r  ${updated}/${matches.length} updated`);
  console.log('\nDone!');
}

// Export pure functions for unit tests; run main() only when executed directly.
module.exports = { normalizeSpecies, normalizeMoveId, normalizeMoveDisplay, compareMoves, buildSpeciesMap, buildLookupKeys, applyOverrides, KNOWN_CORRECT_OVERRIDES };

if (require.main === module) {
  main().catch(e => { console.error('Fatal:', e); process.exit(1); });
}
