'use strict';
// Regression tests for GitHub issue #19 — "fitName counting circled Unicode
// letters as 3 chars instead of 1".
//
// Pokémon GO counts the circled league/marker letters (Ⓖ Ⓤ Ⓛ Ⓜ Ⓡ Ⓗ Ⓓ Ⓧ ※) as
// ONE character each toward the 12-char nick limit. In the refactor, fitName()
// already measures with String.length, and every one of these glyphs is a single
// UTF-16 code unit (U+24xx / U+203B), so it already counts each as 1 — the
// 3-chars-each behaviour was a pre-refactor (single-file HTML) bug. These tests
// lock the correct behaviour in against regression, using the exact cases the
// issue confirmed by testing in GO.

const { buildNickname } = require('./loader');

// Minimal synthetic Pokémon — only the fields buildNickname reads for a capped
// league ('G') nick. No CSV fixture needed.
function poke(extra = {}) {
  return {
    name: 'Kabutops',
    atkIV: 0, defIV: 15, staIV: 15, // Great-rank 100 but NOT a hundo (no Ⓗ suffix)
    ivAvg: 67,
    rankPctG: 100,
    slots: ['G'],
    isShadow: false,
    ...extra,
  };
}

describe('#19 — circled letters count as 1 char toward the 12-char GO limit', () => {
  test('KabutopsⒼ100 is generated in full (not truncated to KabutG100)', () => {
    const nick = buildNickname(poke(), 'G');
    expect(nick).toBe('KabutopsⒼ100');
    expect(nick.length).toBe(12);            // 8 name + Ⓖ + "100" = 12
    expect(nick).toContain('Ⓖ');             // circled letter preserved
    expect(nick).not.toContain('G1');        // not the plain-letter fallback
  });

  test('KabutopsⒼ92Ⓓ — Dynamax marker also counts as 1 char', () => {
    const nick = buildNickname(poke({
      atkIV: 14, defIV: 13, staIV: 14, ivAvg: 92, rankPctG: 92, isDynamax: true,
    }), 'G');
    expect(nick).toBe('KabutopsⒼ92Ⓓ');
    expect(nick.length).toBe(12);            // 8 name + Ⓖ + "92" + Ⓓ = 12
  });

  test('each circled / marker glyph is a single UTF-16 code unit', () => {
    // The premise of the fix: these are width-1 in JS String.length, matching GO.
    for (const g of ['Ⓖ', 'Ⓤ', 'ⓛ', 'Ⓜ', 'Ⓡ', 'Ⓗ', 'Ⓓ', 'Ⓧ', '※']) {
      expect(g.length).toBe(1);
    }
  });

  test('an 11-char-name family still fits its circled nick (GlaceonⒼ100)', () => {
    const nick = buildNickname(poke({ name: 'Glaceon', rankPctG: 100 }), 'G');
    expect(nick).toBe('GlaceonⒼ100');
    expect(nick.length).toBeLessThanOrEqual(12);
  });
});
