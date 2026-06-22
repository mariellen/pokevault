# Impl Summary — gmax-master-flag-debug (#35, v3.5.55)

## 1. What changed

- **`pokevault-refactor/tests/analyse.gmax_master.test.js`** — added a new section
  `gmax_master_overrides_capped_slot (#35) — two-stage Meowth→Persian` (1 test).
  It is the direct equivalent of the existing Dmax "best Dmax that also wins a capped
  slot stays Ⓜ" group (`analyse.dynamax_master.test.js`, Group B), but exercised on a
  **two-stage** species (Meowth → Persian, `Name (U)='Persian'`). Every pre-existing
  gmax test used **single-stage** Electabuzz (`Name (U)`=self), so this closes a real
  coverage gap.
- **`pokevault-refactor/index.html`** — version bump v3.5.54 → v3.5.55 (`<title>` + logo span).

**No change to `analyse.js`** — the engine is already correct (see §2).

## 2. Why — root cause (diagnosis)

The brief hypothesised a live code bug (A: flag set too late; B: decision-branch order;
C: wrong sort) and asked for temporary console logging. None of the three apply. Instead
of console logging against the personal CSV, I reproduced the brief's exact Meowth/Persian
example as a throwaway Jest fixture through the real engine — reproducible and inspectable.

Findings on the current branch (`feature/dmax-gmax-league-rules-refinement`, v3.5.54):

| Pokémon | Brief says (broken) | Engine actually produces |
|---|---|---|
| CP423 Gmax (98% IV, 14/15/15, UL 100) | `PersiU100$$X` capped nick | `PersianⓂ98Ⓧ`, keep, `wonGigantamaxMaster=true` ✅ |
| CP410 Gmax (82% IV, 14/11/12, UL 97)  | `PersianR82X`, red star/trade | `PersianⓇ82Ⓧ`, keep, `gigantamax` raid slot, no star ✅ |

So the v3.5.54 code already does the right thing, and all three hypotheses are already
satisfied: the sort is descending `ivAvg` (analyse.js ~1280); `wonGigantamaxMaster` is
routed **above** `hasLeagueSlot` in the decision block (~1394); and `isGigantamax` is
applied from overrides at ~line 725, well before the `gmaxCandidates` pass (~1275).

The real cause is a **deploy gap**:

- `origin/main` is **v3.5.53** and contains a `gmaxCandidates` pass but **zero
  `wonGigantamaxMaster`** (it has `wonDynamaxMaster` only). Its older pass, when the best
  Gmax already holds a capped slot, hands the raid candidacy to a *different* slot-less
  Gmax and leaves the winner routing through `hasLeagueSlot` → the exact `PersiU100Ⓧ`
  symptom the brief describes.
- The fix (`wonGigantamaxMaster` + routing above `hasLeagueSlot`) landed in **v3.5.54**
  (commit `ed96ba9`), which is on this branch in an **open, unmerged PR** — so it isn't
  live. The brief observed the live (v3.5.53) site, not v3.5.54.

**Conclusion:** #35 is resolved by merging the existing Dmax/Gmax PR; the only net-new work
is the regression test that locks the behaviour in for two-stage species, plus the version bump.

## 3. Test results

- Targeted file: `analyse.gmax_master.test.js` — **21 passed** (20 prior + 1 new).
- Full suite excluding the untracked CSP file: **754 passed, 2 skipped** (the 2 skips are
  the standard personal-CSV smoke tests).
- `tests/csp.test.js` (4 failures) is **untracked** (`??`) and belongs to the separate
  CSP-hardening thread — not part of this branch/commit and unrelated to gmax. It runs
  against inline-script / `base-uri` / gtag-extraction assertions, none touched here.

## 4. PR URL

Same branch as the Dmax/Gmax refinement (#30) — no separate PR (per your "fold into
current branch/PR" choice). Create/refresh the PR at:
https://github.com/mariellen/pokevault/pull/new/feature/dmax-gmax-league-rules-refinement
(`gh` CLI is not installed in this environment.) Latest commit on the branch: `3f41fe1`.

## 5. Deviations

- The brief expected a code fix in `analyse.js` plus removal of temporary console.log
  statements. No engine fix was needed (already correct in v3.5.54), and the diagnosis was
  done with a reproducible throwaway fixture instead of console logging against the personal
  CSV, then removed — so there are no debug statements to strip.
- The brief referenced "the existing Dmax test `dmax_master_overrides_capped_slot`". No test
  by that literal name exists; the equivalent is `analyse.dynamax_master.test.js` Group B
  ("best Dmax that also wins a capped slot stays Ⓜ"), which I mirrored.

## 6. Open questions

- Do you want #35 tracked as folded into the v3.5.54 PR (current state), or would you prefer
  I note in the PR description that it also closes #35? I can add that line if you confirm.
- The pre-existing git conflict markers in `HANDOFF.md` (lines ~55/76, from the Dmax/Gmax
  merge) are left untouched — they belong to another thread. Flag if you want me to resolve them.
