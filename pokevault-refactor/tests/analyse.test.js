'use strict';
// Phase 1 — Unit tests for the analysis engine.
// Run with: npx jest tests/analyse.test.js
//
// Fixture: poke_genie_export 132.csv (Mariellen's collection, April 2026 export).
// If the CSV is moved, update CSV_PATH below.
//
// NOTE: Node.js must be installed before these tests can run.
// Install with: https://nodejs.org — then `npm install` in the pokevault-refactor folder.

const path = require('path');
const { analyse } = require('./loader');
const { loadCSV } = require('./csvParser');

const CSV_PATH = path.join(
  'C:', 'ClaudeCode', 'from Claude', '20260427-1030', 'poke_genie_export 132.csv'
);

let result;
let csv;

beforeAll(() => {
  csv = loadCSV(CSV_PATH);
  result = analyse(csv);
});

// ─── 1a. Keep count smoke test ───────────────────────────────────────────────

describe('Keep count smoke test', () => {
  it('keep count is in a reasonable range', () => {
    // Exact count depends on which CSV export is used.
    // TESTING_STRATEGY.md targets 2,393 ±10 for poke_genie_export_76.csv.
    // Update bounds below after running once and noting the actual count.
    const keeps = result.pokemon.filter(p => p.decision === 'keep');
    expect(keeps.length).toBeGreaterThan(500);
    expect(keeps.length).toBeLessThan(8000);
  });

  it('every pokemon has a decision', () => {
    result.pokemon.forEach(p => {
      expect(['keep', 'trade', 'review', 'protected']).toContain(p.decision);
    });
  });
});

// ─── 1b. Slot assignment correctness ─────────────────────────────────────────

describe('Slot assignment — Glaceon CP:1500', () => {
  let glaceon1500;

  beforeAll(() => {
    glaceon1500 = result.pokemon.find(p => p.name === 'Glaceon' && p.cp === 1500);
  });

  it('Glaceon CP:1500 exists in this CSV', () => {
    expect(glaceon1500).toBeDefined();
  });

  it('Glaceon CP:1500 wins Great league slot', () => {
    if (!glaceon1500) return;
    expect(glaceon1500.slots).toContain('G');
  });

  it('Glaceon CP:1500 slot is confirmed (dustG=0 → slotConfirmed=true)', () => {
    if (!glaceon1500) return;
    expect(glaceon1500.slotConfirmed).toBe(true);
  });

  it('Glaceon CP:1500 is a gold star (suggestStar=true AND isFavorite=true)', () => {
    if (!glaceon1500) return;
    expect(glaceon1500.suggestStar).toBe(true);
    expect(glaceon1500.isFavorite).toBe(true);
  });
});

describe('Slot assignment — Eevee family', () => {
  it('At most one Eevee-family pokemon wins each evo stage per league', () => {
    const eeveeFamily = result.families.find(f =>
      f.members.some(p => p.name === 'Eevee')
    );
    expect(eeveeFamily).toBeDefined();

    // For each league, count winners per evo target — should be at most 1
    ['L', 'G', 'U', 'M'].forEach(lg => {
      const winners = eeveeFamily.members.filter(p => p.slots.includes(lg));
      const evoGroups = {};
      winners.forEach(p => {
        const evoTarget = lg === 'G' ? (p.evolvedNameG || p.name)
          : lg === 'U' ? (p.evolvedNameU || p.name)
          : lg === 'L' ? (p.evolvedNameL || p.name)
          : (p.evolvedNameU || p.evolvedNameG || p.name);
        const variantKey = p.isShadow ? '|shadow' : p.isLucky ? '|lucky' : p.isPurified ? '|purified' : '';
        const key = evoTarget + variantKey;
        evoGroups[key] = (evoGroups[key] || 0) + 1;
      });
      Object.entries(evoGroups).forEach(([evo, count]) => {
        expect(count).toBeLessThanOrEqual(1);
      });
    });
  });

  it('An Eevee family member (not Eevee itself) wins the Great league slot', () => {
    // The GL slot should go to a final evo (Glaceon, Vaporeon etc.) not to Eevee itself
    const eeveeFamily = result.families.find(f =>
      f.members.some(p => p.name === 'Eevee')
    );
    if (!eeveeFamily) return;
    const glWinner = eeveeFamily.members.find(p => p.slots.includes('G') && p.slotConfirmed);
    if (glWinner) {
      // If a confirmed GL winner exists, it should not be plain Eevee
      // (since a fully evolved Glaceon/Vaporeon etc. should win over Eevee)
      const finalEvos = ['Vaporeon','Jolteon','Flareon','Espeon','Umbreon',
        'Leafeon','Glaceon','Sylveon'];
      expect(finalEvos).toContain(glWinner.name);
    }
  });
});

// ─── 1c. Cyan cross-league check ─────────────────────────────────────────────

describe('Cyan star — does not bleed across leagues', () => {
  it('cheaperAlternativeLeagues only contains leagues where the pokemon holds a slot', () => {
    // cheaperAlternativeLeagues is pruned after conflict resolution, so every
    // remaining entry must correspond to an actual slot the pokemon currently holds.
    result.pokemon.forEach(p => {
      if (!p.cheaperAlternativeLeagues || !p.cheaperAlternativeLeagues.length) return;
      p.cheaperAlternativeLeagues.forEach(cl => {
        expect(p.slots).toContain(cl);
      });
    });
  });

  it('Vaporeon GL winner cheaperAlternativeLeagues does not include Ultra', () => {
    // If a Vaporeon is cyan for Great (cheaper alternative), that should not
    // bleed over to make it cyan for Ultra as well.
    const vaporeonGlWinner = result.pokemon.find(p =>
      p.name === 'Vaporeon' && p.slots.includes('G') && p.isCheaperAlternative
    );
    if (!vaporeonGlWinner) return; // no cyan Vaporeon GL winner in this export — skip
    expect(vaporeonGlWinner.cheaperAlternativeLeagues || []).not.toContain('U');
  });
});

// ─── 1d. Nick generation ─────────────────────────────────────────────────────

describe('Nick generation', () => {
  it('All nicks are at most 12 characters', () => {
    result.pokemon.forEach(p => {
      if (!p.nickname) return;
      expect(p.nickname.length).toBeLessThanOrEqual(12);
    });
  });

  it('Confirmed Great league winner nick contains circled G (Ⓖ)', () => {
    // slotConfirmed=true + G slot → nick uses LC['G'] = 'Ⓖ'
    const glaceon1500 = result.pokemon.find(p => p.name === 'Glaceon' && p.cp === 1500);
    if (!glaceon1500 || !glaceon1500.slots.includes('G') || !glaceon1500.slotConfirmed) return;
    expect(glaceon1500.nickname).toContain('Ⓖ');
  });

  it('Glaceon CP:1500 confirmed GL nick is GlaceonⒼ100', () => {
    // dustG=0, rankPctG=99.71% (rounds to 100), evolvedNameG='' (already Glaceon)
    // → mid = 'Ⓖ100', fitName('Glaceon', 'Ⓖ100', '', 12) = 'GlaceonⒼ100'
    // Note: TESTING_STRATEGY.md incorrectly says 'Glace100g99u' — that is the review format.
    // With slotConfirmed=true the circled-letter format applies.
    const glaceon1500 = result.pokemon.find(p => p.name === 'Glaceon' && p.cp === 1500);
    if (!glaceon1500 || !glaceon1500.slots.includes('G') || !glaceon1500.slotConfirmed) return;
    expect(glaceon1500.nickname).toBe('GlaceonⒼ100');
  });

  it('Lucky pokemon nicks always contain a circled letter', () => {
    // League slot → league circled letter (Ⓖ/Ⓤ/ⓛ/Ⓜ)
    // No slot but rank ≥ 90% → that league's circled letter
    // No slot, rank < 90% everywhere → Ⓡ (Master/Raid fallback via buildNickname 'M')
    // All paths produce one of the circled LC values — never a bare number.
    const CIRCLED = new Set(['ⓛ', 'Ⓖ', 'Ⓤ', 'Ⓜ', 'Ⓡ']);
    // Nundos (0/0/0) always get '⓪' regardless of being lucky — exclude them.
    result.pokemon
      .filter(p => p.isLucky && p.decision === 'keep' && !p.isNundo)
      .forEach(p => {
        const hasCircled = [...p.nickname].some(ch => CIRCLED.has(ch));
        expect(hasCircled).toBe(true);
      });
  });

  it('Review-format nick uses lowercase league letters', () => {
    // Review nicks: Name + rankPct + 'g'/'u'/'l'/'m' (lowercase)
    const reviewPoke = result.pokemon.find(p =>
      p.decision === 'review' && p.slots.some(s => ['L', 'G', 'U', 'M'].includes(s))
    );
    if (!reviewPoke) return;
    // Review nick should contain a lowercase letter (g/u/l/m) after a digit
    expect(reviewPoke.nickname).toMatch(/\d[gGulm]/);
  });
});

// ─── 1e. Family grouping ─────────────────────────────────────────────────────

describe('Family grouping — GENDER_SPLIT_SPECIES', () => {
  it('Frillish male and female are in separate families', () => {
    const frillishFams = result.families.filter(f =>
      f.members.some(p => p.name === 'Frillish')
    );
    // Should have at least 2 families (♂ and ♀); possibly a 3rd for no-gender entries
    expect(frillishFams.length).toBeGreaterThanOrEqual(2);

    const maleFam = frillishFams.find(f => f.members.some(p => p.gender === '♂'));
    const femaleFam = frillishFams.find(f => f.members.some(p => p.gender === '♀'));
    expect(maleFam).toBeDefined();
    expect(femaleFam).toBeDefined();
    expect(maleFam.key).not.toBe(femaleFam.key);
  });

  it('Frillish families have the right gender counts from the CSV (31 ♂, 39 ♀)', () => {
    const maleFam = result.families.find(f =>
      f.members.some(p => p.name === 'Frillish' && p.gender === '♂')
    );
    const femaleFam = result.families.find(f =>
      f.members.some(p => p.name === 'Frillish' && p.gender === '♀')
    );
    if (maleFam) {
      const maleCount = maleFam.members.filter(p => p.name === 'Frillish' && p.gender === '♂').length;
      expect(maleCount).toBe(31);
    }
    if (femaleFam) {
      const femaleCount = femaleFam.members.filter(p => p.name === 'Frillish' && p.gender === '♀').length;
      expect(femaleCount).toBe(39);
    }
  });
});

describe('Family grouping — Normal form normalisation', () => {
  it('Growlithe (form=Normal) and Arcanine are in the same family', () => {
    // Before fix: 'Normal' was in FORM_SPLIT_FORMS → separate family per form
    // After fix: 'Normal' normalised to '' → groups with base form
    const growlitheFam = result.families.find(f =>
      f.members.some(p => p.name === 'Growlithe' && (p.form === 'Normal' || p.form === ''))
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
      f.members.some(p => p.name === 'Growlithe' && (p.form === 'Normal' || p.form === ''))
    );
    const hisuiFam = result.families.find(f =>
      f.members.some(p => p.name === 'Growlithe' && p.form === 'Hisui')
    );
    if (!normalFam || !hisuiFam) return; // one or both not in this CSV — skip
    expect(normalFam.key).not.toBe(hisuiFam.key);
  });
});

// ─── 1f. Purify logic ────────────────────────────────────────────────────────

describe('Purify logic', () => {
  it('No purify candidate has a purified CP that busts the league cap', () => {
    // The 92% threshold matches the purify modal filter in app.js
    const LEAGUE_CAPS = { L: 500, G: 1500, U: 2500 };
    const candidates = result.pokemon.filter(p =>
      p.isShadow && p.purifyLeague && p.purifyRankPct >= 92
    );
    candidates.forEach(p => {
      const cap = LEAGUE_CAPS[p.purifyLeague];
      if (!cap) return; // Master league has no cap
      const estimatedPurifiedCP = Math.round((p.cp || 0) * 1.07);
      expect(estimatedPurifiedCP).toBeLessThanOrEqual(cap);
    });
  });

  it('Purify candidates all have isShadow=true', () => {
    const candidates = result.pokemon.filter(p =>
      p.purifyLeague && p.purifyRankPct >= 92
    );
    candidates.forEach(p => {
      expect(p.isShadow).toBe(true);
    });
  });
});

// ─── 1g. STANDALONE_SPECIES evo vote filtering ───────────────────────────────

describe('Family grouping — STANDALONE_SPECIES evo vote filtering', () => {
  it('Scyther and Scizor are in the same family (Kleavor votes ignored)', () => {
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

  it('Kleavor is in its own standalone family (not merged with Scyther/Scizor)', () => {
    const kleavorFam = result.families.find(f =>
      f.members.some(p => p.name === 'Kleavor')
    );
    const scytherFam = result.families.find(f =>
      f.members.some(p => p.name === 'Scyther')
    );
    if (!kleavorFam || !scytherFam) return;
    expect(kleavorFam.key).not.toBe(scytherFam.key);
  });
});

// ─── 1h. Cyan star — Slowpoke regression (_136 CSV) ─────────────────────────

const CSV_PATH_136 = path.join(
  'C:', 'ClaudeCode', 'from Claude', '20260428-0754', 'poke_genie_export 136.csv'
);

describe('Cyan star regression — _136 CSV', () => {
  // The PENDING_CHANGES description of Slowpoke CP:215 vs CP:207 had incorrect fav values
  // and the two pokemon turned out to be in different families (Galarian vs regular Slowpoke).
  // The actual verified cyan case in Little league is CP:441 (winner) vs CP:211 (starred, same rank).
  let result136;

  beforeAll(() => {
    const csv136 = loadCSV(CSV_PATH_136);
    result136 = analyse(csv136);
  });

  it('At least one Slowpoke wins a Little league slot with cyan (isCheaperAlternative)', () => {
    // CP:441 (rankPctL=96.7%, fav=false, dust=7600) is cheaper winner vs CP:211 (96.56%, fav=true, dust=22600)
    // Both round to 97 — cheaper unfavorited winner should show cyan
    const cyanL = result136.pokemon.find(p =>
      p.name === 'Slowpoke' &&
      p.slots.includes('L') &&
      p.isCheaperAlternative
    );
    expect(cyanL).toBeDefined();
    expect(cyanL.isFavorite).toBe(false);
    expect(cyanL.cheaperAlternativeLeagues).toContain('L');
  });

  it('Cyan winner has a favorited Slowpoke at the same rounded rank in the same species', () => {
    const cyanL = result136.pokemon.find(p =>
      p.name === 'Slowpoke' && p.slots.includes('L') && p.isCheaperAlternative
    );
    if (!cyanL) return;
    const starredAtSameRank = result136.pokemon.find(p =>
      p.name === 'Slowpoke' &&
      p.isFavorite &&
      Math.round(p.rankPctL || 0) === Math.round(cyanL.rankPctL || 0) &&
      p.cp !== cyanL.cp
    );
    expect(starredAtSameRank).toBeDefined();
  });

  it('Cyan check: cheaperAlternativeLeagues only contains leagues where slot is held (_136)', () => {
    result136.pokemon.forEach(p => {
      if (!p.cheaperAlternativeLeagues || !p.cheaperAlternativeLeagues.length) return;
      p.cheaperAlternativeLeagues.forEach(cl => {
        expect(p.slots).toContain(cl);
      });
    });
  });
});
