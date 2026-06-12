// ═══════════════════════════════════════════════════════════
// PokéVault — Configuration
// All user-configurable values are here.
// ═══════════════════════════════════════════════════════════
'use strict';

// ── Supabase credentials ──────────────────────────────────
// SUPABASE_KEY is the Supabase **anon (public) key** — a JWT whose payload
// decodes to {"role":"anon", ...}. It is DESIGNED to ship in the browser
// bundle; access is gated server-side by Row-Level Security (RLS) policies,
// not by the secrecy of this token. It is NOT the service_role key (which must
// never reach a client) and rotating it would not improve security.
//
// ZAP rule 10094 ("Base64 Disclosure") flags this token because it is base64.
// VERDICT: accept — public-by-design, no secret disclosed. Suppress 10094 with
// this justification rather than obfuscating (re-encoding hides nothing and ZAP
// would still flag it). See reviews/csp-hardening-impl-summary.md.
const SUPABASE_URL = 'https://jsozfpsfvvnnmipsksoh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impzb3pmcHNmdnZubm1pcHNrc29oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4ODQ2OTksImV4cCI6MjA4OTQ2MDY5OX0.Qyqo4cF1C_2STXPcMoob9jMRt_VoESmhJqTQkux6i30';

// ── League symbols ────────────────────────────────────────
// These are the circled letters shown in nicknames
const LC = {
  L: 'ⓛ',  // U+24DB lowercase circled l — matches Pokégenie convention
  G: 'Ⓖ',  // U+24C6
  U: 'Ⓤ',  // U+24CA
  M: 'Ⓜ',  // U+24C2
  R: 'Ⓡ',  // U+24C7 — Master/Raid candidate (Lucky, Shadow no-league)
};

// ── Nickname special symbols ──────────────────────────────
const PERFECT   = '100'; // Shown when rank rounds to 100% (✪ fails in GO after circled letters)
const NUNDO     = '⓪';  // 0/0/0 Pokémon
const SHINY_SFX = '※'; // Shiny suffix
const HUNDO_SFX = 'Ⓗ'; // Appended to ANY nick where IVs are 15/15/15

// ── Nick override (user-authored nicknames) ──────────────
// A user can override PokéVault's suggested nick with their own (e.g. to match an
// established Pokégenie convention). GO's in-game nick cap is 12, but we allow
// headroom (64) for Pokégenie-style conventions. Enforced on client + write.
const MAX_NICK_LENGTH = 64;

// Sanitise a user-authored nick before storing/applying.
//   • null / undefined  → returns null  ("no override — use the suggested nick")
//   • ''                → returns ''     (a VALID override meaning "no nick")
//   • any other value   → coerced to string, trimmed, truncated to MAX_NICK_LENGTH
// The null-vs-empty-string distinction is load-bearing: callers MUST use `!= null`
// checks, never truthiness, so an empty override is not collapsed into "no override".
function clampNick(value) {
  if (value === null || value === undefined) return null;
  return String(value).trim().slice(0, MAX_NICK_LENGTH);
}

// ── League caps (CP) ─────────────────────────────────────
const LEAGUE_CAPS = { L: 500, G: 1500, U: 2500, M: Infinity };

// ── Dust affordability thresholds per league ──────────────
// below affordable → green star (act now)
// above affordable → blue star (act but costly)
// tiers = $ indicators shown only ABOVE affordable threshold
const DUST_THRESHOLDS = {
  L: { affordable: 100000,  tiers: [100000, 200000, 300000] },
  G: { affordable: 150000,  tiers: [150000, 250000, 350000] },
  U: { affordable: 300000,  tiers: [300000, 400000, 500000] },
  M: { affordable: Infinity, tiers: [] },
};

// ── Analysis thresholds ───────────────────────────────────
const RULES = {
  keepThreshold:        90,     // min rank% to qualify for a confirmed keep slot
  luckyMasterMargin:     5,     // Lucky Pokémon get +5pp bonus in Master non-shadow winner comparison
  dustTier1:           100000,  // $ — flag dust over this
  dustTier2:           150000,  // $$ — flag dust over this; also triggers affordable backup
  dustTier3:           200000,  // $$$ — flag dust over this
  dustWarnPerfect:     200000,  // warn if dust > this for a 100% rank
  dustWarnNormal:      100000,  // warn if dust > this for normal rank
  dustExcludeThreshold:300000,  // exclude non-final non-legendary from league if dust exceeds this
  leagueNames: { L:'Little', G:'Great', U:'Ultra', M:'Master' },
  leagues: ['L','G','U','M'],
};

// ── Gender dimorphic species ──────────────────────────────
// These species look visibly different by gender in Pokémon GO.
// Each gender gets a separate league slot.
const GENDER_DIMORPHIC = new Set([
  'Meowstic',             // completely different appearance
  'Indeedee',             // different appearance
  'Frillish', 'Jellicent',  // different colours
  'Hippopotas', 'Hippowdon', // different colours
  'Unfezant',             // different plumage
  'Pyroar',               // different mane
  'Lechonk', 'Oinkologne', // Oinkologne male/female look different
  'Combee',               // only female can evolve to Vespiquen
  'Wooper',               // Paldean Wooper male/female differ
]);

// ── Gender-locked evolution species ──────────────────────────────
// Species where gender is required to determine evolution eligibility.
// When gender is missing/unknown, evo targets are cleared to prevent incorrect slot assignment.
const GENDER_LOCKED_EVO = new Set(['Combee', 'Kirlia', 'Snorunt', 'Burmy']);

// ── Special family overrides ──────────────────────────────
// Pokémon that need custom family grouping behaviour
const FAMILY_OVERRIDES = {
  // Kleavor is only obtainable via raids — treat as its own family, not part of Scyther line
  standalone: new Set(['Kleavor']),
  // Wurmple and Clamperl evolution paths are random — flag as unknown
  unknownEvo: new Set(['Wurmple', 'Clamperl']),
};

// ── Evolution overrides ───────────────────────────────────
// Species where Pokégenie omits evo targets (e.g. male Gothita: evolves to Gothitelle in GO
// but Pokégenie exports blank Name (G/U/L) for male-specific rows).
// Keys: 'Name|gender' or 'Name'. Values: { G, U, L } evo targets.
const EVO_OVERRIDES = {
  'Gothita|♂': { G: 'Gothorita', U: 'Gothitelle', L: 'Gothorita' },
};

// ── Stardust power-up cost table ─────────────────────────
// Cost per power-up at each level (two power-ups per full level)
const DUST_PP = {
  1:200,2:200,3:400,4:400,5:600,6:600,7:800,8:800,9:1000,10:1000,
  11:1300,12:1300,13:1600,14:1600,15:1900,16:1900,17:2200,18:2200,19:2500,20:2500,
  21:3000,22:3000,23:3500,24:3500,25:4000,26:4000,27:4500,28:4500,29:5000,30:5000,
  31:6000,32:6000,33:7000,34:7000,35:8000,36:8000,37:9000,38:9000,39:10000,40:10000
};

// Short prefixes used in nicknames when a Pokémon has a visually distinct form.
// Applied in buildNickname when p.form or p.specialForm matches a key here.
// Furfrou / Vivillon / Flabébé forms are set via the Set Forms modal (p.specialForm).
const FORM_NICK_PREFIXES = {
  // Castform
  'Snowy':'Snow', 'Rainy':'Rain', 'Sunny':'Snny',
  // Lycanroc
  'Midnight':'Night', 'Midday':'Day', 'Dusk':'Dusk',
  // Regional variants (Alola/Galar/Hisui/Paldea) — used for pre-evos targeting regional forms
  'Alola':'Alol', 'Galar':'Galr', 'Hisui':'Hisu', 'Paldea':'Pald',
  // Deoxys
  'Attack':'Atk', 'Defense':'Def', 'Speed':'Spd',
  // Groudon / Kyogre
  'Primal':'Prml',
  // Wormadam
  'Sandy':'Sandy', 'Trash':'Trash',
  // Furfrou trims (via Set Forms modal)
  'Dandy':'Dand', 'Matron':'Matr', 'La Reine':'Rein', 'Kabuki':'Kbki',
  'Pharaoh':'Phar', 'Star':'Star', 'Diamond':'Diam', 'Heart':'Hart', 'Natural':'Natl',
  // Vivillon patterns (via Set Forms modal)
  'Polar':'Polr', 'Meadow':'Mdow', 'Tundra':'Tndr', 'Continental':'Cont',
  'Garden':'Grdn', 'Elegant':'Elgt', 'Icy Snow':'IcyS', 'Marine':'Marn',
  'Modern':'Modn', 'Monsoon':'Mnsn', 'Ocean':'Ocen', 'River':'Rivr',
  'Sandstorm':'Sand', 'Savanna':'Savn', 'Sun':'Sun', 'Jungle':'Jngl',
  'Archipelago':'Arch', 'High Plains':'HiPl', 'Pokéball':'PBal', 'Fancy':'Fanc',
  // Flabébé / Floette / Florges colours (via Set Forms modal)
  'Red':'Red', 'Orange':'Orng', 'Yellow':'Yell', 'Blue':'Blue', 'White':'Whit',
};

// ── Nick convention ───────────────────────────────
// 'pvpvault' = default (league symbol + rank%)
// 'ivpct'    = ShortName + rounded IV%  e.g. Glaceon56
// 'rawiv'    = ShortName + AtkDefSta    e.g. Glaceon2914
// 'moves'    = ShortName + QCode/CCode  e.g. SwamperMS/HC (fallback: ivpct)
const NICK_CONVENTION = 'pvpvault';

// Two-letter move codes for the 'moves' nick convention.
// Full list sourced from NAMING_CONVENTIONS_PLAN.md; add entries as needed.
const MOVE_CODES = {
  // Fast moves
  'Air Slash':'AS', 'Astonish':'Ast', 'Bite':'Bt', 'Bug Bite':'BB',
  'Bullet Punch':'BP', 'Charm':'Ch', 'Confusion':'Cn', 'Counter':'Co',
  'Dragon Breath':'DB', 'Feint Attack':'FA', 'Fire Spin':'Fs',
  'Frost Breath':'FB', 'Gust':'Gu', 'Hex':'Hx', 'Hidden Power':'HP',
  'Ice Shard':'IS', 'Incinerate':'In', 'Karate Chop':'KC', 'Lick':'Li',
  'Lock On':'LO', 'Low Kick':'LK', 'Metal Claw':'MC', 'Mud Shot':'MS',
  'Mud Slap':'Ml', 'Peck':'Pe', 'Poison Jab':'PJ', 'Pound':'Pd',
  'Powder Snow':'PS', 'Quick Attack':'QA', 'Razor Leaf':'RL',
  'Rock Smash':'RkS', 'Rock Throw':'RT', 'Scratch':'Sr', 'Shadow Claw':'SC',
  'Spark':'Sk', 'Steel Wing':'SW', 'Snarl':'Sn', 'Splash':'Spl',
  'Sucker Punch':'SuP', 'Tackle':'Tc', 'Thunder Shock':'TS',
  'Vine Whip':'VW', 'Water Gun':'WG', 'Waterfall':'Wt',
  'Wing Attack':'WA', 'Yawn':'Yn', 'Zen Headbutt':'ZH',
  // Charge moves
  'Aerial Ace':'AA', 'Ancient Power':'AnP', 'Aqua Tail':'AT',
  'Aurora Beam':'AuB', 'Blizzard':'Bz', 'Body Slam':'BS',
  'Brave Bird':'BrB', 'Bubble Beam':'BuB', 'Close Combat':'CC',
  'Crunch':'Cr', 'Dazzling Gleam':'DG', 'Dig':'Dg', 'Dark Pulse':'DP',
  'Discharge':'Di', 'Doom Desire':'DD', 'Draco Meteor':'DM',
  'Dragon Claw':'DrC', 'Dragon Pulse':'DrP', 'Drill Run':'DR',
  'Earthquake':'EQ', 'Energy Ball':'EB', 'Fire Blast':'FbB',
  'Flame Charge':'FC', 'Flame Wheel':'FlW', 'Flash Cannon':'FlC',
  'Flamethrower':'Fm', 'Focus Blast':'FcB', 'Foul Play':'FP',
  'Frustration':'Fr', 'Grass Knot':'GK', 'Gunk Shot':'GkS',
  'Heat Wave':'HW', 'Hurricane':'Hu', 'Hydro Cannon':'HC',
  'Hyper Beam':'HB', 'Ice Beam':'IB', 'Ice Punch':'IP',
  'Icy Wind':'IcW', 'Iron Head':'IH', 'Last Resort':'LR',
  'Leaf Blade':'LB', 'Magnet Bomb':'MgB', 'Meteor Mash':'MM',
  'Mirror Shot':'MrS', 'Moonblast':'MB', 'Mud Bomb':'MdB',
  'Muddy Water':'MdW', 'Night Shade':'NS', 'Overheat':'OH',
  'Play Rough':'PR', 'Poison Fang':'PoF', 'Power Gem':'PG',
  'Power-Up Punch':'PuP', 'Psychic':'Pc', 'Psyshock':'Psk',
  'Return':'Rn', 'Rock Blast':'RkB', 'Rock Slide':'RS',
  'Sand Tomb':'SaT', 'Scald':'Sc', 'Seed Bomb':'SdB',
  'Shadow Ball':'SBl', 'Shadow Bone':'SBn', 'Shadow Punch':'SpN',
  'Shadow Sneak':'SSn', 'Signal Beam':'SiB', 'Sky Attack':'SkA',
  'Skull Bash':'SkB', 'Sludge Bomb':'SlB', 'Solar Beam':'SoB',
  'Stone Edge':'SE', 'Superpower':'SpP', 'Surf':'Su',
  'Swift':'Sf', 'Thunder':'Th', 'Thunderbolt':'Tb',
  'Trailblaze':'Tr', 'Triple Axel':'TrA',
  'Water Pulse':'WP', 'Water Shuriken':'WS', 'Wild Charge':'WC',
  'X-Scissor':'XS', 'Zap Cannon':'ZaC',
};
