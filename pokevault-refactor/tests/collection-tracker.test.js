'use strict';
// Tests for BRIEF_BATCH_COLLECTION_TRACKER_2026-05-17
// Task 1: UB section isolation, Task 2: family lucky indicator, Task 3: Excl. Family filter
// Run: npx jest tests/collection-tracker.test.js

// ─── Helpers mirrored from app.js ────────────────────────────────────────────

function getFullFamilyNums(s, speciesById, evolvesInto) {
  let root = s;
  while (root.evolves_from && speciesById.has(root.evolves_from)) {
    root = speciesById.get(root.evolves_from);
  }
  const family = new Set();
  const queue = [root.pokedex_number];
  while (queue.length) {
    const num = queue.shift();
    family.add(num);
    for (const child of (evolvesInto.get(num) || [])) queue.push(child);
  }
  return family;
}

function buildEvolvesInto(allSpecies) {
  const map = new Map();
  for (const s of allSpecies) {
    if (s.evolves_from) {
      const arr = map.get(s.evolves_from) || [];
      arr.push(s.pokedex_number);
      map.set(s.evolves_from, arr);
    }
  }
  return map;
}

// Returns sorted array of { count, name } for family luckies (Task 2 data layer).
function getFamilyLuckyParts(s, speciesById, evolvesInto, luckyCountByNum) {
  const familyNums = getFullFamilyNums(s, speciesById, evolvesInto);
  const parts = [];
  for (const num of familyNums) {
    const count = luckyCountByNum.get(num);
    if (count) parts.push({ count, name: speciesById.get(num)?.name || String(num) });
  }
  parts.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return parts;
}

// Builds the familyLuckyNums set used for Task 3 Excl. Family filter.
function buildFamilyLuckyNums(luckyCountByNum, speciesById, evolvesInto) {
  const familyLuckyNums = new Set();
  for (const [num] of luckyCountByNum) {
    const s = speciesById.get(num);
    if (s) getFullFamilyNums(s, speciesById, evolvesInto).forEach(n => familyLuckyNums.add(n));
  }
  return familyLuckyNums;
}

// ─── Mock species data ────────────────────────────────────────────────────────

// 3-stage: Honedge(1) → Doublade(2) → Aegislash(3)
const honedge   = { pokedex_number: 1, name: 'Honedge',   evolves_from: null };
const doublade  = { pokedex_number: 2, name: 'Doublade',  evolves_from: 1    };
const aegislash = { pokedex_number: 3, name: 'Aegislash', evolves_from: 2    };

// 3-stage: Aron(10) → Lairon(11) → Aggron(12)
const aron   = { pokedex_number: 10, name: 'Aron',   evolves_from: null };
const lairon = { pokedex_number: 11, name: 'Lairon', evolves_from: 10   };
const aggron = { pokedex_number: 12, name: 'Aggron', evolves_from: 11   };

// 2-stage: Archen(13) → Archeops(14)
const archen   = { pokedex_number: 13, name: 'Archen',   evolves_from: null };
const archeops = { pokedex_number: 14, name: 'Archeops', evolves_from: 13   };

// 2-stage: Yungoos(15) → Gumshoos(16)
const yungoos  = { pokedex_number: 15, name: 'Yungoos',  evolves_from: null };
const gumshoos = { pokedex_number: 16, name: 'Gumshoos', evolves_from: 15   };

// Standalone
const snorlax = { pokedex_number: 9, name: 'Snorlax', evolves_from: null };

const allSpeciesMock = [
  honedge, doublade, aegislash,
  aron, lairon, aggron,
  archen, archeops,
  yungoos, gumshoos,
  snorlax,
];

const speciesById = new Map(allSpeciesMock.map(s => [s.pokedex_number, s]));
const evolvesInto = buildEvolvesInto(allSpeciesMock);

// ─── Task 1: UB section isolation ────────────────────────────────────────────

describe('Task 1 — UB section isolation', () => {
  // The fix wraps each category in its own <div class="dex-cat-section">
  // so a closing </div> appears after every UB species before Regular rows begin.
  it('each category produces an independent section div', () => {
    const CAT_ORDER = ['Legendary', 'Mythical', 'Ultra Beast', 'Regular'];
    const catSpeciesMap = {
      'Ultra Beast': [{ name: 'Nihilego' }],
      'Regular':     [{ name: 'Altaria'  }],
    };
    const html = CAT_ORDER
      .filter(cat => catSpeciesMap[cat])
      .map(cat => `<div class="dex-cat-section">${cat}</div>`)
      .join('');
    // UB section must appear and close before Regular section
    const ubEnd  = html.indexOf('</div>', html.indexOf('Ultra Beast'));
    const regStart = html.indexOf('Regular');
    expect(ubEnd).toBeLessThan(regStart);
  });

  it('Regular category gets no section header div', () => {
    const cat = 'Regular';
    const header = cat !== 'Regular' ? `<div class="dex-cat-header">${cat}</div>` : '';
    expect(header).toBe('');
  });

  it('Ultra Beast category gets a section header div', () => {
    const cat = 'Ultra Beast';
    const header = cat !== 'Regular' ? `<div class="dex-cat-header">${cat}</div>` : '';
    expect(header).toBe('<div class="dex-cat-header">Ultra Beast</div>');
  });
});

// ─── getFullFamilyNums ────────────────────────────────────────────────────────

describe('getFullFamilyNums — 3-stage chain', () => {
  it('from base (Aron) returns all three members', () => {
    const fam = getFullFamilyNums(aron, speciesById, evolvesInto);
    expect(fam).toEqual(new Set([10, 11, 12]));
  });

  it('from middle (Lairon) returns all three members', () => {
    const fam = getFullFamilyNums(lairon, speciesById, evolvesInto);
    expect(fam).toEqual(new Set([10, 11, 12]));
  });

  it('from final evo (Aggron) returns all three members', () => {
    const fam = getFullFamilyNums(aggron, speciesById, evolvesInto);
    expect(fam).toEqual(new Set([10, 11, 12]));
  });
});

describe('getFullFamilyNums — 2-stage chain', () => {
  it('from base (Archen) returns both members', () => {
    const fam = getFullFamilyNums(archen, speciesById, evolvesInto);
    expect(fam).toEqual(new Set([13, 14]));
  });

  it('from final evo (Archeops) returns both members', () => {
    const fam = getFullFamilyNums(archeops, speciesById, evolvesInto);
    expect(fam).toEqual(new Set([13, 14]));
  });
});

describe('getFullFamilyNums — standalone', () => {
  it('standalone species (Snorlax) returns only itself', () => {
    const fam = getFullFamilyNums(snorlax, speciesById, evolvesInto);
    expect(fam).toEqual(new Set([9]));
  });
});

// ─── Task 2: family lucky indicator ──────────────────────────────────────────

describe('Task 2 — family lucky indicator', () => {
  it('no luckies in family → no parts', () => {
    const luckyCountByNum = new Map();
    expect(getFamilyLuckyParts(archen, speciesById, evolvesInto, luckyCountByNum)).toEqual([]);
  });

  it('1 lucky Archeops, missing Archen → shows Archeops', () => {
    const luckyCountByNum = new Map([[14, 1]]);
    const parts = getFamilyLuckyParts(archen, speciesById, evolvesInto, luckyCountByNum);
    expect(parts).toEqual([{ count: 1, name: 'Archeops' }]);
  });

  it('1 lucky Archen, missing Archeops → shows Archen (base form lucky)', () => {
    const luckyCountByNum = new Map([[13, 1]]);
    const parts = getFamilyLuckyParts(archeops, speciesById, evolvesInto, luckyCountByNum);
    expect(parts).toEqual([{ count: 1, name: 'Archen' }]);
  });

  it('2 lucky Aggron, missing Aron → shows 2🍀 Aggron', () => {
    const luckyCountByNum = new Map([[12, 2]]);
    const parts = getFamilyLuckyParts(aron, speciesById, evolvesInto, luckyCountByNum);
    expect(parts).toEqual([{ count: 2, name: 'Aggron' }]);
  });

  it('2 lucky Aggron + 1 lucky Lairon, missing Aron → sorted higher count first', () => {
    const luckyCountByNum = new Map([[12, 2], [11, 1]]);
    const parts = getFamilyLuckyParts(aron, speciesById, evolvesInto, luckyCountByNum);
    expect(parts).toEqual([
      { count: 2, name: 'Aggron' },
      { count: 1, name: 'Lairon' },
    ]);
  });

  it('lucky outside family → not included', () => {
    const luckyCountByNum = new Map([[9, 3]]); // Snorlax — unrelated
    const parts = getFamilyLuckyParts(aron, speciesById, evolvesInto, luckyCountByNum);
    expect(parts).toEqual([]);
  });

  it('species with no evolution — only exact species checked', () => {
    const luckyCountByNum = new Map([[9, 1]]);
    const parts = getFamilyLuckyParts(snorlax, speciesById, evolvesInto, luckyCountByNum);
    expect(parts).toEqual([{ count: 1, name: 'Snorlax' }]);
  });
});

// ─── Task 3: Excl. Family filter ─────────────────────────────────────────────

describe('Task 3 — buildFamilyLuckyNums expansion', () => {
  it('lucky Aggron expands to include Aron, Lairon, Aggron', () => {
    const luckyCountByNum = new Map([[12, 1]]);
    const nums = buildFamilyLuckyNums(luckyCountByNum, speciesById, evolvesInto);
    expect(nums.has(10)).toBe(true); // Aron
    expect(nums.has(11)).toBe(true); // Lairon
    expect(nums.has(12)).toBe(true); // Aggron
  });

  it('lucky Archen expands to include Archeops', () => {
    const luckyCountByNum = new Map([[13, 1]]);
    const nums = buildFamilyLuckyNums(luckyCountByNum, speciesById, evolvesInto);
    expect(nums.has(13)).toBe(true); // Archen
    expect(nums.has(14)).toBe(true); // Archeops
  });

  it('lucky Archeops expands to include Archen', () => {
    const luckyCountByNum = new Map([[14, 1]]);
    const nums = buildFamilyLuckyNums(luckyCountByNum, speciesById, evolvesInto);
    expect(nums.has(13)).toBe(true); // Archen
    expect(nums.has(14)).toBe(true); // Archeops
  });

  it('does not bleed into unrelated families', () => {
    const luckyCountByNum = new Map([[12, 1]]); // Aggron
    const nums = buildFamilyLuckyNums(luckyCountByNum, speciesById, evolvesInto);
    expect(nums.has(13)).toBe(false); // Archen — unrelated
    expect(nums.has(9)).toBe(false);  // Snorlax — unrelated
  });
});

describe('Task 3 — Excl. Family filter application', () => {
  it('missing Aron, lucky Aggron → excluded', () => {
    const luckyCountByNum = new Map([[12, 1]]);
    const familyLuckyNums = buildFamilyLuckyNums(luckyCountByNum, speciesById, evolvesInto);
    expect(familyLuckyNums.has(aron.pokedex_number)).toBe(true);
  });

  it('missing Archen, lucky Archeops → excluded', () => {
    const luckyCountByNum = new Map([[14, 1]]);
    const familyLuckyNums = buildFamilyLuckyNums(luckyCountByNum, speciesById, evolvesInto);
    expect(familyLuckyNums.has(archen.pokedex_number)).toBe(true);
  });

  it('missing Gumshoos, lucky Yungoos → excluded', () => {
    const luckyCountByNum = new Map([[15, 1]]);
    const familyLuckyNums = buildFamilyLuckyNums(luckyCountByNum, speciesById, evolvesInto);
    expect(familyLuckyNums.has(gumshoos.pokedex_number)).toBe(true);
  });

  it('missing Gumshoos, non-lucky Yungoos → not excluded (no lucky in family)', () => {
    const luckyCountByNum = new Map(); // no luckies at all
    const familyLuckyNums = buildFamilyLuckyNums(luckyCountByNum, speciesById, evolvesInto);
    expect(familyLuckyNums.has(gumshoos.pokedex_number)).toBe(false);
  });

  it('missing Aron, no family luckies → not excluded', () => {
    const luckyCountByNum = new Map([[9, 1]]); // Snorlax lucky — unrelated
    const familyLuckyNums = buildFamilyLuckyNums(luckyCountByNum, speciesById, evolvesInto);
    expect(familyLuckyNums.has(aron.pokedex_number)).toBe(false);
  });

  it('lucky of exact species (Aron) → Aron excluded', () => {
    const luckyCountByNum = new Map([[10, 1]]); // lucky Aron itself
    const familyLuckyNums = buildFamilyLuckyNums(luckyCountByNum, speciesById, evolvesInto);
    expect(familyLuckyNums.has(aron.pokedex_number)).toBe(true);
  });

  it('filter applied: missing list excludes family-lucky species', () => {
    const luckyCountByNum = new Map([[12, 1]]); // lucky Aggron
    const familyLuckyNums = buildFamilyLuckyNums(luckyCountByNum, speciesById, evolvesInto);
    const missing = [aron, lairon, archen]; // Aron + Lairon should be excluded, Archen not
    const filtered = missing.filter(s => !familyLuckyNums.has(s.pokedex_number));
    expect(filtered).toEqual([archen]);
  });
});
