'use strict';
// #74 — Mobile override panel wrap. The override panel already had flex-wrap inline, but it sits
// in a colspan td inside the horizontally-scrollable results table, so it wrapped to the wide
// TABLE width (still horizontal-scrolling). The fix tags the panel with `.override-panel` and a
// mobile CSS rule pins it to the viewport and caps its width, so controls reflow within the screen.

const fs = require('fs');
const path = require('path');
const renderLoader = require('./render-loader');

const makeP = () => ({
  idx: 1, stableKey: 'k1', name: 'Squawkabilly', form: '', cp: 500,
  nickname: 'SquawkabiⓇ91', ivAvg: 91, atkIV: 14, defIV: 14, staIV: 13,
  decision: 'keep', slots: ['collection'], reason: '', notes: '',
  rankPctL: 0, rankPctG: 0, rankPctU: 0, rankPctM: 91,
  rankNumL: null, rankNumG: null, rankNumU: null,
  dustL: 0, dustG: 0, dustU: 0, isLucky: false, isShiny: false, isShadow: false,
  isDynamax: false, isGigantamax: false, isCostumed: false,
  quickMove: '', chargeMove1: '', chargeMove2: '',
});

describe('#74 — override panel wraps within the viewport on mobile', () => {
  it('buildRow tags the override panel with the .override-panel hook', () => {
    const html = renderLoader.buildRow(makeP());
    expect(html).toContain('class="override-panel"');
  });

  it('mobile CSS pins the panel to the viewport and caps its width', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'styles.css'), 'utf8');
    // The rule must exist and constrain width to the viewport (not the table).
    expect(css).toMatch(/\.override-panel\s*\{[^}]*position:sticky/);
    expect(css).toMatch(/\.override-panel\s*\{[^}]*max-width:calc\(100vw/);
  });
});
