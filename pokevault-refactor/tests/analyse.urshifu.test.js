'use strict';
// Feature Batch June 2026 — F5: Urshifu — keep both forms independently.
//
// Urshifu has two battle forms — Single Strike Style (Fighting/Dark) and Rapid
// Strike Style (Fighting/Water). They battle differently and must each be kept
// independently (like Shadow/Non-Shadow). The fix adds 'Single Strike' and
// 'Rapid Strike' to FORM_SPLIT_FORMS so each form gets its OWN family key
// (pokeNum|form) and therefore its own slot/keeper consideration.
//
// Self-contained synthetic CSV through the real csvParser + loader (same approach
// as analyse.branching_evo.test.js). Run with:
//   npx jest tests/analyse.urshifu.test.js --env=node

const loader = require('./loader');
const { analyse } = loader;
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

const urshifu = (o) => row({
  Index: String(o.idx), Name: 'Urshifu', Form: o.form, 'Pokemon Number': '892', CP: String(o.cp),
  'Atk IV': String(o.a ?? 14), 'Def IV': String(o.d ?? 14), 'Sta IV': String(o.s ?? 14),
  'IV Avg': (o.iv ?? 93.3).toFixed(1), 'Level Min': '30', 'Level Max': '40', Dust: '1000',
  Favorite: o.fav ? '1' : '0', Catch: '',
  'Rank % (U)': o.ru != null ? String(o.ru) : '', 'Name (U)': 'Urshifu',
});

describe('F5 — Urshifu Single Strike vs Rapid Strike form split', () => {
  let res;
  beforeAll(() => {
    res = analyse(toCSV([
      urshifu({ idx: 1, form: 'Single Strike', cp: 2400, a: 15, d: 15, s: 15, iv: 100, fav: true }),
      urshifu({ idx: 2, form: 'Rapid Strike',  cp: 2350, a: 14, d: 14, s: 13, iv: 91.1 }),
    ]));
  });

  it('places the two forms in SEPARATE families (key = pokeNum|form)', () => {
    const fams = res.families.filter(f => f.members.some(p => p.name === 'Urshifu'));
    expect(fams.length).toBe(2);
    const keys = fams.map(f => f.key).sort();
    expect(keys).toEqual(['892|Rapid Strike', '892|Single Strike']);
  });

  it('each family contains exactly one Urshifu form', () => {
    const single = res.families.find(f => f.key === '892|Single Strike');
    const rapid  = res.families.find(f => f.key === '892|Rapid Strike');
    expect(single).toBeTruthy();
    expect(rapid).toBeTruthy();
    expect(single.members.length).toBe(1);
    expect(rapid.members.length).toBe(1);
    expect(single.members[0].form).toBe('Single Strike');
    expect(rapid.members[0].form).toBe('Rapid Strike');
  });

  it('both forms are kept (Urshifu is Legendary/protected) — neither traded away', () => {
    const all = res.pokemon.filter(p => p.name === 'Urshifu');
    expect(all.length).toBe(2);
    all.forEach(p => expect(p.decision).not.toBe('trade'));
  });

  it('does NOT merge two same-form Urshifu into separate families', () => {
    const res2 = analyse(toCSV([
      urshifu({ idx: 1, form: 'Single Strike', cp: 2400, fav: true }),
      urshifu({ idx: 2, form: 'Single Strike', cp: 2350 }),
    ]));
    const fams = res2.families.filter(f => f.members.some(p => p.name === 'Urshifu'));
    expect(fams.length).toBe(1);
    expect(fams[0].members.length).toBe(2);
  });
});
