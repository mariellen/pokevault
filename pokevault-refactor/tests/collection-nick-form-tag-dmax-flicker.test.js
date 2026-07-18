'use strict';
// Brief: collection-keeper-nick-and-display-fixes (v3.5.66) — three independent display fixes.
//   Fix 1 (#72 Bug A) — a collection keeper carrying a tentative (unconfirmed, <90%) league-slot
//                        artifact must nick as NameⓇ{IV%}, not the review holding nick (Squawk98u95g).
//   Fix 2 (#72 Bug B) — the cosmetic-form tag carries a `vt-form` class so mobile CSS can keep it visible.
//   Fix 3 (#67)       — ticking Dynamax/Gigantamax in the override panel routes the immediate nick
//                        preview through the dmax/gmax slot handler (evolved terminal name), not the
//                        base-name review nick (the PidoveⓇ84Ⓓ → UnfezantⓇ84Ⓓ flicker).

const fs = require('fs');
const path = require('path');
const loader = require('./loader');
const renderLoader = require('./render-loader');
const setOverrideLoader = require('./set-override-loader');
const { parseCSV } = require('./csvParser');

// ─── CSV plumbing (mirrors analyse.per-form-collection.test.js) ──────────────
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
const keyFor = (num, a, d, s, idx) => [String(num), '', '', a, d, s, '_idx' + idx].join('|');
const analyseWith = (rows, overrides) =>
  loader.createWithOverrides(overrides).analyse(toCSV(rows)).pokemon;

const SQUAWK = 931;
// Squawkabilly cosmetic-form mon with an explicit set of PvP rank columns.
const squawk = (cp, a, d, s, idx, ranks = {}) => row({
  Index: String(idx), Name: 'Squawkabilly', 'Pokemon Number': String(SQUAWK),
  CP: String(cp), 'Atk IV': String(a), 'Def IV': String(d), 'Sta IV': String(s),
  'IV Avg': ((a + d + s) / 45 * 100).toFixed(1), 'Level Min': '20', Dust: '5000',
  'Rank % (G)': ranks.g || '', 'Name (G)': ranks.g ? 'Squawkabilly' : '',
  'Rank % (U)': ranks.u || '', 'Name (U)': ranks.u ? 'Squawkabilly' : '',
});

// ════════════════════════════════════════════════════════════════════════════
// Fix 1 (#72 Bug A) — collection keeper + tentative sub-90 league slot → NameⓇ{IV%}
// ════════════════════════════════════════════════════════════════════════════
describe('#72 Bug A — collection keeper carrying a tentative league slot nicks as NameⓇ{IV%}', () => {
  it('White Plumage 84% with a sub-90 G rank → SquawkabiⓇ84 (not the Squawk88g review nick)', () => {
    // G=88 clears the C3 "any rank>0 surfaces" floor → tentative 'G' slot, but <90 → slotConfirmed
    // falsy. Pre-fix this fell to buildNickname(p,'review') → a league-rank holding nick.
    const mons = analyseWith(
      [squawk(480, 12, 13, 13, 1, { g: '88.0' })],
      { [keyFor(SQUAWK, 12, 13, 13, 1)]: { special_form: 'White Plumage' } },
    );
    const p = mons.find(x => x.cp === 480);
    expect(p.decision).toBe('keep');
    expect(p.slots).toContain('collection');
    expect(p.slots).toContain('G');            // tentative artifact present…
    expect(p.slotConfirmed).toBeFalsy();       // …but not confirmed
    expect(p.nickname).toBe('SquawkabiⓇ84');   // collection nick, own species name
    expect(p.nickname).not.toMatch(/\d+[gul]/i); // no league-rank holding suffix
  });

  it('shared helper — a collection keeper WITHOUT a retained league slot yields the same NameⓇ{IV%}', () => {
    // A high-IV keeper (14/14/14, U=96) has its tentative slot released and routes through the
    // OTHER applyCollectionNick call site. Both call sites must emit the identical NameⓇ{IV%} shape —
    // this guards the v3.5.66 refactor that hoisted the two branches into one shared helper.
    const mons = analyseWith(
      [squawk(560, 14, 14, 14, 1, { u: '96.0' })],
      { [keyFor(SQUAWK, 14, 14, 14, 1)]: { special_form: 'Blue Plumage' } },
    );
    const p = mons.find(x => x.cp === 560);
    expect(p.decision).toBe('keep');
    expect(p.slots).toContain('collection');
    expect(p.slots).not.toContain('U');         // tentative slot released → second branch
    expect(p.nickname).toMatch(/^Squawkabi.*Ⓡ\d+$/); // same NameⓇ{IV%} shape, no league suffix
  });

  it('non-collection species with a sub-90 tentative slot still routes to review (unchanged)', () => {
    // A plain Pidgey (no cosmetic form → no collection slot) keeps the tentative-review behaviour.
    const r = row({
      Index: '1', Name: 'Pidgey', 'Pokemon Number': '16', CP: '400',
      'Atk IV': '12', 'Def IV': '13', 'Sta IV': '13', 'IV Avg': '84.4', 'Level Min': '20', Dust: '5000',
      'Rank % (G)': '88.0', 'Name (G)': 'Pidgeotto',
    });
    const p = loader.createWithOverrides({}).analyse(toCSV([r])).pokemon[0];
    expect(p.slots).not.toContain('collection');
    expect(p.decision).toBe('review');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Fix 2 (#72 Bug B) — cosmetic-form tag carries `vt-form` for mobile visibility
// ════════════════════════════════════════════════════════════════════════════
describe('#72 Bug B — cosmetic-form variant tag carries the vt-form class', () => {
  const baseP = (over) => Object.assign({
    idx: 1, stableKey: 'k1', name: 'Squawkabilly', form: '', cp: 500,
    nickname: 'SquawkabiⓇ91', ivAvg: 91, atkIV: 14, defIV: 14, staIV: 13,
    decision: 'keep', slots: ['collection'], isFavorite: false,
  }, over);

  it('a vivillonPattern tag renders with class="vtag vt-form"', () => {
    const html = renderLoader.variantTags(baseP({ vivillonPattern: 'Green Plumage' }));
    expect(html).toContain('vt-form');
    expect(html).toMatch(/class="vtag vt-form"/);
    expect(html).toContain('Green Plumage');
  });

  it('no vivillonPattern → no vt-form tag', () => {
    expect(renderLoader.variantTags(baseP({}))).not.toContain('vt-form');
  });

  it('mobile CSS keeps vt-form visible (the hide rule excludes it)', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'styles.css'), 'utf8');
    // The mobile ".vtag:not(...)" collapse rule must carry a :not(.vt-form) exclusion.
    expect(css).toMatch(/\.vtag:not\([^{]*\.vt-form\)[^{]*\{display:none;\}/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Fix 3 (#67) — Dynamax/Gigantamax override preview shows the evolved terminal name
// ════════════════════════════════════════════════════════════════════════════
describe('#67 — setOverride nick preview routes Dmax/Gmax through the evolved-name handler', () => {
  const pidove = () => ({
    stableKey: 'k1', idx: 1, name: 'Pidove', form: '', ivAvg: 84,
    atkIV: 12, defIV: 12, staIV: 12, slots: [], rankPctU: 0, rankPctG: 0,
  });

  it('ticking Dynamax pushes the dynamax slot and previews the evolved terminal name', () => {
    const p = pidove();
    setOverrideLoader.setAllPokemon([p]);
    setOverrideLoader.setOverride('k1', 'is_dynamax', true);
    expect(p.isDynamax).toBe(true);
    expect(p.slots).toContain('dynamax');
    expect(p.nickname).toBe('UnfezantⓇ84Ⓓ');   // NOT PidoveⓇ84Ⓓ — the flicker is gone
    expect(p.nickname).not.toMatch(/^Pidove/);
  });

  it('unticking Dynamax removes the slot again (reverts)', () => {
    const p = pidove();
    setOverrideLoader.setAllPokemon([p]);
    setOverrideLoader.setOverride('k1', 'is_dynamax', true);
    setOverrideLoader.setOverride('k1', 'is_dynamax', false);
    expect(p.isDynamax).toBe(false);
    expect(p.slots).not.toContain('dynamax');
  });

  it('ticking Gigantamax previews the evolved terminal name with the Ⓧ suffix', () => {
    const p = Object.assign(pidove(), { stableKey: 'k2', idx: 2 });
    setOverrideLoader.setAllPokemon([p]);
    setOverrideLoader.setOverride('k2', 'is_gigantamax', true);
    expect(p.slots).toContain('gigantamax');
    expect(p.nickname).toBe('UnfezantⓇ84Ⓧ');
  });

  it('a species with no further evolution (Snorlax) keeps its own name', () => {
    const p = { stableKey: 'k3', idx: 3, name: 'Snorlax', form: '', ivAvg: 84,
      atkIV: 12, defIV: 12, staIV: 12, slots: [], rankPctU: 0, rankPctG: 0 };
    setOverrideLoader.setAllPokemon([p]);
    setOverrideLoader.setOverride('k3', 'is_dynamax', true);
    expect(p.nickname).toBe('SnorlaxⓇ84Ⓓ');
  });

  it('buildNickname sanity — the dmax slot evolves, the review slot does not (why the fix matters)', () => {
    const base = { name: 'Pidove', form: '', ivAvg: 84, atkIV: 12, defIV: 12, staIV: 12, isDynamax: true };
    expect(renderLoader.buildNickname({ ...base }, 'dynamax')).toBe('UnfezantⓇ84Ⓓ');
    expect(renderLoader.buildNickname({ ...base }, 'review')).toBe('PidoveⓇ84Ⓓ');
  });
});
