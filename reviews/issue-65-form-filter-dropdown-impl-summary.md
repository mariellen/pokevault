# Impl Summary — Per-family form filter dropdown (#65) — v3.5.71

Brief: `briefs/issue-65-form-filter-dropdown.md`. **Urgent** (bulk-select costumed Pikachu for trading).

## What changed
- **`js/render.js`:**
  - New `formFilterSelect(primaryName, key)` — pure HTML helper. Renders a `<select class="fam-form-filter">`
    with `All forms` + each `FORM_DROPDOWNS[primaryName]` form (the `Unknown` override sentinel is
    excluded); returns `''` for species with no dropdown. Wired to `filterFamilyByForm(key, value)`,
    with `event.stopPropagation()` so it doesn't toggle the family, plus a `.fam-form-count` span.
  - `buildRow` — the main `<tr>` now carries `data-form="<specialForm||vivillonPattern>"` (trimmed,
    escaped) so the filter can match client-side.
- **`js/app.js`:**
  - New `filterFamilyByForm(key, form)` — client-side show/hide, **no re-analysis**, family-scoped
    (only rows inside `#fam-<key>`). Untagged rows (`data-form=""`) hide when a specific form is
    selected; live `(N)` visible count; `__all__` resets. Open override panels collapse while a
    specific form is active.
  - `${formFilterSelect(primaryName,key)}` inserted into **both** family-header renderers
    (`renderFamily` + the filtered variant), right side, before the league dots.
- **`css/styles.css`:** `.fam-form-filter` / `.fam-form-count`.
- **`index.html`:** v3.5.70 → v3.5.71.

## Deviation from the brief (file location)
Brief listed `render.js` for the header, but the family header is rendered in `app.js`. Split it: the
pure `<select>` builder lives in `render.js` (unit-testable via render-loader); the DOM show/hide
handler lives in `app.js`.

## Tests
- **New `tests/form-filter-dropdown.test.js` (7):** `formFilterSelect` options (Pikachu incl. team
  hats, `Unknown` excluded, `''` for non-dropdown Rattata, Squawkabilly/Furfrou work); `buildRow`
  `data-form` on tagged / vivillon / untagged rows. `render-loader` exports `formFilterSelect`.
- **855 passing** (was 848). 4 failures = pre-existing untracked `tests/csp.test.js`.
- `node --check` passes on app.js + render.js. The DOM handler (`filterFamilyByForm`) is not unit-tested
  (no jsdom in the suite) — covered by the manual checklist below.

## Manual checklist (for Mariellen)
1. Pikachu family header shows a form dropdown (right side).
2. "Rock Star" → only Rock Star Pikachu visible + "(N)" count; "All forms" resets.
3. An untagged Pikachu hides under a specific form.
4. Charizard (not in FORM_DROPDOWNS) → no dropdown; Squawkabilly/Furfrou → dropdown present.

## Version
v3.5.70 → v3.5.71.

## PR
https://github.com/mariellen/pokevault/pull/81
