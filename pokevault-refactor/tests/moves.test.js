'use strict';
// Phase 3 — Deterministic unit tests for the pokemon_moves database layer.
// These tests use the local fixture (moves-data.js) so they're offline and instant.
// Run with: npx jest tests/moves.test.js
//
// When Supabase is populated, a separate integration test file can swap the
// fixture for a live Supabase client and run the same assertions.

const { getMoves } = require('./moves-data');

// ─── Swampert ─────────────────────────────────────────────────────────────────

describe('Swampert — Great League', () => {
  let m;
  beforeAll(async () => { m = await getMoves('Swampert', 'G'); });

  it('exists in the database', () => expect(m).not.toBeNull());

  it('fast move is Mud Shot, not legacy or elite TM', async () => {
    expect(m.fast_move_best).toBe('Mud Shot');
    expect(m.fast_move_legacy).toBe(false);
    expect(m.fast_move_elite_tm).toBe(false);
  });

  it('Hydro Cannon is the priority charged move and requires Elite TM', async () => {
    expect(m.charged1_move).toBe('Hydro Cannon');
    expect(m.charged1_cd).toBe(true);
    expect(m.charged1_elite_tm).toBe(true);
  });

  it('Hydro Cannon alternative is Surf (no Elite TM required)', async () => {
    const alt = m.charged1_alternatives?.[0];
    expect(alt).toBeDefined();
    expect(alt.move).toBe('Surf');
    expect(alt.elite_tm).toBe(false);
  });

  it('second move is Earthquake', async () => {
    expect(m.charged2_move).toBe('Earthquake');
    expect(m.charged2_legacy).toBe(false);
    expect(m.charged2_elite_tm).toBe(false);
  });

  it('moveset applies across all leagues', async () => {
    expect(m.moveset_same_across_leagues).toBe(true);
  });
});

// ─── Umbreon ──────────────────────────────────────────────────────────────────

describe('Umbreon — Great League', () => {
  let m;
  beforeAll(async () => { m = await getMoves('Umbreon', 'G'); });

  it('exists in the database', () => expect(m).not.toBeNull());

  it('fast move is Snarl', async () => {
    expect(m.fast_move_best).toBe('Snarl');
    expect(m.fast_move_legacy).toBe(false);
  });

  it('Foul Play is the priority charged move', async () => {
    expect(m.charged1_move).toBe('Foul Play');
    expect(m.charged1_legacy).toBe(false);
    expect(m.charged1_elite_tm).toBe(false);
  });

  it('Last Resort is the second charged move — legacy, Elite TM required', async () => {
    expect(m.charged2_move).toBe('Last Resort');
    expect(m.charged2_legacy).toBe(true);
    expect(m.charged2_elite_tm).toBe(true);
  });

  it('Last Resort alternative is Moonblast (no Elite TM)', async () => {
    const alt = m.charged2_alternatives?.[0];
    expect(alt).toBeDefined();
    expect(alt.move).toBe('Moonblast');
    expect(alt.elite_tm).toBe(false);
  });

  it('moveset applies across all leagues (GL and UL same)', async () => {
    expect(m.moveset_same_across_leagues).toBe(true);
  });
});

describe('Umbreon — Ultra League', () => {
  let m;
  beforeAll(async () => { m = await getMoves('Umbreon', 'U'); });

  it('exists in the database', () => expect(m).not.toBeNull());

  it('same fast move and priority charged move as Great League', async () => {
    expect(m.fast_move_best).toBe('Snarl');
    expect(m.charged1_move).toBe('Foul Play');
  });

  it('Last Resort is still the second move in Ultra League', async () => {
    expect(m.charged2_move).toBe('Last Resort');
    expect(m.charged2_legacy).toBe(true);
    expect(m.charged2_elite_tm).toBe(true);
  });
});

// ─── Metagross ────────────────────────────────────────────────────────────────

describe('Metagross — Ultra League', () => {
  let m;
  beforeAll(async () => { m = await getMoves('Metagross', 'U'); });

  it('exists in the database', () => expect(m).not.toBeNull());

  it('fast move is Bullet Punch', async () => {
    expect(m.fast_move_best).toBe('Bullet Punch');
    expect(m.fast_move_legacy).toBe(false);
  });

  it('Meteor Mash is the priority charged move — CD move requiring Elite TM', async () => {
    expect(m.charged1_move).toBe('Meteor Mash');
    expect(m.charged1_cd).toBe(true);
    expect(m.charged1_elite_tm).toBe(true);
  });

  it('Meteor Mash alternative is Flash Cannon (no Elite TM)', async () => {
    const alt = m.charged1_alternatives?.[0];
    expect(alt).toBeDefined();
    expect(alt.move).toBe('Flash Cannon');
  });

  it('second move is Earthquake', async () => {
    expect(m.charged2_move).toBe('Earthquake');
    expect(m.charged2_legacy).toBe(false);
  });

  it('moveset does NOT apply across all leagues (UL only)', async () => {
    expect(m.moveset_same_across_leagues).toBe(false);
  });
});

// ─── Banette ──────────────────────────────────────────────────────────────────

describe('Banette — Great League', () => {
  let m;
  beforeAll(async () => { m = await getMoves('Banette', 'G'); });

  it('exists in the database', () => expect(m).not.toBeNull());

  it('Shadow Claw is the fast move and it is legacy', async () => {
    expect(m.fast_move_best).toBe('Shadow Claw');
    expect(m.fast_move_legacy).toBe(true);
    expect(m.fast_move_elite_tm).toBe(false); // not elite TM — just unobtainable now
  });

  it('Shadow Ball is the priority charged move', async () => {
    expect(m.charged1_move).toBe('Shadow Ball');
    expect(m.charged1_legacy).toBe(false);
  });

  it('is flagged as having a limited move pool', async () => {
    expect(m.move_pool_limited).toBe(true);
    expect(m.move_pool_note).toBeTruthy();
  });
});

// ─── Medicham ─────────────────────────────────────────────────────────────────

describe('Medicham — Great League', () => {
  let m;
  beforeAll(async () => { m = await getMoves('Medicham', 'G'); });

  it('exists in the database', () => expect(m).not.toBeNull());

  it('fast move is Counter', async () => {
    expect(m.fast_move_best).toBe('Counter');
    expect(m.fast_move_legacy).toBe(false);
    expect(m.fast_move_elite_tm).toBe(false);
  });

  it('Power-Up Punch is the priority charged move', async () => {
    expect(m.charged1_move).toBe('Power-Up Punch');
    expect(m.charged1_legacy).toBe(false);
    expect(m.charged1_elite_tm).toBe(false);
  });

  it('Ice Punch is the recommended second charged move', async () => {
    expect(m.charged2_move).toBe('Ice Punch');
    expect(m.charged2_legacy).toBe(false);
  });

  it('Psychic is listed as an alternative second move', async () => {
    const alt = m.charged2_alternatives?.[0];
    expect(alt).toBeDefined();
    expect(alt.move).toBe('Psychic');
  });

  it('requires second move to be unlocked', async () => {
    expect(m.requires_second_move).toBe(true);
  });
});

// ─── Missing species ──────────────────────────────────────────────────────────

describe('getMoves — missing entries', () => {
  it('returns null for a species not in the database', async () => {
    const m = await getMoves('Dragonite', 'G');
    expect(m).toBeNull();
  });

  it('returns null for a species in the wrong league', async () => {
    // Medicham is only in the database for Great League (maxes out below UL cap)
    const m = await getMoves('Medicham', 'U');
    expect(m).toBeNull();
  });
});
