'use strict';
const supabaseLoader = require('./supabase-loader');

function makePokemon(n) {
  return Array.from({ length: n }, (_, i) => ({
    stableKey: `poke-${i}`,
    name: `Pokemon${i}`,
    form: '', pokeNum: i + 1, cp: 100,
    atkIV: 10, defIV: 10, staIV: 10, ivAvg: 10, level: 20,
    rankPctG: 0, rankPctU: 0, rankPctL: 0,
    rankNumG: null, rankNumU: null, rankNumL: null,
    dustG: 0, dustU: 0, dustL: 0,
    quickMove: '', chargeMove1: '', chargeMove2: '',
    isLucky: false, isShadow: false, isPurified: false, isFavorite: false,
    catchDate: '', pvpTag: '',
    evolvedNameG: '', evolvedNameU: '', evolvedNameL: '',
  }));
}

describe('saveCollectionToCloud — batched write + session tracking', () => {

  it('splits 450 pokemon into batches of 200/200/50', async () => {
    const upsertBatches = [];
    const mockFetch = async (method, path, body) => {
      if (method === 'POST' && path === 'sync_sessions') return [{ id: 'sess-1' }];
      if (method === 'DELETE') return {};
      if (method === 'POST') { upsertBatches.push(body); return {}; }
      return {};
    };

    const { saveCollectionToCloud } = supabaseLoader.createEnv({ supabaseFetch: mockFetch });
    await saveCollectionToCloud(makePokemon(450));

    expect(upsertBatches.length).toBe(3);
    expect(upsertBatches[0].length).toBe(200);
    expect(upsertBatches[1].length).toBe(200);
    expect(upsertBatches[2].length).toBe(50);
  });

  it('calls onProgress after each batch', async () => {
    const progress = [];
    const mockFetch = async (method, path) => {
      if (method === 'POST' && path === 'sync_sessions') return [{ id: 'sess-1' }];
      if (method === 'DELETE') return {};
      return {};
    };

    const { saveCollectionToCloud } = supabaseLoader.createEnv({ supabaseFetch: mockFetch });
    await saveCollectionToCloud(makePokemon(250), (saved, total) => progress.push([saved, total]));

    expect(progress).toEqual([[200, 250], [250, 250]]);
  });

  it('marks session failed and records saved_records if a batch upsert errors', async () => {
    // Fix 2a adds 3 retries per batch — mock must fail ALL attempts for the second batch
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const patches = [];
    const mockFetch = async (method, path, body) => {
      if (method === 'POST' && path === 'sync_sessions') return [{ id: 'sess-1' }];
      if (method === 'DELETE') return {};
      if (method === 'POST') {
        // Fail every attempt whose first item belongs to the second batch (offset >= 200)
        const offset = parseInt((body?.[0]?.pokemon_index || 'poke-0').replace('poke-', ''), 10);
        return offset >= 200 ? null : {};
      }
      if (method === 'PATCH') { patches.push({ path, body }); return {}; }
      return {};
    };

    const { saveCollectionToCloud } = supabaseLoader.createEnv({ supabaseFetch: mockFetch });
    await saveCollectionToCloud(makePokemon(250));
    errSpy.mockRestore();
    warnSpy.mockRestore();

    const failPatch = patches.find(p => p.body.status === 'failed');
    expect(failPatch).toBeDefined();
    expect(failPatch.body.error_text).toBeDefined();
    expect(failPatch.body.saved_records).toBe(200); // first batch wrote, second failed
  });

  it('continues syncing if sync_sessions insert fails (degrade gracefully)', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const upsertBatches = [];
    const mockFetch = async (method, path, body) => {
      if (method === 'POST' && path === 'sync_sessions') return null; // session insert fails
      if (method === 'DELETE') return {};
      if (method === 'POST') { upsertBatches.push(body.length); return {}; }
      return {};
    };

    const { saveCollectionToCloud } = supabaseLoader.createEnv({ supabaseFetch: mockFetch });
    await saveCollectionToCloud(makePokemon(250));
    warnSpy.mockRestore();

    expect(upsertBatches).toEqual([200, 50]);
  });

  it('marks session complete with saved_records after all batches succeed', async () => {
    const patches = [];
    const mockFetch = async (method, path, body) => {
      if (method === 'POST' && path === 'sync_sessions') return [{ id: 'sess-1' }];
      if (method === 'DELETE') return {};
      if (method === 'POST') return {};
      if (method === 'PATCH') { patches.push({ path, body }); return {}; }
      return {};
    };

    const { saveCollectionToCloud } = supabaseLoader.createEnv({ supabaseFetch: mockFetch });
    await saveCollectionToCloud(makePokemon(100));

    const completePatch = patches.find(p => p.body.status === 'complete');
    expect(completePatch).toBeDefined();
    expect(completePatch.body.saved_records).toBe(100);
    expect(completePatch.body.completed_at).toBeDefined();
  });

  it('phase-2 stale-row DELETE failure is non-fatal — upserts still complete and session marked complete', async () => {
    // Fix 2a: the cleanup DELETE (after all upserts) is non-fatal. Upserts must still happen.
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const upsertBatches = [];
    const patches = [];
    const mockFetch = async (method, path, body) => {
      if (method === 'POST' && path === 'sync_sessions') return [{ id: 'sess-1' }];
      if (method === 'DELETE') return null; // phase-2 cleanup DELETE fails (non-fatal)
      if (method === 'POST') { upsertBatches.push(body); return {}; }
      if (method === 'PATCH') { patches.push({ path, body }); return {}; }
      return {};
    };

    const { saveCollectionToCloud } = supabaseLoader.createEnv({ supabaseFetch: mockFetch });
    await saveCollectionToCloud(makePokemon(100));
    warnSpy.mockRestore();

    expect(upsertBatches.length).toBe(1); // upserts still happened
    const completePatch = patches.find(p => p.body.status === 'complete');
    expect(completePatch).toBeDefined(); // session still marked complete
  });

  it('session insert includes correct total_records count', async () => {
    let sessionInsertBody = null;
    const mockFetch = async (method, path, body) => {
      if (method === 'POST' && path === 'sync_sessions') { sessionInsertBody = body; return [{ id: 'sess-1' }]; }
      if (method === 'DELETE') return {};
      return {};
    };

    const { saveCollectionToCloud } = supabaseLoader.createEnv({ supabaseFetch: mockFetch });
    await saveCollectionToCloud(makePokemon(450));

    expect(sessionInsertBody.total_records).toBe(450);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// #41 — evolved_form_g/u/l persistence round-trip
// The form-aware nick (#39) is derived from evolvedFormG/U/L, which on a CSV import
// come from Pokégenie's Form (G/U/L) columns. Cloud save must persist them, and cloud
// load must restore them via the synthetic CSV row (cloudRowToCsvRow), or the nick
// silently degrades to the plain species name after a refresh.
// ─────────────────────────────────────────────────────────────────────────────
describe('#41 — evolved_form persistence', () => {
  const { cloudRowToCsvRow } = require('../js/supabase.js');
  const { analyse } = require('./loader');

  // A Rockruff CP492 row exactly as it would be persisted: Great→Lycanroc/Midday.
  const rockruffDbRow = (over = {}) => ({
    pokemon_index: '744||♀', name: 'Rockruff', form: '', pokemon_num: '744',
    cp: 492, atk_iv: 3, def_iv: 15, sta_iv: 14, iv_avg: 71.1, level: 20, gender: '♀',
    rank_pct_g: 96.83, rank_pct_u: 97.34, rank_pct_l: 91.89,
    evolved_name_g: 'Lycanroc', evolved_name_u: 'Lycanroc', evolved_name_l: 'Rockruff',
    evolved_form_g: 'Midday', evolved_form_u: 'Midday', evolved_form_l: '',
    ...over,
  });

  it('SAVE: evolved_form_g/u/l are written to the upsert payload', async () => {
    const batches = [];
    const mockFetch = async (method, path, body) => {
      if (method === 'POST' && path === 'sync_sessions') return [{ id: 'sess-1' }];
      if (method === 'POST') { batches.push(body); return {}; }
      return {};
    };
    const { saveCollectionToCloud } = supabaseLoader.createEnv({ supabaseFetch: mockFetch });
    await saveCollectionToCloud([{
      stableKey: '744||♀', name: 'Rockruff', form: '', pokeNum: '744', cp: 492,
      atkIV: 3, defIV: 15, staIV: 14, ivAvg: 71.1, level: 20,
      evolvedNameG: 'Lycanroc', evolvedFormG: 'Midday', evolvedFormU: 'Midnight', evolvedFormL: '',
    }]);
    const saved = batches[0][0];
    expect(saved.evolved_form_g).toBe('Midday');
    expect(saved.evolved_form_u).toBe('Midnight');
    expect(saved.evolved_form_l).toBe('');
  });

  it('LOAD MAP: cloudRowToCsvRow restores Form (G/U/L) from evolved_form_* (was hardcoded "")', () => {
    const csv = cloudRowToCsvRow(rockruffDbRow(), 0);
    expect(csv['Form (G)']).toBe('Midday');
    expect(csv['Form (U)']).toBe('Midday');
    expect(csv['Form (L)']).toBe('');
    expect(csv['Name (G)']).toBe('Lycanroc'); // existing behaviour unchanged
  });

  it('LOAD MAP: a form-less Pokémon yields empty Form columns (no regression)', () => {
    const csv = cloudRowToCsvRow({ name: 'Pikachu', pokemon_num: '25' }, 0);
    expect(csv['Form (G)']).toBe('');
    expect(csv['Form (U)']).toBe('');
    expect(csv['Form (L)']).toBe('');
  });

  it('ROUND-TRIP: DB row → cloudRowToCsvRow → analyse restores evolvedFormG (#39 nick survives)', () => {
    const csvRow = cloudRowToCsvRow(rockruffDbRow(), 0);
    const out = analyse([csvRow]);
    const rock = out.pokemon.find(p => p.name === 'Rockruff' && p.cp === 492);
    expect(rock).toBeDefined();
    // Before #41 this was '' on cloud load (Form columns hardcoded), so the form prefix vanished.
    expect(rock.evolvedFormG).toBe('Midday');
    expect(rock.evolvedFormU).toBe('Midday');
  });
});
