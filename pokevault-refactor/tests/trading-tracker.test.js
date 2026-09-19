'use strict';
// Tests for the Trading Tracker feature (Special Trades / Friendship Fridays shortcuts).
// Specified directly by Mariellen in conversation, not a written brief — see PR description
// for the full exchange, including the two real examples (Lunatone, Seviper) that pinned down
// the "Friendship Fridays" rule.

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
    m.setDexQualNeedsBetterLucky(true); // pre-existing state that should get cleared
    m.applyTradingShortcutSpecialTrades();
    expect(m.getDexView()).toBe('missing');
    expect(m.getDexQualShiny()).toBe(true);
    expect(m.getDexQualNeedsBetterLucky()).toBe(false);
    expect(m.getDexExcludeEvolvable()).toBe(true);
    expect(m.getDexExcludeFamily()).toBe(true);
  });
});

describe('Trading Tracker — Friendship Fridays shortcut', () => {
  it('sets missing view + the new needs-better-lucky flag, hide-evolvable + hide-family, clears shiny', () => {
    const m = setup();
    m.applyTradingShortcutFriendshipFridays();
    expect(m.getDexView()).toBe('missing');
    expect(m.getDexQualNeedsBetterLucky()).toBe(true);
    expect(m.getDexQualShiny()).toBe(false);
    expect(m.getDexExcludeEvolvable()).toBe(true);
    expect(m.getDexExcludeFamily()).toBe(true);
  });
});

describe('Trading Tracker — "needs a better lucky" rule (IV%-based, confirmed against real examples)', () => {
  it('a species with no owned lucky at all appears in the list', () => {
    const m = setup();
    m.setAllPokemon([]);
    m.setDexQualNeedsBetterLucky(true);
    const body = { innerHTML: '' };
    m.renderDexMissingView(body, m.applyDexFilters(SPECIES));
    expect(namesIn(body.innerHTML)).toContain('Lunatone');
  });

  it('Lunatone example: a lucky at 87% IV% (Master) still appears — under 90%', () => {
    const m = setup();
    m.setAllPokemon([lucky({ pokeNum: 337, iv: 87 })]);
    m.setDexQualNeedsBetterLucky(true);
    const body = { innerHTML: '' };
    m.renderDexMissingView(body, m.applyDexFilters(SPECIES));
    expect(namesIn(body.innerHTML)).toContain('Lunatone');
  });

  it('Seviper example: a lucky at 99% Ultra but only 89% IV% (Master) still appears — the case that disproves "best rank in any league"', () => {
    const m = setup();
    m.setAllPokemon([lucky({ pokeNum: 336, iv: 89, ru: 99 })]);
    m.setDexQualNeedsBetterLucky(true);
    const body = { innerHTML: '' };
    m.renderDexMissingView(body, m.applyDexFilters(SPECIES));
    expect(namesIn(body.innerHTML)).toContain('Seviper');
  });

  it('a lucky at exactly 90% IV% no longer appears — satisfied', () => {
    const m = setup();
    m.setAllPokemon([lucky({ pokeNum: 337, iv: 90 })]);
    m.setDexQualNeedsBetterLucky(true);
    const body = { innerHTML: '' };
    m.renderDexMissingView(body, m.applyDexFilters(SPECIES));
    expect(namesIn(body.innerHTML)).not.toContain('Lunatone');
  });

  it('multiple luckies: species is satisfied as soon as ANY one of them is >=90%, even if others are not', () => {
    const m = setup();
    m.setAllPokemon([
      lucky({ pokeNum: 337, cp: 1000, iv: 60 }),
      lucky({ pokeNum: 337, cp: 2000, iv: 95 }),
    ]);
    m.setDexQualNeedsBetterLucky(true);
    const body = { innerHTML: '' };
    m.renderDexMissingView(body, m.applyDexFilters(SPECIES));
    expect(namesIn(body.innerHTML)).not.toContain('Lunatone');
  });

  it('a species not owned at all and not lucky-related is unaffected by the flag being off (regression)', () => {
    const m = setup();
    m.setAllPokemon([lucky({ pokeNum: 337, iv: 87 })]);
    m.setDexQualNeedsBetterLucky(false);
    m.setDexQualLucky(false);
    const body = { innerHTML: '' };
    m.renderDexMissingView(body, m.applyDexFilters(SPECIES));
    // Plain missing (no qualifiers): Lunatone IS owned (has a lucky individual), so it's not
    // "missing" under the default owned/unowned rule — only Seviper and Bulbasaur are.
    expect(namesIn(body.innerHTML).sort()).toEqual(['Bulbasaur', 'Seviper']);
  });
});
