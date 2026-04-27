'use strict';
// Local fixture for moves unit tests — mirrors the pokemon_moves Supabase schema.
// Used instead of a live Supabase call so tests are deterministic and offline.
// Keep in sync with supabase_pokemon_moves.sql.

const MOVES_DATA = [
  // ── Swampert ────────────────────────────────────────────────────────────────
  {
    species: 'Swampert', league: 'G', form: null,
    fast_move_best: 'Mud Shot', fast_move_legacy: false, fast_move_cd: false, fast_move_elite_tm: false,
    fast_move_note: 'Core to the gameplan — generates energy very fast',
    fast_move_alternatives: null,
    charged1_move: 'Hydro Cannon', charged1_legacy: false, charged1_cd: true, charged1_elite_tm: true,
    charged1_note: 'Community Day move — the best option by a wide margin. Get an Elite TM if you can.',
    charged1_alternatives: [{ move: 'Surf', note: 'best if no Elite TM', elite_tm: false }],
    charged2_move: 'Earthquake', charged2_legacy: false, charged2_cd: false, charged2_elite_tm: false,
    charged2_note: 'Ground coverage — pairs perfectly with Hydro Cannon',
    charged2_alternatives: [{ move: 'Sludge Wave', note: 'anti-Fairy option — narrow coverage but useful in some metas' }],
    role_note: 'A-tier Great League staple. Water/Ground typing has only one weakness (Grass), making it a splashable pick on almost any team.',
    moveset_same_across_leagues: true, requires_second_move: true,
    move_pool_limited: false, move_pool_note: null,
    verified: false,
  },

  // ── Umbreon ─────────────────────────────────────────────────────────────────
  {
    species: 'Umbreon', league: 'G', form: null,
    fast_move_best: 'Snarl', fast_move_legacy: false, fast_move_cd: false, fast_move_elite_tm: false,
    fast_move_note: 'Fast energy generation — enables constant shield pressure',
    fast_move_alternatives: null,
    charged1_move: 'Foul Play', charged1_legacy: false, charged1_cd: false, charged1_elite_tm: false,
    charged1_note: 'STAB Dark-type move — solid coverage and energy cost',
    charged1_alternatives: [{ move: 'Psychic', note: 'Poison/Fighting coverage but lower priority than Last Resort' }],
    charged2_move: 'Last Resort', charged2_legacy: true, charged2_cd: false, charged2_elite_tm: true,
    charged2_note: 'Legacy move (Elite TM required) — second best charged move for Umbreon in PvP',
    charged2_alternatives: [{ move: 'Moonblast', note: 'best if no Elite TM — anti-Dragon/Fighting coverage', elite_tm: false }],
    role_note: 'S-tier Great League tank. Dark/Normal typing with exceptional bulk. Works as a safe switch and closer.',
    moveset_same_across_leagues: true, requires_second_move: true,
    move_pool_limited: false, move_pool_note: null,
    verified: false,
  },
  {
    species: 'Umbreon', league: 'U', form: null,
    fast_move_best: 'Snarl', fast_move_legacy: false, fast_move_cd: false, fast_move_elite_tm: false,
    fast_move_note: 'Fast energy generation — same role as Great League',
    fast_move_alternatives: null,
    charged1_move: 'Foul Play', charged1_legacy: false, charged1_cd: false, charged1_elite_tm: false,
    charged1_note: 'Same best charged move as Great League',
    charged1_alternatives: null,
    charged2_move: 'Last Resort', charged2_legacy: true, charged2_cd: false, charged2_elite_tm: true,
    charged2_note: 'Legacy move (Elite TM required) — same second move as Great League',
    charged2_alternatives: [{ move: 'Moonblast', note: 'best if no Elite TM', elite_tm: false }],
    role_note: 'Solid Ultra League pick with the same moveset as Great League. Bulk is especially valuable at the higher CP ceiling.',
    moveset_same_across_leagues: true, requires_second_move: true,
    move_pool_limited: false, move_pool_note: null,
    verified: false,
  },

  // ── Metagross ───────────────────────────────────────────────────────────────
  {
    species: 'Metagross', league: 'U', form: null,
    fast_move_best: 'Bullet Punch', fast_move_legacy: false, fast_move_cd: false, fast_move_elite_tm: false,
    fast_move_note: 'Best energy-generating fast move for PvP',
    fast_move_alternatives: null,
    charged1_move: 'Meteor Mash', charged1_legacy: false, charged1_cd: true, charged1_elite_tm: true,
    charged1_note: 'Community Day move — significantly outperforms all alternatives. Requires Elite TM.',
    charged1_alternatives: [{ move: 'Flash Cannon', note: 'best non-CD Steel charged move if no Elite TM', elite_tm: false }],
    charged2_move: 'Earthquake', charged2_legacy: false, charged2_cd: false, charged2_elite_tm: false,
    charged2_note: 'Ground coverage — neutral damage on most opponents that resist Steel',
    charged2_alternatives: [{ move: 'Psychic', note: 'STAB coverage but less universal than Earthquake' }],
    role_note: 'A-tier Ultra League pick. Steel/Psychic typing with impressive bulk. Especially good in metas with heavy Fairy and Ice presence.',
    moveset_same_across_leagues: false, requires_second_move: true,
    move_pool_limited: false, move_pool_note: null,
    verified: false,
  },

  // ── Banette ─────────────────────────────────────────────────────────────────
  {
    species: 'Banette', league: 'G', form: null,
    fast_move_best: 'Shadow Claw', fast_move_legacy: true, fast_move_cd: false, fast_move_elite_tm: false,
    fast_move_note: 'Legacy move — do NOT TM this under any circumstances. Irreplaceable.',
    fast_move_alternatives: null,
    charged1_move: 'Shadow Ball', charged1_legacy: false, charged1_cd: false, charged1_elite_tm: false,
    charged1_note: 'STAB Ghost-type nuke — the primary damage move',
    charged1_alternatives: null,
    charged2_move: 'Dazzling Gleam', charged2_legacy: false, charged2_cd: false, charged2_elite_tm: false,
    charged2_note: 'Anti-Dark/Dragon coverage',
    charged2_alternatives: [{ move: 'Thunder', note: 'alternative coverage if Dazzling Gleam not useful in current meta' }],
    role_note: 'Niche Great League Ghost-type. Only viable if you have Shadow Claw (legacy). Without it, skip.',
    moveset_same_across_leagues: false, requires_second_move: true,
    move_pool_limited: true,
    move_pool_note: 'Only 3 obtainable charged moves: Shadow Ball, Dazzling Gleam, Thunder. (Shadow Sneak is also legacy but weaker.) Check with Elite TM before unlocking second move to confirm target move is available.',
    verified: false,
  },

  // ── Medicham ────────────────────────────────────────────────────────────────
  {
    species: 'Medicham', league: 'G', form: null,
    fast_move_best: 'Counter', fast_move_legacy: false, fast_move_cd: false, fast_move_elite_tm: false,
    fast_move_note: 'One of the best fast moves in PvP — STAB Fighting with excellent energy generation',
    fast_move_alternatives: null,
    charged1_move: 'Power-Up Punch', charged1_legacy: false, charged1_cd: false, charged1_elite_tm: false,
    charged1_note: 'Essential — builds ATK boosts that snowball later in the match',
    charged1_alternatives: null,
    charged2_move: 'Ice Punch', charged2_legacy: false, charged2_cd: false, charged2_elite_tm: false,
    charged2_note: 'Anti-Dragon/Flying coverage — most broadly useful second move',
    charged2_alternatives: [{ move: 'Psychic', note: 'anti-Fighting/Poison coverage — situationally better in some cups' }],
    role_note: 'S-tier Great League staple. Psychic/Fighting typing with elite coverage. Counter + Power-Up Punch is a mandatory combination.',
    moveset_same_across_leagues: false, requires_second_move: true,
    move_pool_limited: false, move_pool_note: null,
    verified: false,
  },
];

// Returns a Promise matching the Supabase client interface.
// Production code uses: const { data } = await supabase.from('pokemon_moves').select('*').eq('species', s).eq('league', l).single();
async function getMoves(species, league, form = null) {
  const row = MOVES_DATA.find(r =>
    r.species === species &&
    r.league === league &&
    (r.form ?? null) === (form ?? null)
  );
  return row || null;
}

module.exports = { getMoves, MOVES_DATA };
