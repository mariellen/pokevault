'use strict';
// Tests for the Trading Tracker feature (Special Trades / Friendship Fridays shortcuts).
// Specified directly by Mariellen in conversation, not a written brief — see PR description
// for the full exchange. Friendship Fridays is built from two generic, independently-selectable
// pieces (the existing dexQualLucky toggle + a new dexIvUnder threshold) rather than a single
// special-cased flag, per Mariellen's own feedback after using v1 — she noticed the "Lucky"
// button didn't light up, and correctly identified the 90% cutoff as the only truly "magical"
// part worth generalizing.

const { load } = require('./trading-tracker-loader');

const SPECIES = [
  { pokedex_number: 337, name: 'Lunatone', category: 'Regular', type1: 'Rock', type2: 'Psychic', evolves_from: null, is_in_go: true },
  { pokedex_number: 336, name: 'Seviper', category: 'Regular', type1: 'Poison', type2: null, evolves_from: null, is_in_go: true },
  { pokedex_number: 1, name: 'Bulbasaur', category: 'Regular', type1: 'Grass', type2: 'Poison', evolves_from: null, is_in_go: true },
];

const lucky = (o) => ({
  pokeNum: String(o.pokeNum), cp: o.cp || 1500, ivAvg: o.iv,
  atkIV: 10, defIV: 10, staIV: 10, isLucky: true, isShiny: false,
  isDynamax: false, isGigantamax: false, isHundo: false, decision: 'keep',
  rankPctU: o.ru || 0, rankPctG: o.rg || 0, rankPctL: o.rl || 0, rankPctM: o.iv,
});

function setup() {
  const m = load();
  m.setAllSpecies(SPECIES);
  return m;
}

const namesIn = (html) => SPECIES.filter(s => html.includes(s.name)).map(s => s.name);

describe('Trading Tracker — Special Trades shortcut (v2: own dexView, union of not-owned + missing-shiny)', () => {
  it('sets dexView to "special"', () => {
    const m = setup();
    m.applyTradingShortcutSpecialTrades();
    expect(m.getDexView()).toBe('special');
  });

  it('is reported active immediately after being applied, and not once the view changes', () => {
    const m = setup();
    m.applyTradingShortcutSpecialTrades();
    expect(m.isSpecialTradesActive()).toBe(true);
    expect(m.isFriendshipFridaysActive()).toBe(false);
    m.setDexView('have');
    expect(m.isSpecialTradesActive()).toBe(false);
  });

  it('includes a completely unowned species (the gap that prompted this fix)', () => {
    const m = setup();
    m.setAllSpecies([
      { pokedex_number: 1, name: 'Bulbasaur', category: 'Regular', type1: 'Grass', type2: 'Poison', evolves_from: null, is_in_go: true },
      { pokedex_number: 4, name: 'Charmander', category: 'Regular', type1: 'Fire', type2: null, evolves_from: null, is_in_go: true },
    ]);
    // Owns something (Charmander) so allPokemon isn't empty, but owns zero Bulbasaur.
    m.setAllPokemon([{ pokeNum: '4', cp: 500, atkIV: 10, defIV: 10, staIV: 10, isShiny: false, isLucky: false, decision: 'keep' }]);
    m.applyTradingShortcutSpecialTrades();
    expect(m.getDexModalBodyHtml()).toContain('Bulbasaur');
  });

  it('includes an owned species that has no shiny yet (shiny released in GO)', () => {
    const m = setup();
    const SP = [{ pokedex_number: 1, name: 'Bulbasaur', category: 'Regular', type1: 'Grass', type2: 'Poison', evolves_from: null, is_in_go: true, is_shiny_available: true }];
    m.setAllSpecies(SP);
    m.setAllPokemon([{ pokeNum: '1', cp: 500, atkIV: 10, defIV: 10, staIV: 10, isShiny: false, isLucky: false, decision: 'keep' }]);
    m.applyTradingShortcutSpecialTrades();
    expect(m.getDexModalBodyHtml()).toContain('Bulbasaur');
  });

  it('excludes a species that already has an owned shiny', () => {
    const m = setup();
    const SP = [{ pokedex_number: 1, name: 'Bulbasaur', category: 'Regular', type1: 'Grass', type2: 'Poison', evolves_from: null, is_in_go: true, is_shiny_available: true }];
    m.setAllSpecies(SP);
    m.setAllPokemon([{ pokeNum: '1', cp: 500, atkIV: 10, defIV: 10, staIV: 10, isShiny: true, isLucky: false, decision: 'keep' }]);
    m.applyTradingShortcutSpecialTrades();
    expect(m.getDexModalBodyHtml()).not.toContain('Bulbasaur');
  });

  it('excludes an owned species with no shiny yet, when no shiny has been released for it in GO', () => {
    const m = setup();
    const SP = [{ pokedex_number: 1, name: 'Bulbasaur', category: 'Regular', type1: 'Grass', type2: 'Poison', evolves_from: null, is_in_go: true, is_shiny_available: false }];
    m.setAllSpecies(SP);
    m.setAllPokemon([{ pokeNum: '1', cp: 500, atkIV: 10, defIV: 10, staIV: 10, isShiny: false, isLucky: false, decision: 'keep' }]);
    m.applyTradingShortcutSpecialTrades();
    expect(m.getDexModalBodyHtml()).not.toContain('Bulbasaur');
  });
});

describe('Trading Tracker — Friendship Fridays shortcut', () => {
  it('sets missing view + Lucky ON + IV-under 90, hide-evolvable + hide-family, clears shiny', () => {
    const m = setup();
    m.applyTradingShortcutFriendshipFridays();
    expect(m.getDexView()).toBe('missing');
    expect(m.getDexQualLucky()).toBe(true);
    expect(m.getDexIvUnder()).toBe(90);
    expect(m.getDexQualShiny()).toBe(false);
    expect(m.getDexExcludeEvolvable()).toBe(true);
    expect(m.getDexExcludeFamily()).toBe(true);
  });

  it('is reported active immediately after being applied', () => {
    const m = setup();
    m.applyTradingShortcutFriendshipFridays();
    expect(m.isFriendshipFridaysActive()).toBe(true);
    expect(m.isSpecialTradesActive()).toBe(false);
  });

  it('is no longer reported active once ANY selector changes afterward', () => {
    const m = setup();
    m.applyTradingShortcutFriendshipFridays();
    expect(m.isFriendshipFridaysActive()).toBe(true);
    m.setDexIvUnder(80); // user tweaks the threshold manually
    expect(m.isFriendshipFridaysActive()).toBe(false);
  });
});

describe('Trading Tracker — "needs a better lucky" rule (generic Lucky + IV-under, confirmed against real examples)', () => {
  it('a species with no owned lucky at all appears in the list', () => {
    const m = setup();
    m.setAllPokemon([]);
    m.setDexQualLucky(true);
    m.setDexIvUnder(90);
    const body = { innerHTML: '' };
    m.renderDexMissingView(body, m.applyDexFilters(SPECIES));
    expect(namesIn(body.innerHTML)).toContain('Lunatone');
  });

  it('Lunatone example: a lucky at 87% IV% (Master) still appears — under 90%', () => {
    const m = setup();
    m.setAllPokemon([lucky({ pokeNum: 337, iv: 87 })]);
    m.setDexQualLucky(true);
    m.setDexIvUnder(90);
    const body = { innerHTML: '' };
    m.renderDexMissingView(body, m.applyDexFilters(SPECIES));
    expect(namesIn(body.innerHTML)).toContain('Lunatone');
  });

  it('Seviper example: a lucky at 99% Ultra but only 89% IV% (Master) still appears — the case that disproves "best rank in any league"', () => {
    const m = setup();
    m.setAllPokemon([lucky({ pokeNum: 336, iv: 89, ru: 99 })]);
    m.setDexQualLucky(true);
    m.setDexIvUnder(90);
    const body = { innerHTML: '' };
    m.renderDexMissingView(body, m.applyDexFilters(SPECIES));
    expect(namesIn(body.innerHTML)).toContain('Seviper');
  });

  it('a lucky at exactly the threshold no longer appears — satisfied', () => {
    const m = setup();
    m.setAllPokemon([lucky({ pokeNum: 337, iv: 90 })]);
    m.setDexQualLucky(true);
    m.setDexIvUnder(90);
    const body = { innerHTML: '' };
    m.renderDexMissingView(body, m.applyDexFilters(SPECIES));
    expect(namesIn(body.innerHTML)).not.toContain('Lunatone');
  });

  it('multiple luckies: species is satisfied as soon as ANY one of them meets the threshold', () => {
    const m = setup();
    m.setAllPokemon([
      lucky({ pokeNum: 337, cp: 1000, iv: 60 }),
      lucky({ pokeNum: 337, cp: 2000, iv: 95 }),
    ]);
    m.setDexQualLucky(true);
    m.setDexIvUnder(90);
    const body = { innerHTML: '' };
    m.renderDexMissingView(body, m.applyDexFilters(SPECIES));
    expect(namesIn(body.innerHTML)).not.toContain('Lunatone');
  });

  it('threshold is a live, generic value — under 80% behaves differently than under 90%', () => {
    const m = setup();
    m.setAllPokemon([lucky({ pokeNum: 337, iv: 85 })]);
    m.setDexQualLucky(true);
    m.setDexIvUnder(80);
    const body = { innerHTML: '' };
    m.renderDexMissingView(body, m.applyDexFilters(SPECIES));
    // 85% is not under 80%, so this species is already satisfied at this (lower) threshold.
    expect(namesIn(body.innerHTML)).not.toContain('Lunatone');
  });

  it('plain Lucky with no IV-under set is unchanged from pre-existing behaviour (regression)', () => {
    const m = setup();
    m.setAllPokemon([lucky({ pokeNum: 337, iv: 87 })]);
    m.setDexQualLucky(true);
    m.setDexIvUnder(null);
    const body = { innerHTML: '' };
    m.renderDexMissingView(body, m.applyDexFilters(SPECIES));
    // Plain "missing lucky" means "owns no lucky at all" — Lunatone owns one (any quality), so
    // it is NOT missing under the old, unmodified rule.
    expect(namesIn(body.innerHTML)).not.toContain('Lunatone');
  });

  it('a species not owned at all and no qualifiers set is unaffected (regression)', () => {
    const m = setup();
    m.setAllPokemon([lucky({ pokeNum: 337, iv: 87 })]);
    m.setDexQualLucky(false);
    m.setDexIvUnder(null);
    const body = { innerHTML: '' };
    m.renderDexMissingView(body, m.applyDexFilters(SPECIES));
    expect(namesIn(body.innerHTML).sort()).toEqual(['Bulbasaur', 'Seviper']);
  });
});

// v1, self-contained per Mariellen's request — bypasses dexView entirely, writes directly to
// #dex-modal-body/#dex-modal-sub. Real-world scenario: three separate physical Gyarados, one
// each at rounded-100% Little/Great/Ultra, must exclude Gyarados from the list — the case that
// rules out reusing #145's dexLeagueRank100 filter (which is OR-based: any ONE league at 100%
// already excludes a species, not "all three required").
describe('Trading Tracker — General Trading Days (v1)', () => {
  const GYARADOS_SPECIES = [
    { pokedex_number: 130, name: 'Gyarados', category: 'Regular', type1: 'Water', type2: 'Flying', evolves_from: 129, is_in_go: true },
    { pokedex_number: 1, name: 'Bulbasaur', category: 'Regular', type1: 'Grass', type2: 'Poison', evolves_from: null, is_in_go: true },
  ];
  const mon = (pokeNum, rl, rg, ru) => ({
    pokeNum: String(pokeNum), cp: 1000, atkIV: 10, defIV: 10, staIV: 10,
    rankPctL: rl, rankPctG: rg, rankPctU: ru, rankPctM: 0,
    isLucky: false, isShiny: false, isDynamax: false, isGigantamax: false, isHundo: false, decision: 'keep',
  });

  it("Mariellen's Gyarados example: three separate 100% individuals (one per league) excludes it from the list", () => {
    const m = load();
    m.setAllSpecies(GYARADOS_SPECIES);
    m.setAllPokemon([
      mon(130, 100, 0, 0),   // Little 100%
      mon(130, 0, 100, 0),   // Great 100%
      mon(130, 0, 0, 100),   // Ultra 100%
    ]);
    m.applyTradingShortcutGeneralTradingDays();
    expect(m.getDexModalBodyHtml()).not.toContain('Gyarados');
  });

  it('missing even ONE of the three leagues keeps the species on the list', () => {
    const m = load();
    m.setAllSpecies(GYARADOS_SPECIES);
    m.setAllPokemon([
      mon(130, 100, 100, 0), // Little + Great covered, Ultra not
    ]);
    m.applyTradingShortcutGeneralTradingDays();
    expect(m.getDexModalBodyHtml()).toContain('Gyarados');
  });

  it('a single individual covering all three leagues at once also satisfies it (not required to be different individuals)', () => {
    const m = load();
    m.setAllSpecies(GYARADOS_SPECIES);
    m.setAllPokemon([mon(130, 100, 100, 100)]);
    m.applyTradingShortcutGeneralTradingDays();
    expect(m.getDexModalBodyHtml()).not.toContain('Gyarados');
  });

  it('a completely unowned species is excluded (that gap belongs to the plain Missing view, not here)', () => {
    const m = load();
    m.setAllSpecies(GYARADOS_SPECIES);
    m.setAllPokemon([mon(130, 100, 100, 100)]); // Gyarados fully covered, Bulbasaur unowned
    m.applyTradingShortcutGeneralTradingDays();
    expect(m.getDexModalBodyHtml()).not.toContain('Bulbasaur');
  });

  it('a Legendary species is always excluded, even if it needs leagues', () => {
    const m = load();
    m.setAllSpecies([{ pokedex_number: 150, name: 'Mewtwo', category: 'Legendary', type1: 'Psychic', type2: null, is_in_go: true }]);
    m.setAllPokemon([mon(150, 0, 0, 0)]); // owned, needs all three
    m.applyTradingShortcutGeneralTradingDays();
    expect(m.getDexModalBodyHtml()).not.toContain('Mewtwo');
  });

  it('a species not yet released in GO is always excluded, even if it needs leagues', () => {
    const m = load();
    m.setAllSpecies([{ pokedex_number: 999, name: 'FutureMon', category: 'Regular', type1: 'Normal', type2: null, is_in_go: false }]);
    m.setAllPokemon([mon(999, 0, 0, 0)]);
    m.applyTradingShortcutGeneralTradingDays();
    expect(m.getDexModalBodyHtml()).not.toContain('FutureMon');
  });

  it('empty state renders cleanly when every species is fully covered', () => {
    const m = load();
    m.setAllSpecies([GYARADOS_SPECIES[0]]);
    m.setAllPokemon([mon(130, 100, 100, 100)]);
    m.applyTradingShortcutGeneralTradingDays();
    expect(m.getDexModalBodyHtml()).toContain('pv-modal-empty');
  });

  // v2 fixes, from feedback after using v1: sort by fewest-covered-first, and make Category/
  // Types keep working no matter when they're clicked (v1 bypassed dexView entirely, so a
  // Category click while viewing this list silently bounced back to Have/Missing).
  it('sorts by fewest leagues covered first (most urgent), alphabetical within the same count', () => {
    const THREE = [
      { pokedex_number: 1, name: 'ZzzNeedsNone', category: 'Regular', type1: 'Normal', type2: null, is_in_go: true },
      { pokedex_number: 2, name: 'AaaNeedsOne', category: 'Regular', type1: 'Normal', type2: null, is_in_go: true },
      { pokedex_number: 3, name: 'BbbNeedsThree', category: 'Regular', type1: 'Normal', type2: null, is_in_go: true },
      { pokedex_number: 4, name: 'CccNeedsThree', category: 'Regular', type1: 'Normal', type2: null, is_in_go: true },
    ];
    const m = load();
    m.setAllSpecies(THREE);
    m.setAllPokemon([
      mon(2, 100, 100, 0),   // needs 1 more (Ultra)
      // 1 (ZzzNeedsNone) fully covered — won't appear at all
      mon(1, 100, 100, 100),
      // 3 and 4 are owned (so they're not excluded as zero-owned) but need all three leagues
      mon(3, 0, 0, 0),
      mon(4, 0, 0, 0),
    ]);
    m.applyTradingShortcutGeneralTradingDays();
    const html = m.getDexModalBodyHtml();
    const posOf = name => html.indexOf(name);
    // Needs-3 species (Bbb, Ccc) should both sort before needs-1 species (Aaa).
    expect(posOf('BbbNeedsThree')).toBeGreaterThan(-1);
    expect(posOf('CccNeedsThree')).toBeGreaterThan(-1);
    expect(posOf('AaaNeedsOne')).toBeGreaterThan(-1);
    expect(posOf('BbbNeedsThree')).toBeLessThan(posOf('AaaNeedsOne'));
    expect(posOf('CccNeedsThree')).toBeLessThan(posOf('AaaNeedsOne'));
    // Within the same needs-3 count, alphabetical: Bbb before Ccc.
    expect(posOf('BbbNeedsThree')).toBeLessThan(posOf('CccNeedsThree'));
    expect(html).not.toContain('ZzzNeedsNone');
  });

  it('Category filter applies (via the same applyDexFilters as Have/Missing)', () => {
    const MIXED = [
      { pokedex_number: 130, name: 'Gyarados', category: 'Regular', type1: 'Water', type2: 'Flying', is_in_go: true },
      { pokedex_number: 151, name: 'Mew', category: 'Mythical', type1: 'Psychic', type2: null, is_in_go: true },
    ];
    const m = load();
    m.setAllSpecies(MIXED);
    // Both owned but with zero coverage — both would normally appear on the list. Mythical
    // (not Legendary) so the permanent Legendary-exclusion doesn't interfere with what this
    // test is actually checking (that Category filtering itself works).
    m.setAllPokemon([mon(130, 0, 0, 0), mon(151, 0, 0, 0)]);
    m.setDexCat('Mythical');
    m.applyTradingShortcutGeneralTradingDays();
    const html = m.getDexModalBodyHtml();
    expect(html).toContain('Mew');
    expect(html).not.toContain('Gyarados');
  });

  it('Category filter keeps applying even when clicked WHILE already viewing this list (the v1 bug)', () => {
    const MIXED = [
      { pokedex_number: 130, name: 'Gyarados', category: 'Regular', type1: 'Water', type2: 'Flying', is_in_go: true },
      { pokedex_number: 151, name: 'Mew', category: 'Mythical', type1: 'Psychic', type2: null, is_in_go: true },
    ];
    const m = load();
    m.setAllSpecies(MIXED);
    m.setAllPokemon([mon(130, 0, 0, 0), mon(151, 0, 0, 0)]);
    m.applyTradingShortcutGeneralTradingDays();
    expect(m.getDexModalBodyHtml()).toContain('Gyarados'); // both shown, no category filter yet
    // Simulate clicking the Mythical category button while this view is showing — this used
    // to call the plain renderDexModal() dispatcher, which in v1 always fell through to
    // Have/Missing since dexView never actually became 'general'.
    m.setDexCat('Mythical');
    m.renderDexModal();
    const html = m.getDexModalBodyHtml();
    expect(html).toContain('Mew');
    expect(html).not.toContain('Gyarados');
  });

  it('the shortcut button is reported active only while dexView is "general"', () => {
    const m = load();
    m.setAllSpecies(GYARADOS_SPECIES);
    m.setAllPokemon([mon(130, 100, 100, 100)]);
    expect(m.isGeneralTradingDaysActive()).toBe(false);
    m.applyTradingShortcutGeneralTradingDays();
    expect(m.isGeneralTradingDaysActive()).toBe(true);
    m.setDexView('have');
    expect(m.isGeneralTradingDaysActive()).toBe(false);
  });
});
