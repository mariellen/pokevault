'use strict';
// #73 — Purify indicator dedup. simulatePurify() fires per member, so a family with several
// qualifying shadows advertised the purify `p` on all of them. dedupePurifyCandidates() keeps at
// most one per FINAL evolution target: pre-evos (Amaura) collapse into the evolved keeper
// (Aurorus), but branching families (shadow Eevee → Vaporeon vs → Umbreon) keep one per target.
//
// Assertions are on purifyLeague / isPurifySlot (what the dedup mutates and what the `p` suffix +
// purify modal both gate on) rather than the exact nick — the M-league IV+2 purify path makes raw
// nicks noisy, so fixtures use IV≥90 to suppress it and isolate the intended league purify.

const loader = require('./loader');
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
const analyse = (rows) => loader.createWithOverrides({}).analyse(toCSV(rows)).pokemon;
const find = (mons, cp) => mons.find(p => p.cp === cp);
const isPurifyKeeper = (p) => !!p.purifyLeague && p.isPurifySlot;

// A shadow with a single qualifying purify league (Sha/Pur=2, rank≥90). IV≥90 so the M-league
// IV+2 purify path is skipped (it only fires when ivAvg<90).
const shadow = (name, num, cp, idx, lg, rank, evoName) => {
  const o = {
    Index: String(idx), Name: name, 'Pokemon Number': String(num), CP: String(cp),
    'Atk IV': '14', 'Def IV': '14', 'Sta IV': '13', 'IV Avg': '91.1',
    'Level Min': '25', Dust: '5000', 'Shadow/Purified': '1',
  };
  o[`Rank % (${lg})`] = String(rank);
  o[`Sha/Pur (${lg})`] = '2';
  if (evoName) o[`Name (${lg})`] = evoName;
  return row(o);
};

describe('#73 — one purify `p` per evolution target', () => {
  it('Amaura/Aurorus: only the evolved keeper (Aurorus) keeps purify; all Amaura pre-evos lose it', () => {
    const mons = analyse([
      shadow('Aurorus', 699, 2400, 1, 'U', 95.0, 'Aurorus'), // final evo, Ultra purify
      shadow('Amaura', 698, 1400, 2, 'G', 95.0, ''),         // pre-evo, Great purify
      shadow('Amaura', 698, 1420, 3, 'G', 97.0, ''),
      shadow('Amaura', 698, 1450, 4, 'G', 99.0, ''),
    ]);
    expect(isPurifyKeeper(find(mons, 2400))).toBe(true);     // Aurorus retains
    expect(isPurifyKeeper(find(mons, 1400))).toBe(false);    // Amaura all dropped
    expect(isPurifyKeeper(find(mons, 1420))).toBe(false);
    expect(isPurifyKeeper(find(mons, 1450))).toBe(false);
    // Cleared purifyLeague → no `p` suffix and no review purify nick for the losers
    [1400, 1420, 1450].forEach(cp => expect(find(mons, cp).purifyLeague).toBe(''));
  });

  it('one qualifying purify candidate in a family → unchanged (still a keeper)', () => {
    const mons = analyse([shadow('Aurorus', 699, 2400, 1, 'U', 95.0, 'Aurorus')]);
    expect(isPurifyKeeper(find(mons, 2400))).toBe(true);
  });

  it('no qualifying purify candidates → nobody flagged', () => {
    // Sha/Pur blank (Pokégenie says keep shadow) → simulatePurify never sets purifyLeague.
    const r = row({
      Index: '1', Name: 'Aurorus', 'Pokemon Number': '699', CP: '2400',
      'Atk IV': '14', 'Def IV': '14', 'Sta IV': '13', 'IV Avg': '91.1', 'Level Min': '25',
      Dust: '5000', 'Shadow/Purified': '1', 'Rank % (U)': '95.0', 'Name (U)': 'Aurorus',
    });
    const p = analyse([r])[0];
    expect(p.purifyLeague).toBe('');
    expect(p.isPurifySlot).toBeFalsy();
  });

  it('branching family (Eevee): shadows bound for different final evos each keep their `p`', () => {
    const mons = analyse([
      shadow('Eevee', 133, 1800, 1, 'U', 95.0, 'Vaporeon'), // → Vaporeon (Ultra)
      shadow('Eevee', 133, 1750, 2, 'U', 95.0, 'Jolteon'),  // → Jolteon (Ultra)
    ]);
    // Distinct terminal targets → not deduped against each other, even at the same league.
    expect(isPurifyKeeper(find(mons, 1800))).toBe(true);
    expect(isPurifyKeeper(find(mons, 1750))).toBe(true);
  });

  it('same target, two evolved copies → higher purified rank wins, other dropped', () => {
    const mons = analyse([
      shadow('Aurorus', 699, 2400, 1, 'U', 92.0, 'Aurorus'),
      shadow('Aurorus', 699, 2420, 2, 'U', 97.0, 'Aurorus'),
    ]);
    expect(isPurifyKeeper(find(mons, 2420))).toBe(true);   // higher rank retained
    expect(isPurifyKeeper(find(mons, 2400))).toBe(false);
  });
});
