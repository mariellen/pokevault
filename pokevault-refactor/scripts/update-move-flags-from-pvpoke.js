#!/usr/bin/env node
// Update pokemon_moves legacy and Elite TM flags from pvpoke's pokemon.json.
//
// moves.json no longer contains flag data. pokemon.json has per-species
// legacyMoves and eliteMoves arrays which are the authoritative source.
//
// Flag assignment (per-species, not per-move globally):
//   move in eliteMoves only        → isEliteTm = true  (Elite TM required, still obtainable)
//   move in legacyMoves only       → isLegacy  = true  (unobtainable, do not TM away)
//   move in both                   → isEliteTm = true  (obtainable via Elite TM)
//   move in neither                → both false
//
// CD flags (fast_move_cd, charged1_cd, charged2_cd) are NOT updated here —
// pokemon.json has no separate CD signal.
//
// Rules:
//   verified = true  → never touched (manually verified data wins)
//   verified = false → fast/charged legacy + elite_tm columns updated
//
// Usage:
//   SUPABASE_SERVICE_KEY=your-key node scripts/update-move-flags-from-pvpoke.js --dry-run
//   SUPABASE_SERVICE_KEY=your-key node scripts/update-move-flags-from-pvpoke.js

'use strict';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jsozfpsfvvnnmipsksoh.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

const PVPOKE_POKEMON_URL =
  'https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/gamemaster/pokemon.json';

// ── Species normalisation ─────────────────────────────────────────────────────

// Normalise a DB species display name to a pvpoke speciesId base key.
// "Mr. Mime" → "mr_mime", "Nidoran♀" → "nidoran_f", "Flabébé" → "flabebe"
function normalizeSpeciesName(name) {
  return name
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents: é→e, etc.
    .toLowerCase()
    .replace(/♀/g, '_f')
    .replace(/♂/g, '_m')
    .replace(/['.]/g, '')                              // strip apostrophe, period
    .replace(/[-:\s()]+/g, '_')                        // punctuation/spaces → underscore
    .replace(/_+/g, '_')                               // collapse runs
    .replace(/^_|_$/g, '');                            // trim
}

// pvpoke form suffix aliases — DB form column → candidate pvpoke suffixes.
// Multiple candidates are tried in order (most-specific first).
const FORM_SUFFIXES = {
  alolan:    ['alolan', 'alola'],
  galarian:  ['galarian'],
  hisuian:   ['hisuian', 'hisui'],
  paldean:   ['paldean', 'paldea'],
  origin:    ['origin'],
  therian:   ['therian'],
  primal:    ['primal'],
  altered:   ['altered'],
  incarnate: ['incarnate'],
  armored:   ['armored', 'a'],
  attack:    ['attack'],
  defense:   ['defense'],
  speed:     ['speed'],
  sky:       ['sky'],
  land:      ['land'],
  aria:      ['aria'],
  baile:     ['baile'],
  midday:    ['midday'],
  midnight:  ['midnight'],
  dusk:      ['dusk'],
  dawn:      ['dawn'],
  ice:       ['ice'],
  normal:    ['normal'],
};

// Build candidate pvpoke speciesId keys to try for a given DB species + form.
// Returns an ordered array (most-specific first) to try against the pokemon map.
function buildSpeciesKeys(species, form) {
  const base = normalizeSpeciesName(species);
  if (!form || !form.trim()) return [base];
  const f = form.toLowerCase().trim();
  const suffixes = FORM_SUFFIXES[f] || [f.replace(/\s+/g, '_')];
  return [...new Set(suffixes.map(s => `${base}_${s}`))];
}

// ── Move normalisation ────────────────────────────────────────────────────────

// Convert a DB display name to a pvpoke moveId for set membership checks.
// "Hydro Cannon" → "HYDRO_CANNON", "Mud-Slap" → "MUD_SLAP"
function displayToMoveId(displayName) {
  if (!displayName) return '';
  return displayName
    .toUpperCase()
    .replace(/[-\s]+/g, '_')
    .replace(/[^A-Z0-9_]/g, '');
}

// Check membership in a Set, with Weather Ball type-variant support.
// "WEATHER_BALL" → matches "WEATHER_BALL_ICE", "WEATHER_BALL_ROCK", etc.
function moveInSet(moveId, set) {
  if (!moveId || !set || set.size === 0) return false;
  if (set.has(moveId)) return true;
  // Prefix scan for typed variants (Weather Ball only in practice)
  for (const id of set) {
    if (id.startsWith(moveId + '_')) return true;
  }
  return false;
}

// ── Build per-species lookup map ──────────────────────────────────────────────

function buildPokemonMap(entries) {
  const map = new Map();
  for (const entry of entries) {
    if (!entry.speciesId) continue;
    map.set(entry.speciesId, {
      eliteSet: new Set(entry.eliteMoves  || []),
      legacySet: new Set(entry.legacyMoves || []),
      allMoves: new Set([
        ...(entry.fastMoves    || []),
        ...(entry.chargedMoves || []),
        ...(entry.legacyMoves  || []),
        ...(entry.eliteMoves   || []),
      ]),
    });
  }
  return map;
}

// Find the pvpoke entry for a DB species+form pair. Returns { key, entry } or null.
function findEntry(species, form, pokemonMap) {
  for (const key of buildSpeciesKeys(species, form)) {
    const entry = pokemonMap.get(key);
    if (entry) return { key, entry };
  }
  return null;
}

// Compute legacy + eliteTm flags for one DB move name against a species entry.
// Returns { isLegacy, isEliteTm }.
function getMoveFlags(moveName, entry) {
  if (!moveName || !entry) return { isLegacy: false, isEliteTm: false };
  const moveId = displayToMoveId(moveName);
  const isEliteTm = moveInSet(moveId, entry.eliteSet);
  const isLegacy  = !isEliteTm && moveInSet(moveId, entry.legacySet);
  return { isLegacy, isEliteTm };
}

// ── Supabase ──────────────────────────────────────────────────────────────────

async function supabaseReq(method, path, body) {
  if (!SUPABASE_KEY) throw new Error('SUPABASE_SERVICE_KEY env var not set');
  const headers = {
    'apikey':        SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type':  'application/json',
  };
  if (method !== 'GET') headers['Prefer'] = 'return=minimal';
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Supabase ${method} ${path} → HTTP ${res.status}: ${txt.slice(0, 400)}`);
  }
  return method === 'GET' ? res.json() : null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('PokéVault — Move Flags Updater (pvpoke pokemon.json)');
  console.log('=====================================================\n');

  if (!SUPABASE_KEY) {
    console.error('Error: SUPABASE_SERVICE_KEY environment variable is required.');
    console.error('Usage: SUPABASE_SERVICE_KEY=your-key node scripts/update-move-flags-from-pvpoke.js');
    process.exit(1);
  }

  const isDryRun = process.argv.includes('--dry-run');
  if (isDryRun) console.log('[DRY RUN] No changes will be written.\n');

  // ── Step 1: Fetch pokemon.json ────────────────────────────────────────────
  console.log(`Fetching pvpoke pokemon.json...`);
  const res = await fetch(PVPOKE_POKEMON_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching pokemon.json`);
  const pokemonEntries = await res.json();
  console.log(`  ${pokemonEntries.length} species entries loaded.`);

  const pokemonMap = buildPokemonMap(pokemonEntries);
  console.log(`  ${pokemonMap.size} entries indexed by speciesId.\n`);

  // ── Step 2: Sanity check ──────────────────────────────────────────────────
  // Abort before any DB writes if the source data looks wrong.
  const swampert = pokemonMap.get('swampert');
  if (!swampert) {
    console.error('ABORT: "swampert" not found in pokemon.json — source file structure may have changed.');
    process.exit(1);
  }
  if (!moveInSet('HYDRO_CANNON', swampert.eliteSet)) {
    console.error('ABORT: Swampert\'s eliteMoves does not contain HYDRO_CANNON.');
    console.error(`       eliteMoves = [${[...swampert.eliteSet].join(', ')}]`);
    console.error('       pokemon.json structure may have changed — aborting before any DB writes.');
    process.exit(1);
  }
  console.log('Sanity check passed: Swampert has HYDRO_CANNON in eliteMoves.\n');

  // ── Step 3: Fetch unverified pokemon_moves rows ───────────────────────────
  console.log('Fetching unverified pokemon_moves from Supabase...');
  const rows = await supabaseReq('GET', [
    'pokemon_moves?verified=eq.false',
    '&select=species,league,form',
    ',fast_move_best,fast_move_legacy,fast_move_elite_tm',
    ',charged1_move,charged1_legacy,charged1_elite_tm',
    ',charged2_move,charged2_legacy,charged2_elite_tm',
    '&limit=10000',
    '&order=species,league',
  ].join(''));
  console.log(`  ${rows.length} unverified rows fetched.\n`);

  // ── Step 4: Compute patches ───────────────────────────────────────────────
  const updates = [];
  const missingSpecies = new Map();    // "Species|form" → count
  const movesNotInPool = [];           // { species, league, move, moveId }

  for (const row of rows) {
    const found = findEntry(row.species, row.form || '', pokemonMap);

    if (!found) {
      const key = `${row.species}|${row.form || ''}`;
      missingSpecies.set(key, (missingSpecies.get(key) || 0) + 1);
      continue; // skip — no data to set flags from
    }

    const { entry } = found;

    // Log any move not present in the species' full move pool (name mismatch risk).
    for (const [moveName, label] of [
      [row.fast_move_best,  'fast'],
      [row.charged1_move,   'c1'],
      [row.charged2_move,   'c2'],
    ]) {
      if (!moveName) continue;
      const moveId = displayToMoveId(moveName);
      if (!moveInSet(moveId, entry.allMoves)) {
        movesNotInPool.push({ species: row.species, league: row.league, move: moveName, moveId, slot: label });
      }
    }

    const ff  = getMoveFlags(row.fast_move_best, entry);
    const c1f = getMoveFlags(row.charged1_move,  entry);
    const c2f = getMoveFlags(row.charged2_move,  entry);

    const patch = {};
    if (Boolean(row.fast_move_legacy)    !== ff.isLegacy)    patch.fast_move_legacy    = ff.isLegacy;
    if (Boolean(row.fast_move_elite_tm)  !== ff.isEliteTm)   patch.fast_move_elite_tm  = ff.isEliteTm;
    if (Boolean(row.charged1_legacy)     !== c1f.isLegacy)   patch.charged1_legacy     = c1f.isLegacy;
    if (Boolean(row.charged1_elite_tm)   !== c1f.isEliteTm)  patch.charged1_elite_tm   = c1f.isEliteTm;
    if (Boolean(row.charged2_legacy)     !== c2f.isLegacy)   patch.charged2_legacy     = c2f.isLegacy;
    if (Boolean(row.charged2_elite_tm)   !== c2f.isEliteTm)  patch.charged2_elite_tm   = c2f.isEliteTm;

    if (Object.keys(patch).length > 0) {
      updates.push({ species: row.species, league: row.league, form: row.form || '', patch });
    }
  }

  // ── Step 5: Report diagnostics ────────────────────────────────────────────
  if (missingSpecies.size > 0) {
    console.log(`Species not found in pokemon.json (${missingSpecies.size} unique — skipped, needs manual review):`);
    for (const [key, count] of [...missingSpecies].sort()) {
      const [sp, form] = key.split('|');
      const formStr = form ? ` [${form}]` : '';
      console.log(`  ${sp}${formStr}  (${count} league row${count > 1 ? 's' : ''})`);
    }
    console.log();
  }

  if (movesNotInPool.length > 0) {
    const uniq = [...new Map(movesNotInPool.map(m => [`${m.species}|${m.move}`, m])).values()];
    console.log(`Moves not found in species pool (${uniq.length} unique — may indicate name mismatch):`);
    for (const { species, league, move, moveId, slot } of uniq) {
      console.log(`  ${species} ${league} [${slot}]: "${move}" → ${moveId}`);
    }
    console.log();
  }

  console.log(`${updates.length} rows need flag updates, ${rows.length - missingSpecies.size - (updates.length === 0 ? rows.length - missingSpecies.size : 0)} already correct.\n`);

  // Friendlier already-correct count
  const skippedMissing = [...missingSpecies.values()].reduce((a, b) => a + b, 0);
  const alreadyCorrect = rows.length - skippedMissing - updates.length;
  console.log(`Summary so far: ${rows.length} rows fetched, ${skippedMissing} skipped (species not found), ${alreadyCorrect} already correct, ${updates.length} to update.\n`);

  if (updates.length === 0) {
    console.log('Nothing to update.');
    return;
  }

  // ── Step 6: Preview ───────────────────────────────────────────────────────
  const PREVIEW_MAX = 50;
  console.log(`Rows to update${updates.length > PREVIEW_MAX ? ` (first ${PREVIEW_MAX} of ${updates.length})` : ''}:`);
  for (const u of updates.slice(0, PREVIEW_MAX)) {
    const formStr = u.form ? ` [${u.form}]` : '';
    console.log(`  ${u.species}${formStr} ${u.league}  ${JSON.stringify(u.patch)}`);
  }
  if (updates.length > PREVIEW_MAX) console.log(`  ... and ${updates.length - PREVIEW_MAX} more`);
  console.log();

  if (isDryRun) {
    console.log('[DRY RUN] No changes written.');
    return;
  }

  // ── Step 7: Apply updates ─────────────────────────────────────────────────
  console.log(`Applying ${updates.length} updates...`);
  const leagueStats = {};
  let errors = 0, done = 0;

  for (const { species, league, form, patch } of updates) {
    const formFilter = form ? `&form=eq.${encodeURIComponent(form)}` : `&form=eq.`;
    try {
      await supabaseReq('PATCH',
        `pokemon_moves?species=eq.${encodeURIComponent(species)}&league=eq.${encodeURIComponent(league)}${formFilter}`,
        patch
      );
      leagueStats[league] = (leagueStats[league] || 0) + 1;
    } catch (e) {
      console.error(`\n  Error: ${species} ${league} — ${e.message}`);
      errors++;
    }
    done++;
    if (done % 25 === 0 || done === updates.length) {
      process.stdout.write(`\r  ${done}/${updates.length} processed`);
    }
  }
  console.log();

  // ── Step 8: Summary ───────────────────────────────────────────────────────
  console.log('\n--- Summary ---');
  for (const [league, count] of Object.entries(leagueStats).sort()) {
    console.log(`  ${league}: ${count} rows updated`);
  }
  if (errors > 0) console.log(`  Errors: ${errors}`);
  if (missingSpecies.size > 0) {
    console.log(`  Species not in pokemon.json: ${missingSpecies.size} (see above — review manually)`);
  }
  if (errors === 0) {
    console.log('\nNext: run the coverage query to verify flag counts, then re-run verify-moves-against-pvpoke.js.');
  }
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
