'use strict';
// Fixture-based tests for the analysis engine.
// Uses poke_genie_fixture.csv — 52 deterministic rows designed to exercise specific behaviours.
// See FIXTURE_CSV_SPEC.md for the full spec and expected outputs per row.
//
// Run with: npx jest tests/analyse.fixture.test.js

const path = require('path');
const loader = require('./loader');
const { analyse, buildNickname } = loader;
const { loadCSV } = require('./csvParser');

const FIXTURE_PATH = path.join(__dirname, 'poke_genie_fixture.csv');

let result;
const find = (name, cp) => result.pokemon.find(p => p.name === name && p.cp === cp);
const findFam = (name) => result.families.find(f => f.members.some(p => p.name === name));

beforeAll(() => {
  const csv = loadCSV(FIXTURE_PATH);
  result = analyse(csv);
});

// ─── Group 1 — Glaceon family ────────────────────────────────────────────────

describe('Group 1 — Glaceon family (evolved preference + committed)', () => {
  it('Glaceon CP:1500 wins Great slot (dustG=0, fav=1) — GOLD', () => {
    const p = find('Glaceon', 1500);
    expect(p).toBeDefined();
    expect(p.slots).toContain('G');
    expect(p.isFavorite).toBe(true);
    expect(p.suggestStar).toBe(true);
  });

  it('Eevee CP:477 (same IVs as Glaceon 1500, fav=1) does NOT win Great slot — RED', () => {
    const p = find('Eevee', 477);
    expect(p).toBeDefined();
    expect(p.isFavorite).toBe(true);
    const hasLeagueSlot = p.slots.some(s => ['L', 'G', 'U', 'M'].includes(s));
    expect(hasLeagueSlot).toBe(false);
    expect(p.suggestStar).toBe(false);
  });

  it('Glaceon CP:2500 wins Ultra slot (dustU=0, fav=1) — GOLD', () => {
    const p = find('Glaceon', 2500);
    expect(p).toBeDefined();
    expect(p.slots).toContain('U');
    expect(p.isFavorite).toBe(true);
    expect(p.suggestStar).toBe(true);
  });

  it('Eevee CP:654 (same IVs as Glaceon 2500, fav=0) loses Ultra — evolved Glaceon wins tiebreaker', () => {
    const preEvo = find('Eevee', 654);
    expect(preEvo).toBeDefined();
    expect(preEvo.slots).not.toContain('U');
    expect(preEvo.suggestStar).toBe(false);
    // Glaceon must still hold Ultra
    const evolved = find('Glaceon', 2500);
    expect(evolved.slots).toContain('U');
  });
});

// ─── Group 2 — Leafeon family ────────────────────────────────────────────────

describe('Group 2 — Leafeon family (evolved preference)', () => {
  it('Leafeon CP:1177 wins Ultra only (99.37%) — one-slot rule: U processed before G', () => {
    const p = find('Leafeon', 1177);
    expect(p).toBeDefined();
    expect(p.slots).toContain('U');
    expect(p.slots).not.toContain('G'); // one-slot: U wins first (M→U→G→L order)
    expect(p.nickname).toContain('Ⓤ');
    expect(p.isFavorite).toBe(true);
    expect(p.suggestStar).toBe(true);
  });

  it('Leafeon CP:1177 wins a slot and is fav=1 (GOLD)', () => {
    const p = find('Leafeon', 1177);
    expect(p).toBeDefined();
    const hasLeagueSlot = p.slots.some(s => ['L', 'G', 'U', 'M'].includes(s));
    expect(hasLeagueSlot).toBe(true);
    expect(p.isFavorite).toBe(true);
    expect(p.suggestStar).toBe(true);
  });

  it('Eevee CP:485 (fav=1, same IVs as Leafeon 1177) does NOT win Great slot — RED', () => {
    const p = find('Eevee', 485);
    expect(p).toBeDefined();
    expect(p.isFavorite).toBe(true);
    const hasG = p.slots.includes('G');
    expect(hasG).toBe(false);
  });
});

// ─── Group 3 — Vaporeon (same-evo slot routing) ──────────────────────────────
// CP:1497 wins Ultra only (99.61%) under one-slot rule — U is processed before G (M→U→G→L).
// CP:2493 (98.68% Ultra, fav=1, dustU=0) does NOT win Ultra — CP:1497 holds it.
// CP:2493 has no GL rank so GL for the Vaporeon evo stage goes unfilled.

describe('Group 3 — Vaporeon (same-evo slot routing)', () => {
  it('Vaporeon CP:1497 (G=99.90%, U=99.61%) wins Ultra only — one-slot: U processed before G', () => {
    const p = find('Vaporeon', 1497);
    expect(p.slots).toContain('U');
    expect(p.slots).not.toContain('G'); // one-slot: U wins first (M→U→G→L order)
  });

  it('Vaporeon CP:2493 (fav=1, dustU=0) does NOT win Ultra — CP:1497 retains it', () => {
    const p = find('Vaporeon', 2493);
    expect(p.slots).not.toContain('U');
    expect(p.isFavorite).toBe(true);
    expect(p.suggestStar).toBe(false); // no confirmed slot — not a star candidate
  });
});

// ─── Group 4 — Slowpoke CYAN star ────────────────────────────────────────────

describe('Group 4 — Slowpoke CYAN star', () => {
  it('Slowpoke CP:215 wins Little slot at 99.39% (rounded 99)', () => {
    const p = find('Slowpoke', 215);
    expect(p).toBeDefined();
    expect(p.slots).toContain('L');
  });

  it('Slowpoke CP:215 shows CYAN — isCheaperAlternative=true, suggestStarCheaper=true', () => {
    // CP:215 (dust=800) wins over CP:207 (dust=1600, fav=1) at same rounded rank (99).
    // The starred alt costs more → cyan fires.
    const p = find('Slowpoke', 215);
    expect(p.isCheaperAlternative).toBe(true);
    expect(p.cheaperAlternativeLeagues).toContain('L');
    expect(p.suggestStarCheaper).toBe(true);
  });

  it('Slowpoke CP:207 (fav=1, same rounded rank, more expensive) — RED star, no slot', () => {
    const p = find('Slowpoke', 207);
    expect(p.isFavorite).toBe(true);
    expect(p.slots).not.toContain('L');
    expect(p.suggestStar).toBe(false);
  });

  it('Slowpoke CP:441 does NOT win the Little slot (CP:215 wins it)', () => {
    // CP:441 has 97% Great rank so it correctly wins a Great slot — the spec's
    // "dot/trade" note only referred to Little league. Little goes to CP:215.
    expect(find('Slowpoke', 215).slots).toContain('L');
    expect(find('Slowpoke', 441).slots).not.toContain('L');
  });
});

// ─── Group 5 — Flaaffy (lucky zero-dust committed) ───────────────────────────

describe('Group 5 — Flaaffy (lucky zero-dust committed)', () => {
  // C2: Flaaffy evolvedNameL='Flaaffy' ≠ evolvedNameG='Ampharos' → different forms → not excluded from Great.
  // Flaaffy (lucky, effectiveDust=6750) beats Mareep (dustG=25000) for Great via lower effective dust.
  // Deconfliction fires: Flaaffy's Little evo target ('Flaaffy') ≠ Great anchor ('Ampharos') → Little released.
  // Mareep wins Little via nextBest.
  it('Flaaffy CP:500 (Lucky, fav=1, different evo targets for L/G) wins Great slot under C2', () => {
    const p = find('Flaaffy', 500);
    expect(p).toBeDefined();
    expect(p.isLucky).toBe(true);
    expect(p.isFavorite).toBe(true);
    expect(p.slots).toContain('G');
  });

  it('Mareep CP:120 wins Great (regular non-lucky Ampharos group is independent from Flaaffy lucky group)', () => {
    const mareep = find('Mareep', 120);
    expect(mareep).toBeDefined();
    expect(mareep.slots).toContain('G');
    expect(mareep.slots).not.toContain('L');
  });
});

// ─── Group 6 — Totodile family ───────────────────────────────────────────────
// Under one-slot (M→U→G→L): Feraligatr CP:2498 wins ML first (hundo, best ivAvg),
// then is excluded from UL. CP:2400 wins UL as cascade winner.

describe('Group 6 — Totodile/Croconaw/Feraligatr', () => {
  it('Feraligatr CP:2498 (hundo, fav=1) wins Master only — one-slot: M wins first', () => {
    const p = find('Feraligatr', 2498);
    expect(p).toBeDefined();
    expect(p.slots).toContain('M');
    expect(p.slots).not.toContain('U'); // one-slot: excluded from UL after winning ML
    expect(p.isFavorite).toBe(true);
    expect(p.suggestStar).toBe(true);
  });

  it('Feraligatr CP:2400 (fav=1) WINS Ultra (freed by CP:2498 moving to ML) — GOLD', () => {
    const p = find('Feraligatr', 2400);
    expect(p.isFavorite).toBe(true);
    expect(p.slots).toContain('U'); // cascade winner: CP:2498 moved to ML, freeing UL
    expect(p.suggestStar).toBe(true);
  });

  it('Feraligatr CP:1200 (same IVs, fav=1, old scan) does NOT win Ultra slot — RED', () => {
    const p = find('Feraligatr', 1200);
    expect(p.isFavorite).toBe(true);
    expect(p.slots).not.toContain('U');
    expect(p.suggestStar).toBe(false);
  });

  it('Totodile CP:50 (42% rank) is below keep threshold — trade/review', () => {
    const p = find('Totodile', 50);
    expect(['trade', 'review']).toContain(p.decision);
  });

  it('Totodile CP:500 (dustG=13500, affordable) wins Great slot — GREEN star', () => {
    const p = find('Totodile', 500);
    expect(p).toBeDefined();
    expect(p.slots).toContain('G');
    expect(p.suggestStar).toBe(true);
    expect(p.suggestStarExpensive).toBeFalsy();
    expect(p.isFavorite).toBe(false);
  });

  it('Croconaw CP:800 wins Great slot — GREEN star', () => {
    const p = find('Croconaw', 800);
    expect(p).toBeDefined();
    expect(p.slots).toContain('G');
    expect(p.suggestStar).toBe(true);
    expect(p.suggestStarExpensive).toBeFalsy();
    expect(p.isFavorite).toBe(false);
  });
});

// ─── Group 7 — Purify modal ──────────────────────────────────────────────────
// simulatePurify fires when estimatedPurifiedRank = rank + improvement*0.4 ≥ 92
// and rank is in (0, 90) — already-qualifying shadows are skipped.

describe('Group 7 — Purify modal candidates', () => {
  it('Gastly shadow CP:82 (G=89.5%, improvement≈6.7%) appears in purify modal', () => {
    const p = find('Gastly', 82);
    expect(p).toBeDefined();
    expect(p.isShadow).toBe(true);
    expect(p.purifyLeague).toBeTruthy();
    expect(p.purifyRankPct).toBeGreaterThanOrEqual(92);
  });

  it('Cacnea shadow CP:80 (G=80%, improvement≈11.1%) does NOT appear — estimate too low', () => {
    const p = find('Cacnea', 80);
    expect(p).toBeDefined();
    expect(p.isShadow).toBe(true);
    expect(p.purifyRankPct).toBeLessThan(92);
  });

  it('Machop shadow CP:120 (G=88%, IVs 13/13/13 → hundo after purify) appears with purifyHundo=true', () => {
    const p = find('Machop', 120);
    expect(p).toBeDefined();
    expect(p.isShadow).toBe(true);
    expect(p.purifyLeague).toBeTruthy();
    expect(p.purifyRankPct).toBeGreaterThanOrEqual(92);
    expect(p.purifyHundo).toBe(true);
  });
});

// ─── Group 8 — Star flags ────────────────────────────────────────────────────
// Under one-slot (M→U→G→L): Machamp CP:2450 wins ML first (ivAvg=97.8 → confirmed ML).
// Cascade: Machop CP:400 wins UL (freed by Machamp), Machop CP:350 wins GL (freed by CP:400).
// Eevee CP:478 wins ML (as Umbreon, ivAvg=93.3 → confirmed ML).

describe('Group 8 — Explicit star colours', () => {
  it('Machamp CP:2450 wins Master slot (ivAvg=97.8%) — one-slot: M wins first, nick shows Ⓜ', () => {
    const p = find('Machamp', 2450);
    expect(p).toBeDefined();
    expect(p.slots).toContain('M');
    expect(p.slots).not.toContain('U'); // one-slot: excluded from UL after winning ML
    expect(p.nickname).toContain('Ⓜ');
    expect(p.nickname).not.toContain('Ⓡ');
  });

  it('Machop CP:400 wins Ultra slot (freed by Machamp moving to ML)', () => {
    const p = find('Machop', 400);
    expect(p).toBeDefined();
    expect(p.slots).toContain('U'); // cascade: Machamp moved to ML, freeing UL
    expect(p.slots).not.toContain('G');
  });

  it('Machop CP:350 (fav=1) wins Great slot (cascade from CP:400 moving to UL) — GOLD star', () => {
    // CP:400 moved to UL (cascade), freeing GL for CP:350
    const p = find('Machop', 350);
    expect(p.isFavorite).toBe(true);
    expect(p.slots).toContain('G'); // cascade winner: CP:400 freed GL
    expect(p.suggestStar).toBe(true); // fav=1 + wins slot = gold
  });

  it('Eevee CP:478 wins Master slot (ivAvg=93.3%, as Umbreon) — GREEN star', () => {
    const p = find('Eevee', 478);
    expect(p).toBeDefined();
    expect(p.slots).toContain('M'); // one-slot: wins ML (ivAvg ≥ 90%), excluded from UL
    expect(p.suggestStarExpensive).toBe(false); // ML affordable=Infinity, not expensive
    expect(p.suggestStar).toBe(true); // fav=0 + wins slot = green
  });
});

// ─── Group 9 — Family grouping ───────────────────────────────────────────────

describe('Group 9 — Family grouping', () => {
  it('Frillish ♂ and ♀ are in separate families', () => {
    const maleFam = result.families.find(f =>
      f.members.some(p => p.name === 'Frillish' && p.gender === '♂')
    );
    const femaleFam = result.families.find(f =>
      f.members.some(p => p.name === 'Frillish' && p.gender === '♀')
    );
    expect(maleFam).toBeDefined();
    expect(femaleFam).toBeDefined();
    expect(maleFam.key).not.toBe(femaleFam.key);
  });

  it('Jellicent ♂ is in the same family as Frillish ♂ (evo-vote gender merge)', () => {
    const frillishFam = result.families.find(f =>
      f.members.some(p => p.name === 'Frillish' && p.gender === '♂')
    );
    const jellicentFam = result.families.find(f =>
      f.members.some(p => p.name === 'Jellicent' && p.gender === '♂')
    );
    expect(frillishFam).toBeDefined();
    expect(jellicentFam).toBeDefined();
    expect(frillishFam.key).toBe(jellicentFam.key);
  });

  it('Growlithe (Normal form) and Arcanine (Normal form) are in the same family', () => {
    const growlitheFam = result.families.find(f =>
      f.members.some(p => p.name === 'Growlithe')
    );
    const arcanineFam = result.families.find(f =>
      f.members.some(p => p.name === 'Arcanine' && !p.form.includes('Hisui'))
    );
    expect(growlitheFam).toBeDefined();
    expect(arcanineFam).toBeDefined();
    expect(growlitheFam.key).toBe(arcanineFam.key);
  });

  it('Hisuian Growlithe is in a separate family from Normal Growlithe', () => {
    const normalFam = result.families.find(f =>
      f.members.some(p => p.name === 'Growlithe' && (p.form === '' || p.form === 'Normal'))
    );
    const hisuiFam = result.families.find(f =>
      f.members.some(p => p.name === 'Growlithe' && p.form === 'Hisui')
    );
    expect(normalFam).toBeDefined();
    expect(hisuiFam).toBeDefined();
    expect(normalFam.key).not.toBe(hisuiFam.key);
  });

  it('Kleavor is in its own standalone family (NOT with Scyther/Scizor)', () => {
    const kleavorFam = result.families.find(f =>
      f.members.some(p => p.name === 'Kleavor')
    );
    const scytherFam = result.families.find(f =>
      f.members.some(p => p.name === 'Scyther')
    );
    expect(kleavorFam).toBeDefined();
    expect(scytherFam).toBeDefined();
    expect(kleavorFam.key).not.toBe(scytherFam.key);
  });

  it('Scyther (with Kleavor evo target in CSV) and Scizor are in the same family', () => {
    // Row 34 Scyther has Name(U)=Kleavor — the STANDALONE_SPECIES filter must ignore it.
    const scytherFam = result.families.find(f =>
      f.members.some(p => p.name === 'Scyther')
    );
    const scizorFam = result.families.find(f =>
      f.members.some(p => p.name === 'Scizor')
    );
    expect(scytherFam).toBeDefined();
    expect(scizorFam).toBeDefined();
    expect(scytherFam.key).toBe(scizorFam.key);
  });
});

// ─── Group 10 — Nick format ──────────────────────────────────────────────────

describe('Group 10 — Nick format', () => {
  it('All nicks are at most 12 characters', () => {
    result.pokemon.forEach(p => {
      if (!p.nickname) return;
      expect(p.nickname.length).toBeLessThanOrEqual(12);
    });
  });

  it('Feraligatr CP:2498 (hundo, wins Master) nick contains Ⓜ not Ⓡ', () => {
    const p = find('Feraligatr', 2498);
    expect(p).toBeDefined();
    expect(p.nickname).toBeDefined();
    expect(p.nickname).toContain('Ⓜ'); // one-slot: wins ML, nick uses Ⓜ
    expect(p.nickname).not.toContain('Ⓡ');
  });

  it('Snorlax CP:2990 (lucky hundo) nick contains Ⓡ or Ⓤ (lucky circled letter)', () => {
    const p = find('Snorlax', 2990);
    expect(p).toBeDefined();
    expect(p.nickname).toBeDefined();
    const CIRCLED = new Set(['ⓛ', 'Ⓖ', 'Ⓤ', 'Ⓜ', 'Ⓡ']);
    const hasCircled = [...p.nickname].some(ch => CIRCLED.has(ch));
    expect(hasCircled).toBe(true);
  });

  it('Magikarp CP:10 gets ML placeholder (no league data → no ML keeper → grey star review)', () => {
    const p = find('Magikarp', 10);
    // No league rank data → ML placeholder fires (best unslotted member in family)
    expect(p.decision).toBe('review');
    expect(p.isMlPlaceholder).toBe(true);
  });
});

// ─── Group 11 — Shadow/Lucky coexistence ────────────────────────────────────
// Shadow/lucky variants are in SEPARATE groups and each win their own slot independently.
// Under one-slot (M→U→G→L): high-ivAvg Pokémon (≥90%) win ML first.
// Shadow Seedot (99.49% UL, 99.71% GL) → wins UL (processed before GL).
// Shadow Bulbasaur CP:497 (ivAvg=95.6) → wins ML independently of normal ML winner.
// Scyther shadow/normal (both ivAvg=95.6) → both win ML independently (separate groups).
// Lucky Qwilfish CP:443 (ivAvg=95.6) → wins ML independently of normal ML winner.

describe('Group 11 — Shadow/Lucky coexistence', () => {
  it('Shadow Seedot CP:115 wins Ultra (99.49%) independently of normal CP:454 — separate groups', () => {
    const shadow = find('Seedot', 115);
    const normal = find('Seedot', 454);
    expect(shadow).toBeDefined();
    expect(normal).toBeDefined();
    expect(shadow.slots).toContain('U'); // one-slot: UL processed before GL; shadow wins UL
    expect(shadow.isShadow).toBe(true);
    expect(shadow.isFavorite).toBe(true);
    expect(shadow.suggestStar).toBe(true);
    // Shadow and normal are independent — normal also has its own slot
    const normalHasSlot = normal.slots.some(s => ['L','G','U','M'].includes(s));
    expect(normalHasSlot).toBe(true);
  });

  it('Shadow Bulbasaur CP:497 holds Master slot; normal Bulbasaur CP:463 also holds Master slot independently', () => {
    const shadow = find('Bulbasaur', 497);
    const normal = find('Bulbasaur', 463);
    expect(shadow.slots).toContain('M'); // ivAvg=95.6 → confirmed ML winner in shadow group
    expect(normal.slots).toContain('M'); // ivAvg=93.3 → confirmed ML winner in normal group
    expect(shadow.isShadow).toBe(true);
  });

  it('Scyther shadow CP:950 and normal CP:35 both hold Master slot independently (separate groups)', () => {
    const shadow = find('Scyther', 950);
    const normal = find('Scyther', 35);
    expect(shadow.slots).toContain('M'); // ivAvg=95.6 → ML winner in shadow group
    expect(normal.slots).toContain('M'); // ivAvg=95.6 → ML winner in normal group
    expect(shadow.isShadow).toBe(true);
  });

  it('Lucky Qwilfish CP:443 holds Master slot independently of normal CP:440', () => {
    const lucky = find('Qwilfish', 443);
    const normal = find('Qwilfish', 440);
    expect(lucky.slots).toContain('M'); // Lucky wins non-shadow Master (95.6%+5pp beats normal 93.3%)
    expect(normal.slots).not.toContain('M'); // normal loses to Lucky in one-winner Master pick
    expect(lucky.isLucky).toBe(true);
    expect(lucky.isFavorite).toBe(true);
    expect(lucky.suggestStar).toBe(true);
  });
});

// ─── Group 12 — Nuzleaf cyan star ────────────────────────────────────────────
// CP:498 (100% Little, dustL=800, fav=0) wins Little over CP:499 (99.8%, dustL=1600, fav=1).
// CP:498 should show CYAN (suggestStarCheaper) because the starred CP:499 at the same
// rounded rank costs more dust.

describe('Group 12 — Nuzleaf cyan star', () => {
  it('Nuzleaf CP:498 (100% Little, fav=0, dustL=800) wins Little slot', () => {
    const p = find('Nuzleaf', 498);
    expect(p).toBeDefined();
    expect(p.slots).toContain('L');
  });

  it('Nuzleaf CP:498 shows CYAN — cheaper than starred CP:499 at same rounded rank', () => {
    const p = find('Nuzleaf', 498);
    expect(p.suggestStarCheaper).toBe(true);
    expect(p.isCheaperAlternative).toBe(true);
    expect(p.cheaperAlternativeLeagues).toContain('L');
  });

  it('Nuzleaf CP:499 (99.8% Little, fav=1, dustL=1600) loses Little slot — RED star', () => {
    const p = find('Nuzleaf', 499);
    expect(p).toBeDefined();
    expect(p.isFavorite).toBe(true);
    expect(p.slots).not.toContain('L');
    expect(p.suggestStar).toBe(false);
  });
});

// ─── Group 13 — Standalone evo target slot suppression ───────────────────────
// Pokégenie sets Name(L)=Kleavor for Scyther rows and populates Rank%(L) with
// Kleavor's Little League rank (~94%). Without the fix, Scyther would incorrectly
// receive a Little League slot because the rank exceeds keepThreshold (90%).

describe('Group 13 — Standalone evo target suppresses league slot', () => {
  it('Scyther CP:260 (5/2/13) has no Little League slot despite 94% Rank%(L)', () => {
    const p = find('Scyther', 260);
    expect(p).toBeDefined();
    expect(p.slots).not.toContain('L');
  });

  it('Scyther CP:260 standaloneEvoL flag is set', () => {
    const p = find('Scyther', 260);
    expect(p).toBeDefined();
    expect(p.standaloneEvoL).toBe(true);
  });
});

// ─── Group 14 — Sawk multi-league deconfliction ──────────────────────────────
// Under one-slot (M→U→G→L): CP:190 wins G (99.3%) first, excluded from L.
// CP:500 (97.9% LL) wins Little as cascade winner (CP:190 freed it).

describe('Group 14 — Sawk multi-league deconfliction', () => {
  it('Sawk CP:190 (G=99.3%, fav=1) holds Great only — one-slot: G wins first, excluded from L', () => {
    const p = find('Sawk', 190);
    expect(p).toBeDefined();
    expect(p.slots).toContain('G');
    expect(p.slots).not.toContain('L'); // one-slot: excluded from LL after winning GL
    expect(p.isFavorite).toBe(true);
    expect(p.suggestStar).toBe(true); // fav=1 + wins slot = gold
  });

  it('Sawk CP:500 WINS Little slot (cascade — freed by CP:190 holding GL only)', () => {
    const p = find('Sawk', 500);
    expect(p).toBeDefined();
    expect(p.slots).toContain('L'); // cascade: CP:190 only holds GL, LL freed
  });

  it('Sawk CP:500 has a confirmed Little slot — GREEN star', () => {
    const p = find('Sawk', 500);
    expect(p.suggestStar).toBe(true); // fav=0 + wins LL = green
    expect(p.decision).toBe('keep');
  });
});

// ─── Group 15 — Special override = force keep (Shiny / Dynamax / Gigantamax) ─
// Parameterised across all three flags — each produces 4 tests (12 total).
// Snorlax CP:100 (stableKey='143|||5|5|5|2026-02-01') has no league rank data.
// Machamp CP:2450 (stableKey='68|||15|15|14|2025-01-01') holds Ultra slot normally.

// rankSym = the no-league-slot rank symbol. The best Dynamax is the Master power-up
// candidate (Ⓜ via wonDynamaxMaster); shiny/gigantamax no-slot still use Ⓡ.
describe.each([
  ['is_shiny',      '※', 'isShiny',      'Ⓡ'],
  ['is_dynamax',    'Ⓓ', 'isDynamax',    'Ⓜ'],
  ['is_gigantamax', 'Ⓧ', 'isGigantamax', 'Ⓡ'],
])('Group 15 — %s override = force keep', (flagKey, suffix, propName, rankSym) => {
  let ovResult;
  const ovFind = (name, cp) => ovResult.pokemon.find(p => p.name === name && p.cp === cp);

  beforeAll(() => {
    const csv = loadCSV(FIXTURE_PATH);
    const overrides = {
      '143|||5|5|5|2026-02-01': { [flagKey]: true },
      '68|||15|15|14|2025-01-01': { [flagKey]: true },
    };
    ovResult = loader.createWithOverrides(overrides).analyse(csv);
  });

  it(`Snorlax CP:100 (${flagKey}, no league slot) → decision=keep, suggestStar=true`, () => {
    const p = ovFind('Snorlax', 100);
    expect(p).toBeDefined();
    expect(p[propName]).toBe(true);
    expect(p.decision).toBe('keep');
    expect(p.suggestStar).toBe(true);
  });

  it(`Snorlax CP:100 (${flagKey}, fav=0) → green star not red`, () => {
    const p = ovFind('Snorlax', 100);
    expect(p.isFavorite).toBe(false);
    expect(p.suggestStar).toBe(true);
  });

  it(`Snorlax CP:100 (${flagKey}, no league rank) → nick contains ${rankSym} and ${suffix}`, () => {
    const p = ovFind('Snorlax', 100);
    expect(p.nickname).toContain(rankSym);
    expect(p.nickname).toContain(suffix);
    expect(p.nickname.length).toBeLessThanOrEqual(12);
  });

  it(`Machamp CP:2450 (${flagKey} + Master slot) → nick contains Ⓜ and ${suffix}`, () => {
    const p = ovFind('Machamp', 2450);
    expect(p).toBeDefined();
    expect(p[propName]).toBe(true);
    expect(p.decision).toBe('keep');
    expect(p.nickname).toContain('Ⓜ'); // one-slot: wins ML, nick uses Ⓜ
    expect(p.nickname).toContain(suffix);
    expect(p.nickname.length).toBeLessThanOrEqual(12);
  });
});

// ─── Group 16 — Nick convention selector ─────────────────────────────────────
// Tests buildNickname() with convention param: ivpct, rawiv, moves.
// Uses fixture data from the default beforeAll at the top of the file.

describe('Group 16 — Nick convention selector', () => {
  it('ivpct: Glaceon CP:1500 (IVs 2/9/14, ivAvg=55.6) → Glaceon56', () => {
    const p = find('Glaceon', 1500);
    expect(buildNickname(p, 'G', 'ivpct')).toBe('Glaceon56');
  });

  it('rawiv: Glaceon CP:1500 (IVs 2/9/14) → Glaceon2914', () => {
    const p = find('Glaceon', 1500);
    expect(buildNickname(p, 'G', 'rawiv')).toBe('Glaceon2914');
  });

  it('rawiv: Leafeon CP:1177 (IVs 0/14/15) → Leafeon01415', () => {
    const p = find('Leafeon', 1177);
    expect(buildNickname(p, 'G', 'rawiv')).toBe('Leafeon01415');
  });

  it('All conventions produce nicks ≤ 12 chars for all fixture pokemon', () => {
    const conventions = ['pvpvault', 'ivpct', 'rawiv', 'moves'];
    result.pokemon.forEach(p => {
      conventions.forEach(conv => {
        const slot = p.slots[0] || 'review';
        const nick = buildNickname(p, slot, conv);
        expect(nick.length).toBeLessThanOrEqual(12);
      });
    });
  });

  it('moves: falls back to ivpct for pokemon with no moves in CSV', () => {
    const p = find('Glaceon', 1500); // no moves in fixture
    const movesNick = buildNickname(p, 'G', 'moves');
    const ivpctNick = buildNickname(p, 'G', 'ivpct');
    expect(movesNick).toBe(ivpctNick);
  });

  it('moves: Feraligatr CP:2498 (Shadow Claw + Hydro Cannon) → nick uses move codes', () => {
    const p = find('Feraligatr', 2498);
    const nick = buildNickname(p, 'U', 'moves');
    expect(nick).toContain('SC');
    expect(nick).toContain('HC');
    expect(nick).toContain('/');
    expect(nick.length).toBeLessThanOrEqual(12);
  });

  it('pvpvault: explicit "pvpvault" param produces same nick as no convention param', () => {
    result.pokemon.forEach(p => {
      const slot = p.slots[0] || 'review';
      expect(buildNickname(p, slot, 'pvpvault')).toBe(buildNickname(p, slot));
    });
  });

  it('pvpvault: Glaceon CP:1500 (Great winner, dustG=0) → GlaceonⒼ100', () => {
    const p = find('Glaceon', 1500);
    expect(buildNickname(p, 'G', 'pvpvault')).toBe('GlaceonⒼ100');
  });
});

// ─── Group 16b — Special suffixes work across all conventions ─────────────────
// Verifies that ※ (shiny suffix) threads through ivpct, rawiv, moves, pvpvault.

describe('Group 16b — Special suffixes work across all conventions', () => {
  let sfxResult;
  const sfxFind = (name, cp) => sfxResult.pokemon.find(p => p.name === name && p.cp === cp);

  beforeAll(() => {
    const csv = loadCSV(FIXTURE_PATH);
    const overrides = { '143|||5|5|5|2026-02-01': { is_shiny: true } };
    sfxResult = loader.createWithOverrides(overrides).analyse(csv);
  });

  it.each(['pvpvault', 'ivpct', 'rawiv', 'moves'])(
    '%s convention: shiny Snorlax CP:100 nick ends with ※',
    (convention) => {
      const p = sfxFind('Snorlax', 100);
      const nick = buildNickname(p, p.slots[0] || 'review', convention);
      expect(nick.endsWith('※')).toBe(true);
      expect(nick.length).toBeLessThanOrEqual(12);
    }
  );
});

// ─── Group 17 — Shadow purify p suffix ───────────────────────────────────────
// Regression lock for the bug where purifyLeague slot counted as "already has slot",
// suppressing the p suffix that signals "worth purifying".

describe('Group 17 — Shadow purify p suffix', () => {
  it('Gastly shadow CP:82 (purifyRankPct≥92) → nick contains league symbol + p', () => {
    const p = find('Gastly', 82);
    expect(p).toBeDefined();
    expect(p.purifyRankPct).toBeGreaterThanOrEqual(92);
    expect(p.nickname).toMatch(/[ⓁⒼⓊ]\d+p/);
  });

  it('Gastly shadow CP:82 → nick length ≤ 12', () => {
    const p = find('Gastly', 82);
    expect(p.nickname.length).toBeLessThanOrEqual(12);
  });

  it('Machop shadow CP:120 (purifyHundo) → nick contains p✪', () => {
    const p = find('Machop', 120);
    expect(p).toBeDefined();
    expect(p.purifyHundo).toBe(true);
    expect(p.nickname).toContain('p✪');
    expect(p.nickname.length).toBeLessThanOrEqual(12);
  });

  it('Cacnea shadow CP:80 (purifyRankPct<92, no purifyLeague) → nick does NOT contain purify p', () => {
    const p = find('Cacnea', 80);
    expect(p).toBeDefined();
    expect(p.purifyLeague).toBeFalsy();
    expect(p.nickname).not.toMatch(/[ⓁⒼⓊ]\d+p/);
  });
});

// ─── Group 18 — Dynamax holding-format fix ───────────────────────────────────
// Direct unit tests on buildNickname() — the fix redirects slot='review' to
// slot='dynamax'/'gigantamax'/'shiny' when the pokemon has the corresponding flag.

describe('Group 18 — Dynamax/Gigantamax/Shiny holding-format redirect', () => {
  const makeP = (overrides) => Object.assign({
    name: 'Entei', form: '', specialForm: '', vivillonPattern: '',
    isDynamax: false, isGigantamax: false, isShiny: false,
    isShadow: false, isPurified: false, isLucky: false, isNundo: false,
    ivAvg: 82, atkIV: 10, defIV: 13, staIV: 14,
    rankPctG: 75, rankPctU: 75, rankPctL: 0, rankPctM: 89,
    slots: [], purifyLeague: '',
    hasAllBestMoves: false, hasBestMoves: false, hasTwoMoves: false,
    dustG: 0, dustU: 0, dustL: 0,
    evolvedNameG: '', evolvedNameU: '', evolvedNameL: '',
    quickMove: '', chargeMove1: '',
  }, overrides);

  it('isDynamax + slot=review → nick contains Ⓡ and Ⓓ, not holding format', () => {
    const p = makeP({ isDynamax: true, slots: ['dynamax'] });
    const nick = buildNickname(p, 'review');
    expect(nick).toContain('Ⓡ');
    expect(nick).toContain('Ⓓ');
    expect(nick).not.toMatch(/\d+[lgum]/); // no lowercase holding letters
    expect(nick.length).toBeLessThanOrEqual(12);
  });

  it('isGigantamax + slot=review → nick contains Ⓡ and Ⓧ, not holding format', () => {
    const p = makeP({ isGigantamax: true, slots: ['gigantamax'] });
    const nick = buildNickname(p, 'review');
    expect(nick).toContain('Ⓡ');
    expect(nick).toContain('Ⓧ');
    expect(nick).not.toMatch(/\d+[lgum]/);
    expect(nick.length).toBeLessThanOrEqual(12);
  });

  it('isShiny + slot=review → nick ends with ※, not holding format', () => {
    const p = makeP({ isShiny: true, slots: ['shiny'] });
    const nick = buildNickname(p, 'review');
    expect(nick).toContain('※');
    expect(nick).not.toMatch(/\d+[lgum]/);
    expect(nick.length).toBeLessThanOrEqual(12);
  });

  it('isDynamax with qualifying league + slot=review → uses league symbol not Ⓡ', () => {
    // rankPctU=95 >= 90 → should produce NameⓊ95Ⓓ
    const p = makeP({ isDynamax: true, rankPctU: 95, slots: ['dynamax'] });
    const nick = buildNickname(p, 'review');
    expect(nick).toContain('Ⓤ');
    expect(nick).toContain('Ⓓ');
    expect(nick.length).toBeLessThanOrEqual(12);
  });

  it('isLucky + slot=review → NameⓇ{IV%} not holding format', () => {
    const p = makeP({ isLucky: true });
    const nick = buildNickname(p, 'review');
    expect(nick).toContain('Ⓡ');
    expect(nick).not.toMatch(/\d+[lgum]/); // no lowercase holding letters
    expect(nick.length).toBeLessThanOrEqual(12);
  });

  it('isLucky + isDynamax + slot=review → Lucky wins (Ⓡ format) with Ⓓ suffix', () => {
    const p = makeP({ isLucky: true, isDynamax: true });
    const nick = buildNickname(p, 'review');
    expect(nick).toContain('Ⓡ');
    expect(nick).toContain('Ⓓ');
    expect(nick).not.toMatch(/\d+[lgum]/);
    expect(nick.length).toBeLessThanOrEqual(12);
  });

  it('isLucky + isShiny + slot=review → Lucky wins (Ⓡ format) with ※ suffix', () => {
    const p = makeP({ isLucky: true, isShiny: true });
    const nick = buildNickname(p, 'review');
    expect(nick).toContain('Ⓡ');
    expect(nick.length).toBeLessThanOrEqual(12);
  });
});

// ─── Group 19 — Shiny ✨ star type ────────────────────────────────────────────
// starType='shiny' fires for shinies whose only star reason is the shiny flag itself
// (no real PvP league slot, lucky, or nundo slot). Shinies with a real PvP slot
// keep their gold/green starType unchanged.

describe('Group 19 — Shiny ✨ starType', () => {
  let shinyNoSlotResult, shinyWithSlotResult;
  const findIn = (res, name, cp) => res.pokemon.find(p => p.name === name && p.cp === cp);

  beforeAll(() => {
    const csv = loadCSV(FIXTURE_PATH);
    // Snorlax CP:100 (5/5/5) — no league slot; shiny override → starType should be 'shiny'
    shinyNoSlotResult = loader.createWithOverrides({
      '143|||5|5|5|2026-02-01': { is_shiny: true }
    }).analyse(csv);
    // Glaceon CP:1500 (2/9/14, fav=1) — has real Great League slot; shiny override → starType stays gold
    shinyWithSlotResult = loader.createWithOverrides({
      '471|||2|9|14|2025-01-01': { is_shiny: true }
    }).analyse(csv);
  });

  it('shiny Snorlax CP:100 (no real league slot, fav=0) → starType is shiny not dot', () => {
    const p = findIn(shinyNoSlotResult, 'Snorlax', 100);
    expect(p).toBeDefined();
    expect(p.isShiny).toBe(true);
    expect(p.isFavorite).toBe(false);
    expect(p.starType).toBe('shiny');
    expect(p.starType).not.toBe('none');
    expect(p.starType).not.toBe('red');
  });

  it('shiny Glaceon CP:1500 (has Great League slot, fav=1) → starType is gold not shiny', () => {
    const p = findIn(shinyWithSlotResult, 'Glaceon', 1500);
    expect(p).toBeDefined();
    expect(p.isShiny).toBe(true);
    expect(p.starType).toBe('gold'); // real PvP slot + fav=1 → gold unchanged
    expect(p.starType).not.toBe('shiny');
  });
});

// ─── Group 20 — Shiny A3 nick fix (no Ⓜ for ivAvg-only Master rank) ─────────

describe('Group 20 — Shiny nick: Ⓡ when no capped league qualifies', () => {
  const makeShinyP = (overrides) => Object.assign({
    name: 'Clamperl', form: '', specialForm: '', vivillonPattern: '',
    isDynamax: false, isGigantamax: false, isShiny: true,
    isShadow: false, isPurified: false, isLucky: false, isNundo: false,
    ivAvg: 91, atkIV: 13, defIV: 14, staIV: 15,
    rankPctG: 45, rankPctU: 38, rankPctL: 70, rankPctM: 91,
    slots: ['shiny'], purifyLeague: '',
    hasAllBestMoves: false, hasBestMoves: false, hasTwoMoves: false,
    dustG: 0, dustU: 0, dustL: 0,
    evolvedNameG: '', evolvedNameU: '', evolvedNameL: '',
    quickMove: '', chargeMove1: '',
  }, overrides);

  it('shiny with high ivAvg (91%) but no qualifying capped league → nick has Ⓡ not Ⓜ', () => {
    const p = makeShinyP({});
    const nick = buildNickname(p, 'shiny');
    expect(nick).toContain('Ⓡ');
    expect(nick).toContain('※');
    expect(nick).not.toContain('Ⓜ');
    expect(nick.length).toBeLessThanOrEqual(12);
  });

  it('shiny with qualifying Great rank (92%) → nick has Ⓖ symbol', () => {
    const p = makeShinyP({ rankPctG: 92, rankPctL: 0 });
    const nick = buildNickname(p, 'shiny');
    expect(nick).toContain('Ⓖ');
    expect(nick).toContain('※');
    expect(nick).not.toContain('Ⓜ');
    expect(nick.length).toBeLessThanOrEqual(12);
  });

  it('shiny + slot=review (no confirmed slot) → Ⓡ format with ※, no league symbol', () => {
    const p = makeShinyP({ slots: [] });
    const nick = buildNickname(p, 'review');
    expect(nick).toContain('Ⓡ');
    expect(nick).toContain('※');
    expect(nick).not.toMatch(/[ⓁⒼⓊⓂ]/);
    expect(nick.length).toBeLessThanOrEqual(12);
  });
});

// ─── Group 21 — Hundo force-keep (Part B Fix 1) ──────────────────────────────

describe('Group 21 — Hundo (15/15/15) always gets decision=keep', () => {
  const makeHundoP = () => Object.assign({
    name: 'Mienfoo', form: '', specialForm: '', vivillonPattern: '',
    isDynamax: false, isGigantamax: false, isShiny: false,
    isShadow: false, isPurified: false, isLucky: false, isNundo: false,
    ivAvg: 100, atkIV: 15, defIV: 15, staIV: 15,
    rankPctG: 50, rankPctU: 45, rankPctL: 60, rankPctM: 100,
    slots: ['hundo'], purifyLeague: '', isPurifySlot: false,
    hasAllBestMoves: false, hasBestMoves: false, hasTwoMoves: false,
    dustG: 0, dustU: 0, dustL: 0,
    evolvedNameG: '', evolvedNameU: '', evolvedNameL: '',
    quickMove: '', chargeMove1: '',
  });

  it('hundo nick slot=lucky (not actually lucky) → NameⒽ format (standalone hundo indicator)', () => {
    const p = makeHundoP();
    const nick = buildNickname(p, 'lucky');
    expect(nick).toContain('Ⓗ');
    expect(nick).not.toContain('Ⓡ');
    expect(nick.length).toBeLessThanOrEqual(12);
  });
});

// ─── Group 22 — evolutionUnknown flag (Part C) ───────────────────────────────

describe('Group 22 — evolutionUnknown flag', () => {
  it('Wurmple has evolutionUnknown=true', () => {
    const all = result.pokemon;
    const wurmple = all.find(p => p.name === 'Wurmple');
    if (!wurmple) return; // fixture may not include Wurmple
    expect(wurmple.evolutionUnknown).toBe(true);
  });

  it('buildNickname does not crash for unknownEvo pokemon', () => {
    const p = {
      name: 'Wurmple', form: '', specialForm: '', vivillonPattern: '',
      isDynamax: false, isGigantamax: false, isShiny: false,
      isShadow: false, isPurified: false, isLucky: false, isNundo: false,
      ivAvg: 91, atkIV: 14, defIV: 15, staIV: 15,
      rankPctG: 91, rankPctU: 75, rankPctL: 91, rankPctM: 91,
      slots: ['G'], purifyLeague: '', isPurifySlot: false, evolutionUnknown: true,
      hasAllBestMoves: false, hasBestMoves: false, hasTwoMoves: false,
      dustG: 0, dustU: 0, dustL: 0,
      evolvedNameG: '', evolvedNameU: '', evolvedNameL: '',
      quickMove: '', chargeMove1: '',
    };
    const nick = buildNickname(p, 'G');
    expect(nick).toBeDefined();
    expect(nick.length).toBeLessThanOrEqual(12);
  });
});

// ─── Group 23 — Cross-evo-target slot routing + ML pre-evo + male Gothita ─────

const findByGender = (name, gender, cp) =>
  result.pokemon.find(p => p.name === name && p.gender === gender && p.cp === cp);

describe('Group 23 — Cross-evo-target slot routing', () => {

  // Case 1: Gligar cross-evo deconfliction
  it('Gligar CP:124 holding GL+UL with different evo targets → releases GL to runner-up', () => {
    const cp124 = find('Gligar', 124);
    const cp829 = find('Gligar', 829);
    expect(cp124).toBeDefined();
    expect(cp829).toBeDefined();
    expect(cp124.slots).not.toContain('G'); // GL released
    expect(cp124.slots).toContain('U');     // UL kept
    expect(cp829.slots).toContain('G');     // runner-up wins GL
    expect(cp829.decision).toBe('keep');
  });

  it('Gligar CP:829 gets green star (suggestStar) after deconfliction', () => {
    const p = find('Gligar', 829);
    expect(p.suggestStar).toBe(true);
    expect(p.nickname).toMatch(/Ⓖ/);
    expect(p.starType).toBe('green');
  });

  it('Gligar CP:124 keeps its best slot (Ultra as Gliscor)', () => {
    const p = find('Gligar', 124);
    expect(p.slots).toContain('U');
    expect(p.decision).toBe('keep');
    expect(p.targetEvo).toBe('Gliscor');
  });

  it('not.toContain: CP:124 does not hold GL after cross-evo deconfliction', () => {
    const p = find('Gligar', 124);
    expect(p.slots).not.toContain('G');
  });

  it('not.toContain: CP:829 has a confirmed league slot after deconfliction', () => {
    const p = find('Gligar', 829);
    expect(p.slots.some(s => ['L','G','U','M'].includes(s))).toBe(true);
  });

  // Case 2: Mienfoo hundo vs evolved Mienshao for Master League
  it('Mienfoo hundo (15/15/15) wins Master League over lower-IV evolved Mienshao', () => {
    const mienfoo = find('Mienfoo', 793);
    expect(mienfoo).toBeDefined();
    expect(mienfoo.atkIV).toBe(15);
    expect(mienfoo.defIV).toBe(15);
    expect(mienfoo.staIV).toBe(15);
    expect(mienfoo.slots).toContain('M');
    expect(mienfoo.decision).toBe('keep');
  });

  it('Mienfoo hundo nick shows ML format (Ⓜ) and hundo Ⓗ, not GL format (Ⓖ)', () => {
    const mienfoo = find('Mienfoo', 793);
    expect(mienfoo.nickname).toMatch(/Ⓜ/);
    expect(mienfoo.nickname).toContain('Ⓗ');
    expect(mienfoo.nickname).not.toMatch(/Ⓖ/);
  });

  it('not.toContain: Mienshao does not win ML when hundo pre-evo exists', () => {
    const p = find('Mienshao', 2289);
    expect(p).toBeDefined();
    expect(p.slots).not.toContain('M');
  });

  // Case 3: Male Gothita → Gothitelle via EVO_OVERRIDES
  it('male Gothita (15/15/14) gets Gothitelle evo targets from EVO_OVERRIDES', () => {
    const gothita = findByGender('Gothita', '♂', 185);
    expect(gothita).toBeDefined();
    expect(gothita.evolvedNameU).toBe('Gothitelle');
    expect(gothita.evolvedNameG).toBe('Gothorita');
  });

  it('male Gothita wins Master League slot (best-IV pre-evo, no final-evo in collection)', () => {
    const gothita = findByGender('Gothita', '♂', 185);
    expect(gothita.slots).toContain('M');
    expect(gothita.decision).toBe('keep');
  });

  it('male Gothita nick does not show holding format after fix', () => {
    const p = findByGender('Gothita', '♂', 185);
    expect(p.nickname).not.toMatch(/\d+m$/);
  });

  it('male Gothita starType is not red after fix', () => {
    const p = findByGender('Gothita', '♂', 185);
    expect(p.starType).not.toBe('red');
  });
});

// ─── Group 24 — Purify modal: exact CP cap prevents level-25 bust ─────────────
// Shadow Venonat CP:207 (level 8, IVs 8/10/14).
// Old heuristic: 89 + 11.1*0.4 = 93.4% → falsely qualifies for Little League.
// New code: purified level=25, evo=Venomoth, exact CP=1443 > 500 cap → excluded.

// ─── Group 25 — Squirtle: high-IV pre-evo wins ML over lower-IV final evo ──────
// Bug: hasFinalEvoInGroup always blocked pre-evos from ML even when they had
// better IVs than the Blastoise already in the collection. Starred 97.8% Squirtle
// was red (no slot) while 53.3% Blastoise was green (tentative ML) → Cull blocked.
// Fix: allow pre-evo when it strictly outranks ALL final evos in the group.

describe('Group 25 — Squirtle: high-IV pre-evo wins ML when unevolved beats final evo', () => {
  it('Squirtle CP:496 (97.8% IV, fav=1) wins Master League slot over 53.3% Blastoise', () => {
    const p = find('Squirtle', 496);
    expect(p).toBeDefined();
    expect(p.isFavorite).toBe(true);
    expect(p.slots).toContain('M');
  });

  it('Squirtle CP:496 (fav=1, wins ML) is gold-starred — not red', () => {
    const p = find('Squirtle', 496);
    expect(p.starType).toBe('gold');
    expect(p.starType).not.toBe('red');
  });

  it('Blastoise CP:1943 (53.3% IV, outclassed) has no slots and is not green-starred', () => {
    const p = find('Blastoise', 1943);
    expect(p).toBeDefined();
    expect(p.suggestStar).toBe(false);
    expect(p.starType).not.toBe('green');
  });

  it('Squirtle/Blastoise family has gold star + no green/blue/cyan — qualifies for Cull modal', () => {
    const fam = findFam('Squirtle');
    expect(fam).toBeDefined();
    const m = fam.members;
    expect(m.some(p => p.isFavorite && (p.suggestStar || p.suggestStarExpensive))).toBe(true);
    expect(m.some(p => !p.isFavorite && p.suggestStar)).toBe(false);
    expect(m.some(p => p.suggestStarExpensive && !p.isFavorite)).toBe(false);
    expect(m.some(p => p.suggestStarCheaper && !p.isFavorite)).toBe(false);
  });
});

describe('Group 24 — Purify modal: exact CP cap prevents level-25 bust', () => {
  it('shadow Venonat CP:207 (level 8) does NOT qualify for Little League purify — level-25 Venomoth exceeds 500CP', () => {
    const p = find('Venonat', 207);
    expect(p).toBeDefined();
    expect(p.isShadow).toBe(true);
    expect(p.purifyLeague).not.toBe('L');
  });

  it('shadow Venonat CP:207 has no qualifying purify league at all', () => {
    const p = find('Venonat', 207);
    expect(p.purifyLeague).toBe('');
  });

  it('shadow Venonat CP:207 purifyHundo is false (purified IVs 10/12/15, not 15/15/15)', () => {
    const p = find('Venonat', 207);
    expect(p.purifyHundo).toBe(false);
  });
});

// ─── Group 26 — Nick Symbol Overhaul (Ⓜ ML, Ⓗ hundo indicator) ──────────────

describe('Group 26 — Nick Symbol Overhaul', () => {
  const makeP = (overrides) => Object.assign({
    name: 'Mewtwo', form: '', specialForm: '', vivillonPattern: '',
    isDynamax: false, isGigantamax: false, isShiny: false,
    isShadow: false, isPurified: false, isLucky: false, isNundo: false,
    ivAvg: 100, atkIV: 15, defIV: 15, staIV: 15,
    rankPctG: 0, rankPctU: 0, rankPctL: 0, rankPctM: 100,
    slots: [], purifyLeague: '', isPurifySlot: false,
    hasAllBestMoves: false, hasBestMoves: false, hasTwoMoves: false,
    dustG: 0, dustU: 0, dustL: 0,
    evolvedNameG: '', evolvedNameU: '', evolvedNameL: '',
    quickMove: '', chargeMove1: '',
  }, overrides);

  // 1. Hundo + capped league slot → Ⓗ appended
  it('15/15/15 + Ultra slot → nick contains Ⓤ100Ⓗ', () => {
    const p = makeP({ slots: ['U'], rankPctU: 100 });
    const nick = buildNickname(p, 'U');
    expect(nick).toContain('Ⓤ');
    expect(nick).toContain('100');
    expect(nick).toContain('Ⓗ');
    expect(nick.length).toBeLessThanOrEqual(12);
  });

  // 2. Hundo + Master League → Ⓜ not Ⓡ, with Ⓗ
  it('15/15/15 + Master slot → nick contains Ⓜ100Ⓗ (not Ⓡ)', () => {
    const p = makeP({ slots: ['M'], wonMasterSlot: true });
    const nick = buildNickname(p, 'M');
    expect(nick).toContain('Ⓜ');
    expect(nick).toContain('100');
    expect(nick).toContain('Ⓗ');
    expect(nick).not.toContain('Ⓡ');
    expect(nick.length).toBeLessThanOrEqual(12);
  });

  // 3. Hundo, no league slot (slot='lucky', not actually lucky) → NameⒽ
  it('15/15/15, no slot (slot=lucky, not lucky) → nick is NameⒽ only', () => {
    const p = makeP({ slots: ['hundo'] });
    const nick = buildNickname(p, 'lucky');
    expect(nick).toContain('Ⓗ');
    expect(nick).not.toContain('Ⓡ');
    expect(nick).not.toContain('Ⓜ');
    expect(nick).not.toMatch(/\d/); // no IV number
    expect(nick.length).toBeLessThanOrEqual(12);
  });

  // 4. Lucky + hundo, no qualifying capped league (slot=review → !hasSlot lucky path) → Ⓡ100Ⓗ
  it('15/15/15 + lucky, no slot (slot=review) → nick contains Ⓡ100Ⓗ', () => {
    const p = makeP({ isLucky: true, slots: [] });
    const nick = buildNickname(p, 'review');
    expect(nick).toContain('Ⓡ');
    expect(nick).toContain('100');
    expect(nick).toContain('Ⓗ');
    expect(nick.length).toBeLessThanOrEqual(12);
  });

  // 5. Hundo + shiny, no slot → nick contains Ⓗ※ at end
  it('15/15/15 + shiny, no slot (slot=review) → nick ends with Ⓗ※', () => {
    const p = makeP({ isShiny: true, slots: [] });
    const nick = buildNickname(p, 'review');
    expect(nick).toContain('Ⓡ');
    expect(nick).toContain('Ⓗ');
    expect(nick.endsWith('Ⓗ※')).toBe(true);
    expect(nick.length).toBeLessThanOrEqual(12);
  });

  // 6. Non-hundo → no Ⓗ in nick
  it('Non-hundo (14/15/15) + Ultra slot → no Ⓗ in nick', () => {
    const p = makeP({ atkIV: 14, ivAvg: 97.8, slots: ['U'], rankPctU: 97 });
    const nick = buildNickname(p, 'U');
    expect(nick).toContain('Ⓤ');
    expect(nick).not.toContain('Ⓗ');
    expect(nick.length).toBeLessThanOrEqual(12);
  });

  // 7. fitName maximises name: long name + Ⓤ100Ⓗ suffix
  it('fitName via buildNickname: long name gets max chars, total ≤ 12', () => {
    const p = makeP({ name: 'Whimsicott', slots: ['U'], rankPctU: 100 });
    const nick = buildNickname(p, 'U');
    // 'Ⓤ100Ⓗ' = 5 chars suffix → 7 chars for name → 'Whimsic'
    expect(nick.length).toBeLessThanOrEqual(12);
    expect(nick).toContain('Ⓤ');
    expect(nick).toContain('Ⓗ');
    const nameChars = nick.indexOf('Ⓤ');
    expect(nameChars).toBe(7); // 7 chars of name before suffix
  });

  // 8. $$ suppressed on hundo nick even when dust is expensive
  it('hundo with expensive dust → no $$ in nick', () => {
    const p = makeP({ slots: ['U'], rankPctU: 100, dustU: 400000 });
    const nick = buildNickname(p, 'U');
    expect(nick).not.toContain('$');
    expect(nick).toContain('Ⓗ');
    expect(nick.length).toBeLessThanOrEqual(12);
  });

  // 9. Feraligatr (fixture hundo) + Master slot → nick has Ⓗ
  it('Feraligatr CP:2498 (hundo fixture) → nick contains Ⓜ and Ⓗ', () => {
    const p = find('Feraligatr', 2498);
    expect(p).toBeDefined();
    expect(p.atkIV).toBe(15);
    expect(p.defIV).toBe(15);
    expect(p.staIV).toBe(15);
    expect(p.nickname).toContain('Ⓜ'); // one-slot: wins ML, nick uses Ⓜ
    expect(p.nickname).toContain('Ⓗ');
    expect(p.nickname.length).toBeLessThanOrEqual(12);
  });
});

// ─── Group 27 — Brief B: Dmax/Gmax/Legendary normalisation ──────────────────
// Rows 62–69 added to fixture for these tests.
// Dmax/Gmax: best-IV per species → keep slot; all dupes → trade + visibility star.
// Legendary (non-Dmax/Gmax, no league slot): best-IV → 'best_overall' → keep; dupes → trade + visibility.

// 27a: Two Dmax Entei — best is the Master power-up candidate (Ⓜ); the slot-less dupe
// is kept as a raid candidate (Ⓡ) per the dynamax-master-flag brief (all Dmax kept).
describe('Group 27a — Dmax Entei: best-IV gets Ⓜ, dupe kept as raid candidate (Ⓡ)', () => {
  let g27aResult;
  const g27aFind = (name, cp) => g27aResult.pokemon.find(p => p.name === name && p.cp === cp);

  beforeAll(() => {
    const csv = loadCSV(FIXTURE_PATH);
    const overrides = {
      '244|||13|14|13|2026-03-01': { is_dynamax: true },  // Entei CP:2900 88.9% — best
      '244|||11|11|12|2026-03-02': { is_dynamax: true },  // Entei CP:2800 75.6% — dupe
    };
    g27aResult = loader.createWithOverrides(overrides).analyse(csv);
  });

  it('Entei CP:2900 (best Dmax, 88.9%) → decision=keep, wonDynamaxMaster, slots includes dynamax', () => {
    const p = g27aFind('Entei', 2900);
    expect(p).toBeDefined();
    expect(p.isDynamax).toBe(true);
    expect(p.decision).toBe('keep');
    expect(p.wonDynamaxMaster).toBe(true);
    expect(p.slots).toContain('dynamax');
  });

  it('Entei CP:2900 (best Dmax) → nickname is EnteiⓂ89Ⓓ (Master power-up candidate)', () => {
    const p = g27aFind('Entei', 2900);
    expect(p.nickname).toBe('EnteiⓂ89Ⓓ');
  });

  it('Entei CP:2800 (dupe Dmax, 75.6%) → decision=keep (raid candidate)', () => {
    const p = g27aFind('Entei', 2800);
    expect(p).toBeDefined();
    expect(p.isDynamax).toBe(true);
    expect(p.decision).toBe('keep');
    expect(p.wonDynamaxMaster).toBeFalsy();
  });

  it('Entei CP:2800 (dupe Dmax) → nickname is EnteiⓇ76Ⓓ (raid candidate)', () => {
    const p = g27aFind('Entei', 2800);
    expect(p.nickname).toBe('EnteiⓇ76Ⓓ');
  });

  it('Entei CP:2800 (dupe Dmax) → kept, not a tradeable visibility star', () => {
    const p = g27aFind('Entei', 2800);
    expect(p.decision).toBe('keep');
    expect(p.starType).not.toBe('visibility');
  });
});

// 27b: Gmax Snorlax — best (with Ultra rank ≥90) keeps with Ⓧ in nick, dupe trades with visibility
describe('Group 27b — Gmax Snorlax: best-IV keeps (Ⓧ in nick), dupe gets visibility star', () => {
  let g27bResult;
  const g27bFind = (name, cp) => g27bResult.pokemon.find(p => p.name === name && p.cp === cp);

  beforeAll(() => {
    const csv = loadCSV(FIXTURE_PATH);
    const overrides = {
      '143|||15|14|15|2026-03-03': { is_gigantamax: true },  // Snorlax CP:2448 97.8% — best Gmax
      '143|||11|10|11|2026-03-04': { is_gigantamax: true },  // Snorlax CP:200 71.1% — dupe
    };
    g27bResult = loader.createWithOverrides(overrides).analyse(csv);
  });

  it('Snorlax CP:2448 (best Gmax, 97.8%) → decision=keep', () => {
    const p = g27bFind('Snorlax', 2448);
    expect(p).toBeDefined();
    expect(p.isGigantamax).toBe(true);
    expect(p.decision).toBe('keep');
  });

  it('Snorlax CP:2448 (best Gmax) → nickname contains Ⓧ and is SnorlaxⓊ96Ⓧ', () => {
    // Lucky Snorlax wins Master slot; CP:2448 (non-lucky) demoted → holds Gmax slot instead.
    // Gmax nick picks best capped league ≥90% (Ultra 96%), so SnorlaxⓊ96Ⓧ.
    const p = g27bFind('Snorlax', 2448);
    expect(p.nickname).toContain('Ⓧ');
    expect(p.nickname).toBe('SnorlaxⓊ96Ⓧ');
    expect(p.nickname.length).toBeLessThanOrEqual(12);
  });

  it('Snorlax CP:200 (no Gmax slot, Lucky winner holds Master) → decision=trade', () => {
    // CP:2448 holds Gmax slot (no M slot after demotion); CP:200 has no slot.
    const p = g27bFind('Snorlax', 200);
    expect(p).toBeDefined();
    expect(p.isGigantamax).toBe(true);
    expect(p.decision).toBe('trade');
  });

  it('Snorlax CP:200 (no slot) → starType is visibility', () => {
    const p = g27bFind('Snorlax', 200);
    expect(p.starType).toBe('visibility');
  });
});

// 27c: Raikou Legendary — best wins Master slot (Ⓜ93), dupe trades with visibility
describe('Group 27c — Raikou Legendary: best wins Master slot (Ⓜ93), dupe gets visibility star', () => {
  // Uses global result — Raikou rows auto-classified as Legendary (now enter M competition).

  it('Raikou CP:2900 (best, 93.3%) → decision=keep, slots includes M', () => {
    const p = find('Raikou', 2900);
    expect(p).toBeDefined();
    expect(p.decision).toBe('keep');
    expect(p.slots).toContain('M');
  });

  it('Raikou CP:2900 (best Legendary) → nickname is RaikouⓂ93', () => {
    const p = find('Raikou', 2900);
    expect(p.nickname).toBe('RaikouⓂ93');
  });

  it('Raikou CP:2700 (dupe, 77.8%) → decision=trade', () => {
    const p = find('Raikou', 2700);
    expect(p).toBeDefined();
    expect(p.decision).toBe('trade');
  });

  it('Raikou CP:2700 (dupe Legendary) → starType is visibility', () => {
    const p = find('Raikou', 2700);
    expect(p.starType).toBe('visibility');
  });
});

// 27d: Dmax+shiny Entei CP:2901 — only Dmax in run, so it is the best Dmax and gets the
// Master power-up flag (Ⓜ) plus the Ⓓ/※ markers.
describe('Group 27d — Dmax+shiny Entei: keeps with Ⓜ, Ⓓ, ※ in nick', () => {
  let g27dResult;
  const g27dFind = (name, cp) => g27dResult.pokemon.find(p => p.name === name && p.cp === cp);

  beforeAll(() => {
    const csv = loadCSV(FIXTURE_PATH);
    const overrides = {
      '244|||13|14|13|2026-03-07': { is_dynamax: true, is_shiny: true },  // Entei CP:2901 shiny Dmax
    };
    g27dResult = loader.createWithOverrides(overrides).analyse(csv);
  });

  it('Entei CP:2901 (only Dmax in run, shiny) → decision=keep, slots includes dynamax', () => {
    const p = g27dFind('Entei', 2901);
    expect(p).toBeDefined();
    expect(p.isDynamax).toBe(true);
    expect(p.isShiny).toBe(true);
    expect(p.decision).toBe('keep');
    expect(p.slots).toContain('dynamax');
  });

  it('Entei CP:2901 (Dmax+shiny, best Dmax) → nickname contains Ⓜ, Ⓓ, and ※', () => {
    const p = g27dFind('Entei', 2901);
    expect(p.nickname).toContain('Ⓜ');
    expect(p.nickname).toContain('Ⓓ');
    expect(p.nickname).toContain('※');
    expect(p.nickname.length).toBeLessThanOrEqual(12);
  });
});

// ─── Group 28 — Deino multi-evo-target multi-league ─────────────────────────
// Exercises: Bug1 blank-evo guard (GL+LL), deconfliction+nextBest across evo
// targets, aIsEvolved tiebreaker, dust tiebreaker, two independent GL keeps.
//
// Initial slot assignment:
//   Deino CP:537  GL=99.40%(Zweilous) + UL=95.50%(Hydreigon) → conflict
//   Deino CP:499  LL=91.80%(Zweilous) — best LL
//   Hydreigon CP:1498  GL=99.40%(Hydreigon) — independent GL keep
//
// After deconfliction: CP:537 releases G(Zweilous), keeps U(Hydreigon)
// nextBest fills G(Zweilous) → CP:499 (next-best, holds L not G)
//
// Final state:
//   CP:537  → U(Hydreigon) keep
//   CP:499  → G(Zweilous) + L(Zweilous) keep (two slots, same evo target)
//   Hydreigon CP:1498  → G(Hydreigon) keep (independent of Zweilous group)
//   CP:399, CP:93, CP:10  → no slots

describe('Group 28a — Two independent GL keeps from same Deino family', () => {
  it('Hydreigon CP:1498 (→Hydreigon) holds GL slot and decision=keep', () => {
    const p = find('Hydreigon', 1498);
    expect(p).toBeDefined();
    expect(p.slots).toContain('G');
    expect(p.decision).toBe('keep');
  });

  it('A Deino holds GL slot with targetEvo=Zweilous (nextBest after CP:537 deconfliction)', () => {
    const zweiGL = result.pokemon.find(p =>
      p.name === 'Deino' && p.slots.includes('G') && p.targetEvo === 'Zweilous'
    );
    expect(zweiGL).toBeDefined();
    expect(zweiGL.decision).toBe('keep');
  });

  it('Both GL evo-target groups coexist — Hydreigon GL slot not deconflicted by Zweilous winner', () => {
    const hdr = find('Hydreigon', 1498);
    const zweiGL = result.pokemon.find(p =>
      p.name === 'Deino' && p.slots.includes('G') && p.targetEvo === 'Zweilous'
    );
    expect(hdr.slots).toContain('G');
    expect(zweiGL).toBeDefined();
  });
});

describe('Group 28b — Deconfliction releases G(Zweilous), keeps U(Hydreigon); nextBest fills G', () => {
  it('Deino CP:537 holds U(Hydreigon) after deconfliction', () => {
    const p = find('Deino', 537);
    expect(p).toBeDefined();
    expect(p.slots).toContain('U');
    expect(p.decision).toBe('keep');
  });

  it('Deino CP:537 does NOT hold G after deconfliction (G(Zweilous) was released)', () => {
    const p = find('Deino', 537);
    expect(p.slots).not.toContain('G');
  });

  it('Deino CP:499 wins G(Zweilous) as nextBest after CP:537 releases it', () => {
    const p = find('Deino', 499);
    expect(p).toBeDefined();
    expect(p.slots).toContain('G');
  });

  it('Hydreigon CP:1498 retains G(Hydreigon) independently through deconfliction', () => {
    expect(find('Hydreigon', 1498).slots).toContain('G');
  });
});

describe('Group 28c — Blank evolvedNameG/L guard: unanalysed Deino wins no GL/LL slot', () => {
  it('Deino CP:10 (blank evo fields) does not hold GL slot', () => {
    const p = find('Deino', 10);
    expect(p).toBeDefined();
    expect(p.slots).not.toContain('G');
  });

  it('Deino CP:10 (blank evolvedNameL) does not hold LL slot', () => {
    expect(find('Deino', 10).slots).not.toContain('L');
  });

  it('Deino CP:10 decision is not keep', () => {
    expect(find('Deino', 10).decision).not.toBe('keep');
  });
});

describe('Group 28d — Dedup does not collapse two different GL evo-target slots', () => {
  it('Both G|Zweilous and G|Hydreigon winners exist in Deino family after all passes', () => {
    const famMembers = result.pokemon.filter(p =>
      ['Deino', 'Zweilous', 'Hydreigon'].includes(p.name)
    );
    const glKeepers = famMembers.filter(p => p.slots.includes('G') && p.decision === 'keep');
    const evoTargets = new Set(glKeepers.map(p => p.targetEvo || p.name));
    expect(evoTargets.has('Zweilous')).toBe(true);
    expect(evoTargets.has('Hydreigon')).toBe(true);
  });
});

describe('Group 28e — LL competition: Zweilous-evo Deino wins; blank excluded', () => {
  // Under one-slot (M→U→G→L): CP:499 wins GL (99.40%), then excluded from LL.
  // CP:399 (91.80% LL, evolvedNameL=Zweilous) wins LL as cascade winner. CP:537 does not win L.
  it('Deino CP:537 does NOT hold LL slot — CP:499 (now GL only) freed CP:399 for LL', () => {
    const p = find('Deino', 537);
    expect(p.slots).not.toContain('L');
  });

  it('Deino CP:499 holds GL only (G=99.40%) — one-slot: excluded from LL after winning GL', () => {
    const p = find('Deino', 499);
    expect(p.slots).toContain('G');
    expect(p.slots).not.toContain('L'); // one-slot: excluded from LL after winning GL
  });

  it('Deino CP:399 wins LL (91.80% as Zweilous) — cascade after CP:499 freed LL', () => {
    const p = find('Deino', 399);
    expect(p).toBeDefined();
    expect(p.slots).toContain('L'); // cascade winner: CP:499 freed LL slot
    expect(p.decision).toBe('keep');
  });

  it('Deino CP:10 (blank evolvedNameL, no rank) does not hold LL slot', () => {
    expect(find('Deino', 10).slots).not.toContain('L');
  });

  it('Deino CP:93 (blank evolvedNameL, no LL rank) does not hold LL slot', () => {
    expect(find('Deino', 93).slots).not.toContain('L');
  });
});

describe('Group 28f — Dust tiebreaker within same evo target at tied GL rank', () => {
  // CP:537 (dustG=25000) and CP:499 (dustG=28000) both have GL=99.40% for Zweilous.
  // Dust tiebreaker selects CP:537 as initial GL winner; it is then deconflicted to U.
  // CP:499 becomes the GL winner via nextBest.
  it('CP:537 holds UL (not GL) — confirms it won GL initially via dust tiebreaker, then deconflicted', () => {
    const p537 = find('Deino', 537);
    expect(p537.slots).toContain('U');
    expect(p537.slots).not.toContain('G');
  });

  it('CP:499 (higher dust) holds GL as nextBest — was second in initial GL due to dust', () => {
    const p499 = find('Deino', 499);
    expect(p499.slots).toContain('G');
  });
});

describe('Group 28g — aIsEvolved tiebreaker: Hydreigon beats Deino CP:93 at same rounded GL rank', () => {
  it('Hydreigon CP:1498 and Deino CP:93 share the same GL rank (99.40%)', () => {
    const hdr = find('Hydreigon', 1498);
    const d93 = find('Deino', 93);
    expect(Math.round(hdr.rankPctG)).toBe(99);
    expect(Math.round(d93.rankPctG)).toBe(99);
  });

  it('Hydreigon CP:1498 wins GL(Hydreigon) — already-evolved tiebreaker over Deino CP:93', () => {
    expect(find('Hydreigon', 1498).slots).toContain('G');
    expect(find('Deino', 93).slots).not.toContain('G');
  });

  it('Deino CP:93 decision is not keep (lost to Hydreigon in GL(Hydreigon) group)', () => {
    expect(find('Deino', 93).decision).not.toBe('keep');
  });
});

// 27e: Dmax hundo Entei CP:3200 — keeps with nick EnteiⓇ100ⒹⒽ
describe('Group 27e — Dmax hundo Entei: hundo indicator in nick', () => {
  let g27eResult;
  const g27eFind = (name, cp) => g27eResult.pokemon.find(p => p.name === name && p.cp === cp);

  beforeAll(() => {
    const csv = loadCSV(FIXTURE_PATH);
    const overrides = {
      '244|||15|15|15|2026-03-08': { is_dynamax: true },  // Entei CP:3200 hundo Dmax
    };
    g27eResult = loader.createWithOverrides(overrides).analyse(csv);
  });

  it('Entei CP:3200 (Dmax hundo, 15/15/15) → decision=keep, wonDynamaxMaster, slots includes dynamax (not regular M)', () => {
    // Dynamax is excluded from the regular Master pass; the best Dmax gets the Ⓜ power-up
    // flag via wonDynamaxMaster instead of winning a regular M slot.
    const p = g27eFind('Entei', 3200);
    expect(p).toBeDefined();
    expect(p.isDynamax).toBe(true);
    expect(p.atkIV).toBe(15);
    expect(p.defIV).toBe(15);
    expect(p.staIV).toBe(15);
    expect(p.decision).toBe('keep');
    expect(p.wonDynamaxMaster).toBe(true);
    expect(p.wonMasterSlot).toBeFalsy();
    expect(p.slots).toContain('dynamax');
  });

  it('Entei CP:3200 (Dmax hundo) → nickname is EnteiⓂ100ⒹⒽ', () => {
    // wonDynamaxMaster → Ⓜ + IV%(100→PERFECT); Ⓓ (dynamax) + Ⓗ (hundo) suffixes.
    const p = g27eFind('Entei', 3200);
    expect(p.nickname).toBe('EnteiⓂ100ⒹⒽ');
  });
});

// ─── Group 29 — Greedent CP:1438 wins UL (Option C affordable-first) ─────────
// Option C two-pass: affordable candidates (dust ≤ 300k for UL) win Pass 1.
// Greedent CP:1438 (92.09% UL, affordable as final evo) beats expensive Skwovet CP:750 (98.58% UL).
// GL is still won by Skwovet CP:496 (100%, affordable, dustG=0).
// Behaviour changed intentionally by Feature 2 Option C (brief 2026-05-29).

describe('Group 29 — Greedent CP:1438 wins UL (Option C); Skwovet CP:750 loses UL to affordable candidate', () => {
  it('Greedent CP:1438 (92.09% UL, affordable) → wins UL slot (Option C Pass 1)', () => {
    const p = find('Greedent', 1438);
    expect(p).toBeDefined();
    expect(p.slots).toContain('U');
    expect(p.decision).toBe('keep');
  });

  it('Skwovet CP:750 (98.58% UL, expensive dustU) → does NOT hold UL slot (Option C)', () => {
    const p = find('Skwovet', 750);
    expect(p.slots).not.toContain('U');
  });

  it('Skwovet CP:750 does NOT hold GL either — CP:496 (100%) wins it', () => {
    const p = find('Skwovet', 750);
    expect(p.slots).not.toContain('G');
  });

  it('Skwovet CP:750 (no league slot) → decision=review', () => {
    const p = find('Skwovet', 750);
    expect(p.decision).toBe('review');
  });
});

// ─── Group 30 — Skwovet CP:496 99.78% GL wins against same-family competition ────
// Regression guard: sameEvoConflicts fix must not displace a top GL winner.
// CP:496 (99.78% GL, evolvedNameG=Greedent, fav=1, dustG=0) should win GL unconditionally.
// CP:750 (99.50% GL, 98.58% UL) should NOT displace it — lower rank loses GL.
// See Group 32 (test 5a/5d) for the evolved-rival (Greedent CP:1300 99.50%) guard.

describe('Group 30 — Skwovet CP:496 (99.78% GL) wins and is kept — regression guard', () => {
  it('Skwovet CP:496 (99.78% GL, evolvedNameG=Greedent) → slots contains G', () => {
    const p = find('Skwovet', 496);
    expect(p).toBeDefined();
    expect(p.slots).toContain('G');
  });

  it('Skwovet CP:496 → decision=keep', () => {
    const p = find('Skwovet', 496);
    expect(p.decision).toBe('keep');
  });

  it('Skwovet CP:496 (99.78% GL, rounds to 100) → nickname contains Ⓖ and 100', () => {
    const p = find('Skwovet', 496);
    expect(p.nickname).toContain('Ⓖ');
    expect(p.nickname).toContain('100');
  });

  it('Skwovet CP:496 holds GL; Greedent CP:1438 holds UL (Option C affordable-first)', () => {
    // Option C: affordable Greedent CP:1438 wins UL in Pass 1; Skwovet CP:750 (expensive) loses UL.
    const p496 = find('Skwovet', 496);
    const greedent = find('Greedent', 1438);
    expect(p496.slots).toContain('G');
    expect(greedent.slots).toContain('U');
  });
});

// ─── Group 31 — Mewtwo M slot: highest-IV wins Master, lower-IV does NOT ─────────
// Legendaries now enter M competition; highest ivAvg wins Master slot (Ⓜ).
// CP:2368 (93.3% IV, fav=1) wins M; CP:2352 (88.9% IV) does not.

describe('Group 31 — Mewtwo best-IV wins best_overall (Legendary regression guard)', () => {
  it('Mewtwo CP:2368 (93.3% IV, highest) → slots contains M', () => {
    const p = find('Mewtwo', 2368);
    expect(p).toBeDefined();
    expect(p.slots).toContain('M');
  });

  it('Mewtwo CP:2368 → decision=keep', () => {
    const p = find('Mewtwo', 2368);
    expect(p.decision).toBe('keep');
  });

  it('Mewtwo CP:2368 (best Legendary) → nickname contains Ⓜ and 93', () => {
    const p = find('Mewtwo', 2368);
    expect(p.nickname).toContain('Ⓜ');
    expect(p.nickname).toContain('93');
  });

  it('Mewtwo CP:2352 (88.9% IV, lower) → does NOT hold best_overall slot', () => {
    const p = find('Mewtwo', 2352);
    expect(p).toBeDefined();
    expect(p.slots).not.toContain('best_overall');
  });
});

// ─── Group 32 — Fix 1 regression: actual rank wins before evolved preference ────
// Rows 78 (Skwovet CP:496, 99.78% GL) and 81 (Greedent CP:1300, 99.50% GL) both
// round to 100 at GL. Without Fix 1 the evolved form wins; with Fix 1 higher actual
// rank wins regardless of evo preference.

describe('Group 32 — Fix 1 regression: actual rank wins before evolved preference at equal rounded rank', () => {
  it('Skwovet CP:496 (99.78% GL, pre-evo) wins GL over Greedent CP:1300 (99.50% GL, evolved)', () => {
    const p = find('Skwovet', 496);
    expect(p).toBeDefined();
    expect(p.slots).toContain('G');
  });

  it('Greedent CP:1300 (99.50% GL) does NOT win GL — lower actual rank loses despite evolved preference', () => {
    const p = find('Greedent', 1300);
    expect(p).toBeDefined();
    expect(p.slots).not.toContain('G');
  });
});

// ─── Group 36 — betterInThisLg guard: committed-to-Little filter uses rank comparison ─
// Review #2 root cause: line ~742 excluded ANY favorited, dustL=0, Little-qualifying Pokémon
// from Great/Ultra, even when Great rank is higher. Fix: only exclude when NOT better in this lg.
// 4a: CP:496 (rankG=99.78% > rankL=98.83%) must win Great.
// 4b: Flaaffy CP:500 (rankG=91.50% < rankL=99.95%) must stay committed to Little.
// 4c: Mawile CP:500 (rankG=95.00% < rankL=99.00%, final-evo, same-evo) must stay excluded from Great.

describe('Group 36 — betterInThisLg guard (committed-to-Little filter uses rank comparison)', () => {
  // 4a — exact regression: fav + dustL=0 + qualifying Little rank + higher Great rank → wins Great
  it('4a: Skwovet CP:496 (rankG=99.78% > rankL=98.83%, fav, dustL=0) still wins Great', () => {
    const p = find('Skwovet', 496);
    expect(p.slots).toContain('G');
  });
  it('4a: Skwovet CP:496 → decision=keep (not demoted to review when fav + Little-maxed)', () => {
    const p = find('Skwovet', 496);
    expect(p.decision).not.toBe('review');
    expect(p.decision).toBe('keep');
  });
  it('4a: Skwovet CP:496 → nickname contains Ⓖ (confirmed Great slot)', () => {
    const p = find('Skwovet', 496);
    expect(p.nickname).toContain('Ⓖ');
  });

  // 4b — C2 behavioural change: Flaaffy evolvedNameL='Flaaffy' ≠ evolvedNameG='Ampharos' → different forms
  // Under C2, Flaaffy is no longer excluded from Great. It wins Great (cheaper lucky dust beats Mareep).
  // Deconfliction: Flaaffy's Great anchor 'Ampharos' ≠ Little evo 'Flaaffy' → Little released.
  // Mareep wins Little via nextBest (evolvedNameL='Flaaffy').
  it('4b: Flaaffy CP:500 (C2: evolvedNameL=Flaaffy ≠ evolvedNameG=Ampharos) now wins Great', () => {
    const fl = find('Flaaffy', 500);
    expect(fl.slots).toContain('G');
    expect(fl.slots).not.toContain('L');
  });
  it('4b: Mareep CP:120 wins Great (regular non-lucky Ampharos group is independent from Flaaffy lucky group)', () => {
    const mr = find('Mareep', 120);
    expect(mr.slots).toContain('G');
    expect(mr.slots).not.toContain('L');
  });

  // 4c — final-evo same-form: Mawile (rankG=95% < rankL=99%, no evo path) stays excluded from Great
  it('4c: Mawile CP:500 (rankG=95% < rankL=99%, final-evo, fav, dustL=0) excluded from Great', () => {
    const p = find('Mawile', 500);
    expect(p.slots).not.toContain('G');
  });
});

// ─── Group 33 — Evolved preference still fires on genuine actual-rank tie ───────
// Rows 1 (Glaceon CP:1500) and 2 (Eevee CP:477) have identical GL rank (99.71%).
// Fix 1 must NOT suppress evolved-preference when actual ranks are truly equal.

describe('Group 33 — Evolved preference wins on genuine actual-rank tie (Fix 1 regression guard)', () => {
  it('Glaceon CP:1500 (99.71% GL) wins GL — evolved form takes priority at equal actual rank', () => {
    const p = find('Glaceon', 1500);
    expect(p).toBeDefined();
    expect(p.slots).toContain('G');
  });

  it('Eevee CP:477 (99.71% GL identical to Glaceon) does NOT win GL — evolved form takes priority at equal actual rank', () => {
    const p = find('Eevee', 477);
    expect(p).toBeDefined();
    expect(p.slots).not.toContain('G');
  });
});

// ─── Group 35 — Variant-key conflict guard: shadow slot gets independent nextBest ─
// Rows 84 (Regular Gengar CP:1300, 93% GL), 85 (Shadow Gengar CP:1327, 88% GL + 92% UL),
// 86 (Shadow Gengar CP:1100, 82% GL).
// Shadow Gengar #85 wins shadow GL + shadow UL. sameEvoConflicts releases shadow GL
// (88% < 90%). Without Fix 4, slotWinners['G|Gengar'] counts regular + shadow together,
// so the count stays > 0 and no nextBest is found. With Fix 4, shadow key is independent
// and Shadow Gengar CP:1100 is correctly assigned the shadow GL slot via nextBest.

describe('Group 35 — Variant-key conflict guard: shadow slot gets independent nextBest (Fix 4 regression guard)', () => {
  it('Regular Gengar CP:1300 (93% GL) → slots contains G', () => {
    const p = find('Gengar', 1300);
    expect(p).toBeDefined();
    expect(p.slots).toContain('G');
  });

  it('Shadow Gengar CP:1100 (82% GL) → slots contains G — shadow slot nextBest found after shadow Gengar #1 releases GL', () => {
    const p = find('Gengar', 1100);
    expect(p).toBeDefined();
    expect(p.slots).toContain('G');
  });
});

// ─── Group 37 — Fix A1: slotConfirmed recompute requires rank ≥ keepThreshold ──
// Bug: lines 1230+1338 set slotConfirmed=true from slot membership alone.
// A Pokémon winning two tentative slots (<90%) triggers sameEvoConflict; after conflict
// resolution removes the weaker slot, the remaining tentative 'G' flips slotConfirmed=true.
// Fix: recompute must also check rankPct >= keepThreshold for each remaining slot.
// Mismagius CP:1490 wins G (82%) + U (79%) tentatively → sameEvoConflict releases U →
// remaining G (82%) → slotConfirmed must stay false → decision=review, no circled letter.

describe('Group 37 — Fix A1: tentative-slot slotConfirmed recompute (rank guard)', () => {
  it('Mismagius CP:1490 (82% G + 79% U, both tentative) → decision=review after sameEvoConflict', () => {
    const p = find('Mismagius', 1490);
    expect(p).toBeDefined();
    expect(p.decision).toBe('review');
  });
  it('Mismagius CP:1490 → slotConfirmed is falsy (not promoted by rank-blind recompute)', () => {
    const p = find('Mismagius', 1490);
    expect(p.slotConfirmed).toBeFalsy();
  });
  it('Mismagius CP:1490 → nickname has no circled league letter (holding nick only)', () => {
    const p = find('Mismagius', 1490);
    expect(p.nickname).not.toMatch(/Ⓖ|Ⓤ|Ⓛ|Ⓜ/);
  });
});

// ─── Group 38 — B1: dust exclusion is rank-gated (pre-evo + high dust) ──────────
// dustExcludeThreshold=300k: a pre-evo with dustG>300k is excluded from GL ONLY when
// rankPctG < keepThreshold (90%). High-rank pre-evos (≥90%) must never be excluded by dust.
// Snubbull (#209, pre-evo of Granbull) both cases with dustG=350k.

describe('Group 38 — B1: dust exclusion is rank-gated for pre-evos', () => {
  it('B1a: Snubbull CP:430 (95% GL, dustG=350k) is kept despite high dust — rank ≥ 90% overrides dust exclusion', () => {
    const p = find('Snubbull', 430);
    expect(p).toBeDefined();
    expect(p.slots).toContain('G');
    expect(p.decision).toBe('keep');
  });
  it('B1b: Snubbull CP:400 (85% GL, dustG=350k) is excluded — rank < 90% + high dust triggers exclusion', () => {
    const p = find('Snubbull', 400);
    expect(p).toBeDefined();
    expect(p.slots).not.toContain('G');
  });
});

// ─── Group 39 — B2: lucky half-effective-dust wins tiebreak ─────────────────────
// Lucky Pokémon pay half effective dust in the slot sort tiebreak.
// Both Minun are lucky — they compete in the same |lucky variant group for the lucky GL slot.
// Lucky A (CP:1380, dustG=120k → effective 60k) vs Lucky B (CP:1360, dustG=200k → effective 100k).
// Same rounded GL rank (95%). Lucky A wins because effective 60k < 100k.

describe('Group 39 — B2: lucky half-dust tiebreak (lower effective dust wins same-rank slot)', () => {
  it('B2: Lucky Minun CP:1380 (dustG=120k → effective 60k, rank=95.10%) wins lucky-GL over Lucky CP:1360 (dustG=200k → effective 100k)', () => {
    const a = find('Minun', 1380);
    const b = find('Minun', 1360);
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a.slots).toContain('G');
    expect(b.slots).not.toContain('G');
  });
});

// ─── Group 40 — B3: gender-dimorphic species win GL independently ────────────────
// Frillish (#592) male and female are in separate family groups (GENDER_SPLIT_SPECIES).
// Both ≥90% GL → both win GL independently; neither displaces the other.

describe('Group 40 — B3: gender-dimorphic Frillish male + female win GL independently', () => {
  it('B3: Male Frillish CP:1050 (92% GL) wins GL independently', () => {
    const p = find('Frillish', 1050);
    expect(p).toBeDefined();
    expect(p.slots).toContain('G');
    expect(p.decision).toBe('keep');
  });
  it('B3: Female Frillish CP:1030 (91% GL) wins GL independently', () => {
    const p = find('Frillish', 1030);
    expect(p).toBeDefined();
    expect(p.slots).toContain('G');
    expect(p.decision).toBe('keep');
  });
  it('B3: Male and female Frillish both held GL simultaneously — gender split is independent', () => {
    const male = find('Frillish', 1050);
    const female = find('Frillish', 1030);
    expect(male.slots).toContain('G');
    expect(female.slots).toContain('G');
  });
});

// ─── Group 41 — B4: shiny+league slot nick order — COVERAGE GAP ──────────────────
// The test harness calls analyse(csv) with no overridesCache, so isShiny cannot be
// injected via override. Shiny nick ordering (Ⓖ → IV% → Ⓗ → ※) is untested here.
// TODO: extend harness to accept an overrides map and add shiny nick assertion.

// ─── Group 42 — B5: shadow purify-'p' suffix toggling ───────────────────────────
// Shadow with confirmed own-league slot (≥90%) → no 'p' suffix.
// Shadow Gengar CP:1327 (92% UL shadow slot, confirmed) should NOT have 'p' in nickname.
// Shadow Gengar CP:1100 (82% GL, tentative only) SHOULD have 'p' if purifyLeague is set.

describe('Group 42 — B5: shadow purify-p suffix toggling', () => {
  it('B5: Shadow Gengar CP:1327 (92% UL confirmed slot) → nickname does NOT contain purify p suffix', () => {
    const p = find('Gengar', 1327);
    expect(p).toBeDefined();
    // Shadow with confirmed own-league UL slot — purify 'p' suffix must be suppressed
    expect(p.isShadow).toBe(true);
    expect(p.slots.some(s => s === 'U')).toBe(true);
    expect(p.nickname).not.toMatch(/p(?:✪)?$/);
  });
});

// ─── Group 43 — B6: affordable candidate wins GL outright (Option C) ────────────
// Option C: affordable CP:1430 (dustG=100k ≤ 150k, 96% GL) wins GL in Pass 1.
// Expensive CP:1450 (dustG=200k > 150k) does not win GL — filtered out of Pass 1 and
// no other league slot is available for it. Behaviour changed by Feature 2 Option C (brief 2026-05-29).

describe('Group 43 — B6: affordable GL winner wins slot outright (Option C)', () => {
  it('B6: Tentacruel CP:1430 (dustG=100k, 96% GL) wins GL directly (isAffordableWinner=true, G slot)', () => {
    const p = find('Tentacruel', 1430);
    expect(p).toBeDefined();
    expect(p.isAffordableWinner).toBe(true);
    expect(p.slots).toContain('G');
    expect(p.decision).toBe('keep');
  });
  it('B6: Tentacruel CP:1450 (dustG=200k, expensive) does NOT win GL (Option C Pass 1 skips it)', () => {
    const p = find('Tentacruel', 1450);
    expect(p).toBeDefined();
    expect(p.slots).not.toContain('G');
    expect(p.isExpensiveWinner).toBeFalsy();
  });
});

// ─── Group 44 — C2: evo-target-scoped committed-to-Little guard ──────────────────
// Bidoof CP:496: fav=1, dustL=0, rankPctL=95%, evolvedNameL='Bidoof'.
// evolvedNameG='Bibarel', evolvedNameU='Bibarel' — DIFFERENT from evolvedNameL.
// C2 fix: 'Bidoof' ≠ 'Bibarel' → NOT excluded from G and U.
// Under one-slot (M→U→G→L): CP:496 wins U first (91% UL rank), excluded from G.
// No other Bidoof in fixture → GL slot goes unfilled.
// Mawile 4c guard still holds: evolvedNameL='Mawile' = evolvedNameG='Mawile' → same form → excluded.

describe('Group 44 — C2: evo-target-scoped committed-to-Little guard', () => {
  it('C2: Bidoof CP:496 (fav, dustL=0, evolvedNameL=Bidoof ≠ Bibarel) wins Ultra slot (not excluded by C2)', () => {
    const p = find('Bidoof', 496);
    expect(p).toBeDefined();
    expect(p.slots).toContain('U'); // C2: not excluded (Bidoof≠Bibarel); one-slot: U wins first
  });
  it('C2: Bidoof CP:496 holds U only — one-slot: excluded from G after winning U', () => {
    const p = find('Bidoof', 496);
    expect(p.decision).toBe('keep');
    expect(p.slots).toContain('U');
    expect(p.slots).not.toContain('G'); // one-slot: excluded from GL after winning UL
  });
  it('4c still holds: Mawile CP:500 (evolvedNameL=Mawile = evolvedNameG=Mawile, same form) excluded from Great', () => {
    const p = find('Mawile', 500);
    expect(p.slots).not.toContain('G');
  });
});

// ─── Group 45 — C3: remove 70% floor — best-in-family always surfaces as review ─
// Rattata CP:100: rankPctG=65% (below old 70% floor), only Rattata in fixture.
// Before C3: no slot assigned → decision='trade'. After C3: gets tentative G slot → decision='review'.

describe('Group 45 — C3: remove 70% floor — best-in-family always surfaces as review', () => {
  it('C3: Rattata CP:100 (65% GL, below old 70% floor) gets tentative GL slot', () => {
    const p = find('Rattata', 100);
    expect(p).toBeDefined();
    expect(p.slots).toContain('G');
  });
  it('C3: Rattata CP:100 → decision=review (not trade), slotConfirmed=false', () => {
    const p = find('Rattata', 100);
    expect(p.decision).toBe('review');
    expect(p.slotConfirmed).toBeFalsy();
  });
});

// ─── Group 46 — One-slot + C4: Marowak GL only; Cubone wins LL directly ────────
// Under one-slot (M→U→G→L): Marowak CP:494 wins GL (95%), excluded from LL.
// Cubone CP:12 wins LL directly (96% as Marowak, evolvedNameL='Marowak') — no competition.
// Cubone wins a confirmed slot → NOT a best_overall case. Nick uses Ⓛ format.

describe('Group 46 — One-slot: Marowak wins GL only; Cubone CP:12 wins LL as cascade', () => {
  it('Marowak CP:494 wins GL only — one-slot: excluded from LL after winning GL', () => {
    const p = find('Marowak', 494);
    expect(p).toBeDefined();
    expect(p.slots).toContain('G');
    expect(p.slots).not.toContain('L'); // one-slot: excluded from LL after winning GL
    expect(p.slots).not.toContain('best_overall');
    expect(p.decision).toBe('keep');
  });
  it('Cubone CP:12 wins LL directly (Marowak freed LL under one-slot) — keep', () => {
    const p = find('Cubone', 12);
    expect(p).toBeDefined();
    expect(p.slots).toContain('L'); // wins LL directly: Marowak freed it under one-slot
    expect(p.decision).toBe('keep');
  });
  it('Cubone CP:12 → nickname contains ⓛ (Little League format)', () => {
    const p = find('Cubone', 12);
    expect(p.nickname).toMatch(/ⓛ/); // LL winner → lowercase ⓛ in nick
  });
  it('Cubone CP:12 does NOT need best_overall (wins LL directly)', () => {
    const p = find('Cubone', 12);
    expect(p.slots).not.toContain('best_overall'); // has a real LL slot
  });
  it('non-legendary with no rank data (Magikarp CP:10) does NOT get best_overall — gets ML placeholder instead', () => {
    const p = find('Magikarp', 10);
    expect(p).toBeDefined();
    expect(p.slots).not.toContain('best_overall');
    // ML placeholder fires: family has no ML keeper, Magikarp has no league slot
    expect(p.isMlPlaceholder).toBe(true);
    expect(p.slots).toContain('M');
    expect(p.decision).toBe('review');
  });
});

// ─── Group 47 — One-slot invariant: no Pokémon holds more than one league slot ──
// Core rule: each physical Pokémon wins exactly ONE league slot (M/U/G/L).
// shadow/lucky/affordable/tentative/best_overall slots don't count — only the four league letters.

describe('Group 47 — One-slot invariant: no Pokémon holds >1 league slot', () => {
  const leagueSlots = s => s.filter(x => ['L','G','U','M'].includes(x));

  it('no Pokémon in the fixture holds more than one league slot', () => {
    result.pokemon.forEach(p => {
      const ls = leagueSlots(p.slots);
      expect(ls.length).toBeLessThanOrEqual(1);
    });
  });

  it('Marowak CP:494 holds exactly one league slot (GL)', () => {
    const p = find('Marowak', 494);
    expect(leagueSlots(p.slots)).toHaveLength(1);
    expect(p.slots).toContain('G');
  });

  it('Feraligatr CP:2498 (hundo) holds exactly one league slot (ML)', () => {
    const p = find('Feraligatr', 2498);
    expect(leagueSlots(p.slots)).toHaveLength(1);
    expect(p.slots).toContain('M');
  });

  it('Vaporeon CP:1497 does NOT hold both G and U', () => {
    const p = find('Vaporeon', 1497);
    expect(leagueSlots(p.slots)).toHaveLength(1);
  });

  it('Sawk CP:190 does NOT hold both G and L', () => {
    const p = find('Sawk', 190);
    expect(leagueSlots(p.slots)).toHaveLength(1);
  });

  it('Feraligatr CP:2400 wins UL after CP:2498 is excluded (one cascade slot)', () => {
    const p = find('Feraligatr', 2400);
    expect(p.slots).toContain('U');
    expect(leagueSlots(p.slots)).toHaveLength(1);
  });
});

// ─── Group 48 — One-slot motivating example: Marowak/Cubone ─────────────────
// Marowak CP:494 wins GL (99.9% as Marowak) → excluded from LL under one-slot.
// Cubone CP:12 wins LL as Marowak (96%) — separate physical Pokémon.

describe('Group 48 — One-slot motivating example: Marowak wins GL; Cubone wins LL', () => {
  it('Marowak CP:494 wins GL', () => {
    expect(find('Marowak', 494).slots).toContain('G');
    expect(find('Marowak', 494).decision).toBe('keep');
  });

  it('Marowak CP:494 does NOT also hold LL after winning GL', () => {
    const slots = find('Marowak', 494).slots.filter(s => ['G','U','L','M'].includes(s));
    expect(slots).toHaveLength(1);
  });

  it('Cubone CP:12 wins LL (96% as Marowak) after Marowak CP:494 is excluded from LL', () => {
    expect(find('Cubone', 12).slots).toContain('L');
    expect(find('Cubone', 12).decision).toBe('keep');
  });

  it('Cubone CP:12 nickname contains ⓛ (Little League format)', () => {
    expect(find('Cubone', 12).nickname).toContain('ⓛ');
  });

  it('Feraligatr CP:2498 does NOT also hold UL after winning ML', () => {
    const slots = find('Feraligatr', 2498).slots.filter(s => ['G','U','L','M'].includes(s));
    expect(slots).toHaveLength(1);
    expect(find('Feraligatr', 2498).slots).toContain('M');
  });

  it('Feraligatr CP:2400 wins UL (freed by CP:2498 exclusion)', () => {
    expect(find('Feraligatr', 2400).slots).toContain('U');
    expect(find('Feraligatr', 2400).decision).toBe('keep');
  });

  it('Sawk CP:500 wins LL after CP:190 holds GL only (cascade)', () => {
    expect(find('Sawk', 500).slots).toContain('L');
    expect(find('Sawk', 500).decision).toBe('keep');
  });
});

// ─── Group 49 — ML placeholder: grey star for families with no ML keeper ──────
// Rule: if a family has no member with slots.includes('M') after all passes,
// the highest-ivAvg member with no league slot gets isMlPlaceholder=true,
// slots=['M'], decision='review', starType='grey', nick = Name+ivAvg+'m'.
//
// Test 1 — fires: Magikarp CP:10 (35.6% ivAvg, no league ranks, no ML floor)
//   → ML placeholder assigned, starType='grey', nick 'Magikarp36m'
// Test 2 — does not fire: Feraligatr family has confirmed ML (CP:2498 hundo → M slot)
//   → placeholder does NOT fire; CP:2498 isMlPlaceholder must be false
// Test 3 — does not fire: Marowak/Cubone family — Marowak has G, Cubone has L,
//   no unslotted member remains → placeholder cannot find a candidate

describe('Group 49 — ML placeholder: grey star for families with no ML keeper', () => {
  it('49a: Magikarp CP:10 (no league ranks, ivAvg=35.6%) gets ML placeholder slot', () => {
    const p = find('Magikarp', 10);
    expect(p).toBeDefined();
    expect(p.slots).toContain('M');
    expect(p.isMlPlaceholder).toBe(true);
  });

  it('49b: Magikarp CP:10 placeholder → decision=review, starType=grey', () => {
    const p = find('Magikarp', 10);
    expect(p.decision).toBe('review');
    expect(p.starType).toBe('grey');
  });

  it('49c: Magikarp CP:10 placeholder → nickname contains ivAvg rounded + m suffix (Magikarp36m)', () => {
    const p = find('Magikarp', 10);
    expect(p.nickname).toMatch(/36m/);
  });

  it('49d: Feraligatr family already has confirmed ML (CP:2498 hundo) → placeholder does NOT fire', () => {
    const p = find('Feraligatr', 2498);
    expect(p.slots).toContain('M');
    expect(p.isMlPlaceholder).toBeFalsy(); // confirmed ML, not a placeholder
  });

  it('49e: Marowak/Cubone family — all members have slots → no ML placeholder assigned', () => {
    // Marowak CP:494 wins G; Cubone CP:12 wins L — no unslotted member remains
    const marowak = find('Marowak', 494);
    const cubone = find('Cubone', 12);
    expect(marowak.isMlPlaceholder).toBeFalsy();
    expect(cubone.isMlPlaceholder).toBeFalsy();
  });
});
