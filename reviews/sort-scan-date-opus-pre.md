# Opus Pre-Implementation Review
_Generated: 12 Jun 2026 19:52_

## Root Cause Analysis

This is a feature addition, not a defect — there is no broken code. The "missing" capability is that the sort dropdown in `app.js` lacks a scan-date option, and the underlying `Scan Date` / `Original Scan Date` CSV fields are currently parsed-but-unused for sorting purposes.

The real risk lies in **two latent traps**:

1. **Date parsing**: Pokégenie's `Scan Date` is a string. If the existing sort comparator does naive string comparison, chronological order will break for any non-ISO format (e.g., `MM/DD/YYYY` or locale-dependent formats). The brief explicitly requires parsing as a date.
2. **Family-level aggregation**: The app sorts at the **family** level, not the individual Pokémon level. A scan date is a per-Pokémon attribute, so you must derive a *family-level* scan-date key (the max/newest member's scan date) before the family comparator runs. Sorting individuals directly would shatter the existing within-family ordering guarantee.

## Risk Assessment

**Scope — families / edge cases affected:**
- **All families** are reorderable by this new key, so the entire collection view is in play.
- **Multi-member families** (evolution lines, multiple catches of same species) — the family key must be the *newest* member's scan date, not the first or last in array order.
- **Missing/unparseable `Scan Date`** — must sort to bottom (treated as oldest / epoch 0 or `-Infinity`).
- **Lucky/Shadow/Purified variants** and **traded mons** — verify Pokégenie still populates `Scan Date`; some imported/legacy rows may have it blank.
- **`Original Scan Date` is mentioned but NOT the sort key.** Do not accidentally wire it in. It's documented context only.

**Security implications:**
- None of consequence. One caution: do **not** pass raw CSV date strings into `new Date()` and then into any DOM sink or `eval`-like path. Pure comparator use is fine. No injection surface here.

**Regression risk — existing tests that may break:**
- Any snapshot/order-assertion test that pins the **default** sort order. Ensure the new option is **additive** and does not become the default.
- Tests asserting **within-family ordering** (by star/decision) — these MUST still pass when the new sort is active. If you sort individuals instead of families, these break.
- The GA4 bundling (same version target) means the dropdown's change handler is being touched by two briefs simultaneously — high merge-conflict risk on the same function.

## Implementation Guidance

**File: `app.js`**

1. **Dropdown options** — locate the sort `<select>` population (search for the existing sort option strings / the `<option>` list). Add:
   - `value="scanDateDesc"` → label `Scan date ↓`
   - `value="scanDateAsc"` → label `Scan date ↑` (lower priority; include if cheap)

2. **Date parser helper** — add a small pure function near the other CSV-field accessors:
   ```js
   function parseScanDate(pokemon) {
     const raw = pokemon["Scan Date"];
     if (!raw) return null;
     const t = Date.parse(raw);
     return Number.isNaN(t) ? null : t;
   }
   ```
   Confirm the actual field key casing/spacing against the CSV header parser — match it exactly (e.g. `"Scan Date"` vs a normalized key).

3. **Family-level key** — in the family-sort comparator (search for where families are ordered, likely a `sortFamilies` / `compareFamilies` function or the comparator passed to `.sort()` on the families array), compute per family:
   ```js
   function familyScanKey(family) {
     const times = family.members
       .map(parseScanDate)
       .filter(t => t !== null);
     return times.length ? Math.max(...times) : -Infinity;
   }
   ```
   `-Infinity` guarantees missing-date families sort to the bottom for both directions when handled correctly — see Watch Points.

4. **Wire into the sort switch** — in the comparator selection logic:
   - `scanDateDesc`: `familyScanKey(b) - familyScanKey(a)`
   - `scanDateAsc`: `familyScanKey(a) - familyScanKey(b)`
   - **Do not** alter the within-family sort. After family ordering is decided, the existing star/decision sort inside each family must run unchanged.

5. **GA4 coordination** — the change handler is shared with the GA4 brief. Fire the existing/added GA4 sort event with the new `value` strings included in the allowed set, but keep the two changes logically separate within the handler.

## Required Tests

1. **Sort orders families by newest member** — family A's newest member scanned later than family B's newest → A appears before B under `scanDateDesc`.
2. **Newest member wins, not array order** — a family whose *second* member has the latest scan date sorts ahead of a family whose *first* member is older. Proves max-aggregation, not first/last.
3. **Within-family order preserved** — under `scanDateDesc`, members inside a family remain in the existing star/decision order (assert exact intra-family sequence).
4. **Missing scan date sorts to bottom (desc)** — family with all-blank `Scan Date` appears last under `scanDateDesc`.
5. **Missing scan date sorts to bottom (asc)** — family with all-blank `Scan Date` appears **last** under `scanDateAsc` too (treated as oldest, not as epoch-zero-at-top). See Watch Points — this is the tricky one.
6. **Unparseable date treated as missing** — garbage string (`"N/A"`, `""`) → `null` → bottom.
7. **Date parsing is chronological, not lexical** — two dates where string compare and date compare disagree (e.g. `"9/1/2024"` vs `"10/1/2024"`) sort correctly.
8. **Default sort unchanged** — without selecting the new option, existing default ordering test still passes.
9. **GA4 event fires with new value** — selecting `scanDateDesc` emits the tracking event with the correct sort identifier.

## Watch Points

- **The asc/missing contradiction.** The brief says missing dates sort to **bottom** *and* "treat as oldest." For ascending (oldest first), "oldest" would naturally float to the **top** — but the brief wants them at the **bottom**. These conflict. Resolve by treating "sort to bottom" as the hard rule: missing entries always land last regardless of direction. Implement asc as a primary comparator on real dates with a secondary rule that pushes `null`/`-Infinity` families to the end. Do **not** let `-Infinity` naturally sort to the top in ascending mode. **Flag this to the product owner if test 5 fails the intended UX.**

- **Field key casing.** Verify whether the CSV parser normalizes headers (lowercasing, trimming, removing spaces). `"Scan Date"` may actually be stored as `scanDate`, `scan_date`, or `"scan date"`. Match the real key or the accessor silently returns `undefined` → everything sorts to bottom → tests 1–3 fail.

- **`Math.max(...times)` spread on large families** is fine for realistic sizes but use `times.reduce((a,b)=>Math.max(a,b), -Infinity)` if any family could be pathologically large (avoid call-stack spread limits).

- **Timezone / format ambiguity.** `Date.parse` is implementation-dependent for non-ISO strings. If Pokégenie emits `MM/DD/YYYY`, `Date.parse` mostly works in V8 but is non-standard. If test 7 is flaky, parse the components explicitly rather than trusting `Date.parse`.

- **Merge with GA4 brief.** Both briefs edit the same dropdown handler at v3.5.46. Implement on a shared branch or sequence them; rebase carefully to avoid clobbering the option list or the event-tracking call.

- **Don't make it the default.** Keep the new option additive only.