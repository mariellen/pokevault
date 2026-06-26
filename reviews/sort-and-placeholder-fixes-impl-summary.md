# Impl Summary — sort-and-placeholder-fixes (#22 / #24 / #37, v3.5.58)

## 1. What changed

- **`js/analyse.js`**
  - **Fix 1 (#22)** — capped-slot comparator (`eligible.sort`): after the existing rounded-rank →
    evolved → type-priority → dust → raw-rank chain, added **`isFavorite` → higher CP →
    `stableKey`** as deterministic terminal tiebreaks (replacing the scan-index terminal, which
    isn't stable across re-exports / cloud reloads).
  - **Fix 2 (#24/#37)** — ML placeholder pass rewritten. A slot-less member now earns the grey
    "star-for-Master" placeholder **only if its IV strictly exceeds every member already surfaced
    via a tentative capped/Master slot**. Selection uses a Master-IV comparator (ivAvg → evolved →
    dust → isFavorite → CP → stableKey). Members holding tentative slots keep them.
- **`RULES.md`** — documented the new sort terminal tiebreaks and the refined grey-placeholder rule.
- **`index.html`** — v3.5.56 → **v3.5.58** (57 reserved for the open #41 PR).
- **`tests/analyse.sort_placeholder.test.js`** (new, 8 tests) — synthetic CI-portable tests for the
  sort tiebreaks + placeholder logic, plus export187-gated real-data guards for the exact #24/#37
  Pokémon (Tauros Aqua CP1581/CP1572, Stantler CP912 / Wyrdeer CP1149), plus the Tauros family-
  separation confirmation.

## 2. Why — and where the brief was wrong

Verified against the real export (export187), not just the prose:
- **#22 — correct as briefed.** The old terminal tiebreak was scan index, deterministic *within* a
  session but `idx` is row-position → flickers between a fresh export and a cloud load. `isFavorite`
  + CP + `stableKey` are intrinsic. Kept the existing raw-rank tiebreak above `isFavorite`.
- **#24/#37 — right symptom, wrong diagnosis, and one unsafe instruction.**
  - The brief said the filter "excludes members with ANY capped rank data." It actually excludes any
    member holding a **slot** — including sub-90 *tentative* "best available" slots. Confirmed:
    `CP1572` (80% IV, **77.4% Ultra**) auto-won a tentative `U` slot, so it was excluded, and the grey
    star fell to `CP1581` (80% IV, **40.3% Ultra**) — while `CP1580` (84.4% IV, tentative `M`) was also
    better. The brief's `CP1565` (78%) example was from a newer collection; the mechanism is identical.
  - The brief's Fix 2a (literal) *dropped the `decision !== keep/protected` guard* — that would
    overwrite real keepers (hundo/lucky/best_overall) into grey placeholders. **Not done.**
  - The brief's Fix 2b claimed the current placeholder sort "has already-evolved too high." False —
    the old selection was a pure `reduce` by ivAvg with no evolved term. #37 was purely the exclusion
    bug; once surfaced-member IVs are respected, Wyrdeer (84%) no longer beats Stantler (89%).
  - **Resolution chosen (your call: Option 1):** remove the wrong grey star; the stronger members stay
    surfaced via their existing tentative slots rather than being converted to a literal grey `M`.
    Implementing the brief literally (move the grey star onto the tentative-slot holder) would have
    regressed Group 35 (shadow Gengar 82% GL) and Group 45 (Rattata 65% GL), which intentionally keep
    their tentative capped slots.

## 3. Verification (real data, export187)

- **#24 Tauros Aqua:** grey ML placeholders in family **1 → 0**; `CP1581` grey star removed
  (`slots []`, trade); `CP1580` keeps `…84m` review; `CP1572` keeps tentative `U`.
- **#37 Stantler/Wyrdeer:** `Wyrdeer CP1149` (84%) grey star removed; `Stantler CP912` (89%) surfaced
  via tentative `M`.

## 4. Test results

Full suite **green: 774 passed / 2 skipped / 1 todo, 34 suites** (untracked `tests/csp.test.js`
excluded — separate CSP thread). 8 new tests in `analyse.sort_placeholder.test.js`. No regressions
to the existing placeholder guards (Group 35/45/49) or `analyse.dust_tiebreak.test.js`.

## 5. PR URL

`feature/sort-and-placeholder-fixes` → main: https://github.com/mariellen/pokevault/pull/44

## 6. Deviations

1. **Versioning** — branched off `main` (v3.5.56) and bumped to **v3.5.58**, reserving v3.5.57 for the
   open #41 PR (#42). Independent of #41 (different files). If #41 merges first, the only conflict is
   the `index.html` version line (trivial).
2. **Fix 2a guard retained** (brief dropped it — would regress keepers).
3. **Option 1 behaviour** for the grey placeholder (your decision) — stronger members stay on their
   tentative slots; the literal "move the grey star" outcome from the brief is intentionally not done
   (it regresses Group 35/45).

## 7. Open questions

- The "also check" item (#24): confirmed — Tauros Aqua/Blaze/Combat/Normal each form their own family
  (test added). No fix needed.
- export187 is gitignored, so the real-data guards run locally/for you but `it.skip` in CI; the
  synthetic tests cover the logic portably.
