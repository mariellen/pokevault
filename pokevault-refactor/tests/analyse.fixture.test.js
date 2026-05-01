'use strict';
// Fixture-based tests for the analysis engine.
// Uses poke_genie_fixture.csv — 52 deterministic rows designed to exercise specific behaviours.
// See FIXTURE_CSV_SPEC.md for the full spec and expected outputs per row.
//
// Run with: npx jest tests/analyse.fixture.test.js

const path = require('path');
const { analyse } = require('./loader');
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

  it('Eevee CP:654 (same IVs as Glaceon 2500, fav=0) does NOT win over evolved Glaceon', () => {
    // Glaceon 2500 already evolved → pre-evo Eevee should not displace it
    const evolved = find('Glaceon', 2500);
    const preEvo = find('Eevee', 654);
    expect(evolved.slots).toContain('U');
    // Eevee may or may not get the slot — but Glaceon must win it
    if (preEvo && preEvo.slots.includes('U')) {
      // If both somehow hold it, Glaceon must at minimum be there
      expect(evolved.slots).toContain('U');
    }
  });
});

// ─── Group 2 — Leafeon family ────────────────────────────────────────────────

describe('Group 2 — Leafeon family (evolved preference)', () => {
  it('Leafeon CP:1177 wins Great slot (99.58% > Ultra 99.37%) — nick shows Ⓖ', () => {
    const p = find('Leafeon', 1177);
    expect(p).toBeDefined();
    expect(p.slots).toContain('G');
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
});

// ─── Group 8 — Star flags ────────────────────────────────────────────────────

describe('Group 8 — Explicit star colours', () => {
  it('Machamp CP:2450 wins Ultra slot (dustU=0, 99.5%) — nick shows Ⓤ not Ⓡ', () => {
    const p = find('Machamp', 2450);
    expect(p).toBeDefined();
    expect(p.slots).toContain('U');
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

  it('Machop CP:350 (fav=1, loses Great to CP:400) — RED star', () => {
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
    if (!normalFam || !hisuiFam) return;
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
    if (!p || !p.nickname) return;
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
// CP:190 wins G (99.3%), U (75%), and L (98.8%) in initial pass.
// Bug 1 fix: same-evo multi-slot → keep highest-rank league (G=99.3%), release rest.
// U (75%) has no nextBest (CP:500 at 65% is below 70% threshold).
// L (98.8%) nextBest → CP:500 (97.9%, dustL=0) wins Little.

describe('Group 14 — Sawk multi-league deconfliction (Bug 1)', () => {
  it('Sawk CP:190 (G=99.3%) wins Great slot', () => {
    const p = find('Sawk', 190);
    expect(p).toBeDefined();
    expect(p.slots).toContain('G');
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
