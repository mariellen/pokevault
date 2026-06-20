'use strict';
// Regression tests for GitHub issue #23 — "Active filter lost when sort order changes".
//
// Root cause: sortFamilyBy() rebuilt a family's <tbody> from ALL fam.members,
// bypassing the row-level filtering that renderFamilyFiltered() applies. A column
// re-sort therefore re-revealed rows the active filter had hidden.
//
// Fix: both render paths now share one predicate, isMemberVisible(p, fam). These
// tests exercise that predicate the same way sortFamilyBy now does — render only
// fam.members.filter(p => isMemberVisible(p, fam)) — and assert that every active
// filter survives a (simulated) sort.

const { load } = require('./filter-sort-loader');
const { isMemberVisible } = load();

// A member carries the per-row filter flags renderPage() computes, plus the few
// fields the predicate reads. _leagueFiltered encodes the league / Dmax / Gmax
// filters; that is exactly what renderPage sets on non-qualifying rows.
function member(name, extra = {}) {
  return {
    name,
    _leagueFiltered: false,
    hidden: false,
    isExpensiveWinner: false,
    isDynamax: false,
    evolvedNameG: '', evolvedNameU: '', evolvedNameL: '', targetEvo: '',
    ...extra,
  };
}

function family(primaryName, members) {
  return { key: primaryName, primaryName, members };
}

// What sortFamilyBy now renders: the visible subset of fam.members, in order.
function rowsAfterSort(fam, opts) {
  return fam.members.filter(p => isMemberVisible(p, fam, opts)).map(p => p.name);
}

describe('#23 — filters survive a sort-order change', () => {
  test('1. Dynamax filter → sort → only Dynamax rows remain', () => {
    // renderPage marks non-Dynamax rows _leagueFiltered when the Dmax filter is on.
    const fam = family('Charizard', [
      member('Charizard', { isDynamax: true }),
      member('Charizard', { _leagueFiltered: true }), // non-Dmax → filtered
      member('Charmeleon', { _leagueFiltered: true }),
    ]);
    expect(rowsAfterSort(fam)).toEqual(['Charizard']);
  });

  test('2. Stars filter (family-level) → sort → every row of a shown family stays', () => {
    // The Stars filter removes whole families in applyFilters; a family that passes
    // shows all its rows. Sorting it must keep them all.
    const fam = family('Gardevoir', [
      member('Gardevoir'),
      member('Kirlia'),
      member('Ralts'),
    ]);
    expect(rowsAfterSort(fam)).toEqual(['Gardevoir', 'Kirlia', 'Ralts']);
  });

  test('3. Little League filter → sort → only qualifying rows remain', () => {
    const fam = family('Marill', [
      member('Marill'),                               // qualifies
      member('Azumarill', { _leagueFiltered: true }), // filtered out
    ]);
    expect(rowsAfterSort(fam)).toEqual(['Marill']);
  });

  test('4. Multiple filters → sort → all still active (combined _leagueFiltered + practical)', () => {
    const fam = family('Medicham', [
      member('Medicham'),                                   // visible
      member('Meditite', { _leagueFiltered: true }),        // hidden by league/Dmax
      member('Medicham', { isExpensiveWinner: true }),      // hidden by practical
    ]);
    expect(rowsAfterSort(fam, { practical: true })).toEqual(['Medicham']);
  });

  test('5. Regression: no filter → sort → all rows still show (no false filtering)', () => {
    const fam = family('Dragonite', [
      member('Dragonite'),
      member('Dragonair'),
      member('Dratini'),
    ]);
    expect(rowsAfterSort(fam)).toEqual(['Dragonite', 'Dragonair', 'Dratini']);
  });
});

describe('#23 — isMemberVisible predicate details', () => {
  test('manual per-row hide is respected', () => {
    const fam = family('Snorlax', [member('Snorlax', { hidden: true }), member('Munchlax')]);
    expect(rowsAfterSort(fam)).toEqual(['Munchlax']);
  });

  test('practical mode only hides expensive winners when enabled', () => {
    const fam = family('Tyranitar', [
      member('Tyranitar', { isExpensiveWinner: true }),
      member('Pupitar'),
    ]);
    expect(rowsAfterSort(fam, { practical: false })).toEqual(['Tyranitar', 'Pupitar']);
    expect(rowsAfterSort(fam, { practical: true })).toEqual(['Pupitar']);
  });

  test('evo-target search hides family rows that do not match the term', () => {
    // Searching "Sylveon" against an Eevee family: only the Eevee recommended for
    // Sylveon (evolvedNameG) stays; a plain Eevee with no matching evo is hidden.
    const fam = family('Eevee', [
      member('Eevee', { evolvedNameG: 'Sylveon' }),
      member('Eevee', { evolvedNameG: 'Vaporeon' }),
    ]);
    expect(rowsAfterSort(fam, { term: 'sylveon' })).toEqual(['Eevee']);
  });

  test('plain name search keeps the whole family visible (no row hiding)', () => {
    const fam = family('Eevee', [
      member('Eevee', { evolvedNameG: 'Sylveon' }),
      member('Eevee', { evolvedNameG: 'Vaporeon' }),
    ]);
    // term matches the family name itself → not an evo-only match → all rows shown
    expect(rowsAfterSort(fam, { term: 'eevee' })).toEqual(['Eevee', 'Eevee']);
  });

  test('order is preserved among visible rows after a sort', () => {
    // Simulate sortFamilyBy having reordered fam.members by CP desc; visible subset
    // must come out in that same order.
    const fam = family('Gible', [
      member('Garchomp'),
      member('Gabite', { _leagueFiltered: true }),
      member('Gible'),
    ]);
    expect(rowsAfterSort(fam)).toEqual(['Garchomp', 'Gible']);
  });
});
