'use strict';
// Sort by Scan Date (newest first) — unit tests (ticket: sort-scan-date).
//
// Covers the OUR-logic parts of the scan-date sort feature per the Opus
// pre-implementation review "Required Tests":
//   1. Sort orders families by newest member
//   2. Newest member wins, not array order
//   3. Within-family order preserved (family sort never touches members)
//   4. Missing scan date sorts to bottom (desc)
//   5. Missing scan date sorts to bottom (asc) too
//   6. Unparseable date treated as missing
//   7. Date parsing is chronological, not lexical
//   8. Default sort unchanged (option is additive)
//   9. GA4 event fires with the new sort value
//
// The scan date is a per-Pokémon attribute; families are ordered by their
// NEWEST member. Sorting uses the same comparator that applyFilters() wires in:
//   [...families].sort((a,b) => compareFamiliesByScanDate(a,b,dir))

const { load } = require('./sort-loader');

const api = load();
const { parseScanDateMs, familyScanKey, compareFamiliesByScanDate, nextSortMode, trackSortChange } = api;

// Helper: build a family with the given member scan-date strings.
function fam(primaryName, scanDates) {
  return {
    key: primaryName.toLowerCase(),
    primaryName,
    members: scanDates.map((d, i) => ({ name: primaryName, scanDate: d, _order: i })),
  };
}

// Helper: order families newest-first / oldest-first via the app comparator.
function sortDesc(families) {
  return [...families].sort((a, b) => compareFamiliesByScanDate(a, b, 'desc'));
}
function sortAsc(families) {
  return [...families].sort((a, b) => compareFamiliesByScanDate(a, b, 'asc'));
}

describe('parseScanDateMs', () => {
  it('parses an ISO-ish Pokégenie scan date to a numeric timestamp', () => {
    const t = parseScanDateMs({ scanDate: '2026-05-10 10:47' });
    expect(typeof t).toBe('number');
    expect(Number.isNaN(t)).toBe(false);
  });

  it('returns null for a missing scan date', () => {
    expect(parseScanDateMs({ scanDate: '' })).toBeNull();
    expect(parseScanDateMs({ scanDate: '   ' })).toBeNull();
    expect(parseScanDateMs({})).toBeNull();
    expect(parseScanDateMs({ scanDate: undefined })).toBeNull();
  });

  it('6. treats an unparseable / garbage date as missing (null)', () => {
    expect(parseScanDateMs({ scanDate: 'N/A' })).toBeNull();
    expect(parseScanDateMs({ scanDate: 'not-a-date' })).toBeNull();
  });
});

describe('familyScanKey — family-level aggregation', () => {
  it('2. uses the NEWEST member, not array order', () => {
    // The newest scan is the SECOND member; family key must reflect it.
    const f = fam('Eevee', ['2026-01-01 08:00', '2026-06-01 08:00', '2026-03-01 08:00']);
    const newest = parseScanDateMs({ scanDate: '2026-06-01 08:00' });
    expect(familyScanKey(f)).toBe(newest);
  });

  it('returns null when no member has a parseable scan date', () => {
    expect(familyScanKey(fam('Ghost', ['', 'N/A']))).toBeNull();
  });

  it('ignores missing members but still returns the newest real one', () => {
    const f = fam('Mixed', ['', '2026-02-02 09:00', 'N/A']);
    expect(familyScanKey(f)).toBe(parseScanDateMs({ scanDate: '2026-02-02 09:00' }));
  });
});

describe('compareFamiliesByScanDate — family ordering', () => {
  it('1. orders families by newest member (descending = newest first)', () => {
    const older = fam('Older', ['2026-01-01 10:00']);
    const newer = fam('Newer', ['2026-05-01 10:00']);
    const ordered = sortDesc([older, newer]);
    expect(ordered.map(f => f.primaryName)).toEqual(['Newer', 'Older']);
  });

  it('2. family whose 2nd member is newest sorts ahead (max-aggregation)', () => {
    // Family A's newest is its second member (June); Family B is all-March.
    const a = fam('A', ['2026-01-01 10:00', '2026-06-01 10:00']);
    const b = fam('B', ['2026-03-01 10:00', '2026-03-15 10:00']);
    const ordered = sortDesc([b, a]);
    expect(ordered.map(f => f.primaryName)).toEqual(['A', 'B']);
  });

  it('3. family sort never reorders members within a family', () => {
    const a = fam('A', ['2026-01-01 10:00', '2026-06-01 10:00']);
    const b = fam('B', ['2026-03-01 10:00']);
    const before = a.members.map(m => m._order);
    sortDesc([a, b]);
    expect(a.members.map(m => m._order)).toEqual(before); // untouched: [0,1]
  });

  it('4. family with all-blank scan dates sorts LAST under desc', () => {
    const dated = fam('Dated', ['2026-04-01 10:00']);
    const blank = fam('Blank', ['', '']);
    const ordered = sortDesc([blank, dated]);
    expect(ordered.map(f => f.primaryName)).toEqual(['Dated', 'Blank']);
  });

  it('5. family with all-blank scan dates sorts LAST under asc too (not floated to top)', () => {
    const earliest = fam('Earliest', ['2026-01-01 10:00']);
    const latest = fam('Latest', ['2026-09-01 10:00']);
    const blank = fam('Blank', ['']);
    const ordered = sortAsc([blank, latest, earliest]);
    // oldest real first, newest real second, missing pinned to the bottom
    expect(ordered.map(f => f.primaryName)).toEqual(['Earliest', 'Latest', 'Blank']);
  });

  it('6. family whose only date is garbage is treated as missing → bottom', () => {
    const dated = fam('Dated', ['2026-04-01 10:00']);
    const garbage = fam('Garbage', ['N/A']);
    expect(sortDesc([garbage, dated]).map(f => f.primaryName)).toEqual(['Dated', 'Garbage']);
    expect(sortAsc([garbage, dated]).map(f => f.primaryName)).toEqual(['Dated', 'Garbage']);
  });

  it('7. parses chronologically, not lexically (DD/MM/YYYY slash format)', () => {
    // "9/1/2024" = 9 Jan, "10/1/2024" = 10 Jan. Lexically "10..." < "9..."
    // but chronologically 10 Jan is NEWER, so it must sort first under desc.
    const jan9 = fam('Jan9', ['9/1/2024']);
    const jan10 = fam('Jan10', ['10/1/2024']);
    const ordered = sortDesc([jan9, jan10]);
    expect(ordered.map(f => f.primaryName)).toEqual(['Jan10', 'Jan9']);
  });

  it('breaks ties on primaryName for stable output', () => {
    const z = fam('Zubat', ['2026-02-02 10:00']);
    const a = fam('Abra', ['2026-02-02 10:00']);
    expect(sortDesc([z, a]).map(f => f.primaryName)).toEqual(['Abra', 'Zubat']);
  });
});

describe('sort mode cycle — additive option', () => {
  it('8. default sort mode is unchanged (still "star")', () => {
    // render.js owns the global default; assert it has not become scan-date.
    const fs = require('fs');
    const path = require('path');
    const renderSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'render.js'), 'utf8');
    expect(renderSrc).toMatch(/sortMode\s*=\s*'star'/);
  });

  it('cycles star → count → name → scanDateDesc → scanDateAsc → star', () => {
    expect(nextSortMode('star')).toBe('count');
    expect(nextSortMode('count')).toBe('name');
    expect(nextSortMode('name')).toBe('scanDateDesc');
    expect(nextSortMode('scanDateDesc')).toBe('scanDateAsc');
    expect(nextSortMode('scanDateAsc')).toBe('star');
  });

  it('falls back to star for an unknown mode', () => {
    expect(nextSortMode('bogus')).toBe('star');
  });
});

describe('GA4 sort tracking', () => {
  afterEach(() => { delete global.gtag; });

  it('9. fires a sort_change event with the new sort identifier', () => {
    const calls = [];
    global.gtag = (...args) => calls.push(args);
    trackSortChange('scanDateDesc');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(['event', 'sort_change', { sort: 'scanDateDesc' }]);
  });

  it('never throws when gtag is undefined', () => {
    delete global.gtag;
    expect(() => trackSortChange('scanDateAsc')).not.toThrow();
  });
});
