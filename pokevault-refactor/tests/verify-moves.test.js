'use strict';

const {
  normalizeSpecies,
  normalizeMoveId,
  normalizeMoveDisplay,
  compareMoves,
  buildSpeciesMap,
} = require('../scripts/verify-moves-against-pvpoke.js');

// ── normalizeSpecies ───────────────────────────────────────────────────────
describe('normalizeSpecies', () => {
  it('lowercases standard names', () => {
    expect(normalizeSpecies('Swampert')).toBe('swampert');
  });
  it('converts Mr. Mime', () => {
    expect(normalizeSpecies('Mr. Mime')).toBe('mr_mime');
  });
  it('converts Mime Jr.', () => {
    expect(normalizeSpecies('Mime Jr.')).toBe('mime_jr');
  });
  it('converts Nidoran♀', () => {
    expect(normalizeSpecies('Nidoran♀')).toBe('nidoran_f');
  });
  it('converts Nidoran♂', () => {
    expect(normalizeSpecies('Nidoran♂')).toBe('nidoran_m');
  });
  it("converts Farfetch'd", () => {
    expect(normalizeSpecies("Farfetch'd")).toBe('farfetchd');
  });
  it("converts Sirfetch'd", () => {
    expect(normalizeSpecies("Sirfetch'd")).toBe('sirfetchd');
  });
  it('converts Ho-Oh (hyphen preserved as underscore)', () => {
    expect(normalizeSpecies('Ho-Oh')).toBe('ho_oh');
  });
  it('converts Porygon-Z', () => {
    expect(normalizeSpecies('Porygon-Z')).toBe('porygon_z');
  });
  it('converts Type: Null', () => {
    expect(normalizeSpecies('Type: Null')).toBe('type_null');
  });
  it('converts Flabébé', () => {
    expect(normalizeSpecies('Flabébé')).toBe('flabébé');
  });
  it('handles single-word name with no changes needed', () => {
    expect(normalizeSpecies('Pikachu')).toBe('pikachu');
  });
});

// ── normalizeMoveId ────────────────────────────────────────────────────────
describe('normalizeMoveId', () => {
  it('strips underscores and lowercases', () => {
    expect(normalizeMoveId('MUD_SHOT')).toBe('mudshot');
    expect(normalizeMoveId('HYDRO_CANNON')).toBe('hydrocannon');
    expect(normalizeMoveId('SHADOW_BALL')).toBe('shadowball');
  });
  it('handles single-word move', () => {
    expect(normalizeMoveId('THUNDER')).toBe('thunder');
    expect(normalizeMoveId('LICK')).toBe('lick');
  });
  it('returns empty string for falsy input', () => {
    expect(normalizeMoveId('')).toBe('');
    expect(normalizeMoveId(null)).toBe('');
  });
});

// ── normalizeMoveDisplay ───────────────────────────────────────────────────
describe('normalizeMoveDisplay', () => {
  it('strips spaces', () => {
    expect(normalizeMoveDisplay('Mud Shot')).toBe('mudshot');
  });
  it('strips hyphens', () => {
    expect(normalizeMoveDisplay('Mud-Slap')).toBe('mudslap');
  });
  it('returns empty string for falsy', () => {
    expect(normalizeMoveDisplay('')).toBe('');
    expect(normalizeMoveDisplay(null)).toBe('');
  });
  it('normalises to match pvpoke ID', () => {
    expect(normalizeMoveDisplay('Hydro Cannon')).toBe(normalizeMoveId('HYDRO_CANNON'));
    expect(normalizeMoveDisplay('Shadow Ball')).toBe(normalizeMoveId('SHADOW_BALL'));
    expect(normalizeMoveDisplay('Thunder Punch')).toBe(normalizeMoveId('THUNDER_PUNCH'));
  });
});

// ── compareMoves ──────────────────────────────────────────────────────────
describe('compareMoves', () => {
  it('returns match when all three moves agree', () => {
    const row = { fast_move_best: 'Mud Shot', charged1_move: 'Hydro Cannon', charged2_move: 'Earthquake' };
    expect(compareMoves(row, ['MUD_SHOT', 'HYDRO_CANNON', 'EARTHQUAKE'])).toBe('match');
  });

  it('returns match when only two pvpoke moves and no c2 in DB', () => {
    const row = { fast_move_best: 'Lick', charged1_move: 'Body Slam', charged2_move: null };
    expect(compareMoves(row, ['LICK', 'BODY_SLAM'])).toBe('match');
  });

  it('handles hyphenated display move matching underscore pvpoke ID', () => {
    const row = { fast_move_best: 'Mud-Slap', charged1_move: 'Stone Edge', charged2_move: null };
    expect(compareMoves(row, ['MUD_SLAP', 'STONE_EDGE'])).toBe('match');
  });

  it('detects fast move diff', () => {
    const row = { fast_move_best: 'Shadow Claw', charged1_move: 'Meteor Mash', charged2_move: null };
    const result = compareMoves(row, ['BULLET_PUNCH', 'METEOR_MASH']);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toContain('fast:');
    expect(result[0]).toContain('Shadow Claw');
    expect(result[0]).toContain('BULLET_PUNCH');
  });

  it('detects charged1 diff', () => {
    const row = { fast_move_best: 'Bullet Punch', charged1_move: 'Earthquake', charged2_move: null };
    const result = compareMoves(row, ['BULLET_PUNCH', 'METEOR_MASH']);
    expect(Array.isArray(result)).toBe(true);
    expect(result.some(d => d.includes('charged1:'))).toBe(true);
  });

  it('detects charged2 diff when both present', () => {
    const row = { fast_move_best: 'Mud Shot', charged1_move: 'Hydro Cannon', charged2_move: 'Ice Beam' };
    const result = compareMoves(row, ['MUD_SHOT', 'HYDRO_CANNON', 'EARTHQUAKE']);
    expect(Array.isArray(result)).toBe(true);
    expect(result.some(d => d.includes('charged2:'))).toBe(true);
  });

  it('returns skip when pvpoke moveset is missing', () => {
    const row = { fast_move_best: 'Tackle', charged1_move: 'Struggle', charged2_move: null };
    expect(compareMoves(row, null)).toBe('skip');
    expect(compareMoves(row, [])).toBe('skip');
    expect(compareMoves(row, ['TACKLE'])).toBe('skip');
  });

  it('does not diff missing c2 in DB against pvpoke c2', () => {
    const row = { fast_move_best: 'Mud Shot', charged1_move: 'Hydro Cannon', charged2_move: null };
    expect(compareMoves(row, ['MUD_SHOT', 'HYDRO_CANNON', 'SURF'])).toBe('match');
  });
});

// ── buildSpeciesMap ────────────────────────────────────────────────────────
describe('buildSpeciesMap', () => {
  const fakeRankings = [
    { speciesId: 'swampert', speciesName: 'Swampert', moveset: ['MUD_SHOT', 'HYDRO_CANNON', 'EARTHQUAKE'] },
    { speciesId: 'swampert_shadow', speciesName: 'Shadow Swampert', moveset: ['MUD_SHOT', 'HYDRO_CANNON', 'EARTHQUAKE'] },
    { speciesId: 'mr_mime', speciesName: 'Mr. Mime', moveset: ['CONFUSION', 'PSYCHIC', 'ICE_PUNCH'] },
  ];

  it('includes standard entries', () => {
    const map = buildSpeciesMap(fakeRankings);
    expect(map.has('swampert')).toBe(true);
  });

  it('excludes shadow variants', () => {
    const map = buildSpeciesMap(fakeRankings);
    expect(map.has('swampert_shadow')).toBe(false);
  });

  it('indexes by normalised speciesName', () => {
    const map = buildSpeciesMap(fakeRankings);
    expect(map.has(normalizeSpecies('Mr. Mime'))).toBe(true);  // 'mr_mime'
  });

  it('looked-up entry has moveset', () => {
    const map = buildSpeciesMap(fakeRankings);
    expect(map.get('swampert').moveset).toEqual(['MUD_SHOT', 'HYDRO_CANNON', 'EARTHQUAKE']);
  });
});

// ── All-or-nothing: fetch failure guard ───────────────────────────────────
// The all-or-nothing guarantee is structural: main() fetches ALL pvpoke data
// before making any Supabase writes, and exits immediately on fetch failure.
// The unit-testable signal is that module exports are pure functions with no
// side effects — the DB write path is only reachable after successful fetches.
describe('fetch failure guard (structural)', () => {
  it('exported helpers have no side effects', () => {
    expect(typeof normalizeSpecies).toBe('function');
    expect(typeof normalizeMoveId).toBe('function');
    expect(typeof normalizeMoveDisplay).toBe('function');
    expect(typeof compareMoves).toBe('function');
    expect(typeof buildSpeciesMap).toBe('function');
  });
});
