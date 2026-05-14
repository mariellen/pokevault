'use strict';
// Round-trip tests: CSV parse → saveCollectionToCloud → loadCollectionFromCloud
// → processCloudRows (DB→CSV mapping) → analyse → verify fields survive intact.
//
// No real Supabase connection — supabaseFetch is mocked to capture writes
// and replay them on read.

const path = require('path');
const { loadCSV } = require('../csvParser');
const { analyse } = require('../loader');
const supabaseLoader = require('../supabase-loader');

const FIXTURE = path.join(__dirname, '..', 'poke_genie_fixture.csv');

// ─── Helpers ────────────────────────────────────────────────────────────────

// Minimal pokemon object with all fields saveCollectionToCloud reads.
function makeTestPokemon(overrides = {}) {
  return {
    stableKey: 'test-glaceon-1',
    name: 'Glaceon',
    form: '',
    pokeNum: '471',
    cp: 1500,
    atkIV: 2, defIV: 9, staIV: 14,
    ivAvg: 55.6,
    level: 20,
    rankPctG: 99.71, rankPctU: 99.07, rankPctL: 0,
    rankNumG: 13, rankNumU: 39, rankNumL: null,
    dustG: 0, dustU: 84400, dustL: 0,
    quickMove: '', chargeMove1: '', chargeMove2: '',
    isLucky: false, isShadow: false, isPurified: false, isFavorite: true,
    catchDate: '2025-01-01',
    scanDate: '2026-05-10 10:47',
    pvpTag: '',
    evolvedNameG: 'Glaceon', evolvedNameU: 'Glaceon', evolvedNameL: '',
    ...overrides,
  };
}

// Creates a supabaseFetch mock that stores all upserted records in `written`
// and returns them verbatim on GET.
function makeMockEnv() {
  const written = [];

  const supabaseFetch = async (method, url, body) => {
    if (method === 'POST' && url.includes('sync_sessions')) return [{ id: 'sess-1' }];
    if (method === 'DELETE') return {};
    if (method === 'PATCH')  return {};
    if (method === 'POST' && Array.isArray(body)) { written.push(...body); return {}; }
    if (method === 'GET')    return written.slice();
    return {};
  };

  const env = supabaseLoader.createEnv({ supabaseFetch });
  return { ...env, written };
}

// Replicates the processCloudRows() DB→CSV-column mapping from app.js.
// Keeps this copy in sync with app.js manually — the schema test guards the field list.
function dbRowToCSVRow(r) {
  return {
    'Index':              r.pokemon_index,
    'Name':               r.name,
    'Form':               r.form || '',
    'Pokemon Number':     r.pokemon_num || '',
    'CP':                 String(r.cp || 0),
    'HP':                 '0',
    'Atk IV':             String(r.atk_iv || 0),
    'Def IV':             String(r.def_iv || 0),
    'Sta IV':             String(r.sta_iv || 0),
    'IV Avg':             String(r.iv_avg || 0),
    'Level Min':          String(r.level || 0),
    'Level Max':          String(r.level || 0),
    'Quick Move':         r.quick_move || '',
    'Charge Move':        r.charge_move1 || '',
    'Charge Move 2':      r.charge_move2 || '',
    'Lucky':              r.is_lucky ? '1' : '0',
    'Shadow/Purified':    r.is_shadow ? '1' : r.is_purified ? '2' : '0',
    'Favorite':           r.is_favorite ? '1' : '0',
    'Catch Date':         r.catch_date || '',
    'Scan Date':          r.scan_date || '',
    'Original Scan Date': r.original_scan_date || '',
    'Marked for PvP use': r.pvp_tag || '',
    'Rank % (G)':         r.rank_pct_g ? r.rank_pct_g + '%' : '',
    'Rank % (U)':         r.rank_pct_u ? r.rank_pct_u + '%' : '',
    'Rank % (L)':         r.rank_pct_l ? r.rank_pct_l + '%' : '',
    'Rank # (G)':         String(r.rank_num_g || ''),
    'Rank # (U)':         String(r.rank_num_u || ''),
    'Rank # (L)':         String(r.rank_num_l || ''),
    'Dust Cost (G)':      String(r.dust_g || ''),
    'Dust Cost (U)':      String(r.dust_u || ''),
    'Dust Cost (L)':      String(r.dust_l || ''),
    'Name (G)':           r.evolved_name_g || '',
    'Name (U)':           r.evolved_name_u || '',
    'Name (L)':           r.evolved_name_l || '',
    'Form (G)': '', 'Form (U)': '', 'Form (L)': '',
    'Sha/Pur (G)': '0', 'Sha/Pur (U)': '0', 'Sha/Pur (L)': '0',
    'Stat Prod (G)': '', 'Stat Prod (U)': '', 'Stat Prod (L)': '',
    'Candy Cost (G)': '', 'Candy Cost (U)': '', 'Candy Cost (L)': '',
    'Weight': '', 'Height': '', 'Dust': '0', 'Gender': '',
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Parse phase: analyse() produces scanDate from CSV', () => {
  let parsed;

  beforeAll(() => {
    const rows = loadCSV(FIXTURE);
    const result = analyse(rows);
    parsed = result.pokemon;
  });

  it('fixture pokemon have scanDate populated', () => {
    const withScan = parsed.filter(p => p.scanDate);
    expect(withScan.length).toBeGreaterThan(0);
  });

  it('scanDate format is YYYY-MM-DD HH:MM (not catch date format)', () => {
    const p = parsed.find(p => p.scanDate);
    expect(p.scanDate).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
  });

  it('scanDate and catchDate are distinct fields', () => {
    const p = parsed.find(p => p.scanDate && p.catchDate);
    if (!p) return; // fixture may not have both; test is still registered
    expect(p.scanDate).not.toBe(p.catchDate);
  });
});

describe('Save phase: saveCollectionToCloud() writes scan_date correctly', () => {
  let written;

  beforeAll(async () => {
    const env = makeMockEnv();
    const pokemon = [makeTestPokemon({ scanDate: '2026-05-10 10:47' })];
    await env.saveCollectionToCloud(pokemon);
    written = env.written;
  });

  it('writes at least one record', () => {
    expect(written.length).toBe(1);
  });

  it('scan_date is written and non-empty', () => {
    expect(written[0].scan_date).toBe('2026-05-10 10:47');
  });

  it('scan_date is not an empty string', () => {
    expect(written[0].scan_date).not.toBe('');
  });

  it('all COLLECTION_DB_FIELDS are present in the written record', () => {
    const { COLLECTION_DB_FIELDS } = require('../../js/supabase.js');
    const missing = COLLECTION_DB_FIELDS.filter(f => !(f in written[0]));
    expect(missing).toEqual([]);
  });

  it('pokemon_index is set from stableKey', () => {
    expect(written[0].pokemon_index).toBe('test-glaceon-1');
  });

  it('is_favorite is written as boolean', () => {
    expect(written[0].is_favorite).toBe(true);
  });
});

describe('Load phase: dbRowToCSVRow() maps snake_case back to CSV column names', () => {
  const dbRow = {
    pokemon_index: 'test-glaceon-1',
    name: 'Glaceon',
    form: '',
    pokemon_num: '471',
    cp: 1500,
    atk_iv: 2, def_iv: 9, sta_iv: 14,
    iv_avg: 55.6,
    level: 20,
    rank_pct_g: 99.71, rank_pct_u: 99.07, rank_pct_l: 0,
    rank_num_g: 13, rank_num_u: 39, rank_num_l: null,
    dust_g: 0, dust_u: 84400, dust_l: 0,
    quick_move: '', charge_move1: '', charge_move2: '',
    is_lucky: false, is_shadow: false, is_purified: false, is_favorite: true,
    catch_date: '2025-01-01',
    scan_date: '2026-05-10 10:47',
    original_scan_date: '',
    pvp_tag: '',
    evolved_name_g: 'Glaceon', evolved_name_u: 'Glaceon', evolved_name_l: '',
    imported_at: '2026-05-10T10:47:00.000Z',
    user_id: 'test-user-id',
  };

  it('scan_date maps to "Scan Date" column', () => {
    const row = dbRowToCSVRow(dbRow);
    expect(row['Scan Date']).toBe('2026-05-10 10:47');
  });

  it('catch_date maps to "Catch Date" column', () => {
    const row = dbRowToCSVRow(dbRow);
    expect(row['Catch Date']).toBe('2025-01-01');
  });

  it('is_shadow maps to Shadow/Purified = "1"', () => {
    const row = dbRowToCSVRow({ ...dbRow, is_shadow: true });
    expect(row['Shadow/Purified']).toBe('1');
  });

  it('reconstruct CSVrow → analyse → scanDate survives', () => {
    const csvRow = dbRowToCSVRow(dbRow);
    const result = analyse([csvRow]);
    expect(result.pokemon[0].scanDate).toBe('2026-05-10 10:47');
  });
});

describe('Full round-trip: CSV parse → mock save → mock load → re-analyse', () => {
  const SCAN_DATE = '2026-05-10 10:47';
  let roundTrippedPokemon;

  beforeAll(async () => {
    const env = makeMockEnv();
    const input = [makeTestPokemon({ scanDate: SCAN_DATE })];

    // Save
    await env.saveCollectionToCloud(input);

    // Load (mock returns what was written)
    const dbRows = await env.loadCollectionFromCloud();

    // Re-analyse via processCloudRows mapping
    const csvRows = dbRows.map(dbRowToCSVRow);
    const result = analyse(csvRows);
    roundTrippedPokemon = result.pokemon;
  });

  it('round-trip produces at least one pokemon', () => {
    expect(roundTrippedPokemon.length).toBe(1);
  });

  it('scanDate survives the full round-trip', () => {
    expect(roundTrippedPokemon[0].scanDate).toBe(SCAN_DATE);
  });

  it('name survives the round-trip', () => {
    expect(roundTrippedPokemon[0].name).toBe('Glaceon');
  });

  it('cp survives the round-trip', () => {
    expect(roundTrippedPokemon[0].cp).toBe(1500);
  });
});

describe('Edge cases', () => {
  it('pokemon with no scanDate writes empty string, not undefined', async () => {
    const env = makeMockEnv();
    await env.saveCollectionToCloud([makeTestPokemon({ scanDate: '' })]);
    expect(env.written[0].scan_date).toBe('');
    expect(env.written[0].scan_date).not.toBeUndefined();
  });

  it('pokemon with scanDate = "2026-05-10 10:47" round-trips exactly', async () => {
    const env = makeMockEnv();
    const input = [makeTestPokemon({ scanDate: '2026-05-10 10:47' })];
    await env.saveCollectionToCloud(input);
    const dbRows = await env.loadCollectionFromCloud();
    const csvRows = dbRows.map(dbRowToCSVRow);
    const result = analyse(csvRows);
    expect(result.pokemon[0].scanDate).toBe('2026-05-10 10:47');
  });
});
