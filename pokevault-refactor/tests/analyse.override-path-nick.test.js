'use strict';
// Issue #91 / #87 — the shiny/lucky sub-90 keepThreshold guard must hold on the
// OVERRIDE-APPLY path, not just on a fresh CSV analysis.
//
// Live bug: on cloud load the collection is analysed with isShiny=false, then a
// Supabase {is_shiny:true} override is applied AFTER analysis. supabase.js
// applyOverridesToPokemon recomputes the nick via buildNickname(p, getNickSlot(p)).
// The old getNickSlot lacked the guard, so a shiny with a sub-90 tentative league
// slot rendered UxieⒼ66※ instead of UxieⓇ76※.
//
// This test reproduces that exact sequence using the shared resolveNickSlot +
// buildNickname (getNickSlot delegates to resolveNickSlot, so this is the same
// code the app runs on the override path).

const loader = require('./loader');
const { analyse, resolveNickSlot, buildNickname } = loader;
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

// Mirror supabase.js applyOverridesToPokemon's per-Pokémon recompute for a nick-
// affecting flag: set the flag, push the special slot, then rebuild the nick via
// the shared resolver (getNickSlot delegates to resolveNickSlot).
function applyShinyOverrideLikeApp(p) {
  p.isShiny = true;
  if (!p.slots.includes('shiny')) p.slots.push('shiny');
  p.nickname = buildNickname(p, resolveNickSlot(p));
  return p;
}

describe('Issue #91 — override-path guard (shiny sub-90 does not get a league nick)', () => {
  // Faithful to the real collection: a Master-winning sibling (CP2555, IV 91.1)
  // takes the family's Master slot, so the CP1383 Uxie (IV 75.6, Great 65.6%)
  // falls to a sub-90 tentative Great slot — the exact live scenario.
  const uxieMasterSibling = row({
    Index: '9', Name: 'Uxie', 'Pokemon Number': '480', CP: '2555',
    'Atk IV': '14', 'Def IV': '14', 'Sta IV': '13',
    'IV Avg': '91.1', 'Level Min': '20', Dust: '11000',
  });
  // CP1383, IV 75.6 (10/11/13), Great rank 65.6%. Shiny-override target.
  const uxie1383 = row({
    Index: '1', Name: 'Uxie', 'Pokemon Number': '480', CP: '1383',
    'Atk IV': '10', 'Def IV': '11', 'Sta IV': '13',
    'IV Avg': '75.6', 'Level Min': '20', Dust: '2500',
    'Rank % (G)': '65.64', 'Dust Cost (G)': '8000', 'Name (G)': 'Uxie',
    'Rank % (U)': '59.34', 'Dust Cost (U)': '278000', 'Name (U)': 'Uxie',
  });
  const getUxie1383 = () =>
    analyse(toCSV([uxieMasterSibling, uxie1383])).pokemon.find(x => x.name === 'Uxie' && x.cp === 1383);

  it('starts (pre-override) as a sub-90 tentative Great holder (not a Ⓖ nick)', () => {
    const p = getUxie1383();
    expect(p.isShiny).toBeFalsy();
    expect(p.slots).toContain('G');
    expect(p.slotConfirmed).toBeFalsy();
    // Plain sub-90 tentative review holding nick — no league letter.
    expect(p.nickname).not.toMatch(/Ⓖ/);
  });

  it('after a shiny override is applied post-analysis → UxieⓇ76※, NOT UxieⒼ66※', () => {
    const p = getUxie1383();
    applyShinyOverrideLikeApp(p);
    expect(p.isShiny).toBe(true);
    expect(p.nickname).toMatch(/Ⓡ76/);   // holding nick
    expect(p.nickname).toMatch(/※/);      // shiny suffix
    expect(p.nickname).not.toMatch(/Ⓖ/);  // NOT a league nick
    expect(p.nickname).not.toMatch(/Ⓤ/);
  });

  it('resolveNickSlot returns "shiny" (not "G") for the sub-90 shiny Uxie', () => {
    const p = getUxie1383();
    p.isShiny = true;
    if (!p.slots.includes('shiny')) p.slots.push('shiny');
    expect(resolveNickSlot(p)).toBe('shiny');
  });

  it('a shiny WITH a confirmed (≥90) Great slot still resolves to the league nick', () => {
    // Guard against over-correction: a genuine confirmed slot winner keeps Ⓖ.
    // A hundo sibling takes Master, so the CP1500 Uxie (Great 92, sub-90 IV so it
    // does NOT win Master) holds a CONFIRMED Great slot.
    const uxieHundoSibling = row({
      Index: '8', Name: 'Uxie', 'Pokemon Number': '480', CP: '2600',
      'Atk IV': '15', 'Def IV': '15', 'Sta IV': '15',
      'IV Avg': '100.0', 'Level Min': '20', Dust: '11000',
    });
    const uxieConfirmedG = row({
      Index: '2', Name: 'Uxie', 'Pokemon Number': '480', CP: '1500',
      'Atk IV': '13', 'Def IV': '14', 'Sta IV': '13',
      'IV Avg': '88.9', 'Level Min': '20', Dust: '2500',
      'Rank % (G)': '92.0', 'Dust Cost (G)': '8000', 'Name (G)': 'Uxie',
    });
    const p = analyse(toCSV([uxieHundoSibling, uxieConfirmedG])).pokemon.find(x => x.name === 'Uxie' && x.cp === 1500);
    expect(p.slots).toContain('G');
    expect(p.slotConfirmed).toBe(true);
    p.isShiny = true;
    if (!p.slots.includes('shiny')) p.slots.push('shiny');
    expect(resolveNickSlot(p)).toBe('G');           // confirmed → league retained
    expect(buildNickname(p, resolveNickSlot(p))).toMatch(/Ⓖ92/);
  });
});

describe('Issue #87 — override-path guard (Lucky Dmax renders Ⓜ, not a sub-90 league)', () => {
  // Lucky Dmax Lugia #249, CP2108, IV 95.6 (15/14/14), Ultra 40.9%.
  const lugia = row({
    Index: '1', Name: 'Lugia', 'Pokemon Number': '249', CP: '2108',
    'Atk IV': '15', 'Def IV': '14', 'Sta IV': '14',
    'IV Avg': '95.6', 'Level Min': '20', Lucky: '1', Dust: '5000',
    'Rank % (U)': '40.9', 'Dust Cost (U)': '100000', 'Name (U)': 'Lugia',
  });

  it('Lucky Dmax with a sub-90 Ultra slot resolves to dynamax (Ⓜ), not Ⓤ', () => {
    // Analyse with the dynamax flag already set (Dmax is an override too, but the
    // wonDynamaxMaster flag is set inside analyse()).
    const key = ['249','','','15','14','14','_idx1'].join('|');
    const { analyse: analyseOv } = loader.createWithOverrides({ [key]: { is_dynamax: true } });
    const p = analyseOv(toCSV([lugia])).pokemon.find(x => x.name === 'Lugia');
    expect(p.isLucky).toBe(true);
    expect(p.wonDynamaxMaster).toBe(true);
    // Even on a bare resolveNickSlot call (the override recompute path), the power-up
    // flag wins over the sub-90 Ultra slot.
    expect(resolveNickSlot(p)).toBe('dynamax');
    expect(buildNickname(p, resolveNickSlot(p))).toMatch(/Ⓜ/);
    expect(buildNickname(p, resolveNickSlot(p))).not.toMatch(/Ⓤ/);
  });
});
