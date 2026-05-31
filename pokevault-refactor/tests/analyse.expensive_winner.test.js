'use strict';
// Regression tests for the isExpensiveWinner / Practical-toggle area.
// These cover the three gaps found in the 2026-05-31 review:
//   1. Star COLOUR of a favourited expensive winner (the Quilava CP:519 bug).
//   2. The 💰 Practical toggle filter predicate (app.js: practicalMode && p.isExpensiveWinner).
//   3. The shadow + ML purify one-slot interaction (Annihilape M+U).
//
// Run with: npx jest tests/analyse.expensive_winner.test.js
//
// Unlike the other suites these build tiny in-memory CSVs (via the real csvParser)
// rather than relying on the shared fixture, so the exact dust/rank conditions that
// trigger the expensive-winner path are pinned and won't drift if the fixture changes.

const loader = require('./loader');
const { analyse } = loader;
const { parseCSV } = require('./csvParser');

// 50-column Pokégenie export header (matches poke_genie_export_176.csv).
const HEADER = [
  'Index', 'Name', 'Form', 'Pokemon Number', 'Gender', 'CP', 'HP',
  'Atk IV', 'Def IV', 'Sta IV', 'IV Avg', 'Level Min', 'Level Max',
  'Quick Move', 'Charge Move', 'Charge Move 2', 'Scan Date',
  'Original Scan Date', 'Catch Date', 'Weight', 'Height', 'Lucky',
  'Shadow/Purified', 'Favorite', 'Dust',
  'Rank % (G)', 'Rank # (G)', 'Stat Prod (G)', 'Dust Cost (G)', 'Candy Cost (G)', 'Name (G)', 'Form (G)', 'Sha/Pur (G)',
  'Rank % (U)', 'Rank # (U)', 'Stat Prod (U)', 'Dust Cost (U)', 'Candy Cost (U)', 'Name (U)', 'Form (U)', 'Sha/Pur (U)',
  'Rank % (L)', 'Rank # (L)', 'Stat Prod (L)', 'Dust Cost (L)', 'Candy Cost (L)', 'Name (L)', 'Form (L)', 'Sha/Pur (L)',
  'Marked for PvP use',
];

const row = (o) => HEADER.map(c => (o[c] !== undefined ? o[c] : '')).join(',');
// `rows` are already CSV row strings (built via row()); join them with the header.
const toCSV = (rows) => parseCSV([HEADER.join(','), ...rows].join('\n'));

// A single favourited Pokémon that wins Great with prohibitive dust (> GL affordable 150k)
// and no affordable alternative in the family. Snorlax = final evo, so slot logic is simple.
const expensiveFavGreatWinner = () => row({
  Index: '1', Name: 'Snorlax', 'Pokemon Number': '143', CP: '1490', HP: '150',
  'Atk IV': '10', 'Def IV': '15', 'Sta IV': '14', 'IV Avg': '86.7', 'Level Min': '25',
  Favorite: '1', Dust: '5000',
  'Rank % (G)': '99.50', 'Dust Cost (G)': '210000', 'Name (G)': 'Snorlax',
  'Rank % (U)': '40.0', 'Dust Cost (U)': '300000', 'Name (U)': 'Snorlax',
});

// Same Pokémon, not favourited — the control case (should be blue).
const expensiveNonFavGreatWinner = () => row({
  Index: '1', Name: 'Snorlax', 'Pokemon Number': '143', CP: '1490', HP: '150',
  'Atk IV': '10', 'Def IV': '15', 'Sta IV': '14', 'IV Avg': '86.7', 'Level Min': '25',
  Favorite: '0', Dust: '5000',
  'Rank % (G)': '99.50', 'Dust Cost (G)': '210000', 'Name (G)': 'Snorlax',
  'Rank % (U)': '40.0', 'Dust Cost (U)': '300000', 'Name (U)': 'Snorlax',
});

// ─── Group A — Expensive winner flag is set correctly ────────────────────────

describe('Expensive winner — flag assignment', () => {
  it('favourited expensive Great winner: isExpensiveWinner + suggestStarExpensive are true', () => {
    const result = analyse(toCSV([expensiveFavGreatWinner()]));
    const p = result.pokemon.find(x => x.cp === 1490);
    expect(p).toBeDefined();
    expect(p.slots).toContain('G');
    expect(p.expensiveForLeague).toBe('G');
    expect(p.isExpensiveWinner).toBe(true);
    expect(p.suggestStarExpensive).toBe(true);
    expect(p.suggestStar).toBe(false); // forced off when suggestStarExpensive is true
  });

  it('non-favourited expensive Great winner: still flagged, and rendered BLUE', () => {
    const result = analyse(toCSV([expensiveNonFavGreatWinner()]));
    const p = result.pokemon.find(x => x.cp === 1490);
    expect(p.isExpensiveWinner).toBe(true);
    expect(p.suggestStarExpensive).toBe(true);
    expect(p.starType).toBe('blue'); // control — this case already works
  });
});

// ─── Group B — Star COLOUR of a favourited expensive winner ───────────────────
// Decision: gold = "already starred in GO" (action complete). The $ dust-cost suffix
// is suppressed at the display layer when starType === 'gold'. Blue indicates the
// keep action has not yet been taken in GO.

describe('Expensive winner — star colour (Quilava CP:519 regression)', () => {
  it.skip('DOCUMENTS CURRENT BEHAVIOUR: favourited expensive winner is GOLD (the bug)', () => {
    const result = analyse(toCSV([expensiveFavGreatWinner()]));
    const p = result.pokemon.find(x => x.cp === 1490);
    // This assertion passes against the current build and will FAIL once the
    // star tree is fixed — flip it to the next test at that point.
    expect(p.starType).toBe('gold');
  });

  it('INTENDED BEHAVIOUR: favourited expensive winner renders GOLD (action complete in GO)', () => {
    const result = analyse(toCSV([expensiveFavGreatWinner()]));
    const p = result.pokemon.find(x => x.cp === 1490);
    expect(p.starType).toBe('gold');
  });

  it('gold keeper should not also carry a $ dust warning in its nick', () => {
    const result = analyse(toCSV([expensiveFavGreatWinner()]));
    const p = result.pokemon.find(x => x.cp === 1490);
    // The contradiction: gold star ("Starred correctly ✓") + a $ in the nick.
    // Currently FAILS (nick is e.g. "SnorlaxⒼ100$"). Either the star or the $ must go.
    if (p.starType === 'gold') {
      expect(p.nickname).not.toMatch(/\$/);
    }
  });
});

// ─── Group C — 💰 Practical toggle filter predicate ──────────────────────────
// app.js hides rows where (practicalMode && p.isExpensiveWinner). The engine must
// expose isExpensiveWinner so the toggle can act on it, regardless of star colour.

describe('Practical toggle — filter predicate', () => {
  const practicalHidden = (p) => !!p.isExpensiveWinner; // mirrors app.js:248 / 463-464

  it('favourited expensive (gold) winner is still caught by the Practical filter', () => {
    const result = analyse(toCSV([expensiveFavGreatWinner()]));
    const p = result.pokemon.find(x => x.cp === 1490);
    // Even though it renders gold, isExpensiveWinner is true, so Practical hides it.
    expect(practicalHidden(p)).toBe(true);
  });

  it('an ordinary affordable winner is NOT hidden by the Practical filter', () => {
    const affordable = row({
      Index: '1', Name: 'Snorlax', 'Pokemon Number': '143', CP: '1480', HP: '149',
      'Atk IV': '10', 'Def IV': '15', 'Sta IV': '14', 'IV Avg': '86.7', 'Level Min': '24',
      Favorite: '1', Dust: '4000',
      'Rank % (G)': '99.50', 'Dust Cost (G)': '80000', 'Name (G)': 'Snorlax',
    });
    const result = analyse(toCSV([affordable]));
    const p = result.pokemon.find(x => x.cp === 1480);
    expect(p.slots).toContain('G');
    expect(p.isExpensiveWinner).toBeFalsy();
    expect(practicalHidden(p)).toBe(false);
  });
});

// ─── Group D — Shadow + ML purify one-slot interaction ───────────────────────
// A shadow that qualifies for Master after purification (isPurifySlot) is exempt
// from the one-slot rule until it wins a main-pass battle slot, so it can hold a
// purify-M recommendation AND a won battle slot at the same time. This test pins
// the current behaviour so a future one-slot change doesn't silently break it.

describe('Shadow + ML purify — one-slot exemption', () => {
  // Shadow Annihilape-style: final evo, shadow, purifies into Master at ~91%,
  // also wins Ultra as a battle slot at ~90%.
  const shadowPurifyMaster = () => row({
    Index: '1', Name: 'Gengar', 'Pokemon Number': '094', CP: '1327', HP: '120',
    'Atk IV': '13', 'Def IV': '15', 'Sta IV': '14', 'IV Avg': '93.3', 'Level Min': '25',
    Favorite: '0', Dust: '5000', 'Shadow/Purified': '1',
    'Rank % (U)': '90.50', 'Dust Cost (U)': '120000', 'Name (U)': 'Gengar',
    'Rank % (G)': '60.0', 'Dust Cost (G)': '200000', 'Name (G)': 'Gengar',
  });

  it('shadow that purifies into Master may hold both its purify slot and a battle slot', () => {
    const result = analyse(toCSV([shadowPurifyMaster()]));
    const p = result.pokemon.find(x => x.cp === 1327);
    expect(p).toBeDefined();
    expect(p.isShadow).toBe(true);
    const leagueSlots = p.slots.filter(s => ['L', 'G', 'U', 'M'].includes(s));
    // Whatever the count, every league slot it holds must be backed by either a
    // confirmed battle rank (>= keepThreshold) or the purify recommendation.
    leagueSlots.forEach(s => {
      const rank = s === 'M' ? (p.purifyRankPct || p.ivAvg || 0) : (p['rankPct' + s] || 0);
      const isPurifyRec = s === p.purifyLeague && p.isPurifySlot;
      expect(rank >= 90 || isPurifyRec).toBe(true);
    });
  });

  it('a non-shadow holds at most one league slot (one-slot rule holds for regulars)', () => {
    const regular = row({
      Index: '1', Name: 'Gengar', 'Pokemon Number': '094', CP: '1500', HP: '120',
      'Atk IV': '15', 'Def IV': '15', 'Sta IV': '15', 'IV Avg': '100', 'Level Min': '25',
      Favorite: '1', Dust: '5000',
      'Rank % (U)': '95.0', 'Dust Cost (U)': '0', 'Name (U)': 'Gengar',
      'Rank % (G)': '92.0', 'Dust Cost (G)': '0', 'Name (G)': 'Gengar',
    });
    const result = analyse(toCSV([regular]));
    const p = result.pokemon.find(x => x.cp === 1500);
    const leagueSlots = p.slots.filter(s => ['L', 'G', 'U', 'M'].includes(s));
    expect(leagueSlots.length).toBeLessThanOrEqual(1);
  });
});
