'use strict';
// #83 — Per-costume best-IV keeper for the Pikachu family. Extends the v3.5.64 per-form collection
// keeper (Squawkabilly/Furfrou/Vivillon) to Pikachu/Pichu/Raichu via COSTUME_KEEPER_SPECIES —
// keyed on the specialForm costume, but WITHOUT a COLLECTION_SETS completeness set. Costumes are set
// via the special_form override (Pokégenie doesn't export them), so fixtures attach them through
// loader.createWithOverrides keyed by stableKey.

const loader = require('./loader');
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
const keyFor = (num, a, d, s, idx) => [String(num), '', '', a, d, s, '_idx' + idx].join('|');
const analyseWith = (rows, ov) => loader.createWithOverrides(ov).analyse(toCSV(rows)).pokemon;
const find = (mons, cp) => mons.find(p => p.cp === cp);

const PIKA = 25;
const pk = (cp, a, d, s, idx, opts = {}) => row(Object.assign({
  Index: String(idx), Name: opts.name || 'Pikachu', 'Pokemon Number': String(opts.num || PIKA),
  CP: String(cp), 'Atk IV': String(a), 'Def IV': String(d), 'Sta IV': String(s),
  'IV Avg': ((a + d + s) / 45 * 100).toFixed(1), 'Level Min': '20', Dust: '5000',
  Lucky: opts.lucky ? '1' : '', Favorite: opts.fav ? '1' : '',
}, opts.g ? { 'Rank % (G)': opts.g, 'Name (G)': 'Raichu' } : {}));

const isCostumeKeeper = (p) => p.decision === 'keep' && p.slots.includes('collection');

describe('#83 — Pikachu per-costume keeper', () => {
  it('two Rock Star Pikachu → best IV (98%) is the green keeper RaichuⓇ98; the other is not kept', () => {
    const mons = analyseWith(
      [pk(500, 15, 14, 15, 1), pk(480, 14, 13, 14, 2)],
      { [keyFor(PIKA, 15, 14, 15, 1)]: { special_form: 'Rock Star' },
        [keyFor(PIKA, 14, 13, 14, 2)]: { special_form: 'Rock Star' } },
    );
    const best = find(mons, 500), other = find(mons, 480);
    expect(best.decision).toBe('keep');
    expect(best.slots).toContain('collection');
    expect(best.starType).toBe('green');   // IV ≥ 90
    expect(best.nickname).toBe('RaichuⓇ98'); // final-evo name via terminalEvo, not Pikachu
    // the non-best Rock Star is NOT a per-costume keeper
    expect(other.slots).not.toContain('collection');
    expect(other.decision).not.toBe('keep');
  });

  it('a lone sub-90 costume (Santa Hat 84%) is still kept — grey star RaichuⓇ84', () => {
    const mons = analyseWith([pk(460, 12, 13, 13, 1)],
      { [keyFor(PIKA, 12, 13, 13, 1)]: { special_form: 'Santa Hat' } });
    const p = find(mons, 460);
    expect(p.decision).toBe('keep');
    expect(p.slots).toContain('collection');
    expect(p.starType).toBe('grey');       // IV < 90
    expect(p.nickname).toBe('RaichuⓇ84');
  });

  it('favourited costume keeper → gold star', () => {
    const mons = analyseWith([pk(460, 12, 13, 13, 1, { fav: true })],
      { [keyFor(PIKA, 12, 13, 13, 1)]: { special_form: 'Santa Hat' } });
    expect(find(mons, 460).starType).toBe('gold');
  });

  it("untagged (specialForm='Unknown') → no costume keeper, competes normally (not kept)", () => {
    const mons = analyseWith([pk(455, 12, 13, 13, 1)],
      { [keyFor(PIKA, 12, 13, 13, 1)]: { special_form: 'Unknown' } });
    const p = find(mons, 455);
    expect(p.slots).not.toContain('collection'); // no keeper until tagged
    expect(p.decision).not.toBe('keep');          // review/trade, per family context
  });

  it("'None' (confirmed plain) → no costume keeper; a hundo competes normally and is kept", () => {
    const mons = analyseWith([pk(454, 15, 15, 15, 1)],
      { [keyFor(PIKA, 15, 15, 15, 1)]: { special_form: 'None' } });
    const p = find(mons, 454);
    expect(p.slots).not.toContain('collection'); // not a costume keeper
    expect(p.decision).toBe('keep');             // but a hundo still keeps (normal rules)
  });

  it('Lucky costume Pikachu → always kept (existing Lucky rule)', () => {
    const mons = analyseWith([pk(505, 12, 12, 12, 1, { lucky: true })],
      { [keyFor(PIKA, 12, 12, 12, 1)]: { special_form: 'Beanie' } });
    const p = find(mons, 505);
    expect(p.decision).toBe('keep');
    expect(p.slots).toContain('lucky');
  });

  it('Shiny costume Pikachu → best shiny kept (existing shiny rule)', () => {
    const mons = analyseWith([pk(462, 12, 13, 14, 1)],
      { [keyFor(PIKA, 12, 13, 14, 1)]: { special_form: 'Santa Hat', is_shiny: true } });
    const p = find(mons, 462);
    expect(p.decision).toBe('keep');
    expect(p.isShiny).toBe(true);
  });

  it('a costume Pikachu that wins a real GL slot keeps the league nick (RaichuⒼ99), not the Ⓡ keeper', () => {
    // IV 86.7 (< 90) so the M-first one-slot rule doesn't claim Master before G; Rank%(G)=99 wins GL.
    const mons = analyseWith([pk(900, 11, 14, 14, 1, { g: '99.0' })],
      { [keyFor(PIKA, 11, 14, 14, 1)]: { special_form: 'Cake' } });
    const p = find(mons, 900);
    expect(p.decision).toBe('keep');
    expect(p.nickname).toBe('RaichuⒼ99');  // league nick precedence (form-blind PvP win)
    expect(p.slots).toContain('G');
  });

  it('a tagged Raichu keeper nicks RaichuⓇ{IV} (terminalEvo no-op on the final evo)', () => {
    const mons = analyseWith([pk(1200, 12, 13, 13, 1, { name: 'Raichu', num: 26 })],
      { [keyFor(26, 12, 13, 13, 1)]: { special_form: 'Rock Star' } });
    const p = find(mons, 1200);
    expect(p.decision).toBe('keep');
    expect(p.nickname).toBe('RaichuⓇ84');
  });
});
