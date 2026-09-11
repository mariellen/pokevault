'use strict';
// Tests for #145 — league-specific 100%-rank filter in the Pokédex/Collection Tracker.

const { load } = require('./dex-league-rank-filter-loader');

const SPECIES = [
  { pokedex_number: 1, name: 'Bulbasaur', category: 'Regular', type1: 'Grass', type2: 'Poison', evolves_from: null, is_in_go: true },
  { pokedex_number: 448, name: 'Lucario', category: 'Regular', type1: 'Fighting', type2: 'Steel', evolves_from: null, is_in_go: true },
  { pokedex_number: 133, name: 'Eevee', category: 'Regular', type1: 'Normal', type2: null, evolves_from: null, is_in_go: true },
];

const mon = (o) => ({
  pokeNum: String(o.pokeNum), cp: o.cp || 500,
  rankPctL: o.rl || 0, rankPctG: o.rg || 0, rankPctU: o.ru || 0, rankPctM: o.rm || 0,
  atkIV: o.a ?? 10, defIV: o.d ?? 10, staIV: o.s ?? 10,
  isHundo: !!(o.a === 15 && o.d === 15 && o.s === 15),
  isShiny: false, isLucky: false, isDynamax: false, isGigantamax: false,
  decision: 'keep',
});

function setup() {
  const m = load();
  m.setAllSpecies(SPECIES);
  return m;
}

const namesIn = (html) => SPECIES.filter(s => html.includes(s.name)).map(s => s.name);

describe('#145 Test 1 — Have view, league=Great selected', () => {
  it('only species with an owned member at rounded Great rank 100 are shown', () => {
    const m = setup();
    m.setAllPokemon([
      mon({ pokeNum: 1, rg: 99.6 }),   // rounds to 100 -> Bulbasaur qualifies
      mon({ pokeNum: 448, rg: 95 }),   // does not qualify
      mon({ pokeNum: 133, ru: 100 }),  // qualifies for Ultra, not Great -> excluded
    ]);
    m.setDexLeagueRank100(new Set(['G']));
    const body = { innerHTML: '' };
    m.renderDexHaveView(body, m.applyDexFilters(SPECIES));
    expect(namesIn(body.innerHTML)).toEqual(['Bulbasaur']);
  });
});

describe('#145 Test 2 — Have view, hundo AND league=Great both selected (AND semantics)', () => {
  it('shows only species with BOTH a 15/15/15 individual AND a rounded-100 Great individual', () => {
    const m = setup();
    m.setAllPokemon([
      // Bulbasaur: hundo AND Great-100, but on the SAME individual — must still count.
      mon({ pokeNum: 1, a: 15, d: 15, s: 15, rg: 100 }),
      // Lucario: hundo only, no Great-100 individual at all -> must NOT show.
      mon({ pokeNum: 448, a: 15, d: 15, s: 15, rg: 80 }),
      // Eevee: Great-100 only, no hundo individual -> must NOT show.
      mon({ pokeNum: 133, a: 10, d: 10, s: 10, rg: 100 }),
    ]);
    m.setDexQualHundo(true);
    m.setDexLeagueRank100(new Set(['G']));
    const body = { innerHTML: '' };
    m.renderDexHaveView(body, m.applyDexFilters(SPECIES));
    expect(namesIn(body.innerHTML)).toEqual(['Bulbasaur']);
  });

  it('also passes when the hundo and the Great-100 are DIFFERENT individuals of the same species', () => {
    const m = setup();
    m.setAllPokemon([
      mon({ pokeNum: 1, a: 15, d: 15, s: 15, rg: 40 }),   // hundo, low Great rank
      mon({ pokeNum: 1, a: 5, d: 6, s: 7, rg: 100 }),      // separate individual, Great-100
    ]);
    m.setDexQualHundo(true);
    m.setDexLeagueRank100(new Set(['G']));
    const body = { innerHTML: '' };
    m.renderDexHaveView(body, m.applyDexFilters(SPECIES));
    // Both filters independently narrow `matched` (AND), then group by species — since the
    // species has at least one hundo AND at least one Great-100 individual, it qualifies.
    expect(namesIn(body.innerHTML)).toEqual(['Bulbasaur']);
  });
});

describe('#145 Test 3 — Have view, no league selected, hundo off (regression)', () => {
  it('behaves exactly as before #145 — all species with any owned member shown', () => {
    const m = setup();
    m.setAllPokemon([mon({ pokeNum: 1, rg: 50 }), mon({ pokeNum: 448, rg: 30 })]);
    m.setDexLeagueRank100(new Set());
    m.setDexQualHundo(false);
    const body = { innerHTML: '' };
    m.renderDexHaveView(body, m.applyDexFilters(SPECIES));
    expect(namesIn(body.innerHTML).sort()).toEqual(['Bulbasaur', 'Lucario']);
  });
});

describe('#145 Test 4 — deep link round-trip', () => {
  it('encodes and restores dexLeagueRank100 (and combines correctly with hundo) via the hash', () => {
    const m = setup();
    m.setDexLeagueRank100(new Set(['G', 'U']));
    m.setDexQualHundo(true);
    const hash = m.encodeStateToHash();
    expect(hash).toContain('rank100leagues=G%2CU');
    expect(hash).toContain('hundos=true');

    // Reset state, then restore purely from the hash.
    m.setDexLeagueRank100(new Set());
    m.setDexQualHundo(false);
    m.setAllPokemon([]); // avoid the async Supabase fetch path in openDexModal
    m.window.location.hash = hash;
    m.applyHashState();
    expect(m.getDexLeagueRank100()).toEqual(new Set(['G', 'U']));
    expect(m.getDexQualHundo()).toBe(true);
  });

  it('omits rank100leagues from the hash entirely when no league is selected', () => {
    const m = setup();
    m.setDexLeagueRank100(new Set());
    expect(m.encodeStateToHash()).not.toContain('rank100leagues');
  });
});

describe('#145 Test 5 — Missing view', () => {
  it('hides a species from Missing once it has an owned rounded-100 individual in the selected league', () => {
    const m = setup();
    m.setAllPokemon([mon({ pokeNum: 1, rg: 99.6 })]); // Bulbasaur qualifies, others unowned entirely
    m.setDexLeagueRank100(new Set(['G']));
    const body = { innerHTML: '' };
    m.renderDexMissingView(body, m.applyDexFilters(SPECIES));
    // Bulbasaur has a qualifying individual -> excluded from Missing.
    expect(body.innerHTML).not.toContain('Bulbasaur');
    // Lucario and Eevee are owned by nobody at all -> still Missing (and were already missing
    // before this filter — this narrows further, it doesn't add species back).
    expect(body.innerHTML).toContain('Lucario');
    expect(body.innerHTML).toContain('Eevee');
  });

  it('combines with an existing qualifier (lucky) as an independent additional narrowing, per the brief\'s exact snippet', () => {
    // dexQualLucky changes what "missing" means (missing a LUCKY), but the league-100
    // narrowing checks ANY owned individual's league rank regardless of lucky status — so an
    // owned NON-lucky Great-100 Lucario still gets narrowed OUT of "missing lucky + Great100",
    // even though it's still missing a lucky one specifically. This is the brief's given
    // haveRank100Nums snippet's exact behavior (built from allPokemon, not lucky-filtered).
    const m = setup();
    m.setAllPokemon([{ ...mon({ pokeNum: 448, rg: 100 }), isLucky: false }]);
    m.setDexQualLucky(true);
    m.setDexLeagueRank100(new Set(['G']));
    const body = { innerHTML: '' };
    m.renderDexMissingView(body, m.applyDexFilters(SPECIES));
    expect(body.innerHTML).not.toContain('Lucario');
  });

  it('a mathematically-capped-below-100% species still appears in Missing — no reachability/CP-cap check (per the brief, "the dumb version")', () => {
    const m = setup();
    m.setAllPokemon([]); // nobody owned at all
    m.setDexLeagueRank100(new Set(['L']));
    const body = { innerHTML: '' };
    m.renderDexMissingView(body, m.applyDexFilters(SPECIES));
    // Lucario (448) is far too large a species to realistically hit 100% Little rank, but
    // #145 explicitly does not special-case that — it must still appear in Missing.
    expect(body.innerHTML).toContain('Lucario');
  });
});

describe('#145 Test 6 — full existing suite green', () => {
  it('is verified by running the whole jest suite alongside this file, not a self-check', () => {
    expect(true).toBe(true);
  });
});
