'use strict';
// Feature Batch June 2026 — F3: Track name of last CSV loaded.
//
// setCsvFilename(name) centralises the header filename label:
//   • persists the name to localStorage ('pokevault_last_csv'), capped to 120 chars
//   • renders ' · name' into #csvFilename via textContent (auto-escaped — XSS-safe)
//   • setCsvFilename(null) clears both storage and the label
//   • loading a new CSV overwrites the previous name

const LS_KEY = 'pokevault_last_csv';
const { load } = require('./csv-filename-loader');

describe('setCsvFilename — persistence + label', () => {
  it('persists the filename to localStorage and shows the label', () => {
    const { setCsvFilename, store, csvEl } = load();
    setCsvFilename('poke_genie_export_202.csv');
    expect(store.get(LS_KEY)).toBe('poke_genie_export_202.csv');
    expect(csvEl.textContent).toBe(' · poke_genie_export_202.csv');
    expect(csvEl.style.display).toBe('inline');
  });

  it('clears storage and hides the label when called with null', () => {
    const { setCsvFilename, store, csvEl } = load();
    setCsvFilename('a.csv');
    setCsvFilename(null);
    expect(store.has(LS_KEY)).toBe(false);
    expect(csvEl.textContent).toBe('');
    expect(csvEl.style.display).toBe('none');
  });

  it('overwrites the previous filename when a new CSV loads', () => {
    const { setCsvFilename, store, csvEl } = load();
    setCsvFilename('old.csv');
    setCsvFilename('new.csv');
    expect(store.get(LS_KEY)).toBe('new.csv');
    expect(csvEl.textContent).toBe(' · new.csv');
  });

  it('caps the stored name length to 120 chars (defensive)', () => {
    const { setCsvFilename, store } = load();
    const longName = 'x'.repeat(200) + '.csv';
    setCsvFilename(longName);
    expect(store.get(LS_KEY).length).toBe(120);
  });

  it('renders via textContent (no innerHTML) so filenames cannot inject HTML', () => {
    const { setCsvFilename, csvEl } = load();
    setCsvFilename('<img src=x onerror=alert(1)>.csv');
    // textContent assignment never sets innerHTML — the raw string is stored as text.
    expect(csvEl.innerHTML).toBe('');
    expect(csvEl.textContent).toContain('<img');
  });
});
