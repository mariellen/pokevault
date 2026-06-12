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
  nick text default null,        -- user-authored nick override; null = no override, '' = "no nick"
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
  const timeout = setTimeout(() => controller.abort(), 15000); // 15 second timeout (mobile networks need more time)

  // Always fetch the current session so RLS sees auth.uid() for authenticated users.
  // Use window.supabaseClient explicitly — const in auth.js is not a window property
  // and may not be visible across classic script boundaries via bare identifier.
  let bearerToken = SUPABASE_KEY;
  try {
    if (window.supabaseClient) {
      const { data } = await window.supabaseClient.auth.getSession();
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
  'catch_date','scan_date','original_scan_date','gender','pvp_tag',
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

  // ── Fix 2a: INSERT-new-then-DELETE-old (no destructive pre-delete) ──────────
  // Previous behaviour DELETE-then-INSERT could wipe the collection if a batch failed.
  // New flow: upsert every row with a single shared run timestamp; only AFTER all batches
  // are confirmed written do we delete rows left with an OLDER imported_at (i.e. Pokémon
  // no longer in the collection — traded away). If any batch fails after retries, we never
  // delete, so the previous cloud save stays intact.
  //
  // NOTE ON SCHEMA: pokemon_collection has a GLOBAL unique index on pokemon_index and POSTs
  // use resolution=merge-duplicates, so re-saving the same Pokémon UPSERTS in place (its
  // imported_at is refreshed to runTimestamp). After a fully-successful upsert pass, any row
  // still carrying an older imported_at for this user is provably a stale row to delete.
  // (If/when the unique key becomes (user_id, pokemon_index), this logic is unchanged.)
  const runTimestamp = new Date().toISOString();

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
    original_scan_date: p.originalScanDate||'',
    gender: p.gender||'',
    pvp_tag: p.pvpTag||'',
    evolved_name_g: p.evolvedNameG||'',
    evolved_name_u: p.evolvedNameU||'',
    evolved_name_l: p.evolvedNameL||'',
    imported_at: runTimestamp,
    user_id: userId
  }));

  // Bounded retry for transient batch failures (timeout / 5xx). supabaseFetch returns null
  // on any failure, so retry up to MAX_BATCH_ATTEMPTS with a short backoff before giving up.
  const MAX_BATCH_ATTEMPTS = 3;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function upsertBatchWithRetry(batch, rowOffset) {
    for (let attempt = 1; attempt <= MAX_BATCH_ATTEMPTS; attempt++) {
      const result = await supabaseFetch('POST', 'pokemon_collection?on_conflict=pokemon_index', batch);
      if (result !== null) return true;
      if (attempt < MAX_BATCH_ATTEMPTS) {
        updateSyncStatus(`Retrying save (batch at row ${rowOffset}, attempt ${attempt + 1})...`, 'warn');
        await sleep(500 * attempt); // 500ms, 1000ms backoff
      }
    }
    return false;
  }

  let saved = 0;
  try {
    // Phase 1 — upsert all new batches. Throw on a batch that fails all retries.
    for (let i = 0; i < slim.length; i += BATCH_SIZE) {
      const batch = slim.slice(i, i + BATCH_SIZE);
      const wroteOk = await upsertBatchWithRetry(batch, i);
      if (!wroteOk) throw new Error('Batch write failed at row ' + i + ' after ' + MAX_BATCH_ATTEMPTS + ' attempts');

      saved += batch.length;

      // Fire-and-forget progress update to sync_sessions (don't await — don't throttle batch loop)
      if (sessionId) {
        supabaseFetch('PATCH', 'sync_sessions?id=eq.' + sessionId, { saved_records: saved });
      }

      updateSyncStatus(`Saving... ${saved}/${slim.length}`, 'ok');
      if (onProgress) onProgress(saved, slim.length);
    }

    // Guard: only proceed to delete-old if EVERY row was written.
    if (saved !== slim.length) {
      throw new Error(`Incomplete write: ${saved}/${slim.length} rows confirmed — old data left intact`);
    }

    // Phase 2 — all new rows are confirmed written. Now (and only now) delete stale rows:
    // this user's rows whose imported_at predates this run. Explicit user_id filter is defense
    // in depth alongside RLS. If this DELETE fails it's non-fatal: the new data is already
    // saved; at worst a few traded-away Pokémon linger until the next successful save.
    const delOld = await supabaseFetch(
      'DELETE',
      'pokemon_collection?user_id=eq.' + userId + '&imported_at=lt.' + encodeURIComponent(runTimestamp),
      null, true
    );
    if (delOld === null) {
      console.warn('Stale-row cleanup failed (non-fatal) — new data is saved; old rows will clear on next save');
    }

    if (sessionId) {
      await supabaseFetch('PATCH', 'sync_sessions?id=eq.' + sessionId, {
        status: 'complete',
        completed_at: new Date().toISOString(),
        saved_records: saved,
      });
    }

    cloudCollectionDate = runTimestamp;
    localStorage.setItem('pokevault_last_cloud_save', cloudCollectionDate);
    localStorage.setItem('pokevault_last_cloud_save_count', slim.length);
    updateSyncStatus('✓ Collection saved to cloud (' + slim.length + ' Pokémon)', 'ok');

  } catch (err) {
    // A batch failed — the old collection was NEVER deleted, so the previous save is intact.
    if (sessionId) {
      await supabaseFetch('PATCH', 'sync_sessions?id=eq.' + sessionId, {
        status: 'failed',
        error_text: err.message,
        saved_records: saved,
      });
    }
    updateSyncStatus('⚠ Cloud save failed at row ' + saved + ' of ' + slim.length +
      ' — your previous cloud save is unchanged. Check F12 console for details.', 'warn');
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
  let data = await supabaseFetch('GET', 'pokemon_overrides?select=*');
  if (data === null) {
    // Retry once after a short delay before declaring offline (handles transient mobile drops)
    await new Promise(r => setTimeout(r, 2000));
    data = await supabaseFetch('GET', 'pokemon_overrides?select=*');
  }
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
    if (!ov) {
      // Override record gone entirely — if this Pokémon previously had a nick
      // override, restore its suggested nick and re-render.
      if (p.nickOverridden && typeof applyNickOverride === 'function') {
        applyNickOverride(p, null, p.suggestedNickname);
        toRerender.push(p);
      }
      return;
    }
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
    // Recompute the suggested nick when a nick-affecting flag changed, then apply
    // the user-authored nick override (if any) on top of it.
    let suggested = (p.suggestedNickname !== undefined) ? p.suggestedNickname : p.nickname;
    if (nickAffected) {
      if (typeof buildNickname === 'function' && typeof getNickSlot === 'function') {
        suggested = buildNickname(p, getNickSlot(p));
      }
    }
    const hadOverride = p.nickOverridden;
    if (typeof applyNickOverride === 'function') {
      applyNickOverride(p, ov, suggested);
    } else if (nickAffected) {
      p.nickname = suggested;
    }
    if (nickAffected || p.nickOverridden || hadOverride) toRerender.push(p);
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

// Save a user-authored nick override with an optimistic local update + rollback.
//   nick === null/undefined → clears the override (suggested nick returns)
//   nick === ''             → a real override meaning "no nick"
//   any other value         → trimmed + truncated to MAX_NICK_LENGTH, then stored
// Returns true on success (or offline), false if a connected write failed (state reverted).
async function saveNickOverride(pokemonIdx, nick) {
  const value = (typeof clampNick === 'function')
    ? clampNick(nick)
    : (nick == null ? null : String(nick).trim().slice(0, 64));

  const p = (typeof allPokemon !== 'undefined' && Array.isArray(allPokemon))
    ? allPokemon.find(x => x.stableKey === pokemonIdx) : null;

  // Snapshot for rollback
  const prevCache = overridesCache[pokemonIdx] ? Object.assign({}, overridesCache[pokemonIdx]) : null;
  const prev = p ? { nickname: p.nickname, suggestedNickname: p.suggestedNickname, nickOverridden: p.nickOverridden } : null;

  // Optimistic local update — Pokémon object
  if (p) {
    if (value !== null) {
      if (p.suggestedNickname === undefined || p.suggestedNickname === null) p.suggestedNickname = p.nickname;
      p.nickname = value;
      p.nickOverridden = true;
    } else {
      if (p.suggestedNickname !== undefined && p.suggestedNickname !== null) p.nickname = p.suggestedNickname;
      p.nickOverridden = false;
    }
  }
  // Optimistic local update — cache (field-level merge, never clobber other fields)
  overridesCache[pokemonIdx] = Object.assign(overridesCache[pokemonIdx] || {}, { nick: value, pokemon_index: pokemonIdx });

  if (!supabaseConnected) { updateSyncStatus('✓ Saved (offline)', 'ok'); return true; }
  const userId = await getCurrentUserId();
  if (!userId) return true;

  const payload = { pokemon_index: pokemonIdx, nick: value, updated_at: new Date().toISOString(), user_id: userId };
  const res = await supabaseFetch('POST', 'pokemon_overrides', payload);
  if (res === null) {
    // Write failed — roll back local state and cache.
    if (prevCache) overridesCache[pokemonIdx] = prevCache; else delete overridesCache[pokemonIdx];
    if (p && prev) { p.nickname = prev.nickname; p.suggestedNickname = prev.suggestedNickname; p.nickOverridden = prev.nickOverridden; }
    updateSyncStatus('⚠ Nick save failed — reverted', 'warn');
    return false;
  }
  updateSyncStatus('✓ Saved', 'ok');
  return true;
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