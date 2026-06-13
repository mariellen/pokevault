'use strict';
// Nick Override (inline editing) — TDD test suite for brief nick-override v3.5.48.
// Covers the 10 Required Tests from the Opus pre-implementation review.
//
//  1. Set override          5. Max-length enforcement   9. Write-failure rollback
//  2. CSV-survival          6. XSS escaping             10. Authz (payload carries user_id)
//  3. Reset                 7. Esc cancels
//  4. Empty-string vs null  8. Per-Pokémon isolation
//
// Run with: npx jest tests/nick-override.test.js

const path = require('path');
const loader = require('./loader');
const renderLoader = require('./render-loader');
const supabaseLoader = require('./supabase-loader');
const nickEditLoader = require('./nick-edit-loader');
const { loadCSV } = require('./csvParser');

const { analyse, applyNickOverride, clampNick, MAX_NICK_LENGTH } = loader;
const FIXTURE_PATH = path.join(__dirname, 'poke_genie_fixture.csv');

// ════════════════════════════════════════════════════════════════════
// clampNick — sanitisation primitive (max-length + null/empty distinction)
// ════════════════════════════════════════════════════════════════════
describe('clampNick — sanitisation', () => {
  it('exposes a max length of 64 (GO is 12, headroom for Pokégenie conventions)', () => {
    expect(MAX_NICK_LENGTH).toBe(64);
  });

  it('(5) truncates input exceeding the max length to MAX_NICK_LENGTH', () => {
    const long = 'A'.repeat(200);
    const out = clampNick(long);
    expect(out.length).toBe(MAX_NICK_LENGTH);
    expect(out).toBe('A'.repeat(MAX_NICK_LENGTH));
  });

  it('(4) null/undefined clear the override (return null), empty string is a real override', () => {
    expect(clampNick(null)).toBeNull();
    expect(clampNick(undefined)).toBeNull();
    expect(clampNick('')).toBe('');          // distinct from null — "no nick" override
    expect(clampNick('   ')).toBe('');        // whitespace-only trims to the empty override
  });

  it('trims surrounding whitespace but keeps the inner value', () => {
    expect(clampNick('  Sparky  ')).toBe('Sparky');
  });
});

// ════════════════════════════════════════════════════════════════════
// applyNickOverride — post-derivation merge (pure)
// ════════════════════════════════════════════════════════════════════
describe('applyNickOverride — merge override onto suggested nick', () => {
  it('(1) applies an override nick and flags it as overridden, preserving the suggested nick', () => {
    const p = { nickname: 'GengarⓊ95' };
    applyNickOverride(p, { nick: 'MyGhost' }, 'GengarⓊ95');
    expect(p.nickname).toBe('MyGhost');
    expect(p.nickOverridden).toBe(true);
    expect(p.suggestedNickname).toBe('GengarⓊ95');
  });

  it('(3) reset (nick:null) restores the suggested nick and clears the flag', () => {
    const p = { nickname: 'GengarⓊ95' };
    applyNickOverride(p, { nick: 'MyGhost' }, 'GengarⓊ95');
    applyNickOverride(p, { nick: null }, 'GengarⓊ95');
    expect(p.nickname).toBe('GengarⓊ95');
    expect(p.nickOverridden).toBe(false);
  });

  it('(3) no override record at all uses the suggested nick', () => {
    const p = { nickname: 'GengarⓊ95' };
    applyNickOverride(p, undefined, 'GengarⓊ95');
    expect(p.nickname).toBe('GengarⓊ95');
    expect(p.nickOverridden).toBe(false);
  });

  it('(4) empty-string override is honoured (renders as empty nick), NOT treated as no-override', () => {
    const p = { nickname: 'GengarⓊ95' };
    applyNickOverride(p, { nick: '' }, 'GengarⓊ95');
    expect(p.nickname).toBe('');
    expect(p.nickOverridden).toBe(true);
  });

  it('(5) clamps an over-long override at apply time', () => {
    const p = { nickname: 'X' };
    applyNickOverride(p, { nick: 'B'.repeat(120) }, 'X');
    expect(p.nickname.length).toBe(MAX_NICK_LENGTH);
  });
});

// ════════════════════════════════════════════════════════════════════
// analyse() pipeline — override is applied post-derivation & survives reload
// ════════════════════════════════════════════════════════════════════
describe('analyse() — nick override integration', () => {
  let baseResult;
  beforeAll(() => { baseResult = analyse(loadCSV(FIXTURE_PATH)); });

  it('(1) a pokemon with a nick override renders the custom nick + overridden flag', () => {
    const target = baseResult.pokemon[0];
    const suggested = target.nickname;
    const ov = loader.createWithOverrides({ [target.stableKey]: { nick: 'CUSTOM!' } });
    const res = ov.analyse(loadCSV(FIXTURE_PATH));
    const p = res.pokemon.find(x => x.stableKey === target.stableKey);
    expect(p.nickname).toBe('CUSTOM!');
    expect(p.nickOverridden).toBe(true);
    expect(p.suggestedNickname).toBe(suggested);
  });

  it('(2) CSV-survival — override is re-applied over the recomputed suggested nick on a fresh upload', () => {
    const target = baseResult.pokemon[0];
    const ov = loader.createWithOverrides({ [target.stableKey]: { nick: 'StickyNick' } });
    // Simulate two separate CSV uploads with the same override cache.
    const first = ov.analyse(loadCSV(FIXTURE_PATH));
    const second = ov.analyse(loadCSV(FIXTURE_PATH));
    for (const res of [first, second]) {
      const p = res.pokemon.find(x => x.stableKey === target.stableKey);
      expect(p.nickname).toBe('StickyNick');
      expect(p.nickOverridden).toBe(true);
    }
  });

  it('(8) per-Pokémon isolation — override on A leaves B (different stableKey) untouched', () => {
    const a = baseResult.pokemon[0];
    const b = baseResult.pokemon.find(x => x.stableKey !== a.stableKey);
    expect(b).toBeDefined();
    const bSuggested = b.nickname;
    const ov = loader.createWithOverrides({ [a.stableKey]: { nick: 'OnlyA' } });
    const res = ov.analyse(loadCSV(FIXTURE_PATH));
    const pa = res.pokemon.find(x => x.stableKey === a.stableKey);
    const pb = res.pokemon.find(x => x.stableKey === b.stableKey);
    expect(pa.nickname).toBe('OnlyA');
    expect(pb.nickname).toBe(bSuggested);
    expect(pb.nickOverridden).toBe(false);
  });

  it('(3) clearing the override (no nick field) yields the plain suggested nick', () => {
    const target = baseResult.pokemon[0];
    const ov = loader.createWithOverrides({ [target.stableKey]: { manual_decision: '' } });
    const res = ov.analyse(loadCSV(FIXTURE_PATH));
    const p = res.pokemon.find(x => x.stableKey === target.stableKey);
    expect(p.nickname).toBe(target.nickname);
    expect(p.nickOverridden).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════
// render — distinct indicator + XSS escaping
// ════════════════════════════════════════════════════════════════════
describe('render — buildRow nick cell', () => {
  const makeP = (over) => ({
    idx: 1, stableKey: 'k1', name: 'Gengar', form: '', cp: 1500,
    nickname: over ? over.nickname : 'GengarⓊ95',
    nickOverridden: !!over, suggestedNickname: 'GengarⓊ95',
    atkIV: 15, defIV: 14, staIV: 15, ivAvg: 98, decision: 'keep',
    slots: ['U'], rankPctL: 0, rankPctG: 0, rankPctU: 95, rankPctM: 80,
    rankNumL: null, rankNumG: null, rankNumU: 10, dustL: 0, dustG: 0, dustU: 0,
    isLucky: false, isShiny: false, isShadow: false, suggestStar: true,
    quickMove: '', chargeMove1: '', chargeMove2: '',
  });

  it('(1) overridden nick renders a distinct ✏ indicator', () => {
    const html = renderLoader.buildRow(makeP({ nickname: 'MyGhost' }));
    expect(html).toContain('MyGhost');
    expect(html).toContain('✏');             // override indicator present
    expect(html).toContain('nick-overridden'); // accent class hook
  });

  it('(1) a plain suggested nick renders WITHOUT the override indicator', () => {
    const html = renderLoader.buildRow(makeP(null));
    expect(html).not.toContain('nick-overridden');
  });

  it('(6) XSS — a malicious nick is escaped to inert text, never raw markup', () => {
    const evil = '<img src=x onerror=alert(1)><script>alert(2)</script>';
    const html = renderLoader.buildRow(makeP({ nickname: evil }));
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;img');         // escaped form present
    expect(html).toContain('&lt;script&gt;');
  });

  it('(6) esc escapes all HTML metacharacters', () => {
    expect(renderLoader.esc('<b>"&"</b>')).toBe('&lt;b&gt;&quot;&amp;&quot;&lt;/b&gt;');
  });
});

// ════════════════════════════════════════════════════════════════════
// storage — saveNickOverride optimistic update, rollback, payload
// ════════════════════════════════════════════════════════════════════
describe('saveNickOverride — storage layer', () => {
  const makePoke = () => ({ stableKey: 'k1', nickname: 'GengarⓊ95', suggestedNickname: undefined, nickOverridden: false });

  it('(1) optimistic local update + persists nick to the override cache', async () => {
    const poke = makePoke();
    const env = supabaseLoader.createNickEnv({ clampNick, allPokemon: [poke] });
    env.setConnected(true);
    const ok = await env.saveNickOverride('k1', 'Spooky');
    expect(ok).toBe(true);
    expect(poke.nickname).toBe('Spooky');
    expect(poke.nickOverridden).toBe(true);
    expect(poke.suggestedNickname).toBe('GengarⓊ95');
    expect(env.getCache()['k1'].nick).toBe('Spooky');
  });

  it('(3) reset (null) clears the cache nick and restores suggested', async () => {
    const poke = makePoke();
    const env = supabaseLoader.createNickEnv({ clampNick, allPokemon: [poke] });
    env.setConnected(true);
    await env.saveNickOverride('k1', 'Spooky');
    await env.saveNickOverride('k1', null);
    expect(poke.nickname).toBe('GengarⓊ95');
    expect(poke.nickOverridden).toBe(false);
    expect(env.getCache()['k1'].nick).toBeNull();
  });

  it('(4) empty-string persists as a real override; null clears it', async () => {
    const poke = makePoke();
    const env = supabaseLoader.createNickEnv({ clampNick, allPokemon: [poke] });
    env.setConnected(true);
    await env.saveNickOverride('k1', '');
    expect(env.getCache()['k1'].nick).toBe('');
    expect(poke.nickOverridden).toBe(true);
    await env.saveNickOverride('k1', null);
    expect(env.getCache()['k1'].nick).toBeNull();
    expect(poke.nickOverridden).toBe(false);
  });

  it('(5) clamps an over-long nick before writing', async () => {
    const poke = makePoke();
    let written = null;
    const env = supabaseLoader.createNickEnv({
      clampNick, allPokemon: [poke],
      supabaseFetch: async (m, pth, body) => { written = body; return {}; },
    });
    env.setConnected(true);
    await env.saveNickOverride('k1', 'C'.repeat(120));
    expect(written.nick.length).toBe(MAX_NICK_LENGTH);
  });

  it('(9) write-failure rollback — Supabase rejection reverts local state and cache', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const poke = makePoke();
    const env = supabaseLoader.createNickEnv({
      clampNick, allPokemon: [poke],
      supabaseFetch: async () => null, // simulate write failure
    });
    env.setConnected(true);
    const ok = await env.saveNickOverride('k1', 'Spooky');
    warn.mockRestore();
    expect(ok).toBe(false);
    // Local state reverted to pre-edit values
    expect(poke.nickname).toBe('GengarⓊ95');
    expect(poke.nickOverridden).toBe(false);
    // Cache must not retain the failed override
    expect(env.getCache()['k1']).toBeUndefined();
  });

  it('(10) authz — write payload is scoped with user_id (RLS defense-in-depth)', async () => {
    const poke = makePoke();
    let written = null;
    const env = supabaseLoader.createNickEnv({
      clampNick, allPokemon: [poke],
      supabaseFetch: async (m, pth, body) => { written = body; return {}; },
    });
    env.setConnected(true);
    await env.saveNickOverride('k1', 'Spooky');
    expect(written.user_id).toBe('test-user-id');
    expect(written.pokemon_index).toBe('k1');
    expect(written.nick).toBe('Spooky');
  });

  it('offline (not connected) still updates local state and returns true', async () => {
    const poke = makePoke();
    const env = supabaseLoader.createNickEnv({ clampNick, allPokemon: [poke] });
    // supabaseConnected defaults false
    const ok = await env.saveNickOverride('k1', 'Offline');
    expect(ok).toBe(true);
    expect(poke.nickname).toBe('Offline');
    expect(env.getCache()['k1'].nick).toBe('Offline');
  });
});

// ════════════════════════════════════════════════════════════════════
// inline edit — commit / cancel / Esc lifecycle
// ════════════════════════════════════════════════════════════════════
describe('inline edit — keyboard lifecycle', () => {
  it('(7) nickEditKey: Enter commits, Esc cancels, other keys are no-ops', () => {
    const { nickEditKey } = nickEditLoader.load();
    expect(nickEditKey('Enter', 'val')).toEqual({ action: 'commit', value: 'val' });
    expect(nickEditKey('Escape', 'val')).toEqual({ action: 'cancel' });
    expect(nickEditKey('a', 'val')).toEqual({ action: 'none' });
  });

  it('(7) Esc cancel performs NO write to the override store', async () => {
    let writes = 0;
    const saveSpy = async () => { writes++; return true; };
    const poke = { stableKey: 'k1', nickname: 'GengarⓊ95', nickOverridden: false };
    const { cancelNickEdit } = nickEditLoader.load({ saveNickOverride: saveSpy, allPokemon: [poke] });
    cancelNickEdit('k1');
    expect(writes).toBe(0);
  });

  it('(1) commit calls saveNickOverride with the trimmed value', async () => {
    const calls = [];
    const saveSpy = async (idx, nick) => { calls.push([idx, nick]); return true; };
    const poke = { stableKey: 'k1', nickname: 'GengarⓊ95', nickOverridden: false };
    const { commitNickEdit } = nickEditLoader.load({ saveNickOverride: saveSpy, allPokemon: [poke] });
    await commitNickEdit('k1', '  NewNick  ');
    expect(calls).toEqual([['k1', 'NewNick']]);
  });

  it('(3) resetNick calls saveNickOverride with null', async () => {
    const calls = [];
    const saveSpy = async (idx, nick) => { calls.push([idx, nick]); return true; };
    const poke = { stableKey: 'k1', nickname: 'Custom', nickOverridden: true };
    const { resetNick } = nickEditLoader.load({ saveNickOverride: saveSpy, allPokemon: [poke] });
    await resetNick('k1');
    expect(calls).toEqual([['k1', null]]);
  });
});
