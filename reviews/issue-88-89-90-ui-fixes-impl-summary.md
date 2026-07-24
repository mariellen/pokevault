# Impl Summary — Small UI Fixes: form-filter persistence, modal Unknown/None, mobile header (#88/#89/#90) — v3.5.74

Brief: `briefs/issue-88-89-90-ui-fixes.md`. Three UI/render-only fixes, no engine changes.

## What changed

### Fix 1 — Sort/re-render resets active form filter (#88)
- **`js/render.js`:** New `formFilterActiveByKey = {}` module-level state object. `formFilterSelect`
  reads it to add `selected` to the right `<option>` when the card is rebuilt. Default option
  (`__all__`) gets `selected` when no saved form exists.
- **`js/app.js`:** `filterFamilyByForm` writes `formFilterActiveByKey[key]` whenever the user
  changes the select (or `reapplyAllFormFilters` resets it). New `reapplyAllFormFilters()` iterates
  all saved entries and calls `filterFamilyByForm` to restore row visibility. Called at the end of
  `renderPage()` immediately after `innerHTML` is set.

**Why the previous fix (PR #83) wasn't enough:** PR #83 re-read the `<select>` value after a
per-column sort (tbody rebuild). But changing the family sort mode (`★ Stars` → `Count` etc.) calls
`applyFilters()` → `renderPage()`, which rebuilds the entire card HTML including the header — the
`<select>` element is recreated with its default value. The new state object survives across
re-renders; the `selected` attribute is baked into the HTML string, so no flash.

### Fix 2 — Set Forms modal shows Unknown instead of None (#89)
- **`js/app.js`:** `formIsSet` inside `openCleanupModal` rewritten as an explicit function body with
  named variables and a comment explaining each case. Behaviour unchanged from the existing code
  (which already correctly handled Unknown→show, None→hide), but intent is now self-documenting.

**Note:** The current code already had correct logic (`p.specialForm !== 'Unknown'`). The brief was
likely filed against an older version where `formIsSet = p => p.specialForm || p.vivillonPattern`
(which treated 'Unknown' as truthy → incorrectly hidden). The explicit refactor guards against
that regression and documents the intent for future maintainers.

### Fix 3 — Family header wrapping on mobile (#90)
- **`js/app.js`:** Both `renderFamily` and `renderFamilyFiltered` replace inline flex styles with
  CSS classes `fam-header-row1` (search buttons + badges) and `fam-header-row2` (form filter,
  league dots, cull button, chevron).
- **`css/styles.css`:** Base styles define the two rows as flex containers matching the old inline
  behaviour. Mobile override (≤600px) adds `flex-direction:column;align-items:stretch` to
  `.family-header` so rows stack, and `flex-wrap:nowrap;overflow-x:auto` / `margin-left:0` to
  each row so controls stay on separate lines without mixing.

The existing `.fam-chevron{margin-left:auto}` CSS already pushes the chevron to the right end of
row 2 on mobile — no extra change needed there.

## Deviations / gotchas
- **Fix 2 is a clarity refactor, not a behaviour change.** The current `formIsSet` logic was already
  correct. The brief was describing an older bug. Tests added to prevent future regression.
- **`reapplyAllFormFilters` runs synchronously** after innerHTML is set, so there is no visible
  flash — the DOM is not painted between the innerHTML write and the filter re-application.

## Tests
- **Updated `tests/form-filter-dropdown.test.js` (+10 tests):**
  - `#88`: 4 tests covering `formFilterSelect` pre-selection (default, saved form, empty reset, key
    isolation).
  - `#89`: 6 tests verifying `formIsSet` equivalent logic (blank, Unknown, None, real form,
    vivillonPattern Unknown, vivillonPattern real).
- **Updated `tests/render-loader.js`:** exports `formFilterActiveByKey` so tests can seed state.
- **875 passed** (was 865). 4 failures = pre-existing untracked `csp.test.js`.

## Manual checklist
1. Load a CSV with Pikachu. Filter to "Rock Star". Change family sort mode (★ → Count → Name) — confirm only Rock Star rows remain visible, dropdown still shows "Rock Star".
2. Switch back to "All forms" — all members reappear.
3. Open Set Forms modal (🎨) — Pikachu with no form tag appears; one with `specialForm='None'` does not.
4. On a mobile viewport (≤600px): search buttons (Me, +Fam, ⭐) on one line; form filter + dots + cull on the line below. No mixed wrapping.

## Version
v3.5.73 → v3.5.74.

## PR
https://github.com/mariellen/pokevault/pull/92
