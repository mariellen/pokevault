'use strict';
// Fix 5a regression — Gender-locked species: missing gender must not produce evo slot.
// Repro: Combee CP:201 (male) was assigned VespiqueⓊ98 because Gender column was blank
// in the import. Engine now treats blank-gender gender-locked species as non-evolvable.

const { parseCSV } = require('./csvParser');
const loader = require('./loader');
const { analyse } = loader;

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

const combeeRow = (gender, idx = 1) => row({
  Index: String(idx), Name: 'Combee', 'Pokemon Number': '415', Gender: gender, CP: '201',
  'Atk IV': '15', 'Def IV': '15', 'Sta IV': '14', 'IV Avg': '97.8', 'Level Min': '10',
  Dust: '1000',
  'Rank % (G)': '98.0', 'Dust Cost (G)': '50000', 'Name (G)': 'Vespiquen',
  'Rank % (U)': '98.0', 'Dust Cost (U)': '75000', 'Name (U)': 'Vespiquen',
  'Rank % (L)': '98.0', 'Dust Cost (L)': '50000', 'Name (L)': 'Vespiquen',
});

// ─── Combee with missing gender ────────────────────────────────────────────────

describe('Fix 5a — Combee: blank gender must not assign Vespiquen evo slot', () => {
  let p;
  beforeAll(() => {
    const res = analyse(toCSV([combeeRow('')]));
    p = res.pokemon.find(q => q.name === 'Combee');
  });

  it('evolvedNameG is cleared when gender is blank', () => {
    expect(p.evolvedNameG).toBe('');
  });
  it('evolvedNameU is cleared when gender is blank', () => {
    expect(p.evolvedNameU).toBe('');
  });
  it('evolvedNameL is cleared when gender is blank', () => {
    expect(p.evolvedNameL).toBe('');
  });
  it('genderUnknownLocked flag is set', () => {
    expect(p.genderUnknownLocked).toBe(true);
  });
  it('no Vespiquen league slot assigned', () => {
    const leagueSlots = p.slots.filter(s => ['G','U','L'].includes(s));
    expect(leagueSlots).toHaveLength(0);
  });
  it('nick does not mention Vespiquen', () => {
    expect(p.nickname).not.toMatch(/Vespi/i);
  });
});

// ─── Female Combee still gets Vespiquen evo target ────────────────────────────

describe('Fix 5a — Female Combee (♀): evo target preserved normally', () => {
  let p;
  beforeAll(() => {
    const res = analyse(toCSV([combeeRow('♀')]));
    p = res.pokemon.find(q => q.name === 'Combee');
  });

  it('evolvedNameG is Vespiquen', () => {
    expect(p.evolvedNameG).toBe('Vespiquen');
  });
  it('genderUnknownLocked is false', () => {
    expect(p.genderUnknownLocked).toBeFalsy();
  });
});

// ─── Male Combee also gets evo cleared (male can't evolve) ────────────────────
// Note: male Combee normally has blank evo cols in Pokégenie — this tests the case where
// the CSV has evo data but gender is explicit male (Pokégenie export inconsistency).

describe('Fix 5a — Male Combee (♂): gender present, Pokégenie normally exports no evo', () => {
  let p;
  beforeAll(() => {
    // Male Combee with Vespiquen in evo columns (simulating bad CSV data)
    const res = analyse(toCSV([combeeRow('♂')]));
    p = res.pokemon.find(q => q.name === 'Combee');
  });

  it('genderUnknownLocked is false (gender is known, just wrong evo in CSV)', () => {
    // The GENDER_LOCKED_EVO guard only fires for blank gender — explicit ♂ is not blank.
    // Male Combee's evo cols in real Pokégenie export are already blank; this test just
    // confirms the flag doesn't fire for non-blank gender.
    expect(p.genderUnknownLocked).toBeFalsy();
  });
});
