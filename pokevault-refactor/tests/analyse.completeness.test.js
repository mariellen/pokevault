'use strict';
// Unit tests for computeFamilyCompleteness (Feature 1 — brief 2026-05-29).
// Tests the 8 scenarios from the brief.

const loader = require('./loader');
const { computeFamilyCompleteness } = loader;

// Helper to build a minimal member object for completeness tests.
function member(overrides = {}) {
  return {
    decision: 'keep',
    slotConfirmed: true,
    slots: [],
    rankPctL: 0, rankPctG: 0, rankPctU: 0, rankPctM: 0,
    isShiny: false, isLucky: false, isDynamax: false, isGigantamax: false,
    ...overrides,
  };
}

// ─── Scenario 1 — blue: all eligible leagues covered, min rank 91% ─────────

describe('Scenario 1 — blue tier: all eligible leagues covered, min rank 91%', () => {
  let c;
  beforeAll(() => {
    c = computeFamilyCompleteness([
      member({ slots: ['G'], rankPctG: 91, rankPctU: 0 }),
      member({ slots: ['U'], rankPctG: 0, rankPctU: 91 }),
    ]);
  });
  it('tier is blue (all ≥90%, none ≥95%)', () => { expect(c.tier).toBe('blue'); });
});

// ─── Scenario 2 — green: all eligible leagues covered, min rank 96% ────────

describe('Scenario 2 — green tier: all eligible leagues covered, min rank 96%', () => {
  let c;
  beforeAll(() => {
    c = computeFamilyCompleteness([
      member({ slots: ['G'], rankPctG: 96, rankPctU: 0 }),
      member({ slots: ['U'], rankPctG: 0, rankPctU: 96 }),
    ]);
  });
  it('tier is green (all ≥95%, none round to 100%)', () => { expect(c.tier).toBe('green'); });
});

// ─── Scenario 3 — gold: all eligible leagues covered, all round to 100% ────

describe('Scenario 3 — gold tier: all eligible leagues covered, all round to 100%', () => {
  let c;
  beforeAll(() => {
    c = computeFamilyCompleteness([
      member({ slots: ['G'], rankPctG: 99.8, rankPctU: 0 }),
      member({ slots: ['U'], rankPctG: 0, rankPctU: 100 }),
    ]);
  });
  it('tier is gold (all Math.round ≥ 100)', () => { expect(c.tier).toBe('gold'); });
});

// ─── Scenario 4 — none: missing a keeper in one eligible league ─────────────

describe('Scenario 4 — no indicator: one eligible league has no confirmed keeper', () => {
  let c;
  beforeAll(() => {
    c = computeFamilyCompleteness([
      member({ slots: ['G'], rankPctG: 96, rankPctU: 92 }),
      // UL eligible (rankPctU > 0) but no confirmed keeper with 'U' slot
      member({ decision: 'trade', slotConfirmed: false, slots: [], rankPctG: 0, rankPctU: 92 }),
    ]);
  });
  it('tier is none (UL has no confirmed keeper)', () => { expect(c.tier).toBe('none'); });
});

// ─── Scenario 5 — ineligible league: not penalised ──────────────────────────

describe('Scenario 5 — ineligible league not penalised', () => {
  let c;
  beforeAll(() => {
    // Only GL eligible (rankPctU/L/M = 0). Confirmed GL keeper.
    c = computeFamilyCompleteness([
      member({ slots: ['G'], rankPctG: 93, rankPctU: 0, rankPctL: 0, rankPctM: 0 }),
    ]);
  });
  it('tier is blue (GL is only eligible league, has keeper)', () => { expect(c.tier).toBe('blue'); });
});

// ─── Scenario 6 — optional icon: shiny keep present → hasShinyKeep ──────────

describe('Scenario 6 — optional icon: shiny keep present', () => {
  let c;
  beforeAll(() => {
    c = computeFamilyCompleteness([
      member({ slots: ['G'], rankPctG: 96, isShiny: true }),
    ]);
  });
  it('hasShinyKeep is true', () => { expect(c.hasShinyKeep).toBe(true); });
  it('tier still computed correctly (green)', () => { expect(c.tier).toBe('green'); });
});

// ─── Scenario 7 — optional icon: no lucky → hasLuckyKeep false ──────────────

describe('Scenario 7 — optional icon: no lucky keep', () => {
  let c;
  beforeAll(() => {
    c = computeFamilyCompleteness([
      member({ slots: ['G'], rankPctG: 96, isLucky: false }),
    ]);
  });
  it('hasLuckyKeep is false (no lucky in family)', () => { expect(c.hasLuckyKeep).toBeFalsy(); });
});

// ─── Scenario 8 — none when family has no rank data at all ──────────────────

describe('Scenario 8 — no eligible leagues: tier is none', () => {
  let c;
  beforeAll(() => {
    c = computeFamilyCompleteness([
      member({ slots: [], rankPctG: 0, rankPctU: 0, rankPctL: 0, rankPctM: 0 }),
    ]);
  });
  it('tier is none (no eligible leagues)', () => { expect(c.tier).toBe('none'); });
});

// ─── Scenario 8b — Dynamax/Gmax icons ──────────────────────────────────────

describe('Scenario 8b — Dynamax and Gmax keep icons', () => {
  it('hasDynamaxKeep true when isDynamax member is keep', () => {
    const c = computeFamilyCompleteness([
      member({ slots: ['G'], rankPctG: 91, isDynamax: true }),
    ]);
    expect(c.hasDynamaxKeep).toBe(true);
  });
  it('hasGmaxKeep true when isGigantamax member is keep', () => {
    const c = computeFamilyCompleteness([
      member({ slots: ['G'], rankPctG: 91, isGigantamax: true }),
    ]);
    expect(c.hasGmaxKeep).toBe(true);
  });
  it('icons absent when no special keeps', () => {
    const c = computeFamilyCompleteness([
      member({ slots: ['G'], rankPctG: 91 }),
    ]);
    expect(c.hasShinyKeep).toBeFalsy();
    expect(c.hasLuckyKeep).toBeFalsy();
    expect(c.hasDynamaxKeep).toBeFalsy();
    expect(c.hasGmaxKeep).toBeFalsy();
  });
});
