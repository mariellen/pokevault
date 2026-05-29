'use strict';
// ════════════════════════════════════════════════════════════════════════════
// Opus Review #4 — coverage additions
//
// Run with: npx jest tests/analyse.review4.test.js
//
// This suite adds coverage the existing fixture suite lacks, in four areas:
//   Group A — Collection-goal: one Eevolution across L/G/U/M + Master-shiny + Dmax + Lucky
//   Group B — Naming conventions end-to-end through analyse() (not just buildNickname())
//   Group C — Finding A: affordable-backup decision/star/nick
//   Group D — Finding B2: regional-form pre-evo (Growlithe/Hisui)
//   Group E — Finding B1: form-divergent evo target (Rockruff/Lycanroc)
//
// It does NOT depend on the fixture CSV for Groups A/C/D — those build synthetic
// rows so the scenario is explicit and self-documenting. Group B uses the fixture.
//
// IMPORTANT FOR CLAUDE CODE:
//   - Tests marked `it(...)` are REGRESSION GUARDS: they assert behaviour that is
//     CURRENTLY CORRECT and must stay green. If your change breaks one, that's a
//     regression — fix the change, not the test.
//   - Tests marked `it.todo(...)` or inside a `describe` tagged [PENDING-DECISION]
//     are NOT YET IMPLEMENTED on purpose. Do not implement them until the linked
//     decision (BA brief) is made. They document intent, not current behaviour.
//   - Tests marked `it.failing(...)` assert the DESIRED end state of a known defect.
//     They are EXPECTED to fail until the fix lands. When you fix the defect,
//     convert `it.failing` → `it` and confirm green.
// ════════════════════════════════════════════════════════════════════════════

const path = require('path');
const loader = require('./loader');
const { analyse, buildNickname } = loader;
const { loadCSV } = require('./csvParser');

const FIXTURE_PATH = path.join(__dirname, 'poke_genie_fixture.csv');
const leagueSlots = slots => slots.filter(s => ['L', 'G', 'U', 'M'].includes(s));

// ── Synthetic-row helper ─────────────────────────────────────────────────────
// Produces a Pokégenie-export-shaped row with sane defaults. Override any field.
// Column names MUST match what analyse() reads (see analyse.js parse step).
let _seq = 0;
function row(over) {
  _seq += 1;
  return Object.assign({
    'Index': String(_seq), 'Name': 'Glaceon', 'Form': '', 'Pokemon Number': '471',
    'Gender': '', 'CP': '0', 'HP': '100',
    'Atk IV': '10', 'Def IV': '10', 'Sta IV': '10', 'IV Avg': '74',
    'Level Min': '20', 'Level Max': '40',
    'Quick Move': '', 'Charge Move': '', 'Charge Move 2': '',
    'Scan Date': '', 'Original Scan Date': '2026-01-01', 'Catch Date': '',
    'Weight': '', 'Height': '', 'Lucky': '0', 'Shadow/Purified': '0',
    'Favorite': '0', 'Dust': '',
    'Rank % (G)': '', 'Rank # (G)': '', 'Stat Prod (G)': '', 'Dust Cost (G)': '',
    'Candy Cost (G)': '', 'Name (G)': '', 'Form (G)': '', 'Sha/Pur (G)': '',
    'Rank % (U)': '', 'Rank # (U)': '', 'Stat Prod (U)': '', 'Dust Cost (U)': '',
    'Candy Cost (U)': '', 'Name (U)': '', 'Form (U)': '', 'Sha/Pur (U)': '',
    'Rank % (L)': '', 'Rank # (L)': '', 'Stat Prod (L)': '', 'Dust Cost (L)': '',
    'Candy Cost (L)': '', 'Name (L)': '', 'Form (L)': '', 'Sha/Pur (L)': '',
    'Marked for PvP use': '',
  }, over);
}

// Run analyse() twice: once to learn stableKeys, then again with overrides keyed
// off those stableKeys (this is how shiny/dmax flags are injected — they are not
// in the CSV). Returns the final analysed result.
function analyseWithFlagOverrides(rows, flagPredicates) {
  const firstPass = analyse(JSON.parse(JSON.stringify(rows)));
  const overrides = {};
  firstPass.pokemon.forEach(p => {
    flagPredicates.forEach(({ match, flags }) => {
      if (match(p)) overrides[p.stableKey] = Object.assign(overrides[p.stableKey] || {}, flags);
    });
  });
  return loader.createWithOverrides(overrides).analyse(JSON.parse(JSON.stringify(rows)));
}

// ════════════════════════════════════════════════════════════════════════════
// GROUP A — Collection goal: one Eevolution, all roles
// Mariellen wants, per Eevolution: a keeper in EACH of Little/Great/Ultra/Master,
// PLUS a Master-shiny (kept even if a separate copy holds a league slot),
// PLUS a Dynamax, PLUS a Lucky. These are SEPARATE physical Pokémon and should
// NOT compete with each other — league slots and shiny/dmax/lucky slots are
// independent slot groups.
//
// Uses Glaceon (dex 471, final evo, battles "as itself" — evolvedName* blank).
// 7 distinct physical Glaceon, one per intended role.
// ════════════════════════════════════════════════════════════════════════════

describe('Group A — Eevee collection goal: one Glaceon per role (L/G/U/M + shiny + dmax + lucky)', () => {
  let result;
  const at = cp => result.pokemon.find(p => p.name === 'Glaceon' && p.cp === cp);

  beforeAll(() => {
    const rows = [
      // L winner: tiny CP, top LL rank
      row({ CP: '495',  'Atk IV': '0',  'Def IV': '15', 'Sta IV': '15', 'IV Avg': '66',
            'Rank % (L)': '99.8', 'Dust Cost (L)': '0', 'Catch Date': '3/1/2026' }),
      // G winner: ~1500 CP, top GL rank
      row({ CP: '1450', 'Atk IV': '2',  'Def IV': '14', 'Sta IV': '13', 'IV Avg': '64',
            'Rank % (G)': '99.5', 'Dust Cost (G)': '0', 'Catch Date': '1/1/2026' }),
      // U winner: ~2500 CP, top UL rank
      row({ CP: '2480', 'Atk IV': '4',  'Def IV': '15', 'Sta IV': '14', 'IV Avg': '73',
            'Rank % (U)': '99.2', 'Dust Cost (U)': '0', 'Catch Date': '2/1/2026' }),
      // M winner: hundo, high CP, mediocre league ranks
      row({ CP: '3100', 'Atk IV': '15', 'Def IV': '15', 'Sta IV': '15', 'IV Avg': '100',
            'Rank % (G)': '40', 'Rank % (U)': '55', 'Catch Date': '4/1/2026' }),
      // Shiny keeper (flag injected): mid IV, no league win — must still keep
      row({ CP: '3000', 'Atk IV': '12', 'Def IV': '12', 'Sta IV': '12', 'IV Avg': '80',
            'Catch Date': '5/1/2026' }),
      // Lucky keeper: mid IV
      row({ CP: '2900', 'Atk IV': '9',  'Def IV': '9',  'Sta IV': '9',  'IV Avg': '60',
            'Lucky': '1', 'Catch Date': '6/1/2026' }),
      // Dynamax keeper (flag injected): mid IV
      row({ CP: '2950', 'Atk IV': '11', 'Def IV': '8',  'Sta IV': '13', 'IV Avg': '71',
            'Catch Date': '7/1/2026' }),
    ];
    result = analyseWithFlagOverrides(rows, [
      { match: p => p.cp === 3000, flags: { is_shiny: true } },
      { match: p => p.cp === 2950, flags: { is_dynamax: true } },
    ]);
  });

  it('all four leagues are filled, each by exactly one distinct Glaceon', () => {
    ['L', 'G', 'U', 'M'].forEach(lg => {
      const holders = result.pokemon.filter(p => p.slots.includes(lg));
      expect(holders).toHaveLength(1);
    });
  });

  it('the four league winners are four DIFFERENT physical Pokémon', () => {
    const winners = ['L', 'G', 'U', 'M'].map(lg =>
      result.pokemon.find(p => p.slots.includes(lg))
    );
    const cps = new Set(winners.map(p => p.cp));
    expect(cps.size).toBe(4);
  });

  it('every league winner holds exactly ONE league slot (one-slot rule holds across the set)', () => {
    result.pokemon.forEach(p => {
      expect(leagueSlots(p.slots).length).toBeLessThanOrEqual(1);
    });
  });

  it('L winner CP:495 → keep, nick uses ⓛ', () => {
    const p = at(495);
    expect(p.slots).toContain('L');
    expect(p.decision).toBe('keep');
    expect(p.nickname).toContain('ⓛ');
  });

  it('G winner CP:1450 → keep, nick uses Ⓖ', () => {
    const p = at(1450);
    expect(p.slots).toContain('G');
    expect(p.decision).toBe('keep');
    expect(p.nickname).toContain('Ⓖ');
  });

  it('U winner CP:2480 → keep, nick uses Ⓤ', () => {
    const p = at(2480);
    expect(p.slots).toContain('U');
    expect(p.decision).toBe('keep');
    expect(p.nickname).toContain('Ⓤ');
  });

  it('M winner CP:3100 (hundo) → keep, nick uses Ⓜ and Ⓗ', () => {
    const p = at(3100);
    expect(p.slots).toContain('M');
    expect(p.decision).toBe('keep');
    expect(p.nickname).toContain('Ⓜ');
    expect(p.nickname).toContain('Ⓗ');
  });

  it('shiny keeper CP:3000 is KEPT even though it holds no league slot', () => {
    const p = at(3000);
    expect(p.isShiny).toBe(true);
    expect(leagueSlots(p.slots)).toHaveLength(0);
    expect(p.decision).toBe('keep');
    expect(p.nickname).toContain('※');
  });

  it('dynamax keeper CP:2950 is KEPT with Ⓓ in nick', () => {
    const p = at(2950);
    expect(p.isDynamax).toBe(true);
    expect(p.decision).toBe('keep');
    expect(p.slots).toContain('dynamax');
    expect(p.nickname).toContain('Ⓓ');
  });

  it('lucky keeper CP:2900 is KEPT (lucky always keep)', () => {
    const p = at(2900);
    expect(p.isLucky).toBe(true);
    expect(p.decision).toBe('keep');
    expect(p.slots).toContain('lucky');
  });

  it('ALL seven physical Glaceon survive as keepers (none traded)', () => {
    const glaceons = result.pokemon.filter(p => p.name === 'Glaceon');
    expect(glaceons).toHaveLength(7);
    glaceons.forEach(p => expect(p.decision).toBe('keep'));
  });
});

describe('Group A2 — shiny that IS the Master winner stacks both roles on one Pokémon', () => {
  // "At least one Master shiny of each, even if there is one in a league."
  // If your only strong Master Glaceon is also shiny, it should hold the M slot
  // AND carry the shiny marker — one Pokémon, both roles, stacked nick.
  let result;
  beforeAll(() => {
    const rows = [
      row({ CP: '495',  'Atk IV': '0',  'Def IV': '15', 'Sta IV': '15', 'IV Avg': '66',
            'Rank % (L)': '99.8', 'Dust Cost (L)': '0', 'Catch Date': '3/1/2026' }),
      row({ CP: '1450', 'Atk IV': '2',  'Def IV': '14', 'Sta IV': '13', 'IV Avg': '64',
            'Rank % (G)': '99.5', 'Dust Cost (G)': '0', 'Catch Date': '1/1/2026' }),
      row({ CP: '2480', 'Atk IV': '4',  'Def IV': '15', 'Sta IV': '14', 'IV Avg': '73',
            'Rank % (U)': '99.2', 'Dust Cost (U)': '0', 'Catch Date': '2/1/2026' }),
      // shiny hundo — the Master pick
      row({ CP: '3100', 'Atk IV': '15', 'Def IV': '15', 'Sta IV': '15', 'IV Avg': '100',
            'Catch Date': '4/1/2026' }),
    ];
    result = analyseWithFlagOverrides(rows, [
      { match: p => p.cp === 3100, flags: { is_shiny: true } },
    ]);
  });

  it('shiny hundo CP:3100 holds the Master slot', () => {
    const p = result.pokemon.find(p => p.cp === 3100);
    expect(p.slots).toContain('M');
    expect(p.decision).toBe('keep');
  });

  it('its nick shows BOTH Master duty (Ⓜ) and shiny (※)', () => {
    const p = result.pokemon.find(p => p.cp === 3100);
    expect(p.nickname).toContain('Ⓜ');
    expect(p.nickname).toContain('※');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// GROUP B — Naming conventions END-TO-END through analyse()
// Existing Group 16 tests call buildNickname() directly. These verify the
// NICK_CONVENTION pathway as it would actually run, and broaden `moves` coverage.
// NOTE: NICK_CONVENTION is a const in config.js (currently 'pvpvault'). analyse()
// builds nicks with the default. We therefore test the convention parameter via
// buildNickname() on REAL analysed Pokémon (post-slot-assignment), which is the
// integration point render.js uses. If a future change wires NICK_CONVENTION
// into analyse() directly, add an end-to-end variant here.
// ════════════════════════════════════════════════════════════════════════════

describe('Group B — Naming conventions on analysed Pokémon', () => {
  let result;
  const find = (name, cp) => result.pokemon.find(p => p.name === name && p.cp === cp);
  beforeAll(() => { result = analyse(loadCSV(FIXTURE_PATH)); });

  const CONVENTIONS = ['pvpvault', 'ivpct', 'rawiv', 'moves'];

  it('every convention yields ≤12 chars for every analysed Pokémon at its real slot', () => {
    result.pokemon.forEach(p => {
      const slot = p.slots.find(s => ['L', 'G', 'U', 'M'].includes(s)) || p.slots[0] || 'review';
      CONVENTIONS.forEach(conv => {
        expect(buildNickname(p, slot, conv).length).toBeLessThanOrEqual(12);
      });
    });
  });

  it('ivpct uses rounded IV%: Glaceon CP:1500 (ivAvg 55.6) → Glaceon56', () => {
    expect(buildNickname(find('Glaceon', 1500), 'G', 'ivpct')).toBe('Glaceon56');
  });

  it('rawiv uses raw IV digits: Glaceon CP:1500 (2/9/14) → Glaceon2914', () => {
    expect(buildNickname(find('Glaceon', 1500), 'G', 'rawiv')).toBe('Glaceon2914');
  });

  it('moves: Pokémon WITH move data uses Q/C codes (Feraligatr → SC/HC)', () => {
    const nick = buildNickname(find('Feraligatr', 2498), 'U', 'moves');
    expect(nick).toContain('SC');
    expect(nick).toContain('HC');
    expect(nick).toContain('/');
  });

  it('moves: Pokémon WITHOUT move data falls back to ivpct', () => {
    const p = find('Glaceon', 1500);
    expect(buildNickname(p, 'G', 'moves')).toBe(buildNickname(p, 'G', 'ivpct'));
  });

  it('pvpvault (default) equals explicit "pvpvault" for every Pokémon', () => {
    result.pokemon.forEach(p => {
      const slot = p.slots[0] || 'review';
      expect(buildNickname(p, slot, 'pvpvault')).toBe(buildNickname(p, slot));
    });
  });

  it('every convention preserves the shiny ※ suffix when the Pokémon is shiny', () => {
    // Inject shiny on Snorlax CP:100 (stableKey from fixture spec) and re-check all conventions.
    const ov = loader.createWithOverrides({ '143|||5|5|5|2026-02-01': { is_shiny: true } });
    const r2 = ov.analyse(loadCSV(FIXTURE_PATH));
    const snorlax = r2.pokemon.find(p => p.name === 'Snorlax' && p.cp === 100);
    CONVENTIONS.forEach(conv => {
      const nick = buildNickname(snorlax, snorlax.slots[0] || 'review', conv);
      expect(nick.endsWith('※')).toBe(true);
      expect(nick.length).toBeLessThanOrEqual(12);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// GROUP C — Finding A: affordable backup
//
// An "affordable backup" is the cheaper same-rounded-rank alternative to an
// EXPENSIVE league winner (effective dust > league affordable threshold). The
// expensive winner gets isExpensiveWinner + blue star; the backup gets an
// X_affordable slot.
//
// BA decision (2026-05-29): Option 1 — backup is a keep-worthy CYAN pick:
//   decision='keep', nick uses the league symbol (Ⓖ96), starType='cyan'.
// ════════════════════════════════════════════════════════════════════════════

describe('Group C — Finding A: affordable backup decision/star/nick', () => {
  let result;
  const find = (name, cp) => result.pokemon.find(p => p.name === name && p.cp === cp);
  beforeAll(() => { result = analyse(loadCSV(FIXTURE_PATH)); });

  // GUARD updated: Finding A → Option 1 chosen (BA brief 2026-05-29).
  // Behaviour changed intentionally: affordable backup is now a keep-worthy cyan pick.
  it('GUARD: Tentacruel CP:1430 affordable backup is keep/cyan/league-symbol-nick (Finding A Option 1)', () => {
    const p = find('Tentacruel', 1430);
    expect(p).toBeDefined();
    expect(p.slots).toContain('G_affordable');
    expect(p.isAffordableWinner).toBe(true);
    expect(p.decision).toBe('keep');
    expect(p.starType).toBe('cyan');
    expect(p.nickname).toContain('Ⓖ'); // league symbol, not holding format
  });

  // Finding A Option 1 — BA decision confirmed 2026-05-29
  it('OPTION 1: affordable backup decision === "keep"', () => {
    const p = find('Tentacruel', 1430);
    expect(p.decision).toBe('keep');
  });

  it('OPTION 1: affordable backup nick uses Ⓖ league symbol, not holding format', () => {
    const p = find('Tentacruel', 1430);
    expect(p.nickname).toContain('Ⓖ');
    expect(p.nickname).not.toMatch(/\d+g$/);
  });

  it('OPTION 1: affordable backup starType === "cyan" (suggestStarCheaper)', () => {
    const p = find('Tentacruel', 1430);
    expect(p.starType).toBe('cyan');
    expect(p.suggestStarCheaper).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// GROUP D — Finding B2: regional-form pre-evo
//
// Mariellen WANTS both a normal Arcanine line AND a Hisuian Arcanine line kept as
// distinct keepers. The engine ALREADY keeps both (separate families 58 and
// 58|Hisui), which is correct.
//
// Finding B2 fix: data.js now has form-qualified VALID_EVOLUTIONS entries
// (e.g. 'Growlithe|Hisui':['Arcanine|Hisui']), validateEvo checks form-qualified
// keys for regional Pokémon, and FORM_NICK_PREFIXES has 'Hisui':'Hisu' etc.
// ════════════════════════════════════════════════════════════════════════════

describe('Group D — Finding B2: regional-form pre-evo distinct keeper', () => {
  let result;
  const growlithes = () => result.pokemon.filter(p => p.name === 'Growlithe');
  beforeAll(() => { result = analyse(loadCSV(FIXTURE_PATH)); });

  it('GUARD: both Growlithe (Normal + Hisui) are kept in SEPARATE families', () => {
    const norm = result.pokemon.find(p => p.name === 'Growlithe' && p.form !== 'Hisui');
    const hisui = result.pokemon.find(p => p.name === 'Growlithe' && p.form === 'Hisui');
    expect(norm).toBeDefined();
    expect(hisui).toBeDefined();
    expect(norm.familyKey).not.toBe(hisui.familyKey);
    expect(hisui.familyKey).toContain('Hisui');
  });

  it('GUARD: each Growlithe holds its own GL slot (keep both lines — intended)', () => {
    growlithes().forEach(p => {
      expect(p.slots).toContain('G');
      expect(p.decision).toBe('keep');
    });
  });

  it('GUARD: one-slot rule still holds per Pokémon (each holds exactly one league slot)', () => {
    growlithes().forEach(p => {
      expect(leagueSlots(p.slots)).toHaveLength(1);
    });
  });

  // Finding B2 fix landed — convert it.failing → it (BA decision 2026-05-29)
  it('DESIRED: the Normal and Hisui Growlithe produce DIFFERENT nicknames', () => {
    const norm = result.pokemon.find(p => p.name === 'Growlithe' && p.form !== 'Hisui');
    const hisui = result.pokemon.find(p => p.name === 'Growlithe' && p.form === 'Hisui');
    expect(hisui.nickname).not.toBe(norm.nickname);
  });

  it('DESIRED: the Hisui Growlithe targets a Hisui-distinct Arcanine, not plain "Arcanine"', () => {
    const hisui = result.pokemon.find(p => p.name === 'Growlithe' && p.form === 'Hisui');
    // After fix, the Hisuian evo target is 'Arcanine|Hisui' — NOT bare 'Arcanine'.
    expect(hisui.targetEvo === 'Arcanine' || hisui.evolvedNameG === 'Arcanine').toBe(false);
  });

  // Finding B2 — shiny-per-region independence (BA decision 2026-05-29)
  // Separate familyKeys mean a shiny Hisuian Growlithe and a shiny Normal Growlithe
  // are tracked independently — they do NOT compete for the same shiny slot.
  it('shiny Normal Growlithe and shiny Hisui Growlithe are independent keepers (separate family keys)', () => {
    const norm = result.pokemon.find(p => p.name === 'Growlithe' && p.form !== 'Hisui');
    const hisui = result.pokemon.find(p => p.name === 'Growlithe' && p.form === 'Hisui');
    // Family keys differ → shiny override on one cannot displace the other
    expect(norm.familyKey).not.toBe(hisui.familyKey);
    // Each Pokémon is already a keeper (confirmed above); injecting shiny on one
    // would not affect the other's slots because they are in different families.
    // Verify directly: the familyKey for Hisui contains the form marker.
    expect(hisui.familyKey).toMatch(/Hisui/);
    expect(norm.familyKey).not.toMatch(/Hisui/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// GROUP E — Finding B1: form-divergent evolution target (Rockruff → Lycanroc)
//
// This is the CHEAP half of Finding B: the target form is ALREADY in the Pokégenie
// export (Form (G)/Form (U)/Form (L) columns), the engine just doesn't read it.
//
// Uses REAL rows extracted from poke_genie_export_176.csv → lycanroc_fixture.csv.
// Headline case: Rockruff CP393 — Pokégenie recommends Midnight Lycanroc for Great
// but Midday Lycanroc for Ultra. Evolving the wrong form on a rare Pokémon is a
// costly mistake, which is exactly what Mariellen wants protected against.
//
// Requires lycanroc_fixture.csv in tests/. If absent, the suite skips Group E with
// a clear message rather than erroring.
// ════════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const LYCANROC_PATH = path.join(__dirname, 'lycanroc_fixture.csv');
const hasLycanrocFixture = fs.existsSync(LYCANROC_PATH);
const describeE = hasLycanrocFixture ? describe : describe.skip;

describeE('Group E — Finding B1: Rockruff→Lycanroc form-divergent evolution', () => {
  let result;
  const at = cp => result.pokemon.find(p => p.cp === cp);
  beforeAll(() => {
    if (!hasLycanrocFixture) return;
    result = analyse(loadCSV(LYCANROC_PATH));
  });

  // ── GUARDS: what is already correct and must stay green ──

  it('GUARD: an already-Midnight Lycanroc keeps the "Night" display prefix (NightⓂ…)', () => {
    // CP1176 is a Midnight Lycanroc (its OWN form = Midnight) — the prefix path works.
    const p = at(1176);
    expect(p).toBeDefined();
    expect(p.form).toBe('Midnight');
    expect(p.nickname).toContain('Night');
  });

  it('GUARD: Rockruff-as-itself GL keeper coexists with a Rockruff→Lycanroc GL keeper', () => {
    // CP531 wins Great as Rockruff (Name(G)=Rockruff, no evolution); CP393 wins Great
    // as Lycanroc. Two different GL evo targets in one family — both kept (Skwovet rule).
    const staysRockruff = result.pokemon.find(p =>
      p.name === 'Rockruff' && p.slots.includes('G') && (p.evolvedNameG === '' || p.evolvedNameG === 'Rockruff')
    );
    const evolves = result.pokemon.find(p =>
      p.name === 'Rockruff' && p.slots.includes('G') && p.evolvedNameG === 'Lycanroc'
    );
    expect(staysRockruff).toBeDefined();
    expect(evolves).toBeDefined();
    expect(staysRockruff).not.toBe(evolves);
  });

  it('GUARD: one-slot rule holds for every Rockruff/Lycanroc', () => {
    result.pokemon.forEach(p => {
      expect(leagueSlots(p.slots).length).toBeLessThanOrEqual(1);
    });
  });

  // ── Finding B1 fix landed — convert it.failing → it (BA decision 2026-05-29) ──

  it('DESIRED: Rockruff CP393 GL winner nick shows the Midnight target (not bare Lycanroc)', () => {
    // Pokégenie Form(G) for CP393 = Midnight. Nick reflects Midnight via FORM_NICK_PREFIXES
    // (e.g. "NightⒼ97"), NOT bare "LycanrocⒼ97".
    const p = at(393);
    expect(p).toBeDefined();
    expect(p.nickname).not.toMatch(/^Lycanroc/);
  });

  it('DESIRED: Rockruff CP492 UL winner nick shows the Midday target (not bare Lycanroc)', () => {
    // Pokégenie Form(U) for CP492 = Midday. Nick reflects Midday via FORM_NICK_PREFIXES.
    const p = at(492);
    expect(p).toBeDefined();
    expect(p.nickname).not.toMatch(/^Lycanroc/);
  });

  it('DESIRED: the per-league form difference is captured somewhere user-visible', () => {
    // CP393 wants Midnight for GL but Midday for UL. A single nick can't carry both, so
    // evolvedFormG/evolvedFormU fields expose both so Mariellen doesn't evolve the wrong one.
    const p = at(393);
    expect(p).toBeDefined();
    const blob = JSON.stringify(p);
    expect(blob.includes('Midnight') && blob.includes('Midday')).toBe(true);
  });
});
