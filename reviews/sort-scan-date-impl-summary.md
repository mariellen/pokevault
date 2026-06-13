# Implementation Summary — Sort by Scan Date (newest first)

**Ticket:** sort-scan-date
**Version target:** v3.5.46
**Route:** DIRECT
**Date:** 12 Jun 2026

## What changed and why

Added two new sort modes — **"Scan date ↓"** (newest first, the primary brief
ask) and **"Scan date ↑"** (oldest first) — to the existing collection sort
control. After a big catching session Mariellen can now surface the most
recently scanned Pokémon at the top of the family list.

The sort applies at the **family** level (the app sorts families, not loose
Pokémon). Because scan date is a per-Pokémon attribute, each family's sort key
is its **newest** member's scan date (max-aggregation). Within-family member
ordering (star/decision) is untouched — the family comparator never reorders
`members`.

Three pure helpers were added to `app.js`:

- `parseScanDateMs(p)` — per-Pokémon scan timestamp in ms, or `null` when the
  scan date is missing/blank/unparseable. Delegates to the existing
  `parsePokegenieDate()` so comparison is **chronological, not lexical**, and
  handles both Pokégenie scan-date format (`YYYY-MM-DD HH:MM`) and legacy
  slash format (`DD/MM/YYYY`).
- `familyScanKey(fam)` — newest member scan time, or `null` if none parse.
  Uses `reduce(Math.max, -Infinity)` (not spread) to avoid call-stack limits
  on pathologically large families.
- `compareFamiliesByScanDate(a, b, dir)` — `Array.sort` comparator. Missing-date
  families are **always pinned to the bottom regardless of direction** (the
  Opus-flagged asc/missing contradiction — see Deviations). Ties break on
  `primaryName` for stable output.

These are wired into `applyFilters()` (the existing family-sort switch) under
`sortMode === 'scanDateDesc'` / `'scanDateAsc'`. The existing star/count/name
branches are unchanged.

The sort UI is a **cycling button** (`cycleSortMode`), not a literal `<select>`
(see Deviations). It was refactored to cycle through a `SORT_CYCLE` array
`['star','count','name','scanDateDesc','scanDateAsc']` with a `nextSortMode()`
helper and a `SORT_BTN_LABELS` map. The new modes are **appended to the tail**,
so the default (`star`, owned by `render.js`) is unchanged and the feature is
purely additive.

GA4: `cycleSortMode` now fires a `sort_change` event (`{ sort: <mode> }`) via a
`trackSortChange()` wrapper, coordinating with the bundled ga4-event-tracking
brief without entangling the two concerns.

## Field key verification

Confirmed against `analyse.js` (line ~644): the CSV `Scan Date` column is parsed
into `p.scanDate` (and `Original Scan Date` → `p.originalScanDate`, which is
**not** used as a sort key, per the brief). Schema/round-trip tests already
assert `p.scanDate` is populated from the fixture, so the accessor casing is
correct — no silent `undefined → everything-to-bottom` failure.

## Files modified

- `pokevault-refactor/js/app.js`
  - Added `parseScanDateMs`, `familyScanKey`, `compareFamiliesByScanDate`
    (new "SCAN-DATE SORT" block).
  - Added two branches in `applyFilters()` for `scanDateDesc` / `scanDateAsc`.
  - Replaced `cycleSortMode` body with `SORT_CYCLE` / `SORT_BTN_LABELS` /
    `nextSortMode` / `trackSortChange`.
- `pokevault-refactor/tests/sort-scan-date.test.js` — new test file (TDD).
- `pokevault-refactor/tests/sort-loader.js` — new Node loader (mirrors
  `tracking-loader.js`) exposing the sort helpers for unit testing.

No HTML change required: the cycling sort button's label is set dynamically and
its default state ("★ Stars") is unchanged.

## Test results

- New suite `tests/sort-scan-date.test.js`: **19 passed** — covers all 9 Opus
  Required Tests (newest-member ordering, max-aggregation, within-family order
  preserved, missing→bottom for desc AND asc, garbage→missing,
  chronological-not-lexical, default unchanged, GA4 fires).
- Full suite: **22 suites, 618 passed, 1 skipped (pre-existing), 0 failed.**

## Deviations from Opus guidance

1. **No `<select>` dropdown.** The brief and Opus review both assume the sort UI
   is an HTML `<select>` with `<option>` elements. In the actual refactor
   codebase the collection sort is a single **cycling button** (`cycleSortMode`
   / `sortMode`, `index.html` line 289). To stay consistent with the existing UI
   and minimise regression risk, the new options were added to that cycle
   (star → count → name → Scan date ↓ → Scan date ↑) rather than introducing a
   new control type. All of Opus's *logic* guidance (family-level max key,
   `null`/missing→bottom, chronological parse, additive/non-default) was followed
   exactly. The `value` strings match Opus's `scanDateDesc` / `scanDateAsc`.

2. **Reused `parsePokegenieDate` instead of raw `Date.parse`.** Opus's sample
   `parseScanDate` called `Date.parse(raw)` directly. The codebase already has a
   battle-tested `parsePokegenieDate()` that normalises both Pokégenie formats
   (ISO scan date and Australian `DD/MM/YYYY` catch/legacy date) to an ISO
   string. `parseScanDateMs` runs that first, then `Date.parse`, which is
   strictly more robust against the timezone/format ambiguity Opus flagged as a
   watch point (and makes test 7 deterministic rather than V8-implementation
   dependent).

3. **GA4 via a `trackSortChange` wrapper.** Rather than inlining the event in the
   handler, a one-line wrapper keeps the sort and telemetry concerns separable
   while still firing on every selection — eases the shared-handler merge with
   the ga4-event-tracking brief.
