'use strict';
// Tests for the Dynamax best-overall Master (Ⓜ) flag — brief: dynamax-master-flag.
//
// Approved rules:
//   • Best Dynamax by IV (per max-evo target) → NameⓂ{IV%}Ⓓ — power up to Master level.
//     Fires even if another Dynamax (or this one) wins a capped league slot.
//   • Other Dynamax that win a capped league slot → NameⒼ/Ⓤ/ⓛ{rank}Ⓓ.
//   • Other Dynamax with no slot → NameⓇ{IV%}Ⓓ — keep as raid candidate.
//   • Dynamax must NOT compete with regular Pokémon for capped league slots
//     (they form an independent |dynamax sub-group, like shadow/lucky/purified).
//
// is_dynamax is an override (no CSV column), applied via loader.createWithOverrides
// keyed by stableKey (pokeNum|form|gender|atk|def|sta|_idx<Index>).
//
// Self-contained synthetic CSVs through the real csvParser + loader (same approach as
// analyse.master_league.test.js / analyse.eevee_master.test.js). Run with:
//   npx jest tests/analyse.dynamax_master.test.js --env=node

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

const NUM = { Electabuzz: 125, Eevee: 133 };
// stableKey used by overrides: pokeNum|form|gender|atk|def|sta|_idx<Index>  (no CP)
const keyFor = (num, a, d, s, idx) => [String(num), '', '', a, d, s, '_idx' + idx].join('|');

// Electabuzz — single-stage for these tests (no evo target on the Name (G/U/L) columns,
// so maxTargetKey resolves to 'Electabuzz' and base name is Electabuzz → "Electabu…").
const elecbuzz = (cp, ivAvg, a, d, s, opts = {}) => row({
  Index: String(opts.idx || 1), Name: 'Electabuzz', 'Pokemon Number': String(NUM.Electabuzz),
  CP: String(cp), 'Atk IV': String(a), 'Def IV': String(d), 'Sta IV': String(s),
  'IV Avg': ivAvg.toFixed(1), 'Level Min': '20', Dust: '5000',
  'Rank % (U)': opts.ru != null ? String(opts.ru) : '',
  'Dust Cost (U)': opts.ru != null ? '10000' : '', 'Name (U)': 'Electabuzz',
});

const eeveeTo = (target, cp, a, d, s, opts = {}) => row({
  Index: String(opts.idx || 1), Name: 'Eevee', 'Pokemon Number': String(NUM.Eevee), CP: String(cp),
  'Atk IV': String(a), 'Def IV': String(d), 'Sta IV': String(s),
  'IV Avg': ((a + d + s) / 45 * 100).toFixed(1), 'Level Min': '5', Dust: '1000',
  'Name (U)': target,
});

const find = (mons, cp) => mons.find(p => p.cp === cp);

// ─── Group A — Electabuzz golden case (the brief's acceptance output) ─────────
describe('Dynamax Master Ⓜ — Electabuzz golden case', () => {
  let mons;
  beforeAll(() => {
    const rows = [
      elecbuzz(1326, 96.0, 15, 15, 13, { idx: 1 }),              // best IV, no league rank
      elecbuzz(1310, 89.0, 14, 13, 13, { idx: 2, ru: 95.0 }),    // wins Ultra among Dmax
      elecbuzz(1303, 87.0, 13, 13, 13, { idx: 3 }),              // no slot
    ];
    const overrides = {
      [keyFor(NUM.Electabuzz, 15, 15, 13, 1)]: { is_dynamax: true },
      [keyFor(NUM.Electabuzz, 14, 13, 13, 2)]: { is_dynamax: true },
      [keyFor(NUM.Electabuzz, 13, 13, 13, 3)]: { is_dynamax: true },
    };
    mons = loader.createWithOverrides(overrides).analyse(toCSV(rows))
      .pokemon.filter(p => p.name === 'Electabuzz');
  });

  it('best Dynamax (96% IV) → ElectiviⓂ96Ⓓ (Master power-up candidate, evolved target #60)', () => {
    const p = find(mons, 1326);
    expect(p).toBeDefined();
    expect(p.isDynamax).toBe(true);
    expect(p.wonDynamaxMaster).toBe(true);
    expect(p.decision).toBe('keep');
    // #60: Pokégenie recommends no PvP evolution (Name(G/U)=Electabuzz), but a Dmax is a raid
    // power-up → the nick shows the terminal evo (Electivire) resolved via VALID_EVOLUTIONS.
    expect(p.nickname).toBe('ElectiviⓂ96Ⓓ');
    expect(p.nickname).not.toContain('Ⓡ');
  });

  // #60 scope: this Dmax ALSO wins an Ultra PvP slot, so it routes through the L/G/U handler
  // (not the dmax slot) and keeps its Pokégenie-recommended unevolved name — only Master /
  // slot-less Dmax+Gmax get the terminal-evo treatment.
  it('Dynamax that wins an Ultra slot (89% IV) → ElectabuⓊ95Ⓓ (Ⓤ, not Ⓜ, not Ⓡ)', () => {
    const p = find(mons, 1310);
    expect(p).toBeDefined();
    expect(p.wonDynamaxMaster).toBeFalsy();
    expect(p.slots).toContain('U');
    expect(p.decision).toBe('keep');
    expect(p.nickname).toBe('ElectabuⓊ95Ⓓ');
    expect(p.nickname).not.toContain('Ⓜ');
    expect(p.nickname).not.toContain('Ⓡ');
  });

  it('slot-less Dynamax (87% IV) → ElectiviⓇ87Ⓓ (keep as raid candidate, evolved target #60)', () => {
    const p = find(mons, 1303);
    expect(p).toBeDefined();
    expect(p.wonDynamaxMaster).toBeFalsy();
    expect(p.decision).toBe('keep');
    // #60: slot-less Dmax routes through the dynamax slot → terminal evo (Electivire).
    expect(p.nickname).toBe('ElectiviⓇ87Ⓓ');
    expect(p.nickname).not.toContain('Ⓜ');
  });

  it('exactly one Dynamax per family carries the Ⓜ flag', () => {
    expect(mons.filter(p => p.wonDynamaxMaster).length).toBe(1);
  });
});

// ─── Group B — best Dmax also wins a capped slot still renders Ⓜ (Change 4 order) ─
describe('Dynamax Master Ⓜ — best Dmax that also wins a capped slot stays Ⓜ', () => {
  it('best-IV Dmax winning an Ultra slot renders Ⓜ, not Ⓤ', () => {
    const rows = [
      elecbuzz(1400, 99.0, 15, 15, 14, { idx: 1, ru: 98.0 }),   // best IV AND wins Ultra
      elecbuzz(1300, 80.0, 12, 12, 12, { idx: 2 }),             // slot-less
    ];
    const overrides = {
      [keyFor(NUM.Electabuzz, 15, 15, 14, 1)]: { is_dynamax: true },
      [keyFor(NUM.Electabuzz, 12, 12, 12, 2)]: { is_dynamax: true },
    };
    const mons = loader.createWithOverrides(overrides).analyse(toCSV(rows))
      .pokemon.filter(p => p.name === 'Electabuzz');
    const best = find(mons, 1400);
    expect(best.wonDynamaxMaster).toBe(true);
    expect(best.decision).toBe('keep');
    expect(best.nickname).toContain('Ⓜ');
    expect(best.nickname).not.toContain('Ⓤ');
    expect(best.nickname).toContain('Ⓓ');
    // the slot-less sibling is kept as a raid candidate
    const dupe = find(mons, 1300);
    expect(dupe.decision).toBe('keep');
    expect(dupe.nickname).toContain('Ⓡ');
  });
});

// ─── Group C — Dynamax DOES compete with regulars for capped slots ────────────
// dmax-gmax-league-rules-refinement (v3.5.54): Dmax/Gmax battle in normal form in
// PvP, so they compete in the SAME capped pool as normals — best ROUNDED rank wins,
// type-priority breaks exact ties. (Reverses the PR #27 |dynamax sub-group.)
describe('Dynamax competes with regulars for capped slots (best rank wins)', () => {
  it('a higher-rank Dmax now wins the Ultra slot a lower-rank Regular would have held', () => {
    const rows = [
      // Regular (non-Dmax): UL 98 on rank.
      elecbuzz(1450, 85.0, 13, 13, 12, { idx: 1, ru: 98.0 }),
      // Dynamax: higher Ultra rank (99) — competes in the SAME pool and wins on rank.
      elecbuzz(1400, 99.0, 15, 15, 14, { idx: 2, ru: 99.0 }),
    ];
    const overrides = {
      [keyFor(NUM.Electabuzz, 15, 15, 14, 2)]: { is_dynamax: true },
    };
    const mons = loader.createWithOverrides(overrides).analyse(toCSV(rows))
      .pokemon.filter(p => p.name === 'Electabuzz');
    const regular = find(mons, 1450);
    const dmax = find(mons, 1400);
    expect(regular.isDynamax).toBeFalsy();
    expect(dmax.isDynamax).toBe(true);
    // Dmax (UL 99) now wins the single Ultra slot on rank — Regular (UL 98) loses it.
    expect(dmax.slots).toContain('U');
    expect(regular.slots).not.toContain('U');
    // Exactly one Ultra keeper for the Electabuzz evo target (no phantom double-slot).
    expect(mons.filter(p => p.slots.includes('U')).length).toBe(1);
    // The best Dmax is also the Master power-up candidate (renders Ⓜ above the capped slot).
    expect(dmax.wonDynamaxMaster).toBe(true);
    expect(dmax.nickname).toContain('Ⓜ');
    // Regular is still kept/surfaced (not asserting trade — depends on family),
    // but it no longer holds the Ultra slot.
    expect(regular.nickname).not.toContain('Ⓤ');
  });
});

// ─── Group D — branching family: one Ⓜ per max-evo target (Eevee) ─────────────
describe('Dynamax Master Ⓜ — branching family keeps one Ⓜ per evo target', () => {
  it('two Dmax Eevees (→Vaporeon / →Flareon) each get their own Ⓜ', () => {
    const rows = [
      eeveeTo('Vaporeon', 500, 10, 10, 9, { idx: 1 }),   // 64.4% — no league slot
      eeveeTo('Flareon',  500, 9, 10, 8, { idx: 2 }),    // 60.0% — no league slot
    ];
    const overrides = {
      [keyFor(NUM.Eevee, 10, 10, 9, 1)]: { is_dynamax: true },
      [keyFor(NUM.Eevee, 9, 10, 8, 2)]: { is_dynamax: true },
    };
    const eevees = loader.createWithOverrides(overrides).analyse(toCSV(rows))
      .pokemon.filter(p => p.name === 'Eevee');
    const vap = eevees.find(p => p.evolvedNameU === 'Vaporeon');
    const fla = eevees.find(p => p.evolvedNameU === 'Flareon');
    expect(vap).toBeDefined();
    expect(fla).toBeDefined();
    // each evo target surfaces its own Master power-up candidate
    expect(vap.wonDynamaxMaster).toBe(true);
    expect(fla.wonDynamaxMaster).toBe(true);
    expect(vap.decision).toBe('keep');
    expect(fla.decision).toBe('keep');
    expect(vap.nickname).toContain('Ⓜ');
    expect(fla.nickname).toContain('Ⓜ');
    expect(eevees.filter(p => p.wonDynamaxMaster).length).toBe(2);
  });
});

// ─── Group E — wonDynamaxMaster is orthogonal to wonMasterSlot ─────────────────
describe('Dynamax Master flag stays orthogonal to the regular Master slot', () => {
  it('a Dmax never sets wonMasterSlot (uses wonDynamaxMaster instead)', () => {
    const rows = [
      elecbuzz(1400, 99.0, 15, 15, 14, { idx: 1 }),   // best Dmax
    ];
    const overrides = {
      [keyFor(NUM.Electabuzz, 15, 15, 14, 1)]: { is_dynamax: true },
    };
    const mons = loader.createWithOverrides(overrides).analyse(toCSV(rows))
      .pokemon.filter(p => p.name === 'Electabuzz');
    const p = find(mons, 1400);
    expect(p.wonDynamaxMaster).toBe(true);
    expect(p.wonMasterSlot).toBeFalsy();
    expect(p.slots).not.toContain('M');
  });

  it('a high-IV Dmax does NOT enter the regular Master pool or demote the non-Dmax Master winner', () => {
    // A regular final-stage Electabuzz wins Master via wonMasterSlot (Ⓜ via wonMasterSlot).
    // A higher-IV Dmax sibling must NOT steal the M slot, must NOT demote the regular winner,
    // and the regular must still render Ⓜ. The Dmax uses its own wonDynamaxMaster flag.
    const rows = [
      elecbuzz(1500, 96.0, 15, 14, 14, { idx: 1 }),   // regular — best non-Dmax IV → Master winner
      elecbuzz(1400, 99.0, 15, 15, 14, { idx: 2 }),   // Dmax — higher IV but excluded from regular Master
    ];
    const overrides = {
      [keyFor(NUM.Electabuzz, 15, 15, 14, 2)]: { is_dynamax: true },
    };
    const mons = loader.createWithOverrides(overrides).analyse(toCSV(rows))
      .pokemon.filter(p => p.name === 'Electabuzz');
    const regular = find(mons, 1500);
    const dmax = find(mons, 1400);
    expect(regular.isDynamax).toBeFalsy();
    expect(dmax.isDynamax).toBe(true);
    // Regular still wins Master despite the Dmax having a higher IV.
    expect(regular.wonMasterSlot).toBe(true);
    expect(regular.slots).toContain('M');
    expect(regular.decision).toBe('keep');
    expect(regular.nickname).toContain('Ⓜ');
    // Dmax keeps its own orthogonal flag and never sets wonMasterSlot / M slot.
    expect(dmax.wonDynamaxMaster).toBe(true);
    expect(dmax.wonMasterSlot).toBeFalsy();
    expect(dmax.slots).not.toContain('M');
    expect(dmax.nickname).toContain('Ⓜ');   // via wonDynamaxMaster, with Ⓓ
    expect(dmax.nickname).toContain('Ⓓ');
  });
});

// ─── Group F — every Dynamax is kept; none are ever traded ─────────────────────
describe('Dynamax are always kept — never traded', () => {
  it('a family of 4 Dmax → all decision=keep, no trade, none with a trade visibility star', () => {
    const rows = [
      elecbuzz(1326, 96.0, 15, 15, 13, { idx: 1 }),              // best → Ⓜ
      elecbuzz(1310, 89.0, 14, 13, 13, { idx: 2, ru: 95.0 }),    // wins Ultra among Dmax
      elecbuzz(1303, 87.0, 13, 13, 13, { idx: 3 }),              // no slot → Ⓡ raid
      elecbuzz(1290, 71.0, 10, 10, 12, { idx: 4 }),              // low IV, no slot → Ⓡ raid
    ];
    const overrides = {
      [keyFor(NUM.Electabuzz, 15, 15, 13, 1)]: { is_dynamax: true },
      [keyFor(NUM.Electabuzz, 14, 13, 13, 2)]: { is_dynamax: true },
      [keyFor(NUM.Electabuzz, 13, 13, 13, 3)]: { is_dynamax: true },
      [keyFor(NUM.Electabuzz, 10, 10, 12, 4)]: { is_dynamax: true },
    };
    const mons = loader.createWithOverrides(overrides).analyse(toCSV(rows))
      .pokemon.filter(p => p.name === 'Electabuzz');
    expect(mons.length).toBe(4);
    mons.forEach(p => {
      expect(p.isDynamax).toBe(true);
      expect(p.decision).toBe('keep');
      expect(p.decision).not.toBe('trade');
    });
    // Every slot-less Dmax holds the 'dynamax' raid slot (Ⓡ) except the Ⓜ winner / capped-slot one.
    const raid = find(mons, 1290);
    expect(raid.slots).toContain('dynamax');
    expect(raid.nickname).toContain('Ⓡ');
    expect(raid.nickname).toContain('Ⓓ');
  });
});

// #60 — terminalEvo fallback for Dmax/Gmax when Pokégenie recommends no league evo
// (evolvedName* empty so base === species). Exercised directly via buildNickname.
describe('Dmax/Gmax terminal-evo fallback (#60)', () => {
  const { buildNickname } = loader;
  const dmax = (name, form='') => buildNickname({
    name, form, atkIV:14, defIV:15, staIV:14, ivAvg:96, isDynamax:true,
    wonDynamaxMaster:true, slots:['dynamax'], evolvedNameG:'', evolvedNameU:'', evolvedNameL:'',
    evolvedFormG:'', evolvedFormU:'', evolvedFormL:'', rankPctM:96, rankPctU:0, rankPctG:0, rankPctL:0,
    hasAllBestMoves:false, hasTwoMoves:false, hasBestMoves:false,
  }, 'dynamax');

  it('single-line mid-evo resolves to terminal: Electabuzz → Electivi…', () => {
    expect(dmax('Electabuzz')).toBe('ElectiviⓂ96Ⓓ');
    expect(dmax('Magmar')).toBe('MagmortaⓂ96Ⓓ');
  });
  it('already-final species unchanged: Snorlax', () => {
    expect(dmax('Snorlax')).toBe('SnorlaxⓂ96Ⓓ');
  });
  it('branching family keeps base name (never guesses): Eevee', () => {
    expect(dmax('Eevee')).toBe('EeveeⓂ96Ⓓ');
  });
  it('regional form resolves via form key: Galar Meowth → Perrserker, Hisui Growlithe → Arcanine', () => {
    expect(dmax('Meowth', 'Galar')).toBe('PerrserkⓂ96Ⓓ');
    expect(dmax('Growlithe', 'Hisui')).toBe('ArcanineⓂ96Ⓓ');
  });
  it('normal form excludes regional-claimed targets: Kanto Meowth → Persian (not the union)', () => {
    expect(dmax('Meowth')).toBe('PersianⓂ96Ⓓ');
  });
});
