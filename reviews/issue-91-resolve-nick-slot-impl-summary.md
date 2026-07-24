# Impl Summary — resolveNickSlot: shiny/lucky sub-90 league nick guard (#91/#87) — v3.5.75

Brief: cowork message (no formal brief file). Engine fix, no UI changes.

## What changed

### `js/analyse.js` — new `resolveNickSlot(p)`
Single source of truth for slot→nick selection. Encodes the shiny/lucky `keepThreshold` guard:
a shiny or lucky Pokémon may only render a league nick when it holds a *confirmed* (≥ keepThreshold)
slot. Previously this guard lived only inside `analyse()` itself (via `slotConfirmed`) and was
duplicated, incompletely, in app.js `getNickSlot`. The override-apply path (`supabase.js
applyOverridesToPokemon`) called `getNickSlot` directly after adding `is_shiny:true`, so the guard
never ran on that path.

Also updated `analyse()`: the `hasLeagueSlot` branch now delegates to `resolveNickSlot(p)` instead
of the inline capped-slot sort it previously used, so all paths share the same logic.

### `js/app.js` — `getNickSlot` is now a delegate
```js
function getNickSlot(p) {
  return resolveNickSlot(p);
}
```
`resolveNickSlot` is defined in analyse.js, which is loaded before app.js, so the call resolves
correctly at runtime. `supabase.js` calls `getNickSlot(p)` → `resolveNickSlot(p)` → correct result.

### `tests/analyse.override-path-nick.test.js` (new file, from cowork)
5 tests covering the override-path bug:
- Uxie CP1383 sub-90 Great tentative: after `applyShinyOverrideLikeApp` → nick contains `Ⓡ76`
  (holding nick), not `Ⓖ` (league nick). Matches `UxieⓇ76※`.
- `resolveNickSlot` returns `'shiny'` (not `'G'`) for the sub-90 shiny Uxie.
- Confirmed ≥90 Great shiny retains league nick (guard against over-correction).
- Lucky Dmax with sub-90 Ultra slot → resolves to `'dynamax'` (Ⓜ), not `'Ⓤ'`.

### `tests/loader.js`
Added `resolveNickSlot` to RETURN exports string so `analyse.override-path-nick.test.js` can import it.

### `tests/render-loader.js`
Added `resolveNickSlot` to factory return (for completeness; not strictly required by the new tests).

### `index.html`
Version bumped v3.5.74 → v3.5.75 across all 12 `?v=` cache-busting strings.

## Root cause

On cloud load, `analyse()` runs with `isShiny=false`. Then `supabase.js applyOverridesToPokemon`
applies `{is_shiny: true}`, pushes `'shiny'` to `p.slots`, and recomputes the nick via
`buildNickname(p, getNickSlot(p))`. The old `getNickSlot` lacked the sub-90 guard:

```js
// OLD (no guard)
const lgSlots = p.slots.filter(s => RULES.leagues.includes(s) || s.endsWith('_affordable'));
// → returned 'G' for a sub-90 shiny, because the slots still included tentative 'G'
```

`resolveNickSlot` adds the guard:
```js
const leagueAllowed = lgSlots.length && !((p.isLucky || p.isShiny) && !lgSlots.some(confirmed));
```
A shiny/lucky falls through to the `'shiny'`/`'lucky'` branches unless at least one of its league
slots is confirmed.

## Deviations / gotchas
- The cowork message version-bumped to 3.5.74 (already taken by PR #92). Correctly bumped to 3.5.75.
- `getNickSlot` in app.js also called by the star-selection logic (`familyStarKeepers`). The delegate
  approach means that code also gets the correct guarded resolver — no further changes needed there.

## Tests
- **Suite: 861 passed** (+5; 4 failures = pre-existing untracked `csp.test.js`).
- New file: `tests/analyse.override-path-nick.test.js` (5 tests).

## Manual check
After cloud load, your shiny Uxie (CP1383, 10/11/13, Great 65.6%) should render `UxieⓇ76※`, not
`UxieⒼ66※`. No data cleanup needed — the nick was being computed wrong, not stored wrong.

## PR
https://github.com/mariellen/pokevault/pull/94
