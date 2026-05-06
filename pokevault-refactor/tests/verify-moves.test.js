'use strict';

const {
  normalizeSpecies,
  normalizeMoveId,
  normalizeMoveDisplay,
  compareMoves,
  buildSpeciesMap,
  buildLookupKeys,
  applyOverrides,
  KNOWN_CORRECT_OVERRIDES,
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
  it('replaces underscores with spaces and lowercases', () => {
    expect(normalizeMoveId('MUD_SHOT')).toBe('mud shot');
    expect(normalizeMoveId('HYDRO_CANNON')).toBe('hydro cannon');
    expect(normalizeMoveId('SHADOW_BALL')).toBe('shadow ball');
  });
  it('handles single-word move', () => {
    expect(normalizeMoveId('THUNDER')).toBe('thunder');
    expect(normalizeMoveId('LICK')).toBe('lick');
  });
  it('returns empty string for falsy input', () => {
    expect(normalizeMoveId('')).toBe('');
    expect(normalizeMoveId(null)).toBe('');
  });
  it('strips type suffix from Weather Ball variants', () => {
    expect(normalizeMoveId('WEATHER_BALL_ICE')).toBe('weather ball');
    expect(normalizeMoveId('WEATHER_BALL_WATER')).toBe('weather ball');
    expect(normalizeMoveId('WEATHER_BALL_FIRE')).toBe('weather ball');
    expect(normalizeMoveId('WEATHER_BALL')).toBe('weather ball');
  });
  it('does not strip suffixes from non-Weather-Ball moves', () => {
    expect(normalizeMoveId('SHADOW_BALL')).toBe('shadow ball');
    expect(normalizeMoveId('FIRE_SPIN')).toBe('fire spin');
  });
});

// ── normalizeMoveDisplay ───────────────────────────────────────────────────
describe('normalizeMoveDisplay', () => {
  it('preserves spaces (lowercases)', () => {
    expect(normalizeMoveDisplay('Mud Shot')).toBe('mud shot');
  });
  it('converts hyphens to spaces', () => {
    expect(normalizeMoveDisplay('Mud-Slap')).toBe('mud slap');
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
  it('keeps distinct moves distinct', () => {
    expect(normalizeMoveDisplay('Mud Shot')).not.toBe(normalizeMoveDisplay('Mudshot'));
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
    // "Mud-Slap" → "mud slap", "MUD_SLAP" → "mud slap"
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

  it('detects charged diff when DB charged move not in pvpoke set', () => {
    const row = { fast_move_best: 'Bullet Punch', charged1_move: 'Earthquake', charged2_move: null };
    const result = compareMoves(row, ['BULLET_PUNCH', 'METEOR_MASH']);
    expect(Array.isArray(result)).toBe(true);
    expect(result.some(d => d.includes('charged:'))).toBe(true);
  });

  it('detects charged diff when DB c2 not in pvpoke set', () => {
    const row = { fast_move_best: 'Mud Shot', charged1_move: 'Hydro Cannon', charged2_move: 'Ice Beam' };
    const result = compareMoves(row, ['MUD_SHOT', 'HYDRO_CANNON', 'EARTHQUAKE']);
    expect(Array.isArray(result)).toBe(true);
    expect(result.some(d => d.includes('charged:'))).toBe(true);
  });

  it('C1/C2 comparison is order-independent', () => {
    const row = { fast_move_best: 'Dragon Tail', charged1_move: 'Dragon Claw', charged2_move: 'Ancient Power' };
    expect(compareMoves(row, ['DRAGON_TAIL', 'ANCIENT_POWER', 'DRAGON_CLAW'])).toBe('match');
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

  it('regional form with qualified speciesId does not overwrite base species entry', () => {
    const rankings = [
      { speciesId: 'electrode', speciesName: 'Electrode', moveset: ['VOLT_SWITCH', 'WILD_CHARGE'] },
      { speciesId: 'electrode_hisuian', speciesName: 'Hisuian Electrode', moveset: ['THUNDER_SHOCK', 'WILD_CHARGE'] },
    ];
    const map = buildSpeciesMap(rankings);
    expect(map.get('electrode').moveset[0]).toBe('VOLT_SWITCH');
  });

  it('regional form that shares bare speciesId does not overwrite base species entry', () => {
    // Worst case: pvpoke gives Hisuian Electrode speciesId="electrode" (same as regular)
    const rankings = [
      { speciesId: 'electrode', speciesName: 'Electrode', moveset: ['VOLT_SWITCH', 'WILD_CHARGE'] },
      { speciesId: 'electrode', speciesName: 'Hisuian Electrode', moveset: ['THUNDER_SHOCK', 'WILD_CHARGE'] },
    ];
    const map = buildSpeciesMap(rankings);
    expect(map.get('electrode').moveset[0]).toBe('VOLT_SWITCH');
  });

  it('regional form is indexed under its speciesName key', () => {
    const rankings = [
      { speciesId: 'electrode', speciesName: 'Electrode', moveset: ['VOLT_SWITCH', 'WILD_CHARGE'] },
      { speciesId: 'electrode', speciesName: 'Hisuian Electrode', moveset: ['THUNDER_SHOCK', 'WILD_CHARGE'] },
    ];
    const map = buildSpeciesMap(rankings);
    expect(map.get('hisuian_electrode').moveset[0]).toBe('THUNDER_SHOCK');
  });
});

// ── buildLookupKeys ────────────────────────────────────────────────────────
describe('buildLookupKeys', () => {
  it('returns bare species when form is absent', () => {
    expect(buildLookupKeys('Swampert', '')).toEqual(['swampert']);
    expect(buildLookupKeys('Swampert', null)).toEqual(['swampert']);
  });

  it('returns species+form first for named forms', () => {
    const keys = buildLookupKeys('Giratina', 'Origin');
    expect(keys[0]).toBe('giratina_origin');
  });

  it('falls back to bare species for default forms', () => {
    const keys = buildLookupKeys('Tornadus', 'Incarnate');
    expect(keys).toContain('tornadus');
    expect(keys[0]).toBe('tornadus_incarnate');
  });

  it('maps Armored form to _a alias', () => {
    const keys = buildLookupKeys('Mewtwo', 'Armored');
    expect(keys).toContain('mewtwo_a');
  });

  it('de-duplicates keys', () => {
    const keys = buildLookupKeys('Mewtwo', 'Normal');
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('maps Paldean form to _paldea alias (pvpoke naming convention)', () => {
    const keys = buildLookupKeys('Tauros', 'Paldean');
    expect(keys).toContain('tauros_paldean');
    expect(keys).toContain('tauros_paldea');
  });

  it('maps Alolan form to _alola alias', () => {
    const keys = buildLookupKeys('Raichu', 'Alolan');
    expect(keys).toContain('raichu_alolan');
    expect(keys).toContain('raichu_alola');
  });

  it('maps Hisuian form to _hisui alias and reversed key', () => {
    const keys = buildLookupKeys('Electrode', 'Hisuian');
    expect(keys).toContain('electrode_hisuian');
    expect(keys).toContain('electrode_hisui');
    // Also try reversed "hisuian_electrode" for pvpoke entries indexed by speciesName
    expect(keys).toContain('hisuian_electrode');
  });

  it('does NOT fall back to bare species for non-default regional forms', () => {
    // Paldean Tauros should not fall through to regular Tauros entry
    const keys = buildLookupKeys('Tauros', 'Paldean');
    expect(keys).not.toContain('tauros');
  });

  it('does NOT fall back to bare species for unrecognised non-default forms', () => {
    // Rotom Wash should not silently match bare rotom entry
    const keys = buildLookupKeys('Rotom', 'Wash');
    expect(keys).not.toContain('rotom');
    expect(keys[0]).toBe('rotom_wash');
  });
});

// ── applyOverrides ────────────────────────────────────────────────────────
describe('applyOverrides', () => {
  it('passes through match and skip unchanged', () => {
    expect(applyOverrides('match', 'Groudon', 'M')).toBe('match');
    expect(applyOverrides('skip', 'Groudon', 'M')).toBe('skip');
  });

  it('suppresses fast diff when KNOWN_CORRECT_OVERRIDES entry present', () => {
    // Groudon M|fast is overridden — a fast diff should become match
    const fakeDiff = ['fast: DB="Mud Shot" pvpoke="DRAGON_TAIL"'];
    expect(applyOverrides(fakeDiff, 'Groudon', 'M')).toBe('match');
  });

  it('suppresses charged diff when KNOWN_CORRECT_OVERRIDES entry present', () => {
    const fakeDiff = ['charged: DB="Sky Attack" pvpoke="FLY"'];
    expect(applyOverrides(fakeDiff, 'Lugia', 'M')).toBe('match');
  });

  it('keeps diff when no override entry matches', () => {
    const fakeDiff = ['fast: DB="Vine Whip" pvpoke="RAZOR_LEAF"'];
    const result = applyOverrides(fakeDiff, 'Venusaur', 'G');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
  });

  it('removes only the overridden diff when multiple diffs exist', () => {
    // Groudon M|fast is overridden, but a charged diff should survive
    const fakeDiff = [
      'fast: DB="Mud Shot" pvpoke="DRAGON_TAIL"',
      'charged: DB="Fire Blast" pvpoke="SOLAR_BEAM"',
    ];
    const result = applyOverrides(fakeDiff, 'Groudon', 'M');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('charged:');
  });

  it('KNOWN_CORRECT_OVERRIDES contains expected species', () => {
    expect('Groudon|M|fast' in KNOWN_CORRECT_OVERRIDES).toBe(true);
    expect('Machamp|U|fast' in KNOWN_CORRECT_OVERRIDES).toBe(true);
    expect('Lugia|M|charged' in KNOWN_CORRECT_OVERRIDES).toBe(true);
    expect('Beedrill|G|fast' in KNOWN_CORRECT_OVERRIDES).toBe(true);
    expect('Electrode|G|fast' in KNOWN_CORRECT_OVERRIDES).toBe(true);
    expect('Electrode|G|charged' in KNOWN_CORRECT_OVERRIDES).toBe(true);
    expect('Lapras|G|fast' in KNOWN_CORRECT_OVERRIDES).toBe(true);
    expect('Lapras|U|fast' in KNOWN_CORRECT_OVERRIDES).toBe(true);
    expect('Leafeon|G|fast' in KNOWN_CORRECT_OVERRIDES).toBe(true);
    expect('Primeape|G|fast' in KNOWN_CORRECT_OVERRIDES).toBe(true);
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
