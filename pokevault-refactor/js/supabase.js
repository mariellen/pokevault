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

async function supabaseFetch(method, path, body, isDeleteAll) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000); // 8 second timeout
  try {
    const opts = {
      method,
      signal: controller.signal,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': isDeleteAll ? 'count=exact' : method === 'POST' ? 'return=minimal,resolution=merge-duplicates' : 'return=minimal'
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

async function saveCollectionToCloud(pokemon) {
  updateSyncStatus('Saving collection to cloud...', 'ok');
  // Delete existing collection first
  // Delete all rows — use id=gte.0 with Prefer:count=exact to ensure full delete
  const delResult = await supabaseFetch('DELETE', 'pokemon_collection?id=gte.0', null, true);
  if (delResult === null) {
    updateSyncStatus('⚠ Could not clear old collection — check Supabase permissions', 'warn');
    return;
  }
  // Chunk into smaller batches to stay within payload limits
  const BATCH = 100;
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
    pvp_tag: p.pvpTag||'',
    evolved_name_g: p.evolvedNameG||'',
    evolved_name_u: p.evolvedNameU||'',
    evolved_name_l: p.evolvedNameL||'',
    imported_at: new Date().toISOString()
  }));
  let saved = 0;
  for (let i=0; i<slim.length; i+=BATCH) {
    const batch = slim.slice(i, i+BATCH);
    const result = await supabaseFetch('POST', 'pokemon_collection?on_conflict=pokemon_index', batch);
    if (result === null) {
      updateSyncStatus('⚠ Cloud save failed at row '+i+' — check F12 console for details', 'warn');
      console.error('Failed batch:', batch.slice(0,2), '...');
      return;
    }
    saved += batch.length;
    updateSyncStatus(`Saving... ${saved}/${slim.length}`, 'ok');
  }
  cloudCollectionDate = new Date().toISOString();
  localStorage.setItem('pokevault_last_cloud_save', cloudCollectionDate);
  updateSyncStatus('✓ Collection saved to cloud ('+slim.length+' Pokémon)', 'ok');
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
  allPokemon.forEach(p => {
    const ov = overridesCache[p.idx];
    if (!ov) return;
    if (ov.is_shiny) p.isShiny = true;
    if (ov.is_dynamax) p.isDynamax = true;
    if (ov.is_gigantamax) p.isGigantamax = true;
    if (ov.is_costumed) p.isCostumed = true;
    if (ov.vivillon_pattern) p.vivillonPattern = ov.vivillon_pattern;
    if (ov.special_form) p.specialForm = ov.special_form;
    if (ov.manual_decision) p.manualDecision = ov.manual_decision;
    if (ov.notes) p.notes = ov.notes;
  });
}

async function saveOverride(pokemonIdx, fields) {
  overridesCache[pokemonIdx] = Object.assign(overridesCache[pokemonIdx]||{}, fields, {pokemon_index: pokemonIdx});
  if (!supabaseConnected) return;
  const payload = Object.assign({pokemon_index: pokemonIdx, updated_at: new Date().toISOString()}, fields);
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

function updateSyncStatus(msg, type) {
  const el = document.getElementById('sync-status');
  if (!el) return;
  el.textContent = msg;
  el.style.color = type === 'ok' ? 'var(--green)' : type === 'warn' ? 'var(--gold)' : 'var(--red)';
}