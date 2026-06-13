ROUTE: OPUS-FIRST
BRIEF: eevee-master-dynamax-regression
VERSION_TARGET: TBD

# Brief — Eevee Family Master Slot + Dynamax Regression

## Context
Two related issues have been identified in the Eevee branching family
after recent engine changes (v3.5.45 dust tiebreak, v3.5.48 nick override).

## Issue 1 — Glaceon Master slot not assigning (regression)

**Observed:** Glaceon CP:1762, 15/14/15, 98% IV showing as `Glaceon98m`
(ML placeholder, grey star) instead of confirmed `GlaceonⓂ98` (gold star,
confirmed Master keeper).

**Was working previously.** Likely regressed in:
- v3.5.45 — dust tiebreak sort comparator change (modified the eligible.sort
  comparator inside the league loop, including Master pass)
- v3.5.48 — nick override (render layer, less likely but worth confirming)

**Suspected cause:** The non-shadow Master pick block or the `isFinalStage`
check may be incorrectly handling Eevee-family evolutions. Glaceon is a
final evolution of Eevee — the branching evo logic may be excluding it
from the Master competition incorrectly after the sort comparator change.

**Test gap confirmed:** No test asserts a plain non-shiny Glaceon wins a
confirmed Master slot. Existing Glaceon tests cover Great slot only and
are gated behind `describeIfCSV` (skipped in CI). This allowed the
regression to ship undetected.

## Issue 2 — Dynamax best not recommended per Eevee evolution

Each Eevee final evolution (Vaporeon, Jolteon, Flareon, Espeon, Umbreon,
Leafeon, Glaceon, Sylveon) should surface its own best Dynamax
recommendation independently. Currently not appearing correctly for the
Eevee branching family.

**Suspected cause:** Dynamax slot assignment may not be respecting evo-target
separation for branching families — the best Dynamax Eevee may be winning
the slot as "Eevee" rather than being separated by final evolution target.

## Opus tasks

1. **Trace the Glaceon Master regression** — run the engine against a
   synthetic Glaceon/Eevee family and confirm whether Glaceon wins a
   confirmed Master slot. If not, trace exactly where in `analyse.js`
   it fails — the non-shadow Master pick block, the `isFinalStage` check,
   the `wonInLoop` logic, or the sort comparator change in v3.5.45.

2. **Check v3.5.45 interaction** — specifically review whether the dust
   tiebreak sort comparator change affected Master slot assignment for
   branching evo families. The change removed the raw-rank bypass —
   does this interact badly with how Eevee evo targets are grouped?

3. **Trace Dynamax slot assignment for branching families** — confirm
   whether each Eevee evolution gets independent Dynamax slot
   consideration or whether they're competing in a shared pool.

4. **Produce fix** — implement whatever changes are needed in `analyse.js`
   to restore correct behaviour. If the fix is complex, produce a diff
   for review before Claude Code implements.

5. **Produce `analyse.eevee_master.test.js`** — self-contained synthetic
   tests (no personal CSV) covering:
   - Glaceon wins confirmed Master slot (`GlaceonⓂ98`, not `Glaceon98m`)
   - Each Eevee evolution gets independent Master slot consideration
   - Dynamax best surfaces correctly per evolution target
   - No regression on branching evo slot separation (existing
     `analyse.branching_evo.test.js` tests must still pass)
   - Two-slot cap holds (one Shadow + one Non-Shadow Master per family)

## Files needed
- `analyse.js`
- `PokéVault_Business_Rules.md`
- `analyse.branching_evo.test.js` (for regression reference)
- `analyse.master_league.test.js` (for regression reference)

## Important
Do not touch any other engine logic. Scope is Eevee family Master slot
and Dynamax only. If the fix requires changes beyond `analyse.js`, flag
for coordinator review before proceeding.
