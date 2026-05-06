-- PokéVault — Targeted pokemon_moves fixes (2026-05-04)
-- Run in Supabase SQL editor:
-- https://supabase.com/dashboard/project/jsozfpsfvvnnmipsksoh/sql/new
--
-- These are CONFIRMED fixes from advisor testing.
-- Task 4 entries (Garchomp, Giratina, Palkia, Dialga, Dragonite, Aerodactyl)
-- are NOT included here — they need pvpoke.com verification first.
--
-- After running these, re-run the import script to propagate any remaining
-- flag fixes, then re-run verify-moves-against-pvpoke.js to confirm 0 diffs.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Task 2 — Wrong move names ─────────────────────────────────────────────────

-- Machamp ML: fast move is Counter (not Karate Chop — that is legacy)
UPDATE pokemon_moves
SET fast_move_best   = 'Counter',
    fast_move_legacy = false,
    charged1_move    = 'Cross Chop',
    charged2_move    = 'Rock Slide'
WHERE species = 'Machamp' AND league = 'M';

-- Metagross ML: fast move is Bullet Punch (Shadow Claw is legacy — do not TM away)
-- Meteor Mash is a CD move requiring Elite TM
UPDATE pokemon_moves
SET fast_move_best      = 'Bullet Punch',
    fast_move_legacy    = false,
    charged1_elite_tm   = true,
    charged1_cd         = true
WHERE species = 'Metagross' AND league = 'M';

-- Blastoise ML: fast move is Water Gun; Hydro Cannon = CD + Elite TM
UPDATE pokemon_moves
SET fast_move_best    = 'Water Gun',
    fast_move_legacy  = false,
    charged1_elite_tm = true,
    charged1_cd       = true
WHERE species = 'Blastoise' AND league = 'M';

-- Samurott ML: fast move is Fury Cutter; Hydro Cannon = CD + Elite TM
UPDATE pokemon_moves
SET fast_move_best    = 'Fury Cutter',
    fast_move_legacy  = false,
    charged1_elite_tm = true,
    charged1_cd       = true
WHERE species = 'Samurott' AND league = 'M';

-- ── Task 3 — Confirmed Elite TM flag fixes ────────────────────────────────────

-- Groudon ML: Precipice Blades (charged1) and Fire Punch (charged2) both Elite TM
UPDATE pokemon_moves
SET charged1_elite_tm = true,
    charged2_elite_tm = true
WHERE species = 'Groudon' AND league = 'M';

-- Kyogre ML: Origin Pulse (charged2) Elite TM
UPDATE pokemon_moves
SET charged2_elite_tm = true
WHERE species = 'Kyogre' AND league = 'M';

-- Rayquaza ML: Dragon Ascent (charged2) Elite TM
UPDATE pokemon_moves
SET charged2_elite_tm = true
WHERE species = 'Rayquaza' AND league = 'M';

-- Reshiram ML: Fusion Flare (charged1) Elite TM
UPDATE pokemon_moves
SET charged1_elite_tm = true
WHERE species = 'Reshiram' AND league = 'M';

-- Kyurem ML: Glaciate (charged1) Elite TM
UPDATE pokemon_moves
SET charged1_elite_tm = true
WHERE species = 'Kyurem' AND league = 'M';

-- Lugia ML: Aeroblast (charged1) Elite TM
UPDATE pokemon_moves
SET charged1_elite_tm = true
WHERE species = 'Lugia' AND league = 'M';

-- Zekrom ML: Fusion Bolt (charged2) Elite TM
UPDATE pokemon_moves
SET charged2_elite_tm = true
WHERE species = 'Zekrom' AND league = 'M';

-- Mewtwo ML: Psystrike (charged1) Elite TM
UPDATE pokemon_moves
SET charged1_elite_tm = true
WHERE species = 'Mewtwo' AND league = 'M';

-- Fire starter CD moves missing Elite TM flag (Blast Burn)
UPDATE pokemon_moves
SET charged1_elite_tm = true,
    charged1_cd       = true
WHERE species IN ('Charizard', 'Typhlosion', 'Cinderace') AND league = 'M';

-- Grass/Water starter CD moves missing Elite TM flag
UPDATE pokemon_moves
SET charged2_elite_tm = true,
    charged2_cd       = true
WHERE species IN ('Rillaboom', 'Primarina') AND league = 'M';
