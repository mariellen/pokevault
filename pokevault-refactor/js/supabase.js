// ═══════════════════════════════════════════════
// PokéVault — Supabase Cloud Storage
// ═══════════════════════════════════════════════
'use strict';

// ═══════════════════════════════════════════════
// SUPABASE CLOUD STORAGE
// Table setup SQL (run once in Supabase SQL editor):
/*
create table if not exists pokemon_overrides (
  id bigserial primary key,
  pokemon_index text unique not null,
  is_shiny boolean default false,
  is_dynamax boolean default false,
  is_gigantamax boolean default false,
  vivillon_pattern text default '',
  special_form text default '',
  is_costumed boolean default false,
  manual_decision text default '',
  notes text default '',
  updated_at timestamptz default now()
);
alter table pokemon_overrides disable row level security;
*/
// ═══════════════════════════════════════════════



// In-memory cache of overrides loaded from Supabase
let overridesCache = {};
let supabaseConnected = false;

async function supabaseFetch(method, path, body, isDeleteAll, prefer) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000); // 8 second timeout

  // Always fetch the current session so RLS sees auth.uid() for authenticated users.
  // Use window.supabaseClient explicitly — const in auth.js is not a window property
  // and may not be visible across classic script boundaries via bare identifier.
  let bearerToken = SUPABASE_KEY;
  try {
    if (window.supabaseClient) {
      const { data } = await window.supabaseClient.auth.getSession();
      // TEMP DEBUG — remove after auth is confirmed working
      console.log('[supabaseFetch]', method, path.split('?')[0],
        '| session:', data?.session ? 'EXISTS' : 'NULL',
        '| token prefix:', data?.session?.access_token?.substring(0, 20) || 'none',
        '| uid:', data?.session?.user?.id || 'none');
      if (data?.session?.access_token) bearerToken = data.session.access_token;
    } else {
      console.warn('[supabaseFetch] window.supabaseClient not ready — using anon key');
    }
  } catch (_) { /* leave as anon key */ }

  try {
    const opts = {
      method,
      signal: controller.signal,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + bearerToken,
        'Content-Type': 'application/json',
        'Prefer': prefer || (isDeleteAll ? 'count=exact' : method === 'POST' ? 'return=minimal,resolution=merge-duplicates' : 'return=minimal')
      }
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, opts);
    clearTimeout(timeout);
    if (!res.ok) {
      const errText = await res.text();
      throw new Error('HTTP ' + res.status + ' — ' + errText.slice(0,200));
    }
    if (res.status === 204) return {};
    const text = await res.text();
    return text ? JSON.parse(text) : {};
  } catch(e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') {
      console.warn('Supabase timeout — project may be paused. Visit supabase.com to wake it.');
      updateSyncStatus('⚠ Cloud timeout — Supabase may be paused. Visit supabase.com to wake it.', 'warn');
    } else {
      console.warn('Supabase error:', e.message);
    }
    return null;
  }
}

// Collection sync state
let cloudCollectionDate = null;

const BATCH_SIZE = 200;

// Explicit list of fields written to pokemon_collection — used by schema validation tests
const COLLECTION_DB_FIELDS = [
  'pokemon_index','name','form','pokemon_num','cp','atk_iv','def_iv','sta_iv','iv_avg','level',
  'rank_pct_g','rank_pct_u','rank_pct_l','rank_num_g','rank_num_u','rank_num_l',
  'dust_g','dust_u','dust_l','quick_move','charge_move1','charge_move2',
  'is_lucky','is_shadow','is_purified','is_favorite',
  'catch_date','scan_date','pvp_tag',
  'evolved_name_g','evolved_name_u','evolved_name_l',
  'imported_at','user_id'
];
if (typeof module !== 'undefined') module.exports = { COLLECTION_DB_FIELDS };

async function saveCollectionToCloud(pokemon, onProgress) {
  const userId = await getCurrentUserId();
  if (!userId) {
    updateSyncStatus('Sign in to save your collection', 'warn');
    return;
  }
  updateSyncStatus('Saving collection to cloud...', 'ok');

  // Cheap hash for dedup — Phase 2c upgrades to real SHA-256 via Web Crypto API
  const csvHash = `${pokemon.length}:${pokemon[0]?.stableKey}:${pokemon[pokemon.length-1]?.stableKey}`;

  // Create sync session — degrade gracefully if it fails
  let sessionId = null;
  const sessionRows = await supabaseFetch('POST', 'sync_sessions', {
    user_id: userId,
    total_records: pokemon.length,
    status: 'in_progress',
    csv_hash: csvHash,
  }, false, 'return=representation');
  if (sessionRows === null) {
    console.warn('sync_sessions insert failed — continuing without session tracking');
  } else {
    sessionId = Array.isArray(sessionRows) ? (sessionRows[0]?.id ?? null) : null;
  }

  // Delete existing collection first
  const delResult = await supabaseFetch('DELETE', 'pokemon_collection?id=gte.0', null, true);
  if (delResult === null) {
    updateSyncStatus('⚠ Could not clear old collection — check Supabase permissions', 'warn');
    if (sessionId) {
      supabaseFetch('PATCH', 'sync_sessions?id=eq.' + sessionId, { status: 'failed', error_text: 'DELETE failed' });
    }
    return;
  }

  const slim = pokemon.map(p => ({
    pokemon_index: p.stableKey,
    name: p.name,
    form: p.form||'',
    pokemon_num: p.pokeNum||'',
    cp: p.cp||0,
    atk_iv: p.atkIV||0,
    def_iv: p.defIV||0,
    sta_iv: p.staIV||0,
    iv_avg: p.ivAvg||0,
    level: p.level||0,
    rank_pct_g: p.rankPctG||0,
    rank_pct_u: p.rankPctU||0,
    rank_pct_l: p.rankPctL||0,
    rank_num_g: p.rankNumG||null,
    rank_num_u: p.rankNumU||null,
    rank_num_l: p.rankNumL||null,
    dust_g: p.dustG||0,
    dust_u: p.dustU||0,
    dust_l: p.dustL||0,
    quick_move: p.quickMove||'',
    charge_move1: p.chargeMove1||'',
    charge_move2: p.chargeMove2||'',
    is_lucky: p.isLucky||false,
    is_shadow: p.isShadow||false,
    is_purified: p.isPurified||false,
    is_favorite: p.isFavorite||false,
    catch_date: p.catchDate||'',
    scan_date: p.scanDate||'',
    pvp_tag: p.pvpTag||'',
    evolved_name_g: p.evolvedNameG||'',
    evolved_name_u: p.evolvedNameU||'',
    evolved_name_l: p.evolvedNameL||'',
    imported_at: new Date().toISOString(),
    user_id: userId
  }));

  let saved = 0;
  try {
    for (let i = 0; i < slim.length; i += BATCH_SIZE) {
      const batch = slim.slice(i, i + BATCH_SIZE);
      const result = await supabaseFetch('POST', 'pokemon_collection?on_conflict=pokemon_index', batch);
      if (result === null) throw new Error('Batch write failed at row ' + i);

      saved += batch.length;

      // Fire-and-forget progress update to sync_sessions (don't await — don't throttle batch loop)
      if (sessionId) {
        supabaseFetch('PATCH', 'sync_sessions?id=eq.' + sessionId, { saved_records: saved });
      }

      updateSyncStatus(`Saving... ${saved}/${slim.length}`, 'ok');
      if (onProgress) onProgress(saved, slim.length);
    }

    if (sessionId) {
      await supabaseFetch('PATCH', 'sync_sessions?id=eq.' + sessionId, {
        status: 'complete',
        completed_at: new Date().toISOString(),
        saved_records: saved,
      });
    }

    cloudCollectionDate = new Date().toISOString();
    localStorage.setItem('pokevault_last_cloud_save', cloudCollectionDate);
    localStorage.setItem('pokevault_last_cloud_save_count', slim.length);
    updateSyncStatus('✓ Collection saved to cloud (' + slim.length + ' Pokémon)', 'ok');

  } catch (err) {
    if (sessionId) {
      await supabaseFetch('PATCH', 'sync_sessions?id=eq.' + sessionId, {
        status: 'failed',
        error_text: err.message,
        saved_records: saved,
      });
    }
    updateSyncStatus('⚠ Cloud save failed at row ' + saved + ' — check F12 console for details', 'warn');
    console.error('saveCollectionToCloud error:', err);
  }
}

async function loadCollectionFromCloud() {
  updateSyncStatus('Loading collection from cloud...', 'ok');
  // Load in batches using range headers
  let all = [], offset = 0;
  const BATCH = 1000;
  while(true) {
    const data = await supabaseFetch('GET',
      `pokemon_collection?select=*&order=pokemon_index&limit=${BATCH}&offset=${offset}`);
    if (!data || !data.length) break;
    all = all.concat(data);
    offset += data.length;
    if (data.length < BATCH) break;
  }
  if (!all.length) {
    updateSyncStatus('No cloud collection found — import a CSV', 'warn');
    return false;
  }
  updateSyncStatus(`✓ Loaded ${all.length} Pokémon from cloud`, 'ok');
  return all;
}

async function checkCloudCollection() {
  // Check if cloud has data
  const data = await supabaseFetch('GET', 'pokemon_collection?select=count&limit=1');
  if (data && data.length > 0) {
    return true;
  }
  return false;
}

async function loadOverrides() {
  const data = await supabaseFetch('GET', 'pokemon_overrides?select=*');
  if (data === null) {
    supabaseConnected = false;
    // Don't overwrite timeout message if already set
    const current = document.getElementById('sync-status')?.textContent || '';
    if (!current.includes('timeout')) {
      updateSyncStatus('⚠ Cloud unavailable — working offline', 'warn');
    }
    return;
  }
  supabaseConnected = true;
  // Show cloud load button if upload section is visible
  const cloudBtn = document.getElementById('cloudLoadBtn');
  if (cloudBtn) {
    // Check if cloud has collection data
    const hasCloud = await supabaseFetch('GET', 'pokemon_collection?select=pokemon_index&limit=1');
    if (hasCloud && hasCloud.length > 0) {
      cloudBtn.style.display = 'inline-block';
      const status = document.getElementById('cloud-load-status');
      if (status) status.textContent = 'Cloud collection available — or import a new CSV above';
    }
  }
  overridesCache = {};
  data.forEach(row => { overridesCache[row.pokemon_index] = row; });
  updateSyncStatus('✓ Synced — ' + data.length + ' overrides loaded', 'ok');
  // Apply overrides to already-loaded pokemon
  if (allPokemon.length) applyOverridesToPokemon();
}

function applyOverridesToPokemon() {
  const toRerender = [];
  allPokemon.forEach(p => {
    const ov = overridesCache[p.stableKey];
    if (!ov) return;
    const nickAffected = ov.is_shiny || ov.is_dynamax || ov.is_gigantamax
                      || ov.special_form || ov.vivillon_pattern;
    if (ov.is_shiny) { p.isShiny = true; if (!p.slots.includes('shiny')) p.slots.push('shiny'); }
    if (ov.is_dynamax) {
      p.isDynamax = true;
      if (!p.slots.includes('dynamax')) p.slots.push('dynamax');
      if (!['keep','protected'].includes(p.decision)) p.decision = 'keep';
    }
    if (ov.is_gigantamax) {
      p.isGigantamax = true;
      if (!p.slots.includes('gigantamax')) p.slots.push('gigantamax');
      if (!['keep','protected'].includes(p.decision)) p.decision = 'keep';
    }
    if (ov.is_costumed) p.isCostumed = true;
    if (ov.vivillon_pattern) p.vivillonPattern = ov.vivillon_pattern;
    if (ov.special_form) p.specialForm = ov.special_form;
    if (ov.manual_decision) p.manualDecision = ov.manual_decision;
    if (ov.notes) p.notes = ov.notes;
    if (nickAffected) toRerender.push(p);
  });
  // Re-render rows where nick-affecting overrides were applied
  toRerender.forEach(p => {
    const tr = document.querySelector(`tr[data-idx="${p.idx}"]`);
    if (!tr || typeof buildRow !== 'function') return;
    const ovRow = tr.nextElementSibling;
    const tmp = document.createElement('tbody');
    tmp.innerHTML = buildRow(p);
    const [newTr, newOvRow] = tmp.children;
    if (newTr) tr.replaceWith(newTr);
    if (ovRow && ovRow.classList.contains('override-row') && newOvRow) ovRow.replaceWith(newOvRow);
  });
  // Reconcile duplicate shiny decisions now that isShiny flags are correct
  if (typeof reconcileShinyDecisions === 'function') reconcileShinyDecisions(allPokemon);
  // Re-render dex modal if open — overrides affect shiny/dmax/gmax counts in the dex view
  const dexModal = document.getElementById('dex-modal');
  if (dexModal && dexModal.style.display !== 'none' && typeof renderDexModal === 'function') {
    renderDexModal();
  }
}

async function saveOverride(pokemonIdx, fields) {
  overridesCache[pokemonIdx] = Object.assign(overridesCache[pokemonIdx]||{}, fields, {pokemon_index: pokemonIdx});
  if (!supabaseConnected) return;
  const userId = await getCurrentUserId();
  if (!userId) return;
  const payload = Object.assign({pokemon_index: pokemonIdx, updated_at: new Date().toISOString(), user_id: userId}, fields);
  await supabaseFetch('POST', 'pokemon_overrides', payload);
  updateSyncStatus('✓ Saved', 'ok');
}

async function deleteOverride(pokemonIdx) {
  delete overridesCache[pokemonIdx];
  if (!supabaseConnected) return;
  await supabaseFetch('DELETE', 'pokemon_overrides?pokemon_index=eq.' + encodeURIComponent(pokemonIdx));
}

// ═══════════════════════════════════════════════
// EVOLUTION CHAINS
// ═══════════════════════════════════════════════

let evolutionChainsBySpecies = {}; // species_name → row
let evolutionChainsByChainId = {}; // chain_id → [rows]
let evolutionChainsLoaded = false;

async function loadEvolutionChains() {
  // Fetch all rows (table has ~1500 rows — one request is fine)
  const data = await supabaseFetch('GET', 'evolution_chains?select=*&limit=2000&order=chain_id,stage');
  if (!data || !data.length) return;
  evolutionChainsBySpecies = {};
  evolutionChainsByChainId = {};
  for (const row of data) {
    evolutionChainsBySpecies[row.species_name] = row;
    if (!evolutionChainsByChainId[row.chain_id]) evolutionChainsByChainId[row.chain_id] = [];
    evolutionChainsByChainId[row.chain_id].push(row);
  }
  evolutionChainsLoaded = true;
  // Re-render families so +Fam buttons show full chains (e.g. Tyrunt → Tyrantrum)
  if (typeof allPokemon !== 'undefined' && allPokemon.length && typeof applyFilters === 'function') {
    applyFilters();
  }
}

// Returns all species names in the same evolution chain as speciesName.
// Standalone species (e.g. Kleavor) return only themselves.
// Returns null if chain data not yet loaded or species not found.
function getFullFamily(speciesName) {
  if (!evolutionChainsLoaded) return null;
  const row = evolutionChainsBySpecies[speciesName];
  if (!row) return null;
  if (row.is_standalone) return [speciesName];
  const chain = evolutionChainsByChainId[row.chain_id] || [];
  return chain.filter(r => !r.is_standalone).map(r => r.species_name);
}

// Returns the pokemon_moves row for species+league, including last_verified_at.
// league: 'Great'|'Ultra'|'Master'|'Little' or code 'G'|'U'|'M'|'L'.
// Returns null if not found or Supabase unavailable.
async function getMovesWithFreshness(species, league) {
  const leagueCode = { 'Great': 'G', 'Ultra': 'U', 'Master': 'M', 'Little': 'L' }[league] || league;
  const data = await supabaseFetch('GET',
    `pokemon_moves?species=eq.${encodeURIComponent(species)}&league=eq.${encodeURIComponent(leagueCode)}&select=*&limit=1`
  );
  return data?.[0] || null;
}

function updateSyncStatus(msg, type) {
  const el = document.getElementById('sync-status');
  if (!el) return;
  el.textContent = msg;
  el.style.color = type === 'ok' ? 'var(--green)' : type === 'warn' ? 'var(--gold)' : 'var(--red)';
}