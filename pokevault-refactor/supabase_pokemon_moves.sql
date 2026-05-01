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

DROP POLICY IF EXISTS "anon_read"   ON pokemon_moves;
DROP POLICY IF EXISTS "anon_write"  ON pokemon_moves;
DROP POLICY IF EXISTS "anon_update" ON pokemon_moves;
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
)
ON CONFLICT (species, league, form) DO NOTHING;

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
)
ON CONFLICT (species, league, form) DO NOTHING;

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
)
ON CONFLICT (species, league, form) DO NOTHING;

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
)
ON CONFLICT (species, league, form) DO NOTHING;

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
)
ON CONFLICT (species, league, form) DO NOTHING;

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
)
ON CONFLICT (species, league, form) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- Bulk seed — 99 additional PvP species (all verified=false)
-- Generated from moves-data.js fixture. Run after initial 5-species seed.
-- ON CONFLICT DO NOTHING so this script is safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO pokemon_moves (
  species, league, form,
  fast_move_best, fast_move_legacy, fast_move_cd, fast_move_elite_tm, fast_move_note, fast_move_alternatives,
  charged1_move, charged1_legacy, charged1_cd, charged1_elite_tm, charged1_note, charged1_alternatives,
  charged2_move, charged2_legacy, charged2_cd, charged2_elite_tm, charged2_note, charged2_alternatives,
  role_note, moveset_same_across_leagues, requires_second_move,
  move_pool_limited, move_pool_note, source, verified
) VALUES

-- ── Tier 1 Great League ───────────────────────────────────────────────────────
('Registeel','G',null,'Lock-On',false,false,false,'Generates energy at an exceptional rate — enables constant charged move spam',null,
 'Zap Cannon',false,false,false,'High-damage Electric nuke — pairs with Lock-On energy spam',null,
 'Focus Blast',false,false,false,'Fighting coverage — handles Dark/Normal/Steel matchups','[{"move":"Flash Cannon","note":"Steel STAB budget alternative"}]',
 'S-tier Great League wall. Steel typing with only Fire/Fighting/Ground weaknesses. Lock-On + Zap Cannon/Focus Blast is nearly unbeatable with shields.',
 false,true,false,null,'claude',false),

('Trevenant','G',null,'Shadow Claw',false,false,false,'Best Ghost fast move — excellent DPT and EPT',null,
 'Shadow Ball',false,false,false,'STAB Ghost nuke — primary damage move',null,
 'Seed Bomb',false,false,false,'Grass coverage — handles Water/Ground/Rock types that resist Ghost','[{"move":"Foul Play","note":"Dark STAB alternative for anti-Psychic/Ghost coverage"}]',
 'Strong Ghost/Grass GL pick. Resists many common types. Shadow Claw gives consistent pressure.',
 false,true,false,null,'claude',false),

('Sableye','G',null,'Shadow Claw',false,false,false,'Best Ghost fast move for Sableye — available via standard TM','[{"move":"Feint Attack","note":"Dark alternative if Shadow Claw unavailable"}]',
 'Foul Play',false,false,false,'STAB Dark charged move — reliable 45-energy option',null,
 'Return',false,false,false,'Purified move — requires a purified Sableye. Excellent neutral coverage.','[{"move":"Dazzling Gleam","note":"best if not purified — Fairy coverage vs Dark/Dragon/Fighting"}]',
 'Bulky Ghost/Dark with no Normal or Fighting weaknesses. Purified Return is the optimal second move.',
 false,true,false,null,'claude',false),

('Lickitung','G',null,'Lick',false,false,false,'Only viable fast move for PvP — decent energy generation',null,
 'Body Slam',false,true,true,'Community Day move — dramatically outperforms alternatives. The entire case for Lickitung in GL rests on this move.','[{"move":"Hyper Beam","note":"only option without Elite TM — far weaker","elite_tm":false}]',
 'Power Whip',false,false,false,'Grass coverage — handles Water/Rock/Ground matchups',null,
 'Exceptional GL tank purely because of Body Slam spam. Without Elite TM Lickitung is not competitive.',
 false,true,false,null,'claude',false),

('Azumarill','G',null,'Bubble',false,false,false,'Best Water fast move — excellent energy generation',null,
 'Ice Beam',false,false,false,'Primary coverage — hits Grass counters for super-effective damage',null,
 'Play Rough',false,false,false,'Fairy STAB — covers Dragon, Fighting, Dark types','[{"move":"Hydro Pump","note":"Water nuke alternative — less coverage than Play Rough"}]',
 'S-tier Great League staple. Water/Fairy typing resists Fire, Water, Ice, Dark, Fighting, Dragon, Bug.',
 false,true,false,null,'claude',false),

('Altaria','G',null,'Dragon Breath',false,false,false,'Best fast move — excellent DPT and good energy generation',null,
 'Sky Attack',false,false,false,'Flying STAB — fast and strong, primary pressure move',null,
 'Moonblast',false,false,false,'Fairy coverage — handles Dragon, Dark, Fighting matchups','[{"move":"Dragon Pulse","note":"Dragon STAB alternative with similar coverage to Dragon Breath"}]',
 'A-tier GL Dragon/Flying with Fairy coverage. Excellent neutral coverage across the meta.',
 false,true,false,null,'claude',false),

('Bastiodon','G',null,'Smack Down',false,false,false,'Only viable fast move — Rock type with OK energy generation',null,
 'Stone Edge',false,false,false,'Rock STAB — primary damage move',null,
 'Flamethrower',false,false,false,'Fire coverage — handles Grass/Ice/Steel matchups','[{"move":"Thunderbolt","note":"Electric coverage for Water/Flying types"}]',
 'S-tier in restricted cups. Rock/Steel typing with incredible bulk — wall against Flying/Ice/Fire/Normal.',
 false,true,false,null,'claude',false),

('Vigoroth','G',null,'Counter',false,false,false,'Best Fighting fast move — excellent DPT and EPT',null,
 'Body Slam',false,false,false,'Normal STAB — cheap and consistent spam move',null,
 'Bulldoze',false,false,false,'Ground coverage — handles Steel, Poison, Fire, Electric types','[{"move":"Brick Break","note":"Fighting coverage alternative"}]',
 'GL Normal-type attacker with Fighting fast move. Counter gives it matchup coverage beyond what its Normal typing suggests.',
 false,true,false,null,'claude',false),

('Skarmory','G',null,'Air Slash',false,false,false,'Best fast move — higher DPT than Steel Wing, good coverage','[{"move":"Steel Wing","note":"Steel STAB alternative — lower DPT but slightly faster energy"}]',
 'Sky Attack',false,false,false,'Flying STAB — powerful primary charged move',null,
 'Brave Bird',false,false,false,'Nuke option — high damage but self-ATK debuff, use for closing','[{"move":"Flash Cannon","note":"Steel STAB if Brave Bird debuff is undesirable"}]',
 'A-tier GL Steel/Flying safe switch. Doubly resistant to Grass.',
 false,true,false,null,'claude',false),

('Dewgong','G',null,'Ice Shard',true,false,true,'Legacy fast move — Elite TM required. The entire GL viability depends on having this.','[{"move":"Frost Breath","note":"standard alternative — significantly weaker in PvP","elite_tm":false}]',
 'Icy Wind',true,false,true,'Legacy charged move — Elite TM required. Speed/debuff move that defines Dewgong''s kit.','[{"move":"Blizzard","note":"standard option without Elite TM — far less effective in PvP","elite_tm":false}]',
 'Water Pulse',false,false,false,'Water coverage — standard charged move for second slot',null,
 'Niche GL Ice/Water — only competitive if you have BOTH legacy Ice Shard AND legacy Icy Wind. Without both, skip.',
 false,true,true,'Fully dependent on two separate legacy moves (Ice Shard + Icy Wind). Check Elite TMs available before investing.','claude',false),

('Walrein','G',null,'Powder Snow',false,true,true,'Community Day fast move — Elite TM required. Core to GL viability.','[{"move":"Frost Breath","note":"standard option without Elite TM — significantly weaker","elite_tm":false}]',
 'Icicle Spear',false,true,true,'Community Day charged move — Elite TM required. Cheap spam move that pairs perfectly with Powder Snow.','[{"move":"Blizzard","note":"standard option without Elite TM — far more expensive energy cost","elite_tm":false}]',
 'Earthquake',false,false,false,'Ground coverage — handles Electric, Fire, Steel, Poison types',null,
 'Top-tier GL Ice/Water. Requires BOTH Community Day moves (Elite TM for each).',
 false,true,false,null,'claude',false),

('Diggersby','G',null,'Mud Shot',false,false,false,'Best fast move — excellent energy generation',null,
 'Fire Punch',false,false,false,'Coverage charged move — handles Grass, Ice, Steel, Bug types',null,
 'Earthquake',false,false,false,'Ground STAB — strong coverage against Electric, Fire, Steel, Poison, Rock','[{"move":"Dig","note":"lower damage Ground alternative"}]',
 'Solid GL Normal/Ground. Mud Shot generates energy fast for constant Fire Punch/Earthquake pressure.',
 false,true,false,null,'claude',false),

('Galvantula','G',null,'Volt Switch',false,false,false,'Best fast move — Electric STAB with excellent energy generation','[{"move":"Bug Bite","note":"Bug STAB alternative — lower energy generation"}]',
 'Lunge',false,false,false,'Bug STAB that lowers opponent ATK — excellent for shield baiting and stat pressure',null,
 'Discharge',false,false,false,'Electric STAB coverage move','[{"move":"Thunder","note":"Electric nuke alternative — higher damage, higher cost"}]',
 'Niche GL Bug/Electric with ATK-debuff game plan via Lunge.',
 false,true,false,null,'claude',false),

('Toxapex','G',null,'Poison Jab',false,false,false,'Best Poison fast move — solid DPT and energy generation','[{"move":"Bite","note":"Dark alternative — different coverage profile"}]',
 'Brine',false,false,false,'Water charged move — cheap pressure option with solid coverage',null,
 'Sludge Wave',false,false,false,'Poison STAB — handles Grass and Fairy types','[{"move":"Gunk Shot","note":"higher damage Poison option — more costly"}]',
 'Poison/Water GL wall. Strong anti-Fairy and anti-Grass.',
 false,true,false,null,'claude',false),

('Annihilape','G',null,'Low Kick',false,false,false,'Fighting fast move with solid energy generation',null,
 'Rage Fist',false,false,false,'Signature Ghost STAB — low energy cost, excellent for shield pressure',null,
 'Close Combat',false,false,false,'Fighting STAB — high damage, self-DEF debuff, use for closing','[{"move":"Night Slash","note":"Dark coverage alternative — faster to fire"}]',
 'Strong GL Fighting/Ghost. Fighting fast move + Ghost charged creates unique dual-type coverage.',
 false,true,false,null,'claude',false),

('Cresselia','G',null,'Psycho Cut',false,false,false,'Best fast move — excellent energy generation enables constant charged move use',null,
 'Moonblast',false,false,false,'Fairy STAB — excellent coverage vs Dark, Dragon, Fighting',null,
 'Grass Knot',false,false,false,'Grass coverage — handles Water, Ground, Rock types','[{"move":"Future Sight","note":"Psychic STAB nuke — high damage, higher cost"}]',
 'S-tier GL/UL Psychic tank with incredible bulk. Psycho Cut spam + Moonblast is a top safe switch.',
 true,true,false,null,'claude',false),

('Cresselia','U',null,'Psycho Cut',false,false,false,'Same as Great League — energy generation is core',null,
 'Moonblast',false,false,false,'Same as Great League',null,
 'Grass Knot',false,false,false,'Same as Great League','[{"move":"Future Sight","note":"Psychic STAB nuke — high damage, higher cost"}]',
 'Top-tier UL Psychic tank. Same moveset as GL. Bulk becomes even more pronounced at higher CP ceiling.',
 true,true,false,null,'claude',false),

('Jellicent','G',null,'Hex',false,false,false,'Ghost fast move with solid energy generation',null,
 'Surf',false,false,false,'Water STAB — cheap pressure move for constant use','[{"move":"Bubble Beam","note":"Water alternative — lower damage, cheap cost"}]',
 'Shadow Ball',false,false,false,'Ghost STAB nuke — heavy hitter for closing out matches',null,
 'GL Ghost/Water with strong dual-STAB coverage. Good safe switch.',
 false,true,false,null,'claude',false),

('Carbink','G',null,'Rock Throw',false,false,false,'Rock fast move — best option for GL coverage','[{"move":"Tackle","note":"Normal alternative — weaker but faster energy"}]',
 'Rock Slide',false,false,false,'Cheap Rock STAB — low-cost pressure move',null,
 'Moonblast',false,false,false,'Fairy STAB — covers Dragon, Dark, Fighting types','[{"move":"Power Gem","note":"Rock STAB alternative — adds Rock coverage"}]',
 'Solid GL Rock/Fairy wall. Fairy typing neutralises Dragon weakness.',
 false,true,false,null,'claude',false),

('Dachsbun','G',null,'Bite',false,false,false,'Dark fast move — best energy generation option',null,
 'Play Rough',false,false,false,'Fairy STAB — covers Dragon, Dark, Fighting',null,
 'Body Slam',false,false,false,'Normal coverage — fast cheap pressure move',null,
 'GL Normal/Fairy. Good bulk and solid Fairy coverage.',
 false,true,false,null,'claude',false),

('Froslass','G',null,'Powder Snow',false,false,false,'Ice fast move with good energy generation','[{"move":"Shadow Claw","note":"Ghost alternative — different coverage profile"}]',
 'Avalanche',false,false,false,'Ice STAB — primary damage move',null,
 'Shadow Ball',false,false,false,'Ghost coverage — hits Psychic and Ghost types','[{"move":"Crunch","note":"Dark alternative for Psychic/Ghost coverage"}]',
 'GL Ice/Ghost. Ice typing excellent in GL meta vs Dragons and Grass.',
 false,true,false,null,'claude',false),

('Obstagoon','G',null,'Counter',false,false,false,'Best Fighting fast move — excellent DPT and EPT','[{"move":"Lick","note":"Ghost alternative — different coverage profile"}]',
 'Night Slash',false,false,false,'Dark STAB — fast 35-energy move, can raise crit chance',null,
 'Cross Chop',false,false,false,'Fighting STAB — coverage against Normal, Steel, Ice, Rock, Dark','[{"move":"Hyper Beam","note":"Normal coverage nuke — higher cost, higher damage"}]',
 'Solid GL Dark/Normal. Counter gives Fighting coverage that Dark typing usually lacks.',
 false,true,false,null,'claude',false),

('Scrafty','G',null,'Counter',false,false,false,'Best Fighting fast move — superior damage by a wide margin','[{"move":"Snarl","note":"Dark alternative — faster energy but less damage"}]',
 'Foul Play',false,false,false,'Dark STAB — punishes Psychic and Ghost matchups',null,
 'Upper Hand',false,false,false,'Priority Fighting move — cheap cost, can drop opponent DEF','[{"move":"Power-Up Punch","note":"Fighting STAB that boosts own ATK — older meta pick"}]',
 'GL Dark/Fighting. Counter + Foul Play hits most of the meta for neutral damage.',
 false,true,false,null,'claude',false),

-- ── Tier 2 Ultra League ───────────────────────────────────────────────────────
('Escavalier','U',null,'Counter',false,false,false,'Best fast move — Fighting coverage with solid energy generation',null,
 'Megahorn',false,false,false,'Bug STAB — powerful primary charged move',null,
 'Drill Run',false,false,false,'Ground coverage — handles Electric, Fire, Steel types that resist Bug',null,
 'Solid UL Bug/Steel attacker. Counter provides Fighting coverage most Bug-types lack.',
 false,true,false,null,'claude',false),

('Venusaur','U',null,'Vine Whip',false,false,false,'Best Grass fast move — good energy generation',null,
 'Frenzy Plant',false,true,true,'Community Day Grass move — best charged move by far. Requires Elite TM.','[{"move":"Solar Beam","note":"standard Grass STAB if no Elite TM — very high energy cost","elite_tm":false}]',
 'Sludge Bomb',false,false,false,'Poison STAB — covers Fairy and other Grass types',null,
 'Solid UL Grass/Poison. Frenzy Plant is the key move.',
 false,true,false,null,'claude',false),

('Charizard','U',null,'Fire Spin',false,false,false,'Best Fire fast move — solid DPT and energy generation','[{"move":"Dragon Breath","note":"Dragon alternative — use for Dragon-focused moveset coverage"}]',
 'Blast Burn',false,true,true,'Community Day Fire move — best charged move. Requires Elite TM.','[{"move":"Overheat","note":"standard Fire STAB if no Elite TM — self-ATK debuff","elite_tm":false}]',
 'Dragon Claw',false,false,false,'Dragon coverage — cheap fast move for baiting shields',null,
 'Popular UL Fire/Flying. Blast Burn makes it competitive.',
 false,true,false,null,'claude',false),

('Machamp','U',null,'Counter',false,false,false,'Best Fighting fast move in the game',null,
 'Cross Chop',false,false,false,'Fast Fighting charged move — excellent for shield pressure',null,
 'Rock Slide',false,false,false,'Rock coverage — handles Flying and Ice types that resist Fighting','[{"move":"Dynamic Punch","note":"Fighting nuke — high damage, high cost"}]',
 'Solid UL Fighting attacker.',
 false,true,false,null,'claude',false),

('Gyarados','U',null,'Dragon Breath',false,false,false,'Best fast move — Dragon type with excellent DPT and EPT','[{"move":"Waterfall","note":"Water alternative — lower performance but STAB"}]',
 'Aqua Tail',false,false,false,'Water STAB — cheap and consistent charged move',null,
 'Crunch',false,false,false,'Dark coverage — handles Psychic and Ghost types','[{"move":"Outrage","note":"Dragon nuke alternative — high damage, high cost"}]',
 'Strong UL Water/Flying.',
 false,true,false,null,'claude',false),

('Dragonite','U',null,'Dragon Breath',false,false,false,'Best fast move — excellent DPT and EPT',null,
 'Dragon Claw',false,false,false,'Cheap Dragon STAB — shields bait and consistent pressure',null,
 'Hurricane',false,false,false,'Flying STAB — coverage against Fighting, Bug, Grass types','[{"move":"Draco Meteor","note":"Dragon nuke — high damage, self-ATK debuff"}]',
 'Versatile UL Dragon/Flying. Dragon Breath + Dragon Claw spam with Hurricane as the nuke option.',
 true,true,false,null,'claude',false),

('Dragonite','M',null,'Dragon Breath',false,false,false,'Same as Ultra League',null,
 'Dragon Claw',false,false,false,'Cheap Dragon STAB — same as Ultra League',null,
 'Hurricane',false,false,false,'Flying STAB — same as Ultra League','[{"move":"Draco Meteor","note":"Dragon nuke alternative"}]',
 'Reliable ML Dragon/Flying. Same moveset as UL.',
 true,true,false,null,'claude',false),

('Gengar','U',null,'Shadow Claw',false,false,false,'Best Ghost fast move — good energy generation. Available via standard TM.','[{"move":"Hex","note":"Ghost alternative fast move — slightly different matchup profile"}]',
 'Shadow Ball',false,false,false,'Ghost STAB nuke — primary damage move',null,
 'Sludge Bomb',false,false,false,'Poison STAB — coverage against Fairy and Grass types','[{"move":"Focus Blast","note":"Fighting coverage — handles Dark and Normal types"}]',
 'UL Ghost/Poison attacker. Shadow Claw energy generation + Shadow Ball spam is effective.',
 false,true,false,null,'claude',false),

('Lapras','U',null,'Ice Shard',false,false,false,'Best Ice fast move for GL/UL — good energy generation','[{"move":"Water Gun","note":"Water alternative — wider coverage profile"}]',
 'Surf',false,false,false,'Water STAB — cheap pressure option',null,
 'Ice Beam',false,false,false,'Ice STAB coverage — handles Dragon and Grass types','[{"move":"Skull Bash","note":"Normal coverage nuke — high damage option"}]',
 'Solid UL Water/Ice tank with high bulk.',
 false,true,false,null,'claude',false),

('Feraligatr','U',null,'Waterfall',false,false,false,'Best Water fast move — strong DPT with decent energy generation',null,
 'Hydro Cannon',false,true,true,'Community Day Water move — best charged move. Elite TM required.','[{"move":"Hydro Pump","note":"standard Water STAB if no Elite TM — higher energy cost","elite_tm":false}]',
 'Ice Fang',false,false,false,'Ice coverage — handles Dragon, Grass, Flying types','[{"move":"Crunch","note":"Dark coverage alternative"}]',
 'Solid UL Water attacker. Hydro Cannon is the key move.',
 false,true,false,null,'claude',false),

('Politoed','U',null,'Mud Shot',false,false,false,'Best fast move — Ground type with excellent energy generation','[{"move":"Bubble","note":"Water alternative fast move — lower energy generation"}]',
 'Weather Ball',false,false,false,'Water-type Weather Ball — fast cheap Water charged move','[{"move":"Surf","note":"standard Water STAB if Weather Ball is unavailable"}]',
 'Earthquake',false,false,false,'Ground STAB — covers Electric, Fire, Steel, Poison types',null,
 'Underrated UL Water. Mud Shot generates energy fast for Weather Ball spam.',
 false,true,false,null,'claude',false),

('Granbull','U',null,'Charm',false,false,false,'Fairy fast move — best DPT option',null,
 'Close Combat',false,false,false,'Fighting coverage — handles Steel types that resist Fairy',null,
 'Crunch',false,false,false,'Dark coverage — handles Psychic and Ghost types','[{"move":"Body Slam","note":"Normal STAB alternative — less coverage but consistent"}]',
 'UL Fairy attacker. Charm DPT is high but slow — needs shields to function.',
 false,true,false,null,'claude',false),

('Ampharos','U',null,'Volt Switch',false,false,false,'Best Electric fast move — good energy generation','[{"move":"Charge Beam","note":"weaker Electric alternative"}]',
 'Zap Cannon',false,false,false,'Electric STAB nuke — high damage, can lower opponent SPD',null,
 'Focus Blast',false,false,false,'Fighting coverage — handles Steel, Dark, Normal, Ice, Rock types','[{"move":"Dragon Pulse","note":"Dragon coverage for Mega Ampharos sets"}]',
 'Solid UL Electric attacker. Volt Switch + Zap Cannon spam with Focus Blast for Steel coverage.',
 false,true,false,null,'claude',false),

('Meganium','U',null,'Vine Whip',false,false,false,'Best Grass fast move — good energy generation',null,
 'Frenzy Plant',false,true,true,'Community Day Grass move — Elite TM required. Core to UL viability.','[{"move":"Solar Beam","note":"standard Grass STAB — very high energy cost","elite_tm":false}]',
 'Earthquake',false,false,false,'Ground coverage — handles Fire, Steel, Poison, Electric types that threaten Grass','[{"move":"Body Slam","note":"Normal STAB alternative — fast cheap pressure"}]',
 'UL Grass attacker. Frenzy Plant is the key move.',
 false,true,false,null,'claude',false),

('Typhlosion','U',null,'Incinerate',false,false,false,'Best Fire fast move — good DPT and energy generation','[{"move":"Fire Spin","note":"Fire alternative — slightly lower energy generation"}]',
 'Blast Burn',false,true,true,'Community Day Fire move — Elite TM required. Best charged move.','[{"move":"Overheat","note":"standard Fire STAB — self-ATK debuff, weaker than Blast Burn","elite_tm":false}]',
 'Shadow Ball',false,false,false,'Ghost coverage — handles Psychic and Ghost types',null,
 'UL Fire attacker. Blast Burn is the key move.',
 false,true,false,null,'claude',false),

('Blastoise','U',null,'Water Gun',false,false,false,'Best Water fast move — good energy generation',null,
 'Hydro Cannon',false,true,true,'Community Day Water move — Elite TM required. Core to UL viability.','[{"move":"Hydro Pump","note":"standard Water STAB — higher energy cost","elite_tm":false}]',
 'Ice Beam',false,false,false,'Ice coverage — handles Dragon, Grass, Flying types','[{"move":"Flash Cannon","note":"Steel coverage alternative"}]',
 'Solid UL Water attacker.',
 false,true,false,null,'claude',false),

('Steelix','U',null,'Dragon Tail',false,false,false,'Best fast move for UL — Dragon type with high DPT','[{"move":"Iron Tail","note":"Steel STAB alternative — lower performance in UL"}]',
 'Earthquake',false,false,false,'Ground STAB — primary coverage move',null,
 'Crunch',false,false,false,'Dark coverage — handles Psychic and Ghost types','[{"move":"Outrage","note":"Dragon nuke alternative"}]',
 'Solid UL Steel/Ground wall. Dragon Tail gives it anti-Dragon utility.',
 false,true,false,null,'claude',false),

('Nidoqueen','U',null,'Poison Jab',false,false,false,'Best fast move — Poison STAB with good energy generation',null,
 'Poison Fang',false,false,false,'Cheap Poison charged move — fast spam option for shield pressure',null,
 'Earth Power',false,false,false,'Ground STAB — handles Electric, Fire, Steel, Poison, Rock types','[{"move":"Earthquake","note":"Earthquake alternative Ground option"}]',
 'Versatile UL Poison/Ground. Dual Poison/Ground STAB coverage hits most of the meta.',
 false,true,false,null,'claude',false),

('Poliwrath','U',null,'Bubble',false,false,false,'Best Water fast move — excellent energy generation',null,
 'Dynamic Punch',false,false,false,'Fighting STAB — strong coverage and high damage',null,
 'Ice Punch',false,false,false,'Ice coverage — handles Dragon, Grass, Flying types','[{"move":"Mud Bomb","note":"Ground coverage alternative"}]',
 'Solid UL Water/Fighting. Bubble + Dynamic Punch provides Fighting coverage most Water-types lack.',
 false,true,false,null,'claude',false),

('Slowbro','U',null,'Confusion',false,false,false,'Best Psychic fast move — excellent DPT',null,
 'Ice Beam',false,false,false,'Ice coverage — handles Dragon, Grass, Flying types prevalent in UL',null,
 'Psychic',false,false,false,'Psychic STAB — covers Fighting and Poison types','[{"move":"Water Pulse","note":"budget Water charged move — less damage"}]',
 'UL Water/Psychic with high bulk.',
 false,true,false,null,'claude',false),

('Clefable','U',null,'Charm',false,false,false,'Best Fairy fast move — high DPT',null,
 'Moonblast',false,false,false,'Fairy STAB nuke — primary coverage move',null,
 'Psychic',false,false,false,'Psychic coverage — handles Fighting and Poison types','[{"move":"Dazzling Gleam","note":"secondary Fairy coverage option"}]',
 'UL Fairy attacker with great bulk.',
 false,true,false,null,'claude',false),

('Wigglytuff','U',null,'Charm',false,false,false,'Best Fairy fast move — high DPT',null,
 'Ice Beam',false,false,false,'Ice coverage — handles Dragon, Grass, Flying types',null,
 'Dazzling Gleam',false,false,false,'Fairy STAB nuke — handles Dragon, Dark, Fighting types','[{"move":"Play Rough","note":"Fairy STAB alternative — lower damage, lower cost"}]',
 'UL Normal/Fairy attacker.',
 false,true,false,null,'claude',false),

('Alakazam','U',null,'Counter',false,false,false,'Best fast move for PvP coverage — Fighting coverage compensates for Psychic weaknesses','[{"move":"Confusion","note":"Psychic STAB alternative — higher DPT but less coverage"}]',
 'Psychic',false,false,false,'Psychic STAB — primary damage move',null,
 'Shadow Ball',false,false,false,'Ghost coverage — handles Psychic, Ghost types that resist Psychic STAB','[{"move":"Focus Blast","note":"Fighting coverage — handles Dark and Steel types"}]',
 'UL Psychic glass cannon.',
 false,true,false,null,'claude',false),

('Muk','U','Alolan','Poison Jab',false,false,false,'Best Poison fast move — good energy generation','[{"move":"Bite","note":"Dark alternative fast move — different coverage profile"}]',
 'Gunk Shot',false,false,false,'Poison STAB nuke — primary damage move',null,
 'Dark Pulse',false,false,false,'Dark STAB coverage — handles Psychic and Ghost types',null,
 'Solid UL Poison/Dark. Alolan Muk has exceptional bulk.',
 false,true,false,null,'claude',false),

('Weezing','U','Galarian','Tackle',false,false,false,'Best fast move for Galarian Weezing in PvP','[{"move":"Infestation","note":"Bug alternative fast move"}]',
 'Overheat',false,false,false,'Fire coverage — handles Grass, Ice, Steel, Bug types. Self-ATK debuff.',null,
 'Play Rough',false,false,false,'Fairy STAB — covers Dragon, Dark, Fighting types','[{"move":"Hyper Beam","note":"Normal nuke alternative"}]',
 'Niche UL Poison/Fairy (Galarian). Overheat + Play Rough coverage.',
 false,true,false,null,'claude',false),

('Magneton','U',null,'Spark',false,false,false,'Best Electric fast move — excellent energy generation',null,
 'Discharge',false,false,false,'Electric STAB — fast and consistent charged move',null,
 'Zap Cannon',false,false,false,'Electric nuke — high damage, higher cost','[{"move":"Flash Cannon","note":"Steel STAB for coverage against Fairy/Ice/Rock"}]',
 'Solid UL Electric/Steel/Magnet. Three types give it 12 resistances.',
 false,true,false,null,'claude',false),

('Magnezone','U',null,'Spark',false,false,false,'Best Electric fast move — good energy generation',null,
 'Wild Charge',false,false,false,'Electric STAB — strong damage with self-DEF debuff',null,
 'Zap Cannon',false,false,false,'Electric nuke alternative — very high damage','[{"move":"Flash Cannon","note":"Steel STAB for Fairy/Ice/Rock coverage"}]',
 'Strong UL Electric/Steel.',
 false,true,false,null,'claude',false),

('Tangrowth','U',null,'Vine Whip',false,false,false,'Best Grass fast move — consistent energy generation',null,
 'Power Whip',false,false,false,'Grass STAB nuke — high damage primary charged move',null,
 'Rock Slide',false,false,false,'Rock coverage — handles Flying and Ice types that counter Grass','[{"move":"Sludge Bomb","note":"Poison coverage for other Grass types"}]',
 'Solid UL Grass attacker with good bulk.',
 false,true,false,null,'claude',false),

-- ── Tier 3 Master League ──────────────────────────────────────────────────────
('Mewtwo','M',null,'Psycho Cut',false,false,false,'Best fast move — excellent energy generation','[{"move":"Confusion","note":"higher DPT alternative but slower energy generation"}]',
 'Psystrike',false,true,true,'Community Day Psychic move — Elite TM required. The best Mewtwo charged move.','[{"move":"Psychic","note":"standard Psychic STAB if no Elite TM — still strong","elite_tm":false}]',
 'Shadow Ball',false,false,false,'Ghost coverage — handles Psychic and Ghost types that resist Psychic','[{"move":"Ice Beam","note":"Ice coverage for Dragon, Grass, Flying types"}]',
 'S-tier Master League Psychic. Psystrike makes it one of the best ML attackers.',
 false,true,false,null,'claude',false),

('Rayquaza','M',null,'Dragon Tail',false,false,false,'Best Dragon fast move — excellent DPT','[{"move":"Air Slash","note":"Flying alternative fast move"}]',
 'Outrage',false,false,false,'Dragon STAB nuke — high damage primary charged move',null,
 'Breaking Swipe',false,false,false,'Dragon coverage — cheap fast move that lowers opponent ATK','[{"move":"Hurricane","note":"Flying STAB nuke alternative"}]',
 'Top-tier ML Dragon/Flying.',
 false,true,false,null,'claude',false),

('Garchomp','M',null,'Mud Shot',false,false,false,'Best fast move — excellent energy generation','[{"move":"Dragon Tail","note":"Dragon alternative for Dragon-focused coverage"}]',
 'Earth Power',false,false,false,'Ground STAB — excellent ML coverage against Electric, Fire, Steel, Poison, Rock',null,
 'Outrage',false,false,false,'Dragon STAB nuke — high damage coverage','[{"move":"Sand Tomb","note":"cheap Ground alternative for faster spam"}]',
 'S-tier ML Dragon/Ground. Mud Shot energy + Earth Power/Outrage dual coverage hits nearly everything.',
 false,true,false,null,'claude',false),

('Togekiss','M',null,'Charm',false,false,false,'Best Fairy fast move — extremely high DPT',null,
 'Flamethrower',false,false,false,'Fire coverage — handles Steel types that resist Fairy',null,
 'Ancient Power',false,false,false,'Rock coverage — can raise all stats if lucky. Cheap option.','[{"move":"Aerial Ace","note":"Flying STAB cheap alternative"}]',
 'Dominant ML Fairy/Flying. Charm DPT is among the best in the game.',
 false,true,false,null,'claude',false),

('Sylveon','M',null,'Charm',false,false,false,'Best Fairy fast move — high DPT',null,
 'Moonblast',false,false,false,'Fairy STAB nuke — primary damage move',null,
 'Last Resort',true,false,true,'Legacy Eevee CD move — requires Elite TM. Adds Normal coverage.','[{"move":"Psyshock","note":"Psychic coverage — best standard option without Elite TM","elite_tm":false}]',
 'ML pure Fairy attacker.',
 false,true,false,null,'claude',false),

('Zacian','M',null,'Snarl',false,false,false,'Best fast move — Dark STAB with excellent energy generation',null,
 'Play Rough',false,false,false,'Fairy STAB — primary coverage vs Dragon, Dark, Fighting',null,
 'Close Combat',false,false,false,'Fighting coverage — handles Steel types that resist Fairy','[{"move":"Wild Charge","note":"Electric alternative for Water/Flying coverage"}]',
 'Top-tier ML Fairy hero form.',
 false,true,false,null,'claude',false),

('Giratina','M','Altered','Shadow Claw',false,false,false,'Best Ghost fast move — excellent energy generation',null,
 'Dragon Claw',false,false,false,'Dragon STAB — cheap fast pressure move for constant use',null,
 'Shadow Force',false,false,false,'Ghost STAB nuke — high damage, higher energy cost','[{"move":"Ancient Power","note":"Rock cheap alternative with stat boost chance"}]',
 'Dominant ML Ghost/Dragon. Shadow Claw + Dragon Claw spam is relentless.',
 false,true,false,null,'claude',false),

('Giratina','M','Origin','Shadow Claw',false,false,false,'Best Ghost fast move — excellent energy generation',null,
 'Shadow Ball',false,false,false,'Ghost STAB — primary damage move',null,
 'Ominous Wind',false,false,false,'Cheap Ghost move with stat boost chance — excellent for shield pressure','[{"move":"Dragon Pulse","note":"Dragon STAB alternative"}]',
 'ML Ghost/Dragon — Origin form is more offensive than Altered form.',
 false,true,false,null,'claude',false),

('Dialga','M',null,'Dragon Breath',false,false,false,'Best fast move — Dragon DPT with excellent energy generation',null,
 'Draco Meteor',false,false,false,'Dragon STAB nuke — highest damage Dragon move. Self-ATK debuff.',null,
 'Iron Head',false,false,false,'Steel STAB — covers Fairy, Ice, Rock types','[{"move":"Thunder","note":"Electric coverage alternative"}]',
 'S-tier ML Dragon/Steel. Dragon/Steel is only weak to Fighting and Ground.',
 false,true,false,null,'claude',false),

('Palkia','M',null,'Dragon Tail',false,false,false,'Best fast move — Dragon type with high DPT','[{"move":"Dragon Breath","note":"alternative Dragon fast — slightly different energy profile"}]',
 'Aqua Tail',false,false,false,'Water STAB — cheap fast pressure move',null,
 'Draco Meteor',false,false,false,'Dragon STAB nuke — high damage closing move',null,
 'Strong ML Water/Dragon. Dragon/Water typing only weak to Dragon and Fairy.',
 false,true,false,null,'claude',false),

('Reshiram','M',null,'Fire Fang',false,false,false,'Best fast move — Fire type with good energy generation',null,
 'Overheat',false,false,false,'Fire STAB nuke — high damage. Self-ATK debuff.',null,
 'Draco Meteor',false,false,false,'Dragon STAB — handles Dragon types not hit by Fire','[{"move":"Stone Edge","note":"Rock coverage alternative"}]',
 'ML Fire/Dragon legendary. Only weak to Dragon, Rock, Ground.',
 false,true,false,null,'claude',false),

('Zekrom','M',null,'Dragon Breath',false,false,false,'Best fast move — Dragon type with excellent energy generation',null,
 'Wild Charge',false,false,false,'Electric STAB — high damage, self-DEF debuff',null,
 'Crunch',false,false,false,'Dark coverage — handles Psychic and Ghost types','[{"move":"Outrage","note":"Dragon STAB nuke — handles Dragon matchups"}]',
 'ML Dragon/Electric.',
 false,true,false,null,'claude',false),

('Kyurem','M',null,'Dragon Breath',false,false,false,'Best fast move — Dragon type with consistent energy generation','[{"move":"Steel Wing","note":"Steel alternative fast move"}]',
 'Dragon Claw',false,false,false,'Cheap Dragon STAB — fast pressure move',null,
 'Blizzard',false,false,false,'Ice STAB nuke — covers Dragon/Grass/Flying types','[{"move":"Outrage","note":"Dragon nuke alternative"}]',
 'ML Ice/Dragon legendary. Doubly weak to Fairy.',
 false,true,false,null,'claude',false),

('Groudon','M',null,'Mud Shot',false,false,false,'Best fast move — exceptional energy generation',null,
 'Earthquake',false,false,false,'Ground STAB — powerful coverage move with wide neutral matchups',null,
 'Fire Punch',false,false,false,'Fire coverage — handles Grass, Ice, Steel, Bug types','[{"move":"Solar Beam","note":"Grass coverage — handles Water types that resist Ground"}]',
 'S-tier ML pure Ground legendary.',
 false,true,false,null,'claude',false),

('Kyogre','M',null,'Waterfall',false,false,false,'Best Water fast move — strong DPT with decent energy generation',null,
 'Surf',false,false,false,'Water STAB — cheaper pressure move',null,
 'Blizzard',false,false,false,'Ice coverage — handles Dragon, Grass, Flying types','[{"move":"Thunder","note":"Electric coverage — handles mirror Water matchups"}]',
 'S-tier ML pure Water legendary.',
 false,true,false,null,'claude',false),

('Lugia','M',null,'Dragon Tail',false,false,false,'Best fast move — Dragon type with high DPT','[{"move":"Extrasensory","note":"Psychic alternative — different coverage profile"}]',
 'Sky Attack',false,false,false,'Flying STAB — fast powerful charged move',null,
 'Aeroblast',false,false,false,'Signature Flying move — very high damage, high crit chance','[{"move":"Hydro Pump","note":"Water coverage for Rock and Ground types"}]',
 'ML Psychic/Flying legendary. Outstanding bulk makes it a reliable safe switch.',
 false,true,false,null,'claude',false),

('Metagross','M',null,'Bullet Punch',false,false,false,'Best energy-generating fast move',null,
 'Meteor Mash',false,true,true,'Community Day Steel move — Elite TM required. Essential for ML viability.','[{"move":"Flash Cannon","note":"standard Steel STAB — weaker than Meteor Mash","elite_tm":false}]',
 'Earthquake',false,false,false,'Ground coverage — handles Electric, Fire, Steel, Poison types','[{"move":"Psychic","note":"STAB Psychic coverage — handles Fighting types"}]',
 'Strong ML Steel/Psychic. Meteor Mash is the key move.',
 false,true,false,null,'claude',false),

('Landorus','M','Therian','Mud Shot',false,false,false,'Best fast move — exceptional energy generation',null,
 'Earth Power',false,false,false,'Ground STAB — wide coverage in ML meta',null,
 'Rock Slide',false,false,false,'Rock coverage — handles Flying and Ice types that counter Ground','[{"move":"Superpower","note":"Fighting coverage — handles Normal/Dark/Rock types"}]',
 'Strong ML Ground/Flying.',
 false,true,false,null,'claude',false),

('Snorlax','M',null,'Lick',false,false,false,'Best fast move — Ghost type with good energy generation for a Normal-type','[{"move":"Zen Headbutt","note":"Psychic alternative — lower energy generation"}]',
 'Body Slam',false,false,false,'Normal STAB — fast cheap pressure move',null,
 'Outrage',false,false,false,'Dragon coverage — wide neutral damage in ML','[{"move":"Earthquake","note":"Ground coverage alternative"}]',
 'ML Normal tank with exceptional bulk. Only weakness is Fighting.',
 false,true,false,null,'claude',false),

-- ── Tier 4 Multi-league ───────────────────────────────────────────────────────
('Haunter','G',null,'Shadow Claw',false,false,false,'Best Ghost fast move — good energy generation',null,
 'Shadow Ball',false,false,false,'Ghost STAB — primary damage move',null,
 'Sludge Bomb',false,false,false,'Poison STAB — covers Fairy and Grass types','[{"move":"Shadow Punch","note":"cheap Ghost alternative for fast pressure"}]',
 'Budget GL Ghost attacker.',
 false,true,false,null,'claude',false),

('Hypno','G',null,'Confusion',false,false,false,'Best Psychic fast move — high DPT',null,
 'Shadow Ball',false,false,false,'Ghost coverage — handles Psychic types',null,
 'Thunder Punch',false,false,false,'Electric coverage — handles Water and Flying types','[{"move":"Focus Blast","note":"Fighting coverage for Dark/Steel/Normal types"}]',
 'GL Psychic attacker with useful dual coverage.',
 false,true,false,null,'claude',false),

('Golem','G','Alolan','Volt Switch',false,false,false,'Electric fast move — great energy generation for Alolan Golem','[{"move":"Rock Throw","note":"Rock alternative fast move"}]',
 'Stone Edge',false,false,false,'Rock STAB — primary high-damage charged move',null,
 'Wild Charge',false,false,false,'Electric STAB — coverage against Water and Flying types',null,
 'GL Rock/Electric (Alolan form). Useful in restricted cup formats.',
 false,true,false,null,'claude',false),

('Electrode','G','Hisuian','Volt Switch',false,false,false,'Best Electric fast move — excellent energy generation','[{"move":"Thunder Shock","note":"alternative Electric fast move with higher EPT"}]',
 'Discharge',false,false,false,'Electric STAB — fast consistent charged move',null,
 'Energy Ball',false,false,false,'Grass coverage — handles Water and Ground types','[{"move":"Wild Charge","note":"Electric nuke alternative — self-DEF debuff"}]',
 'GL Electric/Grass (Hisuian form). Energy Ball Grass coverage differentiates it from standard Electrode.',
 false,true,false,null,'claude',false),

('Exeggutor','G','Alolan','Dragon Tail',false,false,false,'Best fast move — Dragon type with high DPT','[{"move":"Bullet Seed","note":"Grass alternative — faster energy generation"}]',
 'Seed Bomb',false,false,false,'Grass STAB — cheap pressure move',null,
 'Dragon Pulse',false,false,false,'Dragon STAB — coverage against Dragon types','[{"move":"Draco Meteor","note":"Dragon nuke — high damage, self-ATK debuff"}]',
 'GL Grass/Dragon (Alolan form). Only one weakness (Ice).',
 false,true,false,null,'claude',false),

('Scyther','G',null,'Fury Cutter',false,false,false,'Best fast move — excellent energy generation','[{"move":"Air Slash","note":"Flying alternative — higher DPT"}]',
 'X-Scissor',false,false,false,'Bug STAB — cheap fast charged move for constant pressure',null,
 'Leaf Blade',false,false,false,'Grass coverage — handles Water/Ground/Rock types','[{"move":"Aerial Ace","note":"Flying coverage alternative"}]',
 'GL Bug/Flying attacker.',
 false,true,false,null,'claude',false),

('Jolteon','G',null,'Thunder Shock',false,false,false,'Best Electric fast move for Jolteon in GL — high EPT','[{"move":"Volt Switch","note":"slower but more damage per turn"}]',
 'Discharge',false,false,false,'Electric STAB — consistent charged move',null,
 'Thunder',false,false,false,'Electric nuke — high damage option','[{"move":"Last Resort","note":"Eevee CD legacy Normal coverage"}]',
 'GL pure Electric Eeveelution.',
 false,true,false,null,'claude',false),

('Vaporeon','G',null,'Water Gun',false,false,false,'Best Water fast move — good energy generation',null,
 'Aqua Tail',false,false,false,'Water STAB — cheap fast pressure move',null,
 'Hydro Pump',false,false,false,'Water nuke — high damage closing move','[{"move":"Last Resort","note":"Eevee CD legacy Normal coverage move"}]',
 'GL pure Water Eeveelution. High HP makes it very bulky.',
 false,true,false,null,'claude',false),

('Flareon','G',null,'Fire Spin',false,false,false,'Best Fire fast move — good energy generation',null,
 'Flamethrower',false,false,false,'Fire STAB — reliable charged move',null,
 'Overheat',false,false,false,'Fire nuke — high damage, self-ATK debuff','[{"move":"Last Resort","note":"Eevee CD legacy Normal coverage move"}]',
 'GL pure Fire Eeveelution. Best in restricted cup formats.',
 false,true,false,null,'claude',false),

('Espeon','U',null,'Confusion',false,false,false,'Best Psychic fast move — high DPT','[{"move":"Zen Headbutt","note":"alternative Psychic fast move"}]',
 'Psychic',false,false,false,'Psychic STAB — primary damage move',null,
 'Shadow Ball',false,false,false,'Ghost coverage — handles Psychic types that resist Psychic','[{"move":"Last Resort","note":"Eevee CD legacy Normal coverage"}]',
 'UL pure Psychic Eeveelution.',
 false,true,false,null,'claude',false),

('Leafeon','G',null,'Razor Leaf',false,false,false,'Best Grass fast move — very high DPT, low energy generation',null,
 'Leaf Blade',false,false,false,'Grass STAB — fast charged move for pressure',null,
 'Energy Ball',false,false,false,'Grass secondary STAB move','[{"move":"Last Resort","note":"Eevee CD legacy Normal coverage move"}]',
 'GL pure Grass Eeveelution. Razor Leaf DPT is one of the highest of any fast move.',
 false,true,false,null,'claude',false),

('Glaceon','G',null,'Frost Breath',false,false,false,'Best Ice fast move for Glaceon in GL — good EPT','[{"move":"Ice Shard","note":"alternative Ice fast move"}]',
 'Avalanche',false,false,false,'Ice STAB — primary damage move',null,
 'Icy Wind',false,false,false,'Ice coverage — lowers opponent ATK, good for pressure','[{"move":"Last Resort","note":"Eevee CD legacy Normal coverage move"}]',
 'GL pure Ice Eeveelution.',
 false,true,false,null,'claude',false),

('Arcanine','G',null,'Fire Fang',false,false,false,'Best Fire fast move for Arcanine — good energy generation',null,
 'Flamethrower',false,false,false,'Fire STAB — reliable charged move',null,
 'Wild Charge',false,false,false,'Electric coverage — handles Water types that counter Fire','[{"move":"Close Combat","note":"Fighting coverage — handles Normal, Steel, Rock, Ice, Dark types"}]',
 'Solid GL/UL Fire attacker.',
 false,true,false,null,'claude',false),

('Ninetales','G','Alolan','Powder Snow',false,false,false,'Best Ice fast move — good energy generation',null,
 'Weather Ball',false,true,true,'Community Day Ice move — Elite TM required. Best charged move by far.','[{"move":"Blizzard","note":"standard Ice STAB — very high energy cost","elite_tm":false}]',
 'Psyshock',false,false,false,'Psychic coverage — handles Poison, Fighting types','[{"move":"Dazzling Gleam","note":"Fairy coverage from Fairy typing — handles Dragon, Dark, Fighting"}]',
 'GL Ice/Fairy. Weather Ball (Ice) is the key move. Fairy typing removes Dragon weakness.',
 false,true,false,null,'claude',false),

('Rapidash','G',null,'Fire Spin',false,false,false,'Best fast move — Fire STAB with decent energy generation',null,
 'Flame Charge',false,false,false,'Fire charged move — fast and cheap, boosts own SPD',null,
 'Megahorn',false,false,false,'Bug coverage — handles Dark, Psychic, Grass types','[{"move":"Drill Run","note":"Ground coverage alternative"}]',
 'Niche GL pure Fire. Best in restricted cup formats.',
 false,true,false,null,'claude',false),

('Beedrill','G',null,'Poison Jab',false,false,false,'Best Poison fast move — good energy generation','[{"move":"Bug Bite","note":"Bug STAB alternative"}]',
 'X-Scissor',false,false,false,'Bug STAB — cheap fast charged move',null,
 'Drill Run',false,false,false,'Ground coverage — handles Steel, Electric, Fire, Poison types','[{"move":"Sludge Bomb","note":"Poison STAB alternative"}]',
 'GL Bug/Poison attacker.',
 false,true,false,null,'claude',false),

('Pidgeot','G',null,'Wing Attack',false,false,false,'Best Flying fast move — solid DPT and EPT',null,
 'Feather Dance',false,false,false,'Flying move that lowers opponent ATK — excellent for stat pressure',null,
 'Brave Bird',false,false,false,'Flying nuke — high damage but self-ATK debuff','[{"move":"Air Cutter","note":"Flying STAB alternative — less damage, no debuff"}]',
 'GL Normal/Flying. Feather Dance ATK debuffing makes it hard to face shield-up.',
 false,true,false,null,'claude',false),

('Cloyster','G',null,'Ice Shard',true,false,true,'Legacy fast move — Elite TM required. Core to GL viability.','[{"move":"Frost Breath","note":"standard Ice fast move — weaker in PvP","elite_tm":false}]',
 'Icicle Spear',false,false,false,'Ice STAB — cheap fast charged move',null,
 'Hydro Pump',false,false,false,'Water STAB nuke — high damage closing move','[{"move":"Blizzard","note":"Ice nuke alternative"}]',
 'GL Water/Ice — requires Ice Shard (legacy) for best performance.',
 false,true,false,null,'claude',false),

('Tentacruel','G',null,'Poison Jab',false,false,false,'Best Poison fast move — solid energy generation',null,
 'Scald',false,false,false,'Water charged move — cheap option with potential ATK debuff',null,
 'Hydro Pump',false,false,false,'Water nuke — high damage closing move','[{"move":"Acid Spray","note":"Poison coverage that lowers opponent SPD"}]',
 'GL Water/Poison.',
 false,true,false,null,'claude',false),

('Raichu','G','Alolan','Volt Switch',false,false,false,'Best Electric fast move — good energy generation','[{"move":"Thunder Shock","note":"alternative Electric fast move with higher EPT"}]',
 'Wild Charge',false,false,false,'Electric STAB — high damage, self-DEF debuff',null,
 'Surf',false,false,false,'Water coverage — handles Ground types that counter Electric',null,
 'GL Electric/Psychic (Alolan form). Surf covers Ground weakness.',
 false,true,false,null,'claude',false),

('Sandslash','G','Alolan','Powder Snow',false,false,false,'Best Ice fast move for Alolan Sandslash — good energy generation',null,
 'Ice Punch',false,false,false,'Ice STAB — reliable charged move',null,
 'Bulldoze',false,false,false,'Ground coverage — handles Steel, Fire, Electric, Poison types','[{"move":"Aerial Ace","note":"Flying coverage alternative"}]',
 'GL Ice/Steel (Alolan form).',
 false,true,false,null,'claude',false),

('Tangela','G',null,'Vine Whip',false,false,false,'Best Grass fast move — solid energy generation',null,
 'Rock Slide',false,false,false,'Rock coverage — handles Flying and Fire types that threaten Grass',null,
 'Ancient Power',false,false,false,'Rock coverage with stat boost potential','[{"move":"Power Whip","note":"Grass STAB alternative — high damage"}]',
 'GL pure Grass attacker.',
 false,true,false,null,'claude',false),

('Kangaskhan','G',null,'Mud Slap',false,false,false,'Best fast move — Ground type with good energy generation','[{"move":"Low Kick","note":"Fighting alternative fast move"}]',
 'Earthquake',false,false,false,'Ground STAB — strong coverage move',null,
 'Outrage',false,false,false,'Dragon coverage — wide neutral damage in GL','[{"move":"Crabhammer","note":"Water coverage alternative"}]',
 'GL Normal-type. Useful in restricted Normal-type cup formats.',
 false,true,false,null,'claude',false),

('Tauros','G',null,'Zen Headbutt',false,false,false,'Best fast move for PvP — decent DPT','[{"move":"Tackle","note":"Normal alternative fast move — lower performance"}]',
 'Payback',false,false,false,'Dark coverage — handles Psychic and Ghost types',null,
 'Earthquake',false,false,false,'Ground coverage — handles Steel, Fire, Poison, Electric, Rock types','[{"move":"Iron Head","note":"Steel coverage for Fairy and Ice types"}]',
 'GL pure Normal attacker. Best in restricted Normal cup formats.',
 false,true,false,null,'claude',false),

('Primeape','G',null,'Counter',false,false,false,'Best Fighting fast move — excellent DPT and EPT',null,
 'Night Slash',false,false,false,'Dark coverage — fast cheap move, can raise crit',null,
 'Close Combat',false,false,false,'Fighting STAB nuke — high damage closing move','[{"move":"Cross Chop","note":"Fighting STAB alternative — less self-debuff"}]',
 'GL Fighting-type.',
 false,true,false,null,'claude',false),

('Kingler','G',null,'Bubble',false,false,false,'Best Water fast move — excellent energy generation',null,
 'Crabhammer',true,false,true,'Legacy Water move — Elite TM required. Core to GL viability. Do NOT TM.','[{"move":"Vise Grip","note":"standard option without Elite TM — far weaker","elite_tm":false}]',
 'X-Scissor',false,false,false,'Bug coverage — handles Grass, Psychic, Dark types',null,
 'GL pure Water — requires Crabhammer (legacy/Elite TM) to be competitive.',
 false,true,true,'Crabhammer is legacy and requires Elite TM. Without it, Kingler lacks competitive charged moves.','claude',false),

('Seaking','G',null,'Poison Jab',false,false,false,'Best fast move for PvP — Poison STAB with decent energy generation','[{"move":"Peck","note":"Flying alternative fast move"}]',
 'Drill Run',false,false,false,'Ground coverage — handles Electric, Fire, Steel, Poison types',null,
 'Icy Wind',false,false,false,'Ice coverage — handles Dragon, Grass, Flying types','[{"move":"Surf","note":"Water STAB alternative"}]',
 'Niche GL Water/Normal. Best in restricted cup formats.',
 false,true,false,null,'claude',false),

('Lapras','G',null,'Ice Shard',false,false,false,'Best Ice fast move — good energy generation','[{"move":"Water Gun","note":"Water alternative fast move — different coverage"}]',
 'Surf',false,false,false,'Water STAB — cheap pressure move',null,
 'Ice Beam',false,false,false,'Ice STAB — handles Dragon, Grass, Flying types','[{"move":"Skull Bash","note":"Normal nuke alternative"}]',
 'GL Water/Ice tank. High bulk makes it effective.',
 false,true,false,null,'claude',false)

ON CONFLICT (species, league, form) DO NOTHING;
