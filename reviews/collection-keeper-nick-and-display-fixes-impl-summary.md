# Impl Summary — Collection-keeper nick (#72 Bug A) + Mobile form tag (#72 Bug B) + Dmax nick flicker (#67) — v3.5.66

Brief: `briefs/collection-keeper-nick-and-display-fixes.md`. Three independent display fixes.

## What changed

- **`js/analyse.js` (#72 Bug A):** hoisted the collection-keeper nick logic into a shared
  `applyCollectionNick(p)` helper and added the missing branch inside the `hasLeagueSlot` block. A
  collection keeper that carries a **tentative, unconfirmed (sub-90) league-slot artifact** now nicks
  `NameⓇ{IV%}` instead of falling to `buildNickname(p,'review')` → the `Squawk98u95g` holding nick.
  The pre-existing (no-league-slot) collection branch now calls the same helper — one code path, two
  call sites, identical output.
- **`js/render.js` (#72 Bug B):** the Vivillon-pattern variant tag now carries `class="vtag vt-form"`.
- **`css/styles.css` (#72 Bug B):** the mobile `.vtag:not(...)` collapse rule gains a `:not(.vt-form)`
  exclusion, so cosmetic-form tags stay visible at mobile width.
- **`js/app.js` (#67):** `setOverride` now pushes the `dynamax`/`gigantamax` slot when the box is
  ticked (mirroring the existing `is_shiny` slot-push) and removes it on untick, plus two `ns`
  branches so the immediate nick preview routes through the dmax/gmax handler. Result: ticking Dmax on
  Pidove previews `UnfezantⓇ84Ⓓ` immediately, not `PidoveⓇ84Ⓓ`.
- **`index.html`:** v3.5.65 → v3.5.66 (bare-number sed bumped the `?v=` cache-bust strings too).

## Verified engine behaviour (empirical, while writing tests)

- Fix 1's **new** branch only fires for a collection keeper that actually *retains* a tentative slot —
  in practice a **low-IV** one (e.g. White Plumage Squawkabilly 84% with G=88 → slots `['G','collection']`,
  `slotConfirmed` falsy → `SquawkabiⓇ84`). Higher-IV keepers have their tentative slot released and go
  through the second (pre-existing) collection branch; both branches now share `applyCollectionNick`,
  so output is identical. Brief test #3 ("collection keeper that also wins a league slot → league nick")
  is guaranteed by code order: the `slotConfirmed` branch at the top of the `hasLeagueSlot` block runs
  before the collection check.
- Fix 3: `setOverride('k','is_dynamax',true)` → `slots:['dynamax']`, nick `UnfezantⓇ84Ⓓ`; Snorlax (no
  further evo) → `SnorlaxⓇ84Ⓓ`. `terminalEvo()` resolves the 3-stage Pidove→Unfezant even with blank
  Pokégenie evo columns.

## Tests

- **New `tests/collection-nick-form-tag-dmax-flicker.test.js` (11 tests):** Fix 1 new-branch regression
  + shared-helper consistency + non-collection guard; Fix 2 `vt-form` class present/absent + the mobile
  CSS `:not(.vt-form)` rule; Fix 3 real-`setOverride` tick/untick/gigantamax/no-evo + a `buildNickname`
  routing sanity check (dmax evolves, review does not).
- **New `tests/set-override-loader.js`:** line-slices the real `setOverride()` out of app.js and evaluates
  it over config/data/analyse/render with a null-returning `document` (skips the DOM-mutation half) and
  no-op Supabase/summary shims — so #67 is tested against production code, not a re-implementation.
- `tests/render-loader.js` now also exports `variantTags`.
- **833 passing** (was 822; +11). ⚠️ 4 failures remain — the **pre-existing untracked `tests/csp.test.js`**
  (separate CSP-hardening thread), not touched by this branch.

## Deviations from the brief

- Brief Fix 1 described the wrong-nick as happening for collection keepers with *no* league slot, but the
  reported repro (`Squawk98u95g`) is a keeper carrying a *tentative* league slot — so the fix landed in
  the `hasLeagueSlot` branch (not `buildNickname`). Same user-visible result.
- Brief Fix 1 test #2 ("Green Plumage 96% → SquawkabiⓇ96") doesn't map to a retained-slot case at that IV
  (14/14/14 = 93.3%, and its tentative slot is released); replaced with a shared-helper-consistency test
  that guards the refactor across both call sites.

## Manual checklist (for Mariellen)

1. A sub-90 tagged cosmetic-form keeper (e.g. White Plumage Squawkabilly) nicks `NameⓇ{IV%}`, not a
   league-rank holding nick.
2. On a phone, the orange form tag (Green Plumage / Pharaoh / trim) is visible without horizontal scroll.
3. In the override panel, ticking Dynamax/Gigantamax immediately shows the **evolved** name (no base-name
   flicker); unticking reverts.

## Version
v3.5.65 → v3.5.66.

## PR
https://github.com/mariellen/pokevault/pull/75
