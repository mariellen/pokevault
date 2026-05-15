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
    // Not a keeper — no confirmed league slot won
    expect(['trade', 'review']).toContain(preEvo.decision);
    // Glaceon must still hold Ultra
    const evolved = find('Glaceon', 2500);
    expect(evolved.slots).toContain('U');
  });
});

// ─── Group 2 — Leafeon family ────────────────────────────────────────────────

describe('Group 2 — Leafeon family (evolved preference)', () => {
  it('Leafeon CP:1177 wins Great slot (99.58% > Ultra 99.37%) — nick shows Ⓖ', () => {
    const p = find('Leafeon', 1177);
    expect(p).toBeDefined();
    expect(p.slots).toContain('G');
    expect(p.slots).not.toContain('U'); // Bug 1 fix: Great rank wins, Ultra released
    expect(p.nickname).toContain('Ⓖ');
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
// CP:1497 holds both G (99.90%) and U (99.61%). Bug 1 fix: same-evo multi-slot
// holders keep only the league with the highest rank. CP:1497 keeps G, releases U.
// CP:2493 (98.68% Ultra, dustU=0) wins Ultra via nextBest.

describe('Group 3 — Vaporeon (same-evo slot routing)', () => {
  it('Vaporeon CP:1497 (G=99.90%, U=99.61%) keeps Great — releases Ultra (lower rank)', () => {
    const p = find('Vaporeon', 1497);
    expect(p.slots).toContain('G');
    expect(p.slots).not.toContain('U');
  });

  it('Vaporeon CP:2493 (fav=1, dustU=0) wins Ultra after CP:1497 releases it — GOLD', () => {
    const p = find('Vaporeon', 2493);
    expect(p.slots).toContain('U');
    expect(p.isFavorite).toBe(true);
    expect(p.suggestStar).toBe(true); // suggestStar+isFavorite = gold star
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
  it('Flaaffy CP:500 (Lucky, fav=1, dustL=0) wins Little slot — GOLD', () => {
    const p = find('Flaaffy', 500);
    expect(p).toBeDefined();
    expect(p.isLucky).toBe(true);
    expect(p.isFavorite).toBe(true);
    expect(p.slots).toContain('L');
    expect(p.suggestStar).toBe(true);
  });

  it('Mareep CP:120 does NOT win Little (Flaaffy CP:500 wins it) — correct evo-stage grouping', () => {
    const mareep = find('Mareep', 120);
    expect(mareep).toBeDefined();
    expect(mareep.slots).not.toContain('L');
    expect(mareep.slots).toContain('G');
  });
});

// ─── Group 6 — Totodile family ───────────────────────────────────────────────

describe('Group 6 — Totodile/Croconaw/Feraligatr', () => {
  it('Feraligatr CP:2498 (hundo, fav=1, dustU=0) wins Ultra AND Master — GOLD', () => {
    const p = find('Feraligatr', 2498);
    expect(p).toBeDefined();
    expect(p.slots).toContain('U');
    expect(p.slots).toContain('M');
    expect(p.isFavorite).toBe(true);
    expect(p.suggestStar).toBe(true);
  });

  it('Feraligatr CP:2400 (fav=1, dustU=0) LOSES Ultra to CP:2498 hundo — RED', () => {
    const p = find('Feraligatr', 2400);
    expect(p.isFavorite).toBe(true);
    expect(p.slots).not.toContain('U');
    expect(p.suggestStar).toBe(false);
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

describe('Group 8 — Explicit star colours', () => {
  it('Machamp CP:2450 wins Ultra slot (dustU=0, 99.5%) — nick shows Ⓤ not Ⓡ', () => {
    const p = find('Machamp', 2450);
    expect(p).toBeDefined();
    expect(p.slots).toContain('U');
    expect(p.slots).not.toContain('G'); // Bug 1 fix: Ultra rank wins, Great released
    expect(p.nickname).toContain('Ⓤ');
    expect(p.nickname).not.toContain('Ⓡ');
  });

  it('Machop CP:400 wins Great slot (does not get Ultra)', () => {
    const p = find('Machop', 400);
    expect(p).toBeDefined();
    expect(p.slots).toContain('G');
    expect(p.slots).not.toContain('U');
  });

  it('Machop CP:350 (fav=1, loses Great to CP:400) — RED star', () => {
    // CP:350 is fav=1 but lower rank than CP:400 — should not win any slot
    const p = find('Machop', 350);
    expect(p.isFavorite).toBe(true);
    expect(p.suggestStar).toBe(false);
  });

  it('Eevee CP:478 shows BLUE star (suggestStarExpensive) — dustU=513600 exceeds affordable threshold', () => {
    const p = find('Eevee', 478);
    expect(p).toBeDefined();
    expect(p.slots).toContain('U');
    expect(p.suggestStarExpensive).toBe(true);
    expect(p.suggestStar).toBe(false);
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

  it('Feraligatr CP:2498 (hundo, wins Ultra + Master) nick contains Ⓤ not Ⓡ', () => {
    const p = find('Feraligatr', 2498);
    expect(p).toBeDefined();
    expect(p.nickname).toBeDefined();
    expect(p.nickname).toContain('Ⓤ');
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

  it('Magikarp CP:10 is trade decision (far below threshold)', () => {
    const p = find('Magikarp', 10);
    // Magikarp has no league data in fixture — should be trade
    expect(p.decision).toBe('trade');
  });
});

// ─── Group 11 — Shadow/Lucky coexistence (EXPECTED TO FAIL) ─────────────────
// These tests document the desired behaviour BEFORE the feature is built.
// They will fail until shadow/lucky slot coexistence is implemented in analyse.js.

describe('Group 11 — Shadow/Lucky coexistence', () => {
  it('Shadow Seedot CP:115 holds Great slot independently of normal winner CP:454', () => {
    const shadow = find('Seedot', 115);
    const normal = find('Seedot', 454);
    expect(shadow).toBeDefined();
    expect(normal).toBeDefined();
    expect(shadow.slots).toContain('G');
    expect(normal.slots).toContain('G');
    expect(shadow.isShadow).toBe(true);
    expect(shadow.isFavorite).toBe(true);
    expect(shadow.suggestStar).toBe(true);
  });

  it('Shadow Bulbasaur CP:497 holds Ultra slot; normal Bulbasaur CP:463 holds Great slot', () => {
    const shadow = find('Bulbasaur', 497);
    const normal = find('Bulbasaur', 463);
    expect(shadow.slots).toContain('U');
    expect(normal.slots).toContain('G');
  });

  it('Scyther shadow CP:950 and normal CP:35 both hold Great slot independently', () => {
    const shadow = find('Scyther', 950);
    const normal = find('Scyther', 35);
    expect(shadow.slots).toContain('G');
    expect(normal.slots).toContain('G');
  });

  it('Lucky Qwilfish CP:443 holds Ultra slot alongside normal CP:440', () => {
    const lucky = find('Qwilfish', 443);
    const normal = find('Qwilfish', 440);
    expect(lucky.slots).toContain('U');
    expect(normal.slots).toContain('U');
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

// ─── Group 14 — Sawk multi-league deconfliction (Bug 1) ──────────────────────
// CP:190 (IVs 1/8/13, fav=1) wins G (99.3%), U (75%), and L (98.8%) in initial pass.
// Bug 1 fix: same-evo multi-slot → keep highest-rank league (G=99.3%), release rest.
// U (75%) has no nextBest (CP:500 at 65% is below 70% threshold).
// L (98.8%) nextBest → CP:500 (IVs 5/7/8, 97.9%, dustL=0) wins Little.

describe('Group 14 — Sawk multi-league deconfliction (Bug 1)', () => {
  it('Sawk CP:190 (G=99.3%, fav=1) wins Great slot only — GOLD star', () => {
    const p = find('Sawk', 190);
    expect(p).toBeDefined();
    expect(p.slots).toContain('G');
    expect(p.slots).not.toContain('U'); // Bug 1 fix: U released (lower rank than G)
    expect(p.isFavorite).toBe(true);
    expect(p.suggestStar).toBe(true); // fav=1 + wins slot = gold
  });

  it('Sawk CP:190 does NOT hold Little slot — released to CP:500', () => {
    const p = find('Sawk', 190);
    expect(p.slots).not.toContain('L');
  });

  it('Sawk CP:500 (L=97.9%, dustL=0) wins Little slot', () => {
    const p = find('Sawk', 500);
    expect(p).toBeDefined();
    expect(p.slots).toContain('L');
  });

  it('Sawk CP:500 shows green star (fav=0, wins Little, dustL=0)', () => {
    const p = find('Sawk', 500);
    expect(p.isFavorite).toBe(false);
    expect(p.suggestStar).toBe(true);
    expect(p.suggestStarExpensive).toBeFalsy();
  });
});

// ─── Group 15 — Special override = force keep (Shiny / Dynamax / Gigantamax) ─
// Parameterised across all three flags — each produces 4 tests (12 total).
// Snorlax CP:100 (stableKey='143|||5|5|5|2026-02-01') has no league rank data.
// Machamp CP:2450 (stableKey='68|||15|15|14|2025-01-01') holds Ultra slot normally.

describe.each([
  ['is_shiny',      '※', 'isShiny'],
  ['is_dynamax',    'Ⓓ', 'isDynamax'],
  ['is_gigantamax', 'Ⓧ', 'isGigantamax'],
])('Group 15 — %s override = force keep', (flagKey, suffix, propName) => {
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

  it(`Snorlax CP:100 (${flagKey}, no league rank) → nick contains Ⓡ and ${suffix}`, () => {
    const p = ovFind('Snorlax', 100);
    expect(p.nickname).toContain('Ⓡ');
    expect(p.nickname).toContain(suffix);
    expect(p.nickname.length).toBeLessThanOrEqual(12);
  });

  it(`Machamp CP:2450 (${flagKey} + Ultra slot) → nick contains Ⓤ and ${suffix}`, () => {
    const p = ovFind('Machamp', 2450);
    expect(p).toBeDefined();
    expect(p[propName]).toBe(true);
    expect(p.decision).toBe('keep');
    expect(p.nickname).toContain('Ⓤ');
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
    const p = makeP({ slots: ['M'] });
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

  // 9. Feraligatr (fixture hundo) + Ultra slot → nick has Ⓗ
  it('Feraligatr CP:2498 (hundo fixture) → nick contains Ⓤ and Ⓗ', () => {
    const p = find('Feraligatr', 2498);
    expect(p).toBeDefined();
    expect(p.atkIV).toBe(15);
    expect(p.defIV).toBe(15);
    expect(p.staIV).toBe(15);
    expect(p.nickname).toContain('Ⓤ');
    expect(p.nickname).toContain('Ⓗ');
    expect(p.nickname.length).toBeLessThanOrEqual(12);
  });
});

// ─── Group 27 — Brief B: Dmax/Gmax/Legendary normalisation ──────────────────
// Rows 62–69 added to fixture for these tests.
// Dmax/Gmax: best-IV per species → keep slot; all dupes → trade + visibility star.
// Legendary (non-Dmax/Gmax, no league slot): best-IV → 'best_overall' → keep; dupes → trade + visibility.

// 27a: Two Dmax Entei — best keeps, dupe trades with visibility star
describe('Group 27a — Dmax Entei: best-IV keeps, dupe gets visibility star', () => {
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

  it('Entei CP:2900 (best Dmax, 88.9%) → decision=keep, slots includes dynamax', () => {
    const p = g27aFind('Entei', 2900);
    expect(p).toBeDefined();
    expect(p.isDynamax).toBe(true);
    expect(p.decision).toBe('keep');
    expect(p.slots).toContain('dynamax');
  });

  it('Entei CP:2900 (best Dmax) → nickname is EnteiⓇ89Ⓓ', () => {
    const p = g27aFind('Entei', 2900);
    expect(p.nickname).toBe('EnteiⓇ89Ⓓ');
  });

  it('Entei CP:2800 (dupe Dmax, 75.6%) → decision=trade', () => {
    const p = g27aFind('Entei', 2800);
    expect(p).toBeDefined();
    expect(p.isDynamax).toBe(true);
    expect(p.decision).toBe('trade');
  });

  it('Entei CP:2800 (dupe Dmax) → starType is visibility', () => {
    const p = g27aFind('Entei', 2800);
    expect(p.starType).toBe('visibility');
  });

  it('Entei CP:2800 (visibility star dupe) → decision is trade, not keep', () => {
    const p = g27aFind('Entei', 2800);
    expect(p.decision).not.toBe('keep');
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

  it('Snorlax CP:2448 (best Gmax) → nickname contains Ⓧ and is SnorlaxⓂ98Ⓧ', () => {
    // CP:2448 wins ML slot (best non-lucky Snorlax, ivAvg=97.8) → nick via ML handler + Ⓧ suffix
    const p = g27bFind('Snorlax', 2448);
    expect(p.nickname).toContain('Ⓧ');
    expect(p.nickname).toBe('SnorlaxⓂ98Ⓧ');
    expect(p.nickname.length).toBeLessThanOrEqual(12);
  });

  it('Snorlax CP:200 (dupe Gmax, 71.1%) → decision=trade', () => {
    const p = g27bFind('Snorlax', 200);
    expect(p).toBeDefined();
    expect(p.isGigantamax).toBe(true);
    expect(p.decision).toBe('trade');
  });

  it('Snorlax CP:200 (dupe Gmax) → starType is visibility', () => {
    const p = g27bFind('Snorlax', 200);
    expect(p.starType).toBe('visibility');
  });
});

// 27c: Raikou Legendary (no overrides) — best keeps with best_overall, dupe trades with visibility
describe('Group 27c — Raikou Legendary: best keeps (best_overall), dupe gets visibility star', () => {
  // Uses global result — Raikou rows auto-classified as Legendary (no Dmax/Gmax)

  it('Raikou CP:2900 (best, 93.3%) → decision=keep, slots includes best_overall', () => {
    const p = find('Raikou', 2900);
    expect(p).toBeDefined();
    expect(p.decision).toBe('keep');
    expect(p.slots).toContain('best_overall');
  });

  it('Raikou CP:2900 (best Legendary) → nickname is RaikouⓇ93', () => {
    const p = find('Raikou', 2900);
    expect(p.nickname).toBe('RaikouⓇ93');
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

// 27d: Dmax+shiny Entei CP:2901 — only Dmax in run, keeps with nick containing Ⓡ, Ⓓ, ※
describe('Group 27d — Dmax+shiny Entei: keeps with Ⓡ, Ⓓ, ※ in nick', () => {
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

  it('Entei CP:2901 (Dmax+shiny) → nickname contains Ⓡ, Ⓓ, and ※', () => {
    const p = g27dFind('Entei', 2901);
    expect(p.nickname).toContain('Ⓡ');
    expect(p.nickname).toContain('Ⓓ');
    expect(p.nickname).toContain('※');
    expect(p.nickname.length).toBeLessThanOrEqual(12);
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

  it('Entei CP:3200 (Dmax hundo, 15/15/15) → decision=keep, slots includes dynamax', () => {
    const p = g27eFind('Entei', 3200);
    expect(p).toBeDefined();
    expect(p.isDynamax).toBe(true);
    expect(p.atkIV).toBe(15);
    expect(p.defIV).toBe(15);
    expect(p.staIV).toBe(15);
    expect(p.decision).toBe('keep');
    expect(p.slots).toContain('dynamax');
  });

  it('Entei CP:3200 (Dmax hundo) → nickname is EnteiⓂ100ⒹⒽ', () => {
    // rankPctM=ivAvg=100 >= 90 → dynamax handler picks Ⓜ as best league proxy
    const p = g27eFind('Entei', 3200);
    expect(p.nickname).toBe('EnteiⓂ100ⒹⒽ');
  });
});
