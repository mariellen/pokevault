'use strict';
// Brief: issue-117-121-filter-buttons-and-collection-copy (v3.5.83)
//   Feature 1 (#117) — Lucky/Shiny/100% filter buttons, same pattern as existing Dmax/Gmax
//                       buttons but independent/combinable (no mutual exclusion).
//   Feature 2 (#121) — Collection Tracker (Missing view) per-row checkbox + copy icon, header
//                       running selection string with its own copy + clear-all.

const loader = require('./filter-buttons-and-dex-selection-loader');

const mon = (over) => Object.assign({
  name: 'Ditto', decision: 'review', isLucky: false, isShiny: false, isDynamax: false, isGigantamax: false,
  rankPctG: 0, rankPctU: 0, rankPctL: 0, rankPctM: 0, atkIV: 10, defIV: 10, staIV: 10,
}, over);
const fam = (name, members) => ({ key: name, primaryName: name, members });

// ════════════════════════════════════════════════════════════════════════════
// #117 — is100PctPokemon predicate
// ════════════════════════════════════════════════════════════════════════════
describe('#117 — is100PctPokemon', () => {
  let api;
  beforeAll(() => { api = loader.load().api; });

  it('100% Great rank qualifies', () => expect(api.is100PctPokemon(mon({ rankPctG: 100 }))).toBe(true));
  it('100% Ultra rank qualifies', () => expect(api.is100PctPokemon(mon({ rankPctU: 100 }))).toBe(true));
  it('100% Little rank qualifies', () => expect(api.is100PctPokemon(mon({ rankPctL: 100 }))).toBe(true));
  it('100% Master rank qualifies', () => expect(api.is100PctPokemon(mon({ rankPctM: 100 }))).toBe(true));
  it('15/15/15 hundo IV qualifies even with no 100% rank', () =>
    expect(api.is100PctPokemon(mon({ atkIV: 15, defIV: 15, staIV: 15 }))).toBe(true));
  it('99% rank and non-hundo IV does not qualify', () =>
    expect(api.is100PctPokemon(mon({ rankPctG: 99, atkIV: 15, defIV: 15, staIV: 14 }))).toBe(false));
});

// ════════════════════════════════════════════════════════════════════════════
// #117 — filter button toggles (family-level, via the real applyFilters())
// ════════════════════════════════════════════════════════════════════════════
describe('#117 — Lucky/Shiny/100% filter buttons', () => {
  let api, documentShim;
  beforeEach(() => { ({ api, documentShim } = loader.load()); });

  const luckyFam = fam('Alakazam', [mon({ name: 'Alakazam', isLucky: true })]);
  const shinyFam = fam('Gengar', [mon({ name: 'Gengar', isShiny: true })]);
  const plainFam = fam('Rattata', [mon({ name: 'Rattata' })]);
  const luckyDmaxFam = fam('Snorlax', [
    mon({ name: 'Snorlax', isLucky: true }),          // lucky but not dynamax
    mon({ name: 'Snorlax', isDynamax: true }),         // dynamax but not lucky
  ]);
  const luckyAndDmaxFam = fam('Machamp', [mon({ name: 'Machamp', isLucky: true, isDynamax: true })]);

  it('test 1: Lucky filter shows only families with a Lucky member', () => {
    api.setFamilies([luckyFam, shinyFam, plainFam]);
    api.toggleLuckyFilter(documentShim.getElementById('luckyFilterBtn'));
    expect(api.getFilteredFamilies().map(f => f.primaryName)).toEqual(['Alakazam']);
  });

  it('test 2: Shiny filter shows only families with a Shiny member', () => {
    api.setFamilies([luckyFam, shinyFam, plainFam]);
    api.toggleShinyFilter(documentShim.getElementById('shinyFilterBtn'));
    expect(api.getFilteredFamilies().map(f => f.primaryName)).toEqual(['Gengar']);
  });

  it('test 3: 100% filter shows only families with a qualifying member', () => {
    const hundoFam = fam('Blissey', [mon({ name: 'Blissey', atkIV: 15, defIV: 15, staIV: 15 })]);
    api.setFamilies([hundoFam, plainFam]);
    api.toggle100Filter(documentShim.getElementById('hundredFilterBtn'));
    expect(api.getFilteredFamilies().map(f => f.primaryName)).toEqual(['Blissey']);
  });

  it('test 4: Lucky + Shiny combined requires a Lucky AND a Shiny member present', () => {
    const shinyLuckyFam = fam('Umbreon', [mon({ name: 'Umbreon', isLucky: true, isShiny: true })]);
    api.setFamilies([luckyFam, shinyFam, shinyLuckyFam, plainFam]);
    api.toggleLuckyFilter(documentShim.getElementById('luckyFilterBtn'));
    api.toggleShinyFilter(documentShim.getElementById('shinyFilterBtn'));
    expect(api.getFilteredFamilies().map(f => f.primaryName)).toEqual(['Umbreon']);
  });

  it('test 5: Dynamax + Lucky combined keeps a family where the two traits are split across rows', () => {
    // Family-level: applyFilters only checks "some member has trait X" per filter — it doesn't
    // require the SAME row. Row-level narrowing to the single Lucky+Dynamax row is done by the
    // renderPage() _leagueFiltered AND-stacking (structurally identical to the existing Dmax/Gmax
    // row filter; renderPage itself is neutralized in this harness — see loader comment).
    api.setFamilies([luckyDmaxFam, luckyAndDmaxFam, plainFam]);
    api.toggleDmaxFilter(documentShim.getElementById('dmaxFilterBtn'));
    api.toggleLuckyFilter(documentShim.getElementById('luckyFilterBtn'));
    expect(api.getFilteredFamilies().map(f => f.primaryName).sort()).toEqual(['Machamp', 'Snorlax']);
  });

  it('test 6: clearing the filter (toggle off) restores all families', () => {
    api.setFamilies([luckyFam, shinyFam, plainFam]);
    const btn = documentShim.getElementById('luckyFilterBtn');
    api.toggleLuckyFilter(btn);
    expect(api.getFilteredFamilies().length).toBe(1);
    api.toggleLuckyFilter(btn); // toggle off
    expect(api.getFilterState().showLuckyOnly).toBe(false);
    expect(api.getFilteredFamilies().length).toBe(3);
  });

  it('Lucky/Shiny/100% do NOT mutually exclude Dmax/Gmax or each other (unlike Dmax↔Gmax)', () => {
    api.setFamilies([luckyAndDmaxFam]);
    api.toggleDmaxFilter(documentShim.getElementById('dmaxFilterBtn'));
    api.toggleLuckyFilter(documentShim.getElementById('luckyFilterBtn'));
    const state = api.getFilterState();
    expect(state.showDynamaxOnly).toBe(true);
    expect(state.showLuckyOnly).toBe(true); // toggling Lucky did not clear Dynamax
  });
});

// ════════════════════════════════════════════════════════════════════════════
// #121 — Collection Tracker selection (checkbox + copy icon + header string)
// ════════════════════════════════════════════════════════════════════════════
describe('#121 — Collection Tracker row selection', () => {
  let api, documentShim, writeTextCalls;
  beforeEach(() => { ({ api, documentShim, writeTextCalls } = loader.load()); });

  it('test 1: per-row copy sends the lowercase name to the clipboard', async () => {
    await api.copyDexRowName('Misdreavus');
    expect(writeTextCalls).toEqual(['misdreavus']);
  });

  it('test 2: ticking rows builds the header display string (comma + space, insertion order)', () => {
    api.toggleDexSelection('Misdreavus', true);
    api.toggleDexSelection('Mudkip', true);
    api.toggleDexSelection('Natu', true);
    expect([...api.getDexSelected()]).toEqual(['misdreavus', 'mudkip', 'natu']);
    expect(documentShim.getElementById('dex-selection-string').textContent).toBe('misdreavus, mudkip, natu');
    expect(documentShim.getElementById('dex-selection-bar').style.display).toBe('flex');
  });

  it('test 3: copying the header string uses comma-only (no spaces) for the clipboard', async () => {
    api.toggleDexSelection('Misdreavus', true);
    api.toggleDexSelection('Mudkip', true);
    api.toggleDexSelection('Natu', true);
    await api.copyDexSelection();
    expect(writeTextCalls).toEqual(['misdreavus,mudkip,natu']);
  });

  it('test 4: unticking a row updates the string immediately', () => {
    api.toggleDexSelection('Misdreavus', true);
    api.toggleDexSelection('Mudkip', true);
    api.toggleDexSelection('Misdreavus', false);
    expect([...api.getDexSelected()]).toEqual(['mudkip']);
    expect(documentShim.getElementById('dex-selection-string').textContent).toBe('mudkip');
  });

  it('test 5: Clear all empties the selection and hides the bar', () => {
    api.toggleDexSelection('Misdreavus', true);
    api.toggleDexSelection('Mudkip', true);
    api.clearDexSelection();
    expect(api.getDexSelected().size).toBe(0);
    expect(documentShim.getElementById('dex-selection-bar').style.display).toBe('none');
    expect(documentShim.getElementById('dex-selection-string').textContent).toBe('');
  });

  it('empty selection copy is a no-op (no empty string sent to clipboard)', async () => {
    await api.copyDexSelection();
    expect(writeTextCalls).toEqual([]);
  });
});
