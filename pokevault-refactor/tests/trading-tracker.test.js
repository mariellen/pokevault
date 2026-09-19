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

describe('Trading Tracker — Special Trades shortcut', () => {
  it('sets missing view + shiny + shiny-available + hide-evolvable + hide-family, clears other qualifiers', () => {
    const m = setup();
    m.setDexIvUnder(90);
    m.setDexQualLucky(true);
    m.applyTradingShortcutSpecialTrades();
    expect(m.getDexView()).toBe('missing');
    expect(m.getDexQualShiny()).toBe(true);
    expect(m.getDexQualLucky()).toBe(false);
    expect(m.getDexIvUnder()).toBeNull();
    expect(m.getDexExcludeEvolvable()).toBe(true);
    expect(m.getDexExcludeFamily()).toBe(true);
  });

  it('is reported active immediately after being applied', () => {
    const m = setup();
    m.applyTradingShortcutSpecialTrades();
    expect(m.isSpecialTradesActive()).toBe(true);
    expect(m.isFriendshipFridaysActive()).toBe(false);
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
