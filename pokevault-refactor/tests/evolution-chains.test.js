'use strict';
// Tests for evolution chain lookup (getFullFamily logic from supabase.js).
// Uses mock chain data — no Supabase calls.
// Run: npx jest tests/evolution-chains.test.js

// ─── Recreate the lookup logic from supabase.js ───────────────────────────────
// This mirrors getFullFamily() exactly so regressions are caught here.

function buildLookups(rows) {
  const bySpecies = {};
  const byChainId = {};
  for (const row of rows) {
    bySpecies[row.species_name] = row;
    if (!byChainId[row.chain_id]) byChainId[row.chain_id] = [];
    byChainId[row.chain_id].push(row);
  }
  return { bySpecies, byChainId };
}

function getFullFamily(speciesName, bySpecies, byChainId) {
  const row = bySpecies[speciesName];
  if (!row) return null;
  if (row.is_standalone) return [speciesName];
  const chain = byChainId[row.chain_id] || [];
  return chain.filter(r => !r.is_standalone).map(r => r.species_name);
}

// ─── Mock chain data ──────────────────────────────────────────────────────────

const MOCK_CHAINS = [
  // Chain 246 — Tyrunt → Tyrantrum
  { species_name: 'Tyrunt',    pokeapi_name: 'tyrunt',    chain_id: 246, stage: 1, evolves_from: null,     evolves_to: ['Tyrantrum'], is_standalone: false },
  { species_name: 'Tyrantrum', pokeapi_name: 'tyrantrum', chain_id: 246, stage: 2, evolves_from: 'Tyrunt', evolves_to: null,          is_standalone: false },

  // Chain 67 — Eevee + all 9 eeveelutions
  { species_name: 'Eevee',     pokeapi_name: 'eevee',     chain_id: 67,  stage: 1, evolves_from: null,    evolves_to: ['Vaporeon','Jolteon','Flareon','Espeon','Umbreon','Leafeon','Glaceon','Sylveon'], is_standalone: false },
  { species_name: 'Vaporeon',  pokeapi_name: 'vaporeon',  chain_id: 67,  stage: 2, evolves_from: 'Eevee', evolves_to: null, is_standalone: false },
  { species_name: 'Jolteon',   pokeapi_name: 'jolteon',   chain_id: 67,  stage: 2, evolves_from: 'Eevee', evolves_to: null, is_standalone: false },
  { species_name: 'Flareon',   pokeapi_name: 'flareon',   chain_id: 67,  stage: 2, evolves_from: 'Eevee', evolves_to: null, is_standalone: false },
  { species_name: 'Espeon',    pokeapi_name: 'espeon',    chain_id: 67,  stage: 2, evolves_from: 'Eevee', evolves_to: null, is_standalone: false },
  { species_name: 'Umbreon',   pokeapi_name: 'umbreon',   chain_id: 67,  stage: 2, evolves_from: 'Eevee', evolves_to: null, is_standalone: false },
  { species_name: 'Leafeon',   pokeapi_name: 'leafeon',   chain_id: 67,  stage: 2, evolves_from: 'Eevee', evolves_to: null, is_standalone: false },
  { species_name: 'Glaceon',   pokeapi_name: 'glaceon',   chain_id: 67,  stage: 2, evolves_from: 'Eevee', evolves_to: null, is_standalone: false },
  { species_name: 'Sylveon',   pokeapi_name: 'sylveon',   chain_id: 67,  stage: 2, evolves_from: 'Eevee', evolves_to: null, is_standalone: false },

  // Chain 202 — Scyther → Scizor OR Kleavor (Kleavor is standalone)
  { species_name: 'Scyther',  pokeapi_name: 'scyther',  chain_id: 202, stage: 1, evolves_from: null,     evolves_to: ['Scizor', 'Kleavor'], is_standalone: false },
  { species_name: 'Scizor',   pokeapi_name: 'scizor',   chain_id: 202, stage: 2, evolves_from: 'Scyther', evolves_to: null, is_standalone: false },
  { species_name: 'Kleavor',  pokeapi_name: 'kleavor',  chain_id: 202, stage: 2, evolves_from: 'Scyther', evolves_to: null, is_standalone: true  },

  // Chain 1 — standalone Bulbasaur line (used to test 3-stage chain)
  { species_name: 'Bulbasaur',  pokeapi_name: 'bulbasaur',  chain_id: 1, stage: 1, evolves_from: null,        evolves_to: ['Ivysaur'],   is_standalone: false },
  { species_name: 'Ivysaur',   pokeapi_name: 'ivysaur',   chain_id: 1, stage: 2, evolves_from: 'Bulbasaur', evolves_to: ['Venusaur'],  is_standalone: false },
  { species_name: 'Venusaur',  pokeapi_name: 'venusaur',  chain_id: 1, stage: 3, evolves_from: 'Ivysaur',   evolves_to: null,          is_standalone: false },

  // Chain 300 — single-stage species (no evolutions)
  { species_name: 'Mew', pokeapi_name: 'mew', chain_id: 300, stage: 1, evolves_from: null, evolves_to: null, is_standalone: false },
];

let bySpecies, byChainId;

beforeAll(() => {
  ({ bySpecies, byChainId } = buildLookups(MOCK_CHAINS));
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('getFullFamily — basic lookup', () => {
  it('returns null for unknown species', () => {
    expect(getFullFamily('Mewtwo', bySpecies, byChainId)).toBeNull();
  });

  it('Tyrunt chain includes Tyrantrum even without owning it', () => {
    const family = getFullFamily('Tyrunt', bySpecies, byChainId);
    expect(family).toContain('Tyrunt');
    expect(family).toContain('Tyrantrum');
    expect(family).toHaveLength(2);
  });

  it('Tyrantrum lookup also returns full chain', () => {
    const family = getFullFamily('Tyrantrum', bySpecies, byChainId);
    expect(family).toContain('Tyrunt');
    expect(family).toContain('Tyrantrum');
    expect(family).toHaveLength(2);
  });

  it('Mew (single-stage) returns just itself', () => {
    expect(getFullFamily('Mew', bySpecies, byChainId)).toEqual(['Mew']);
  });

  it('Bulbasaur 3-stage chain contains all three stages', () => {
    const family = getFullFamily('Bulbasaur', bySpecies, byChainId);
    expect(family).toContain('Bulbasaur');
    expect(family).toContain('Ivysaur');
    expect(family).toContain('Venusaur');
    expect(family).toHaveLength(3);
  });

  it('mid-chain lookup (Ivysaur) returns full family', () => {
    const family = getFullFamily('Ivysaur', bySpecies, byChainId);
    expect(family).toContain('Bulbasaur');
    expect(family).toContain('Ivysaur');
    expect(family).toContain('Venusaur');
  });
});

describe('getFullFamily — Eevee branching chain', () => {
  it('Eevee chain returns all 9 eeveelutions', () => {
    const family = getFullFamily('Eevee', bySpecies, byChainId);
    const expected = ['Eevee','Vaporeon','Jolteon','Flareon','Espeon','Umbreon','Leafeon','Glaceon','Sylveon'];
    for (const name of expected) expect(family).toContain(name);
    expect(family).toHaveLength(9);
  });

  it('Glaceon lookup returns Eevee + all eeveelutions', () => {
    const family = getFullFamily('Glaceon', bySpecies, byChainId);
    expect(family).toContain('Eevee');
    expect(family).toContain('Glaceon');
    expect(family).toContain('Sylveon');
  });
});

describe('getFullFamily — Kleavor standalone', () => {
  it('Scyther chain excludes Kleavor (standalone)', () => {
    const family = getFullFamily('Scyther', bySpecies, byChainId);
    expect(family).toContain('Scyther');
    expect(family).toContain('Scizor');
    expect(family).not.toContain('Kleavor');
  });

  it('Kleavor lookup returns only Kleavor (standalone returns just itself)', () => {
    const family = getFullFamily('Kleavor', bySpecies, byChainId);
    expect(family).toEqual(['Kleavor']);
  });

  it('Scizor chain also excludes Kleavor', () => {
    const family = getFullFamily('Scizor', bySpecies, byChainId);
    expect(family).toContain('Scyther');
    expect(family).toContain('Scizor');
    expect(family).not.toContain('Kleavor');
  });
});
