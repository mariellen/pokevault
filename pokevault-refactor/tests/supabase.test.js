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
    let batchCount = 0;
    const patches = [];
    const mockFetch = async (method, path, body) => {
      if (method === 'POST' && path === 'sync_sessions') return [{ id: 'sess-1' }];
      if (method === 'DELETE') return {};
      if (method === 'POST') { batchCount++; return batchCount === 2 ? null : {}; }
      if (method === 'PATCH') { patches.push({ path, body }); return {}; }
      return {};
    };

    const { saveCollectionToCloud } = supabaseLoader.createEnv({ supabaseFetch: mockFetch });
    await saveCollectionToCloud(makePokemon(250));

    const failPatch = patches.find(p => p.body.status === 'failed');
    expect(failPatch).toBeDefined();
    expect(failPatch.body.error_text).toBeDefined();
    expect(failPatch.body.saved_records).toBe(200); // first batch wrote, second failed
  });

  it('continues syncing if sync_sessions insert fails (degrade gracefully)', async () => {
    const upsertBatches = [];
    const mockFetch = async (method, path, body) => {
      if (method === 'POST' && path === 'sync_sessions') return null; // session insert fails
      if (method === 'DELETE') return {};
      if (method === 'POST') { upsertBatches.push(body.length); return {}; }
      return {};
    };

    const { saveCollectionToCloud } = supabaseLoader.createEnv({ supabaseFetch: mockFetch });
    await saveCollectionToCloud(makePokemon(250));

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

  it('aborts if pre-sync DELETE fails — does not write on top of stale data', async () => {
    const upsertBatches = [];
    const mockFetch = async (method, path, body) => {
      if (method === 'POST' && path === 'sync_sessions') return [{ id: 'sess-1' }];
      if (method === 'DELETE') return null; // DELETE fails
      if (method === 'POST') { upsertBatches.push(body); return {}; }
      return {};
    };

    const { saveCollectionToCloud } = supabaseLoader.createEnv({ supabaseFetch: mockFetch });
    await saveCollectionToCloud(makePokemon(100));

    expect(upsertBatches.length).toBe(0);
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
