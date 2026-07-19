# Impl Summary — Pikachu list updates + sort-preserves-filter (#82/#77) — v3.5.72

Brief: `briefs/issue-82-pikachu-costume-list-updates-and-sort-filter-fix.md`. Two changes.

## Fix 1 — Pikachu FORM_DROPDOWNS updates (`js/data.js`, #77)
- **Renames:** `Party Hat` → `Party Hat Purple`, `Party Top Hat` → `Party Top Hat Purple`,
  `Safari Hat` → `Safari Cap`.
- **Additions:** `Party Top Hat New Years` (no apostrophe); `None` pinned **second** (after
  `Unknown`) for **Pikachu / Pichu / Raichu** only (Kanto starters unchanged).
- Remainder stays alphabetical. Verified segment: `Party Hat Purple, Party Hat Red,
  Party Top Hat New Years, Party Top Hat Purple, … Safari Cap`.

## Fix 2 — Sort resets the active form filter (`js/app.js`, #82)
`sortFamilyBy` rebuilds the family `tbody` (`tbody.innerHTML = …`), which re-renders every visible
member row — dropping the form filter's show/hide. The header `<select class="fam-form-filter">`
lives **outside** the tbody, so it keeps its value across the rebuild. Added, after the tbody
rebuild: read that select and, if a specific form is active (`value !== '__all__'`), re-apply
`filterFamilyByForm(famKey, value)` — restoring the hidden rows and the `(N)` count.

**Deviation:** the brief said `render.js`, but `sortFamilyBy` lives in `app.js` — fixed there.
Using the select's own value as the source of truth means no extra `data-active-form` attribute is
needed (the brief offered that as one option).

## Tests
- **`tests/pikachu-costume-dropdown.test.js`** updated: alphabetical invariant now allows `None`
  pinned second; spot-checks use the renamed labels and assert the old ones (`Party Hat`,
  `Party Top Hat`, `Safari Hat`, `Professor`) are gone; Pichu/Raichu `toEqual` include `None`;
  new #82 test asserts `None` second for the three, starters excluded, and the Party/Safari segment
  order. **856 passing** (was 855). 4 failures = pre-existing untracked `tests/csp.test.js`.
- Fix 2 is DOM-driven; not unit-tested (no jsdom in the suite). `node --check` clean on app.js.

## Manual checklist (for Mariellen)
1. Filter Pikachu to "Rock Star", click **Master** → only Rock Star Pikachu remain, sorted, `(N)` intact.
2. Sort IV% → filter → sort CP → filter still active.
3. "All forms" → sort → all members shown.
4. Override panel / Set Forms dropdown shows `None` (2nd) + renamed Party/Safari labels.

## Version
v3.5.71 → v3.5.72.

## PR
https://github.com/mariellen/pokevault/pull/83
