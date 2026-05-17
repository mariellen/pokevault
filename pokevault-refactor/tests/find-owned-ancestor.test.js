'use strict';
// Tests for findOwnedAncestor() — the "Evolve from X!" chain walk in renderDexMissingView.
// Mirrors findOwnedAncestor() from app.js exactly.
// Run: npx jest tests/find-owned-ancestor.test.js

function findOwnedAncestor(s, speciesById, ownedNums) {
  let cur = s;
  for (let i = 0; i < 4; i++) {
    if (!cur.evolves_from) return null;
    const parent = speciesById.get(cur.evolves_from);
    if (!parent) return null;
    if (ownedNums.has(parent.pokedex_number)) return parent.name || 'pre-evolution';
    cur = parent;
  }
  return null;
}

// ─── Mock species data ────────────────────────────────────────────────────────

// 3-stage chain: Honedge(1) → Doublade(2) → Aegislash(3)
const honedge   = { pokedex_number: 1, name: 'Honedge',   evolves_from: null };
const doublade  = { pokedex_number: 2, name: 'Doublade',  evolves_from: 1    };
const aegislash = { pokedex_number: 3, name: 'Aegislash', evolves_from: 2    };

// 3-stage chain: Nacli(4) → Naclstack(5) → Garganacl(6)
const nacli      = { pokedex_number: 4, name: 'Nacli',      evolves_from: null };
const naclstack  = { pokedex_number: 5, name: 'Naclstack',  evolves_from: 4    };
const garganacl  = { pokedex_number: 6, name: 'Garganacl',  evolves_from: 5    };

// 2-stage chain: Caterpie(7) → Butterfree(8)
const caterpie   = { pokedex_number: 7, name: 'Caterpie',   evolves_from: null };
const butterfree = { pokedex_number: 8, name: 'Butterfree', evolves_from: 7    };

// Standalone (no evolution)
const snorlax    = { pokedex_number: 9, name: 'Snorlax',    evolves_from: null };

const speciesById = new Map([
  [1, honedge], [2, doublade], [3, aegislash],
  [4, nacli], [5, naclstack], [6, garganacl],
  [7, caterpie], [8, butterfree],
  [9, snorlax],
]);

// ─── 3-stage chain tests ──────────────────────────────────────────────────────

describe('findOwnedAncestor — 3-stage chain (Honedge line)', () => {
  it('missing Aegislash, own Honedge only → "Honedge" (2 steps up)', () => {
    const owned = new Set([1]);
    expect(findOwnedAncestor(aegislash, speciesById, owned)).toBe('Honedge');
  });

  it('missing Aegislash, own Doublade → "Doublade" (immediate pre-evo)', () => {
    const owned = new Set([2]);
    expect(findOwnedAncestor(aegislash, speciesById, owned)).toBe('Doublade');
  });

  it('missing Aegislash, own both Honedge and Doublade → "Doublade" (closest wins)', () => {
    const owned = new Set([1, 2]);
    expect(findOwnedAncestor(aegislash, speciesById, owned)).toBe('Doublade');
  });

  it('missing Doublade, own Honedge → "Honedge" (immediate pre-evo)', () => {
    const owned = new Set([1]);
    expect(findOwnedAncestor(doublade, speciesById, owned)).toBe('Honedge');
  });

  it('missing Aegislash, own nothing → null', () => {
    const owned = new Set();
    expect(findOwnedAncestor(aegislash, speciesById, owned)).toBeNull();
  });
});

describe('findOwnedAncestor — 3-stage chain (Nacli line)', () => {
  it('missing Garganacl, own Naclstack → "Naclstack" (immediate pre-evo)', () => {
    const owned = new Set([5]);
    expect(findOwnedAncestor(garganacl, speciesById, owned)).toBe('Naclstack');
  });

  it('missing Garganacl, own Nacli only → "Nacli" (2 steps up)', () => {
    const owned = new Set([4]);
    expect(findOwnedAncestor(garganacl, speciesById, owned)).toBe('Nacli');
  });

  it('missing Garganacl, own both Nacli and Naclstack → "Naclstack" (closest wins)', () => {
    const owned = new Set([4, 5]);
    expect(findOwnedAncestor(garganacl, speciesById, owned)).toBe('Naclstack');
  });
});

describe('findOwnedAncestor — 2-stage chain (unchanged behaviour)', () => {
  it('missing Butterfree, own Caterpie → "Caterpie"', () => {
    const owned = new Set([7]);
    expect(findOwnedAncestor(butterfree, speciesById, owned)).toBe('Caterpie');
  });

  it('missing Butterfree, own nothing → null', () => {
    const owned = new Set();
    expect(findOwnedAncestor(butterfree, speciesById, owned)).toBeNull();
  });
});

describe('findOwnedAncestor — no evolution', () => {
  it('standalone species (Snorlax) → null regardless of owned set', () => {
    const owned = new Set([9]);
    expect(findOwnedAncestor(snorlax, speciesById, owned)).toBeNull();
  });
});
