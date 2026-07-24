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
    expect(html).toContain('value="__all__"'); // All forms option present (may carry 'selected')
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

describe('#88 — formFilterSelect pre-selects the saved form on re-render', () => {
  afterEach(() => {
    // Clean up state between tests
    Object.keys(renderLoader.formFilterActiveByKey).forEach(k => delete renderLoader.formFilterActiveByKey[k]);
  });

  it('defaults to All forms selected when no saved state exists', () => {
    const html = renderLoader.formFilterSelect('Pikachu', 'pika-test');
    expect(html).toContain('<option value="__all__" selected>All forms</option>');
    expect(html).not.toContain('" selected>Rock Star');
  });

  it('pre-selects the saved form when formFilterActiveByKey is set', () => {
    renderLoader.formFilterActiveByKey['pika-test'] = 'Rock Star';
    const html = renderLoader.formFilterSelect('Pikachu', 'pika-test');
    expect(html).toContain('value="Rock Star" selected');
    // All forms should NOT be selected
    expect(html).not.toContain('<option value="__all__" selected>');
  });

  it('pre-selects All forms when saved state is reset to empty string', () => {
    renderLoader.formFilterActiveByKey['pika-test'] = '';
    const html = renderLoader.formFilterSelect('Pikachu', 'pika-test');
    expect(html).toContain('<option value="__all__" selected>All forms</option>');
  });

  it('does not cross-contaminate different family keys', () => {
    renderLoader.formFilterActiveByKey['fam-a'] = 'Santa Hat';
    renderLoader.formFilterActiveByKey['fam-b'] = '';
    const htmlA = renderLoader.formFilterSelect('Pikachu', 'fam-a');
    const htmlB = renderLoader.formFilterSelect('Pikachu', 'fam-b');
    expect(htmlA).toContain('value="Santa Hat" selected');
    expect(htmlB).toContain('<option value="__all__" selected>All forms</option>');
  });
});

describe('#89 — Set Forms modal formIsSet: Unknown shown, None hidden', () => {
  // formIsSet is a closure inside openCleanupModal, so we test the equivalent logic directly.
  // Rule: blank or 'Unknown' = not yet reviewed (show); 'None' or any real form = hide.
  function formIsSet(specialForm, vivillonPattern) {
    const sf = specialForm || '', vp = vivillonPattern || '';
    return (sf !== '' && sf !== 'Unknown') || (vp !== '' && vp !== 'Unknown');
  }

  it('blank specialForm → show (not yet tagged)', () => {
    expect(formIsSet('', '')).toBe(false);
  });

  it("specialForm='Unknown' → show (not yet reviewed)", () => {
    expect(formIsSet('Unknown', '')).toBe(false);
  });

  it("specialForm='None' → hide (confirmed no costume)", () => {
    expect(formIsSet('None', '')).toBe(true);
  });

  it("specialForm='Rock Star' → hide (real form set)", () => {
    expect(formIsSet('Rock Star', '')).toBe(true);
  });

  it("vivillonPattern='Unknown' → show", () => {
    expect(formIsSet('', 'Unknown')).toBe(false);
  });

  it("vivillonPattern='Polar' → hide (real pattern set)", () => {
    expect(formIsSet('', 'Polar')).toBe(true);
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
