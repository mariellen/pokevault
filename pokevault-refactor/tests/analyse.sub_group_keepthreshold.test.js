'use strict';
// Brief: issue-118-119-subgroup-keepthreshold-complete (v3.5.82)
//   Fix 0 (#118) — setOverride() had a THIRD, hand-rolled copy of slot→nick resolution (separate
//                  from resolveNickSlot/getNickSlot) that lacked the keepThreshold guard. Ticking
//                  Shiny on a Lucky holding only a tentative sub-90 league slot rendered the raw
//                  league nick (e.g. ChesnaugⒼ21※) instead of falling through to the Ⓡ holding nick.
//                  Fixed by having setOverride call resolveNickSlot() directly (single source of truth).
//   Part 1 (#118) — resolveNickSlot/decision-block branch order: shiny is now checked before lucky
//                  in the unconfirmed fallback, so a shiny+lucky combo uses the ivAvg-based shiny
//                  fallback instead of the rankPctM-based lucky fallback.
//   Part 2 (#119) — a Lucky's CONFIRMED slot now suppresses a same-SPECIES non-lucky win of the
//                  same league (main pool has no visibility into the |lucky sub-group otherwise).
//                  Scoped to p.name (not evoTarget) so Flaaffy(lucky)/Mareep(non-lucky) — different
//                  current species sharing a final evo target — stay independent (Group 5/36).

const path = require('path');
const loader = require('./loader');
const setOverrideLoader = require('./set-override-loader');
const { parseCSV } = require('./csvParser');

const HEADER = [
  'Index','Name','Form','Pokemon Number','Gender','CP','HP',
  'Atk IV','Def IV','Sta IV','IV Avg','Level Min','Level Max',
  'Quick Move','Charge Move','Charge Move 2','Scan Date','Original Scan Date','Catch Date',
  'Weight','Height','Lucky','Shadow/Purified','Favorite','Dust',
  'Rank % (G)','Rank # (G)','Stat Prod (G)','Dust Cost (G)','Candy Cost (G)','Name (G)','Form (G)','Sha/Pur (G)',
  'Rank % (U)','Rank # (U)','Stat Prod (U)','Dust Cost (U)','Candy Cost (U)','Name (U)','Form (U)','Sha/Pur (U)',
  'Rank % (L)','Rank # (L)','Stat Prod (L)','Dust Cost (L)','Candy Cost (L)','Name (L)','Form (L)','Sha/Pur (L)',
  'Marked for PvP use',
];
const row = (o) => HEADER.map(c => (o[c] !== undefined ? o[c] : '')).join(',');
const toCSV = (rows) => parseCSV([HEADER.join(','), ...rows].join('\n'));

// ════════════════════════════════════════════════════════════════════════════
// #118 — shiny+lucky combo, tentative sub-90 league slot
// ════════════════════════════════════════════════════════════════════════════
describe('#118 — shiny tick on a Lucky holding only a tentative sub-90 slot', () => {
  it('setOverride(is_shiny) falls through to the ivAvg-based Ⓡ nick, not the tentative league nick', () => {
    // Mirrors the reported Chesnaught CP1257 (15/?) shiny-lucky case: Lucky wins its own |lucky
    // Great sub-group at 21% (only member — C3 floor removed) but that's far below keepThreshold.
    const p = {
      stableKey: 'k1', idx: 1, name: 'Chesnaught', form: '', ivAvg: 93,
      atkIV: 15, defIV: 13, staIV: 12, isLucky: true,
      slots: ['G'], rankPctG: 21, rankPctU: 0, rankPctL: 0, rankPctM: 8,
    };
    setOverrideLoader.setAllPokemon([p]);
    setOverrideLoader.setOverride('k1', 'is_shiny', true);
    expect(p.isShiny).toBe(true);
    expect(p.nickname).toBe('ChesnaugⓇ93※');
    expect(p.nickname).not.toMatch(/Ⓖ/); // no Great-league symbol at 21% tentative rank
  });

  it('a plain (non-shiny) Lucky with the same tentative slot is unaffected by the reorder', () => {
    const p = {
      stableKey: 'k2', idx: 2, name: 'Chesnaught', form: '', ivAvg: 93,
      atkIV: 15, defIV: 13, staIV: 12, isLucky: true,
      slots: ['G'], rankPctG: 21, rankPctU: 0, rankPctL: 0, rankPctM: 8,
    };
    const slot = loader.resolveNickSlot(p);
    expect(slot).toBe('lucky'); // shiny check doesn't match — falls through exactly as before
    expect(loader.buildNickname(p, slot)).toBe('ChesnaughtⓇ8'); // unchanged lucky fallback (rankPctM-based)
  });
});

// ════════════════════════════════════════════════════════════════════════════
// #119 — Lucky blocks main pool for the same species/league
// ════════════════════════════════════════════════════════════════════════════
describe('#119 — a Lucky\'s confirmed slot suppresses a same-species non-lucky win', () => {
  const dedenne = (cp, a, d, s, lucky, idx, uRank) => row({
    Index: String(idx), Name: 'Dedenne', 'Pokemon Number': '702',
    CP: String(cp), 'Atk IV': String(a), 'Def IV': String(d), 'Sta IV': String(s),
    'IV Avg': ((a + d + s) / 45 * 100).toFixed(1), 'Level Min': '20', 'Level Max': '20', Dust: '5000',
    Lucky: lucky ? '1' : '0',
    'Rank % (U)': uRank, 'Dust Cost (U)': '150000', 'Name (U)': 'Dedenne',
  });

  // Low raw IVs (ivAvg well under the 70% Master floor) keep both rows out of Master
  // contention — one-slot-per-Pokémon (M→U→G→L) would otherwise let Master claim the slot
  // before Ultra assignment ever runs. PvP rank% is independent of raw IV avg in practice.
  it('Lucky CP1395 (99% Ultra) suppresses non-lucky CP759 (96% Ultra) from also winning Ultra', () => {
    const mons = loader.createWithOverrides({}).analyse(toCSV([
      dedenne(1395, 8, 8, 7, true, 1, '99.0'),
      dedenne(759, 8, 7, 7, false, 2, '96.0'),
    ])).pokemon;

    const lucky = mons.find(p => p.cp === 1395);
    const nonLucky = mons.find(p => p.cp === 759);

    expect(lucky.slots).toContain('U');
    expect(lucky.decision).toBe('keep');

    expect(nonLucky.slots).not.toContain('U'); // suppressed — Lucky already covers this role
    expect(nonLucky.decision).not.toBe('keep');
  });

  it('two non-lucky Dedenne without any Lucky present compete normally (no suppression)', () => {
    const mons = loader.createWithOverrides({}).analyse(toCSV([
      dedenne(1395, 8, 8, 7, false, 1, '99.0'),
      dedenne(759, 8, 7, 7, false, 2, '96.0'),
    ])).pokemon;
    const best = mons.find(p => p.cp === 1395);
    expect(best.slots).toContain('U'); // ordinary same-variant dedup still picks the better one
  });

  it('Flaaffy(lucky)/Mareep(non-lucky) — different current species — remain independent (regression guard)', () => {
    // Loads the shared fixture used by Group 5/36; both target Ampharos in Great but are
    // different physical Pokémon, so #119's suppression (keyed on p.name) must not fire here.
    const { loadCSV } = require('./csvParser');
    const FIXTURE_PATH = path.join(__dirname, 'poke_genie_fixture.csv');
    const result = loader.analyse(loadCSV(FIXTURE_PATH));
    const flaaffy = result.pokemon.find(p => p.name === 'Flaaffy' && p.cp === 500);
    const mareep = result.pokemon.find(p => p.name === 'Mareep' && p.cp === 120);
    expect(flaaffy.slots).toContain('G');
    expect(mareep.slots).toContain('G');
  });
});
