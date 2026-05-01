// ═══════════════════════════════════════════════════════════
// PokéVault — Configuration
// All user-configurable values are here.
// ═══════════════════════════════════════════════════════════
'use strict';

// ── Supabase credentials ──────────────────────────────────
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
const PERFECT  = '100'; // Shown when rank rounds to 100% (✪ fails in GO after circled letters)
const NUNDO    = '⓪';  // 0/0/0 Pokémon
const SHINY_SFX = '※'; // Shiny suffix

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

// ── Special family overrides ──────────────────────────────
// Pokémon that need custom family grouping behaviour
const FAMILY_OVERRIDES = {
  // Kleavor is only obtainable via raids — treat as its own family, not part of Scyther line
  standalone: new Set(['Kleavor']),
  // Wurmple evolution path is random — flag as unknown
  unknownEvo: new Set(['Wurmple']),
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
  'Midnight':'Night', 'Dusk':'Dusk',
  // Deoxys
  'Attack':'Atk', 'Defense':'Def', 'Speed':'Spd',
  // Giratina / Dialga
  'Origin':'Orig',
  // Forces of Nature (Tornadus/Thundurus/Landorus/Enamorus)
  'Therian':'Ther',
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
