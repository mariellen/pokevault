'use strict';
// Task 5 — Tyrogue IV-based evo correction (brief 2026-05-29).
// Pokégenie can report the wrong evolution for equal ATK=DEF case.
// PokéVault overrides the CSV evo using GO's IV-based rules:
//   ATK > DEF → Hitmonlee
//   DEF > ATK → Hitmonchan
//   ATK = DEF → Hitmontop

const { parseCSV } = require('./csvParser');
const loader = require('./loader');
const { analyse } = loader;

// Minimal CSV rows — only columns analyse() uses
const HEADER = 'Index,Name,Form,Pokemon Number,Gender,CP,HP,Atk IV,Def IV,Sta IV,IV Avg,Level Min,Level Max,Quick Move,Charge Move,Charge Move 2,Scan Date,Original Scan Date,Catch Date,Weight,Height,Lucky,Shadow/Purified,Favorite,Dust,Rank % (G),Rank # (G),Stat Prod (G),Dust Cost (G),Candy Cost (G),Name (G),Form (G),Sha/Pur (G),Rank % (U),Rank # (U),Stat Prod (U),Dust Cost (U),Candy Cost (U),Name (U),Form (U),Sha/Pur (U),Rank % (L),Rank # (L),Stat Prod (L),Dust Cost (L),Candy Cost (L),Name (L),Form (L),Sha/Pur (L),Marked for PvP use';

function tyrogueRow(idx, atkIV, defIV, staIV, csvEvoG, csvEvoU) {
  // Minimal row with wrong evo name in CSV columns — PokéVault should correct it
  return `${idx},Tyrogue,,236,,300,50,${atkIV},${defIV},${staIV},70.0,10.0,10.0,,,, 2026-01-01 10:00,2026-01-01 10:00,2025-01-01,,,0,0,0,5000,90%,100,95%,75000,5,${csvEvoG},,0,85%,200,90%,100000,5,${csvEvoU},,0,,,,,,,,,0,`;
}

function runAnalysis(rows) {
  const csvText = HEADER + '\n' + rows.join('\n');
  const csv = parseCSV(csvText);
  return analyse(csv);
}

// ─── Test 1: ATK=DEF (15/15/14) → Hitmontop, even if CSV says Hitmonchan ────

describe('Task 5 — Tyrogue 15/15/14 (ATK=DEF) → Hitmontop', () => {
  let p;
  beforeAll(() => {
    // CSV reports Hitmonchan (Pokégenie equality bug) — PokéVault should override to Hitmontop
    const result = runAnalysis([tyrogueRow(1, 15, 15, 14, 'Hitmonchan', 'Hitmonchan')]);
    p = result.pokemon[0];
  });

  it('evolvedNameG corrected to Hitmontop (was Hitmonchan in CSV)', () => {
    expect(p.evolvedNameG).toBe('Hitmontop');
  });
  it('evolvedNameU corrected to Hitmontop', () => {
    expect(p.evolvedNameU).toBe('Hitmontop');
  });
});

// ─── Test 2: ATK>DEF (14/12/11) → Hitmonlee ────────────────────────────────

describe('Task 5 — Tyrogue 14/12/11 (ATK>DEF) → Hitmonlee', () => {
  let p;
  beforeAll(() => {
    const result = runAnalysis([tyrogueRow(2, 14, 12, 11, 'Hitmonlee', 'Hitmonlee')]);
    p = result.pokemon[0];
  });

  it('evolvedNameG is Hitmonlee (ATK > DEF)', () => {
    expect(p.evolvedNameG).toBe('Hitmonlee');
  });
});

// ─── Test 3: DEF>ATK (10/14/12) → Hitmonchan ───────────────────────────────

describe('Task 5 — Tyrogue 10/14/12 (DEF>ATK) → Hitmonchan', () => {
  let p;
  beforeAll(() => {
    const result = runAnalysis([tyrogueRow(3, 10, 14, 12, 'Hitmonchan', 'Hitmonchan')]);
    p = result.pokemon[0];
  });

  it('evolvedNameG is Hitmonchan (DEF > ATK)', () => {
    expect(p.evolvedNameG).toBe('Hitmonchan');
  });
});

// ─── Test 4: ATK=DEF=0 (0/0/0 nundo) → Hitmontop ──────────────────────────

describe('Task 5 — Tyrogue 0/0/0 nundo (ATK=DEF=0) → Hitmontop', () => {
  let p;
  beforeAll(() => {
    const result = runAnalysis([tyrogueRow(4, 0, 0, 0, 'Hitmonchan', 'Hitmonchan')]);
    p = result.pokemon[0];
  });

  it('evolvedNameG is Hitmontop (0=0 equality case)', () => {
    expect(p.evolvedNameG).toBe('Hitmontop');
  });
});
