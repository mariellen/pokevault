'use strict';
// Tests for Feature 2 Option C+D — two-pass affordable-first slot assignment.
// Uses the real fixture CSV (same as analyse.fixture.test.js).
// Scenarios from the brief (2026-05-29).

const path = require('path');
const loader = require('./loader');
const { analyse } = loader;
const { loadCSV } = require('./csvParser');

const FIXTURE_PATH = path.join(__dirname, 'poke_genie_fixture.csv');

let result;
const find = (name, cp) => result.pokemon.find(p => p.name === name && p.cp === cp);

beforeAll(() => {
  const csv = loadCSV(FIXTURE_PATH);
  result = analyse(csv);
});

// ─── Option C Scenario 1: affordable GL candidate wins over expensive ────────
// Tentacruel CP:1430 (dustG=100k, affordable) vs CP:1450 (dustG=200k, expensive).
// Pass 1 selects CP:1430 directly.

describe('Option C — affordable GL candidate wins directly (Pass 1)', () => {
  it('Tentacruel CP:1430 (affordable GL) holds the G slot', () => {
    const p = find('Tentacruel', 1430);
    expect(p).toBeDefined();
    expect(p.slots).toContain('G');
  });
  it('Tentacruel CP:1430 has isAffordableWinner=true', () => {
    const p = find('Tentacruel', 1430);
    expect(p.isAffordableWinner).toBe(true);
  });
  it('Tentacruel CP:1430 decision is keep', () => {
    const p = find('Tentacruel', 1430);
    expect(p.decision).toBe('keep');
  });
  it('Tentacruel CP:1430 gets green star (affordable winner, not expensive)', () => {
    const p = find('Tentacruel', 1430);
    expect(p.starType).toBe('green');
  });
  it('Tentacruel CP:1450 (expensive) does NOT hold G slot (blocked by Pass 1)', () => {
    const p = find('Tentacruel', 1450);
    expect(p.slots).not.toContain('G');
  });
  it('Tentacruel CP:1450 does NOT have isExpensiveWinner=true (lost to affordable in Pass 1)', () => {
    const p = find('Tentacruel', 1450);
    expect(p.isExpensiveWinner).toBeFalsy();
  });
});

// ─── Option C Scenario 2: no affordable GL candidate → expensive wins (Pass 2) ─
// Skwovet CP:750 (expensive dustG) — GL has no affordable candidate at ≥90%.
// But in this fixture Skwovet CP:496 (100% GL) wins, so CP:750 falls to review.
// The Pass 2 fallback applies to the Greedent UL case instead.

describe('Option C — expensive Skwovet CP:750 loses GL to affordable Skwovet CP:496', () => {
  it('Skwovet CP:496 holds G slot (affordable, 100% GL)', () => {
    const p = find('Skwovet', 496);
    expect(p).toBeDefined();
    expect(p.slots).toContain('G');
  });
  it('Skwovet CP:750 does NOT hold G slot', () => {
    const p = find('Skwovet', 750);
    expect(p.slots).not.toContain('G');
  });
});

// ─── Fix 1 Scenario 3: best-ranked UL candidate wins outright, even if expensive ──
// Skwovet CP:750 (98.58% UL, expensive dustU=350k) beats Greedent CP:1438 (92.09% UL,
// affordable dustU=250k) — best rank always wins the slot (#134 fix, 2026-09-10).
// Greedent CP:1438 surfaces as the affordable alternative (U_affordable) instead.

describe('Fix 1 — best-ranked UL candidate wins directly, affordable alt surfaces alongside', () => {
  it('Skwovet CP:750 (98.58% UL, expensive) holds U slot', () => {
    const p = find('Skwovet', 750);
    expect(p).toBeDefined();
    expect(p.slots).toContain('U');
  });
  it('Skwovet CP:750 decision is keep', () => {
    expect(find('Skwovet', 750).decision).toBe('keep');
  });
  it('Greedent CP:1438 (92.09% UL, affordable) holds U_affordable, not plain U', () => {
    const p = find('Greedent', 1438);
    expect(p.slots).not.toContain('U');
    expect(p.slots).toContain('U_affordable');
  });
});

// ─── Option D Scenario 4: ML always single pass (exempt from two-pass) ───────
// ML slot winner can be expensive — Option D means no affordable-first filter for M.

describe('Option D — ML exempt from two-pass (single pass)', () => {
  it('ML winner is assigned regardless of dust cost', () => {
    // Any pokemon in the fixture with an M slot — just verify M slots are still assigned.
    const mlWinners = result.pokemon.filter(p => p.slots.includes('M'));
    expect(mlWinners.length).toBeGreaterThan(0);
  });
  it('ML winner may be expensive (isExpensiveWinner stays false for ML — exempt)', () => {
    // Option D: isExpensiveWinner is only set for GL/UL/LL, not ML.
    const mlWinners = result.pokemon.filter(p => p.slots.includes('M'));
    mlWinners.forEach(p => {
      // ML winners should never have isExpensiveWinner set (they are exempt)
      expect(p.isExpensiveWinner).toBeFalsy();
    });
  });
});

// ─── Fix 1 Scenario 5: Skwovet CP:750 loses GL (to a higher-ranked same-species
// GL winner) but wins UL outright on rank, expensive or not ───────────────────
// Skwovet CP:750 loses GL to Skwovet CP:496 (99.78%, higher rank). For UL, CP:750
// (98.58%) out-ranks Greedent CP:1438 (92.09%) and wins despite being expensive —
// the #134 fix means cost never removes a candidate from contention.

describe('Fix 1 — Skwovet CP:750 loses GL to a higher-ranked rival, but wins UL on rank alone', () => {
  it('Skwovet CP:750 holds exactly one league slot (U)', () => {
    const p = find('Skwovet', 750);
    expect(p.slots.filter(s => ['L','G','U','M'].includes(s))).toEqual(['U']);
  });
  it('Skwovet CP:750 decision is keep (won UL)', () => {
    expect(find('Skwovet', 750).decision).toBe('keep');
  });
});
