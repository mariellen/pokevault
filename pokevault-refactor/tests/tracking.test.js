'use strict';
// GA4 event-tracking helpers — unit tests (ticket: ga4-event-tracking).
//
// These cover the parts of the GA4 work that are OUR logic (guarding,
// PII redaction, debounce) rather than the external gtag call itself.
// Per Opus pre-implementation review "Required Tests".

const { load } = require('./tracking-loader');

describe('trackEvent helper', () => {
  let api;
  beforeEach(() => { delete global.gtag; api = load(); });
  afterEach(() => { delete global.gtag; });

  it('1. does nothing and throws nothing when gtag is undefined', () => {
    expect(() => api.trackEvent('csv_upload', { pokemon_count: 5 })).not.toThrow();
  });

  it('2. throws nothing when gtag is defined but throws when called', () => {
    global.gtag = () => { throw new Error('GA boom'); };
    expect(() => api.trackEvent('cloud_save', { pokemon_count: 5 })).not.toThrow();
  });

  it('3. calls gtag("event", name, params) with correct args when gtag works', () => {
    const calls = [];
    global.gtag = (...args) => calls.push(args);
    api.trackEvent('cull_modal_open', { foo: 1 });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(['event', 'cull_modal_open', { foo: 1 }]);
  });

  it('3b. defaults params to an empty object', () => {
    const calls = [];
    global.gtag = (...args) => calls.push(args);
    api.trackEvent('family_expand');
    expect(calls[0]).toEqual(['event', 'family_expand', {}]);
  });
});

describe('nick_copy payload (buildNickShape) — PII redaction', () => {
  let api;
  beforeEach(() => { api = load(); });

  it('4. emitted params contain NO substring of the raw nick', () => {
    const rawNick = 'mum john.doe@example.com 4/15/2 cp1500';
    const shape = api.buildNickShape(rawNick);
    const serialized = JSON.stringify(shape);
    expect(serialized).not.toContain('john.doe@example.com');
    expect(serialized).not.toContain('example');
    expect(serialized).not.toContain('mum');
    expect(shape).toEqual({
      nick_length: rawNick.length,
      has_iv_pattern: true,
      has_cp: true,
    });
  });

  it('detects absence of IV pattern and CP for a plain nick', () => {
    const shape = api.buildNickShape('Umbreon');
    expect(shape).toEqual({ nick_length: 7, has_iv_pattern: false, has_cp: false });
  });

  it('handles null/undefined nick without throwing', () => {
    expect(() => api.buildNickShape(undefined)).not.toThrow();
    expect(api.buildNickShape(undefined)).toEqual({
      nick_length: 0, has_iv_pattern: false, has_cp: false,
    });
  });
});

describe('search debounce (trackSearchDebounced)', () => {
  let api, calls;
  beforeEach(() => {
    jest.useFakeTimers();
    calls = [];
    global.gtag = (...args) => calls.push(args);
    api = load();
  });
  afterEach(() => { jest.useRealTimers(); delete global.gtag; });

  it('5. rapid calls within 500ms => exactly one gtag call with the LAST term params', () => {
    api.trackSearchDebounced('a');
    jest.advanceTimersByTime(100);
    api.trackSearchDebounced('ab');
    jest.advanceTimersByTime(100);
    api.trackSearchDebounced('abc');
    jest.advanceTimersByTime(499);
    expect(calls).toHaveLength(0); // nothing fired yet
    jest.advanceTimersByTime(1);
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('event');
    expect(calls[0][1]).toBe('search');
    expect(calls[0][2]).toEqual({ term_length: 3, is_numeric: false });
  });

  it('6. search payload contains NO raw term string', () => {
    const rawTerm = 'secretTrainerName';
    api.trackSearchDebounced(rawTerm);
    jest.advanceTimersByTime(500);
    expect(calls).toHaveLength(1);
    const serialized = JSON.stringify(calls[0][2]);
    expect(serialized).not.toContain(rawTerm);
    expect(serialized).not.toContain('secret');
    expect(calls[0][2]).toEqual({ term_length: rawTerm.length, is_numeric: false });
  });

  it('flags a purely numeric term as numeric', () => {
    api.trackSearchDebounced('149');
    jest.advanceTimersByTime(500);
    expect(calls[0][2]).toEqual({ term_length: 3, is_numeric: true });
  });
});
