'use strict';
// #65 — Per-family form filter dropdown. Header renders a <select> (render.js formFilterSelect)
// for species with a FORM_DROPDOWNS entry; each row carries its form as data-form (buildRow) so
// the client-side filterFamilyByForm (app.js, DOM — not unit-tested here) can show/hide rows.

const renderLoader = require('./render-loader');

const makeP = (over) => Object.assign({
  idx: 1, stableKey: 'k1', name: 'Pikachu', form: '', cp: 500, nickname: 'Pikachu',
  ivAvg: 90, atkIV: 14, defIV: 13, staIV: 13, decision: 'keep', slots: ['M'],
  reason: '', notes: '', specialForm: '', vivillonPattern: '',
  rankPctL: 0, rankPctG: 0, rankPctU: 0, rankPctM: 90,
  rankNumL: null, rankNumG: null, rankNumU: null, dustL: 0, dustG: 0, dustU: 0,
  isLucky: false, isShiny: false, isShadow: false, isCostumed: false,
  isDynamax: false, isGigantamax: false, quickMove: '', chargeMove1: '', chargeMove2: '',
}, over);

describe('#65 — formFilterSelect (header dropdown)', () => {
  it('renders an All-forms + per-form <select> for a FORM_DROPDOWNS species', () => {
    const html = renderLoader.formFilterSelect('Pikachu', '25');
    expect(html).toContain('<select class="fam-form-filter"');
    expect(html).toContain('<option value="__all__">All forms</option>');
    expect(html).toContain('value="Santa Hat"');
    expect(html).toContain('value="Team Instinct Hat"');
    // wired to the family-scoped filter + a count span, and does not toggle the family
    expect(html).toContain("filterFamilyByForm('25',this.value)");
    expect(html).toContain('event.stopPropagation()');
    expect(html).toContain('fam-form-count');
  });

  it("omits the 'Unknown' override sentinel from the filter options", () => {
    const html = renderLoader.formFilterSelect('Pikachu', '25');
    expect(html).not.toContain('>Unknown<');
  });

  it('renders nothing for a species with no FORM_DROPDOWNS entry', () => {
    expect(renderLoader.formFilterSelect('Rattata', '19')).toBe('');
  });

  it('works for other dropdown species (Squawkabilly, Furfrou)', () => {
    expect(renderLoader.formFilterSelect('Squawkabilly', '931')).toContain('value="Green Plumage"');
    expect(renderLoader.formFilterSelect('Furfrou', '676')).toContain('value="Pharaoh"');
  });
});

describe('#65 — buildRow tags each row with its form (data-form)', () => {
  it('a tagged member carries data-form with its specialForm', () => {
    const html = renderLoader.buildRow(makeP({ specialForm: 'Rock Star' }));
    expect(html).toContain('data-form="Rock Star"');
  });

  it('a vivillonPattern member carries data-form with the pattern', () => {
    const html = renderLoader.buildRow(makeP({ name: 'Vivillon', vivillonPattern: 'Polar' }));
    expect(html).toContain('data-form="Polar"');
  });

  it('an untagged member carries an empty data-form (hidden when a form is selected)', () => {
    const html = renderLoader.buildRow(makeP({}));
    expect(html).toContain('data-form=""');
  });
});
