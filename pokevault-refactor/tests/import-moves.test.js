'use strict';
// Unit tests for import-moves-from-pvpoke.js
// Pure function tests run offline; upsert-logic tests mock global fetch.
//
// Run with: npx jest tests/import-moves.test.js

const { extractForm, extractSpeciesName, pvpokeIdToDisplay, buildRow } =
  require('../scripts/import-moves-from-pvpoke');

// ─── extractForm ──────────────────────────────────────────────────────────────

describe('extractForm', () => {
  it('returns empty string for base species', () => {
    expect(extractForm('swampert')).toBe('');
    expect(extractForm('gengar')).toBe('');
  });

  it('handles all regional suffixes', () => {
    expect(extractForm('sandslash_alolan')).toBe('Alolan');
    expect(extractForm('weezing_galarian')).toBe('Galarian');
    expect(extractForm('electrode_hisuian')).toBe('Hisuian');
    expect(extractForm('tauros_paldean')).toBe('Paldean');
    expect(extractForm('wooper_paldea')).toBe('Paldean');
  });

  it('handles form suffixes', () => {
    expect(extractForm('giratina_origin')).toBe('Origin');
    expect(extractForm('landorus_therian')).toBe('Therian');
    expect(extractForm('groudon_primal')).toBe('Primal');
  });

  it('returns empty string for shadow (skipped elsewhere)', () => {
    expect(extractForm('gengar_shadow')).toBe('');
  });
});

// ─── extractSpeciesName ───────────────────────────────────────────────────────

describe('extractSpeciesName', () => {
  it('returns name unchanged for base species', () => {
    expect(extractSpeciesName('Swampert')).toBe('Swampert');
    expect(extractSpeciesName('Gengar')).toBe('Gengar');
  });

  it('strips regional prefix', () => {
    expect(extractSpeciesName('Alolan Sandslash')).toBe('Sandslash');
    expect(extractSpeciesName('Galarian Weezing')).toBe('Weezing');
    expect(extractSpeciesName('Hisuian Electrode')).toBe('Electrode');
    expect(extractSpeciesName('Paldean Tauros')).toBe('Tauros');
  });
});

// ─── pvpokeIdToDisplay ────────────────────────────────────────────────────────

describe('pvpokeIdToDisplay', () => {
  it('converts simple move IDs to title case', () => {
    expect(pvpokeIdToDisplay('MUD_SHOT')).toBe('Mud Shot');
    expect(pvpokeIdToDisplay('HYDRO_CANNON')).toBe('Hydro Cannon');
    expect(pvpokeIdToDisplay('COUNTER')).toBe('Counter');
  });

  it('strips Weather Ball type suffix', () => {
    expect(pvpokeIdToDisplay('WEATHER_BALL_ICE')).toBe('Weather Ball');
    expect(pvpokeIdToDisplay('WEATHER_BALL_FIRE')).toBe('Weather Ball');
  });

  it('returns null for falsy input', () => {
    expect(pvpokeIdToDisplay(null)).toBeNull();
    expect(pvpokeIdToDisplay(undefined)).toBeNull();
    expect(pvpokeIdToDisplay('')).toBeNull();
  });
});

// ─── buildRow ─────────────────────────────────────────────────────────────────

describe('buildRow', () => {
  const now = '2026-05-06T00:00:00.000Z';

  it('builds a row with correct species/league/form', () => {
    const row = buildRow('Swampert', '', 'G', ['MUD_SHOT', 'HYDRO_CANNON', 'EARTHQUAKE'], now);
    expect(row.species).toBe('Swampert');
    expect(row.league).toBe('G');
    expect(row.form).toBe('');
  });

  it('converts move IDs to display names', () => {
    const row = buildRow('Swampert', '', 'G', ['MUD_SHOT', 'HYDRO_CANNON', 'EARTHQUAKE'], now);
    expect(row.fast_move_best).toBe('Mud Shot');
    expect(row.charged1_move).toBe('Hydro Cannon');
    expect(row.charged2_move).toBe('Earthquake');
  });

  it('sets charged2_move to null when moveset has only 2 entries', () => {
    const row = buildRow('Medicham', '', 'G', ['COUNTER', 'ICE_PUNCH'], now);
    expect(row.charged2_move).toBeNull();
  });

  it('defaults all flag fields to false', () => {
    const row = buildRow('Swampert', '', 'G', ['MUD_SHOT', 'HYDRO_CANNON', 'EARTHQUAKE'], now);
    expect(row.fast_move_legacy).toBe(false);
    expect(row.fast_move_cd).toBe(false);
    expect(row.fast_move_elite_tm).toBe(false);
    expect(row.charged1_legacy).toBe(false);
    expect(row.charged1_cd).toBe(false);
    expect(row.charged1_elite_tm).toBe(false);
    expect(row.charged2_legacy).toBe(false);
    expect(row.charged2_cd).toBe(false);
    expect(row.charged2_elite_tm).toBe(false);
  });

  it('always sets verified=false', () => {
    const row = buildRow('Swampert', '', 'G', ['MUD_SHOT', 'HYDRO_CANNON', 'EARTHQUAKE'], now);
    expect(row.verified).toBe(false);
  });

  it('sets last_verified_at from the provided timestamp', () => {
    const row = buildRow('Swampert', '', 'G', ['MUD_SHOT', 'HYDRO_CANNON', 'EARTHQUAKE'], now);
    expect(row.last_verified_at).toBe(now);
  });

  it('handles regional form correctly', () => {
    const row = buildRow('Sandslash', 'Alolan', 'G', ['POWDER_SNOW', 'ICE_PUNCH', 'BLIZZARD'], now);
    expect(row.form).toBe('Alolan');
    expect(row.species).toBe('Sandslash');
  });
});
