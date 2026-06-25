'use strict';
// Sort comparator + ML placeholder fixes (#22 / #24 / #37), v3.5.58.
//   #22 — capped-slot tiebreak is deterministic across sessions/data sources
//         (isFavorite → CP → stableKey terminal; scan idx is NOT stable across exports).
//   #24/#37 — the grey "star-for-Master" ML placeholder must NOT land on a weak slot-less
//         member while a higher-IV member is already surfaced via a tentative slot.
// Synthetic CSVs through the real csvParser + loader (same approach as analyse.gmax_master).
const fs = require('fs');
const path = require('path');
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

const NUM = 125; // Electabuzz — single stage (Name (U)=self → final), like the gmax tests.
const ivAvg = (a, d, s) => (a + d + s) / 45 * 100;
// Electabuzz row. ru = Ultra rank (with dust du); o.cp/a/d/s/fav as given.
const elec = (o) => row({
  Index: String(o.idx), Name: 'Electabuzz', 'Pokemon Number': String(NUM),
  CP: String(o.cp != null ? o.cp : 1300),
  'Atk IV': String(o.a), 'Def IV': String(o.d), 'Sta IV': String(o.s),
  'IV Avg': ivAvg(o.a, o.d, o.s).toFixed(1), 'Level Min': '20', Dust: '5000',
  Favorite: o.fav ? '1' : '0',
  'Rank % (U)': o.ru != null ? String(o.ru) : '', 'Dust Cost (U)': o.ru != null ? String(o.du != null ? o.du : 10000) : '', 'Name (U)': 'Electabuzz',
});
const run = (specs) => analyse(toCSV(specs.map(elec))).pokemon.filter(p => p.name === 'Electabuzz');
const byIdx = (mons, specs, idx) => mons.find(p => p.cp === (specs.find(s => s.idx === idx).cp));

// ───────────────────────────────────────────────────────────────────────────
// Fix 1 — deterministic capped-slot tiebreak (#22)
// ───────────────────────────────────────────────────────────────────────────
describe('#22 — capped-slot tiebreak: isFavorite → CP → stable, deterministic', () => {
  // IVs of 10/9/8 = 60% — below the 70% Master floor, so these compete ONLY in the Ultra pool
  // (no confirmed-Master steal) and the capped tiebreak alone decides the UL winner.
  it('identical IV + rank + dust: the FAVOURITED one wins the UL slot, both runs', () => {
    const specs = [
      { idx: 1, cp: 1490, a: 10, d: 9, s: 8, ru: 95.0, du: 3000, fav: false },
      { idx: 2, cp: 1480, a: 10, d: 9, s: 8, ru: 95.0, du: 3000, fav: true },
    ];
    const winnerOf = () => run(specs).find(p => p.slots.includes('U')).cp;
    expect(winnerOf()).toBe(1480);     // favourited (idx2) wins
    expect(winnerOf()).toBe(1480);     // determinism — same winner on a second analyse()
  });

  it('identical IV + rank + dust, same favourite status: HIGHER CP wins the UL slot', () => {
    const specs = [
      { idx: 1, cp: 1495, a: 10, d: 9, s: 8, ru: 95.0, du: 3000 },
      { idx: 2, cp: 1480, a: 10, d: 9, s: 8, ru: 95.0, du: 3000 },
    ];
    const winner = run(specs).find(p => p.slots.includes('U'));
    expect(winner.cp).toBe(1495);
  });

  it('REGRESSION: dust tiebreak still fires BEFORE isFavorite (cheaper non-fav beats fav)', () => {
    const specs = [
      { idx: 1, cp: 1490, a: 10, d: 9, s: 8, ru: 95.0, du: 3000, fav: false }, // cheaper
      { idx: 2, cp: 1480, a: 10, d: 9, s: 8, ru: 95.0, du: 8000, fav: true },  // favourited but pricier
    ];
    const winner = run(specs).find(p => p.slots.includes('U'));
    expect(winner.cp).toBe(1490);      // cheaper non-favourite wins on dust, above the fav tiebreak
    expect(winner.isFavorite).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Fix 2 — ML placeholder no longer mis-grades (#24 / #37)
// ───────────────────────────────────────────────────────────────────────────
describe('#24/#37 — ML placeholder respects surfaced higher-IV members', () => {
  // Mirror Tauros Aqua: a high-IV member auto-wins a tentative M review, the next auto-wins a
  // tentative U review, and a 3rd slot-less member is LOWER IV → it must NOT get the grey star.
  it('lower-IV slot-less member gets NO grey placeholder when higher-IV members are surfaced', () => {
    const specs = [
      { idx: 1, cp: 1500, a: 14, d: 13, s: 11, ru: 60.0 }, // 84% IV → best ML → tentative M review
      { idx: 2, cp: 1490, a: 13, d: 12, s: 11, ru: 78.0 }, // 80% IV, best UL rank → tentative U review
      { idx: 3, cp: 1480, a: 12, d: 12, s: 11, ru: 40.0 }, // 78% IV, slot-less, low UL rank
    ];
    const mons = run(specs);
    expect(mons.filter(p => p.isMlPlaceholder).length).toBe(0); // the #24 bug: was 1, on the wrong mon
    const slotless = byIdx(mons, specs, 3);
    expect(slotless.isMlPlaceholder).toBeFalsy();
    expect(slotless.starType).not.toBe('grey');
    // the higher-IV members keep their tentative slots (not stolen by a placeholder)
    expect(byIdx(mons, specs, 1).slots).toContain('M');
    expect(byIdx(mons, specs, 2).slots).toContain('U');
  });

  it('PRESERVED: a family with only low-IV (<70) no-rank members still gets one placeholder', () => {
    const specs = [
      { idx: 1, cp: 600, a: 8, d: 7, s: 6 },  // 46.7% IV, no ranks → slot-less
      { idx: 2, cp: 550, a: 6, d: 6, s: 6 },  // 40.0% IV, no ranks → slot-less
    ];
    const mons = run(specs);
    expect(mons.filter(p => p.isMlPlaceholder).length).toBe(1);
    const best = byIdx(mons, specs, 1);
    expect(best.isMlPlaceholder).toBe(true);  // highest-IV slot-less wins it
    expect(best.starType).toBe('grey');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Real-data guards (export187.csv — gitignored personal export; skipped in CI)
// ───────────────────────────────────────────────────────────────────────────
describe('#24/#37 — real-data guards (export187)', () => {
  const exportPath = path.join(__dirname, 'export187.csv');
  const maybe = fs.existsSync(exportPath) ? it : it.skip;
  let pokemon;
  beforeAll(() => {
    if (!fs.existsSync(exportPath)) return;
    const { loadCSV } = require('./csvParser');
    pokemon = analyse(loadCSV(exportPath)).pokemon;
  });

  maybe('#24 — Tauros Aqua family has no grey ML placeholder; CP1581 (40% Ultra) is not grey', () => {
    const aqua = pokemon.filter(p => p.name === 'Tauros' && p.form === 'Aqua');
    expect(aqua.length).toBeGreaterThan(0);
    expect(aqua.filter(p => p.isMlPlaceholder).length).toBe(0);
    const cp1581 = aqua.find(p => p.cp === 1581);
    expect(cp1581.isMlPlaceholder).toBeFalsy();
    expect(cp1581.starType).not.toBe('grey');
  });

  maybe('#37 — Wyrdeer CP1149 (84%) is not grey-starred; Stantler CP912 (89%) is surfaced via M', () => {
    const wyrdeer = pokemon.find(p => p.name === 'Wyrdeer' && p.cp === 1149);
    expect(wyrdeer.isMlPlaceholder).toBeFalsy();
    expect(wyrdeer.starType).not.toBe('grey');
    const stantler = pokemon.find(p => p.name === 'Stantler' && p.cp === 912);
    expect(stantler.slots).toContain('M'); // surfaced as the Master candidate (tentative review)
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Tauros family separation (#24 "also check" — confirm, no fix expected)
// ───────────────────────────────────────────────────────────────────────────
describe('#24 — Tauros variant forms group into separate families (confirm only)', () => {
  const exportPath = path.join(__dirname, 'export187.csv');
  const maybe = fs.existsSync(exportPath) ? it : it.skip;
  maybe('Tauros Aqua / Blaze / Combat / Normal each form their own family', () => {
    const { loadCSV } = require('./csvParser');
    const { families } = analyse(loadCSV(exportPath));
    const taurosFams = families.filter(f => f.members.some(m => m.name === 'Tauros'));
    const forms = new Set(taurosFams.flatMap(f => f.members.filter(m => m.name === 'Tauros').map(m => m.form)));
    // every family's Tauros members share ONE form (no cross-form mixing)
    taurosFams.forEach(f => {
      const fForms = new Set(f.members.filter(m => m.name === 'Tauros').map(m => m.form));
      expect(fForms.size).toBe(1);
    });
    expect(forms.size).toBeGreaterThanOrEqual(2); // multiple distinct Tauros forms present
  });
});
