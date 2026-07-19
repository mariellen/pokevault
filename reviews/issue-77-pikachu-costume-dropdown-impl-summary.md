# Impl Summary — Pikachu costume dropdown (#77) — v3.5.68

Brief: `briefs/issue-77-pikachu-costume-dropdown.md`. **Urgent** (trading session today). Data-only.

## What changed
- **`js/data.js` — `FORM_DROPDOWNS` only:** added `Pikachu` (83 costumes, grouped by comment
  headers for maintainability), `Pichu` (5), `Raichu` (2). Each starts with `'Unknown'`, matching
  the existing convention (Squawkabilly/Furfrou/Deerling).
- **`index.html`:** v3.5.67 → v3.5.68.

No engine / analyse.js / render.js / app.js changes — the dropdown mechanism (override panel
`render.js:234` + Set Forms modal `app.js:2000`) already keys off `FORM_DROPDOWNS`. `COSTUME_SPECIES`
already listed Pikachu/Pichu/Raichu, so no change there.

## Deliberately not done (per brief)
- **Not** added to `COLLECTION_SETS` — 83 costumes, no completeness tracking wanted.
- **Not** added to `FORM_SEARCH` — costumes are manual labels for bulk tagging, not search targets.

## Notes
- Costume strings are manual, human-readable labels Mariellen sets herself (Pokégenie does not
  export costume data) — they only need to be consistent. Copied verbatim from the brief
  (theclick.gg tracker, 83 costumes).

## Tests
- **New `tests/pikachu-costume-dropdown.test.js` (5):** Pikachu list shape (Unknown-first, ≥80, no
  duplicate labels, spot-checks across groups), Pichu/Raichu exact lists, existing dropdowns
  unchanged (Squawkabilly/Furfrou/Deerling), Pikachu renders a `<select>` with costume options in
  the override panel, and a non-dropdown species (Rattata) still renders the free-text input.
- **845 passing** (was 840). 4 failures = the pre-existing untracked `tests/csp.test.js`.

## Manual checklist (for Mariellen)
1. Open a Pikachu row's override panel (and the 🎨 Set Forms modal) → costume dropdown appears.
2. Pick a costume → saves to Supabase `special_form`; the orange form tag shows it.
3. Squawkabilly/Furfrou/Deerling dropdowns still work.

## Version
v3.5.67 → v3.5.68.

## PR
https://github.com/mariellen/pokevault/pull/78
