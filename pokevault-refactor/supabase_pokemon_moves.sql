-- ═══════════════════════════════════════════════════════════════════════
-- PokéVault — pokemon_moves table
-- Move recommendations for the moves advisor feature.
-- Run in Supabase SQL editor (Dashboard → SQL Editor → New query).
-- ═══════════════════════════════════════════════════════════════════════

-- ── Schema ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pokemon_moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  species text NOT NULL,
  league  text NOT NULL,              -- 'G' | 'U' | 'M' | 'L'
  form    text,                       -- 'Origin', 'Alola' etc — null for standard

  -- Fast move
  fast_move_best       text NOT NULL,
  fast_move_legacy     bool DEFAULT false,
  fast_move_cd         bool DEFAULT false,   -- Community Day move
  fast_move_elite_tm   bool DEFAULT false,
  fast_move_note       text,
  fast_move_alternatives jsonb,
  -- [{"move": "Water Gun", "note": "budget option, significantly weaker"}]

  -- Charged move 1 (priority)
  charged1_move        text NOT NULL,
  charged1_legacy      bool DEFAULT false,
  charged1_cd          bool DEFAULT false,
  charged1_elite_tm    bool DEFAULT false,
  charged1_note        text,
  charged1_alternatives jsonb,
  -- [{"move": "Surf", "note": "best if no Elite TM", "elite_tm": false}]

  -- Charged move 2
  charged2_move        text,
  charged2_legacy      bool DEFAULT false,
  charged2_cd          bool DEFAULT false,
  charged2_elite_tm    bool DEFAULT false,
  charged2_note        text,
  charged2_alternatives jsonb,

  -- Context
  role_note                   text,
  moveset_same_across_leagues bool DEFAULT false,
  requires_second_move        bool DEFAULT true,
  pvpoke_url                  text,

  -- Limited move pool warning (Banette, others)
  move_pool_limited bool DEFAULT false,
  move_pool_note    text,

  -- Meta
  source       text DEFAULT 'claude',    -- 'claude' | 'pvpoke' | 'manual'
  verified     bool DEFAULT false,        -- manually verified by Mariellen before using in prod
  last_updated timestamptz DEFAULT now(),

  UNIQUE(species, league, form)
);

-- ── Row Level Security ────────────────────────────────────────────────────────
-- Phase 1: permissive anon access (same pattern as other tables).
-- Phase 2: restrict to authenticated users once auth is implemented.

ALTER TABLE pokemon_moves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read"   ON pokemon_moves FOR SELECT TO anon USING (true);
CREATE POLICY "anon_write"  ON pokemon_moves FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update" ON pokemon_moves FOR UPDATE TO anon USING (true);

-- ═══════════════════════════════════════════════════════════════════════
-- Seed data — first 5 priority species
-- All rows have verified=false until Mariellen reviews and sets to true.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Swampert (Great League) ───────────────────────────────────────────────────
INSERT INTO pokemon_moves (
  species, league,
  fast_move_best, fast_move_legacy, fast_move_cd, fast_move_elite_tm, fast_move_note,
  fast_move_alternatives,
  charged1_move, charged1_legacy, charged1_cd, charged1_elite_tm, charged1_note,
  charged1_alternatives,
  charged2_move, charged2_note,
  charged2_alternatives,
  role_note, moveset_same_across_leagues, requires_second_move,
  pvpoke_url, source, verified
) VALUES (
  'Swampert', 'G',
  'Mud Shot', false, false, false,
  'Core to the gameplan — generates energy very fast',
  NULL,
  'Hydro Cannon', false, true, true,
  'Community Day move — the best option by a wide margin. Get an Elite TM if you can.',
  '[{"move": "Surf", "note": "best if no Elite TM", "elite_tm": false}]',
  'Earthquake', 'Ground coverage — pairs perfectly with Hydro Cannon',
  '[{"move": "Sludge Wave", "note": "anti-Fairy option — narrow coverage but useful in some metas"}]',
  'A-tier Great League staple. Water/Ground typing has only one weakness (Grass), making it a splashable pick on almost any team.',
  true, true,
  'https://pvpoke.com/rankings/gl/1500/overall/swampert/',
  'claude', false
);

-- ── Umbreon (Great League) ────────────────────────────────────────────────────
INSERT INTO pokemon_moves (
  species, league,
  fast_move_best, fast_move_legacy, fast_move_cd, fast_move_elite_tm, fast_move_note,
  charged1_move, charged1_legacy, charged1_cd, charged1_elite_tm, charged1_note,
  charged1_alternatives,
  charged2_move, charged2_legacy, charged2_elite_tm, charged2_note,
  charged2_alternatives,
  role_note, moveset_same_across_leagues, requires_second_move,
  pvpoke_url, source, verified
) VALUES (
  'Umbreon', 'G',
  'Snarl', false, false, false,
  'Fast energy generation — enables constant shield pressure',
  'Foul Play', false, false, false,
  'STAB Dark-type move — solid coverage and energy cost',
  '[{"move": "Psychic", "note": "Poison/Fighting coverage but lower priority than Last Resort"}]',
  'Last Resort', true, true,
  'Legacy move (Elite TM required) — second best charged move for Umbreon in PvP',
  '[{"move": "Moonblast", "note": "best if no Elite TM — anti-Dragon/Fighting coverage"}]',
  'S-tier Great League tank. Dark/Normal typing with exceptional bulk. Works as a safe switch and closer.',
  true, true,
  'https://pvpoke.com/rankings/gl/1500/overall/umbreon/',
  'claude', false
);

-- ── Umbreon (Ultra League) ────────────────────────────────────────────────────
INSERT INTO pokemon_moves (
  species, league,
  fast_move_best, fast_move_legacy, fast_move_cd, fast_move_elite_tm, fast_move_note,
  charged1_move, charged1_legacy, charged1_cd, charged1_elite_tm, charged1_note,
  charged1_alternatives,
  charged2_move, charged2_legacy, charged2_elite_tm, charged2_note,
  charged2_alternatives,
  role_note, moveset_same_across_leagues, requires_second_move,
  pvpoke_url, source, verified
) VALUES (
  'Umbreon', 'U',
  'Snarl', false, false, false,
  'Fast energy generation — same role as Great League',
  'Foul Play', false, false, false,
  'Same best charged move as Great League',
  NULL,
  'Last Resort', true, true,
  'Legacy move (Elite TM required) — same second move as Great League',
  '[{"move": "Moonblast", "note": "best if no Elite TM"}]',
  'Solid Ultra League pick with the same moveset as Great League. Bulk is especially valuable at the higher CP ceiling.',
  true, true,
  'https://pvpoke.com/rankings/ul/2500/overall/umbreon/',
  'claude', false
);

-- ── Metagross (Ultra League) ──────────────────────────────────────────────────
INSERT INTO pokemon_moves (
  species, league,
  fast_move_best, fast_move_legacy, fast_move_cd, fast_move_elite_tm, fast_move_note,
  charged1_move, charged1_legacy, charged1_cd, charged1_elite_tm, charged1_note,
  charged1_alternatives,
  charged2_move, charged2_note,
  charged2_alternatives,
  role_note, moveset_same_across_leagues, requires_second_move,
  pvpoke_url, source, verified
) VALUES (
  'Metagross', 'U',
  'Bullet Punch', false, false, false,
  'Best energy-generating fast move for PvP',
  'Meteor Mash', false, true, true,
  'Community Day move — significantly outperforms all alternatives. Requires Elite TM.',
  '[{"move": "Flash Cannon", "note": "best non-CD Steel charged move if no Elite TM"}]',
  'Earthquake', 'Ground coverage — neutral damage on most opponents that resist Steel',
  '[{"move": "Psychic", "note": "STAB coverage but less universal than Earthquake"}]',
  'A-tier Ultra League pick. Steel/Psychic typing with impressive bulk. Especially good in metas with heavy Fairy and Ice presence.',
  false, true,
  'https://pvpoke.com/rankings/ul/2500/overall/metagross/',
  'claude', false
);

-- ── Banette (Great League) ────────────────────────────────────────────────────
INSERT INTO pokemon_moves (
  species, league,
  fast_move_best, fast_move_legacy, fast_move_cd, fast_move_elite_tm, fast_move_note,
  charged1_move, charged1_legacy, charged1_cd, charged1_elite_tm, charged1_note,
  charged1_alternatives,
  charged2_move, charged2_note,
  charged2_alternatives,
  role_note, moveset_same_across_leagues, requires_second_move,
  move_pool_limited, move_pool_note,
  pvpoke_url, source, verified
) VALUES (
  'Banette', 'G',
  'Shadow Claw', true, false, false,
  'Legacy move — do NOT TM this under any circumstances. Irreplaceable.',
  'Shadow Ball', false, false, false,
  'STAB Ghost-type nuke — the primary damage move',
  NULL,
  'Dazzling Gleam', 'Anti-Dark/Dragon coverage',
  '[{"move": "Thunder", "note": "alternative coverage if Dazzling Gleam not useful in current meta"}]',
  'Niche Great League Ghost-type. Only viable if you have Shadow Claw (legacy). Without it, skip.',
  false, true,
  true, 'Only 3 obtainable charged moves: Shadow Ball, Dazzling Gleam, Thunder. (Shadow Sneak is also legacy but weaker.) Check with Elite TM before unlocking second move to confirm target move is available.',
  'https://pvpoke.com/rankings/gl/1500/overall/banette/',
  'claude', false
);

-- ── Medicham (Great League) ───────────────────────────────────────────────────
INSERT INTO pokemon_moves (
  species, league,
  fast_move_best, fast_move_legacy, fast_move_cd, fast_move_elite_tm, fast_move_note,
  fast_move_alternatives,
  charged1_move, charged1_legacy, charged1_cd, charged1_elite_tm, charged1_note,
  charged1_alternatives,
  charged2_move, charged2_note,
  charged2_alternatives,
  role_note, moveset_same_across_leagues, requires_second_move,
  pvpoke_url, source, verified
) VALUES (
  'Medicham', 'G',
  'Counter', false, false, false,
  'One of the best fast moves in PvP — STAB Fighting with excellent energy generation',
  NULL,
  'Power-Up Punch', false, false, false,
  'Essential — builds ATK boosts that snowball later in the match',
  NULL,
  'Ice Punch', 'Anti-Dragon/Flying coverage — most broadly useful second move',
  '[{"move": "Psychic", "note": "anti-Fighting/Poison coverage — situationally better in some cups"}]',
  'S-tier Great League staple. Psychic/Fighting typing with elite coverage. Counter + Power-Up Punch is a mandatory combination.',
  false, true,
  'https://pvpoke.com/rankings/gl/1500/overall/medicham/',
  'claude', false
);
