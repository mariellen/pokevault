# Impl Summary — Rockruff formUnset (#68) + Grey Star Sort (#69) — v3.5.65

Brief: `briefs/rockruff-formunset-and-grey-star-sort.md`.

## ⚠️ The confirmation you asked for FAILED — Fix 2 was redesigned

You asked me to confirm that Master-only Rockruffs have blank evo recs. **They don't.** Every
Rockruff in `poke_genie_export 212.csv` — including CP212 (IV95.6) and CP402 (IV95.6) — has
populated `Name (G/U) = Lycanroc` with a form (Dusk/Midday/Midnight). So the blank-evo-rec gate I
proposed would never fire, and **the whole of the brief's Fix 2 is wrong**:
- `FORM_SET_REQUIRED_EVOS` is keyed on the evo **target** (`{Wormadam}`), so adding `'Rockruff'`
  does nothing; adding `'Lycanroc'` would break #39 (it drives `slotEvoTarget` + nick suppression).
- Part B is redundant — `maxRank` already includes `rankPctM` (=`ivAvg`), so high-IV Master
  candidates were always covered.

**Redesigned gate (verified against your real export):** a new `FORM_CHOICE_PREVOS = {Rockruff}`
(config.js), keyed on the pre-evo and used **only** by `formUnset`. It fires when a Rockruff has
**no league slot at all** (`L/G/U/M`), no `specialForm`, and `maxRank ≥ 90`. This:
- fires 📝 on the formless `RockruffⓇ96`/review Rockruffs (the actual #68 symptom — 28 of your 81),
- leaves `FORM_SET_REQUIRED_EVOS` untouched, so **#39 is preserved** (CP534 `RockrⒼ100`, CP686
  `DayⓂ91` unchanged; all Group-E Lycanroc tests still green),
- and the no-league-slot gate avoids a decision(`keep`)-vs-star(`📝`) split, since `hasLeagueSlot`
  runs before the `formUnset` branch.

### One behavior change to sign off on
28 of your 81 Rockruffs now show 📝 instead of a plain review/best-overall star — **including
your best one, CP402 (IV95.6), which was a gold `RockruffⓇ96` best-overall and is now 📝 review**
("set the Lycanroc form before evolving"). That matches the brief's intent, but it's a visible
change on your top Rockruff, so flagging it. If you'd rather the family's best-overall Rockruff
keep its gold star and only the pure-review ones get 📝, that's a one-line gate tweak.

## What changed
- **`js/app.js` (#69):** `pokemonStarRank` now returns **3.5** for `p.starType === 'grey'` (was
  falling through to 6). RULES.md already documented 3.5 — this makes the code match. Red now also
  excludes grey.
- **`js/config.js` (#68):** new `FORM_CHOICE_PREVOS = new Set(['Rockruff'])`.
- **`js/analyse.js` (#68):** `formUnset` also fires for `FORM_CHOICE_PREVOS` pre-evos with no
  league slot.
- **`index.html`:** v3.5.64 → v3.5.65 (bare-number sed bumped the `?v=` cache-bust strings too).
- **`RULES.md`:** Rockruff formUnset section + grey-sort note.

## Tests
- **822 passing** (+9 in `tests/analyse.rockruff-grey-sort.test.js`): grey=3.5 + full sort order
  (Fix 1, testing the real `pokemonStarRank` extracted from source); Rockruff formUnset fires
  (no-slot high-IV), doesn't fire (low-IV / tagged / league-slot winner), Burmy path unchanged.
- ⚠️ **4 failures remain — pre-existing & unrelated:** `tests/csp.test.js` (untracked CSP thread).

## Manual checklist (for Mariellen)
1. Sort by star — grey collection/Rockruff keepers now sit just above red, not at the bottom.
2. Untagged high-IV Rockruffs with no league slot show 📝 (set form before evolving); Rockruffs
   that won a league slot (`DayⓂ`, `RockrⒼ`) are unchanged.

## Version
v3.5.64 → v3.5.65.

## PR
https://github.com/mariellen/pokevault/pull/70
