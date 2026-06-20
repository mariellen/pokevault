# Implementation Summary — `dynamax-master-flag`

_Route: OPUS-FIRST · Target version: v3.5.51_

## What changed and why

The brief required the **best Dynamax** per family/max-evo target to be flagged as the
Master-level power-up candidate (`Ⓜ`), Dynamax to **stop competing with regular Pokémon**
for capped league slots, and **all** Dynamax to be kept (best → `Ⓜ`, capped-slot winners →
`Ⓖ/Ⓤ/ⓛ`, slot-less → `Ⓡ` raid candidates).

Implemented exactly per the Opus pre-review, with one necessary addition (Master-pass
exclusion) to honour the orthogonality decision (Q2).

### Engine (`pokevault-refactor/js/analyse.js`)

1. **Separate Dynamax from regular capped competition (Change 1).** Added a `|dynamax`
   branch to the `variantKey`/`vk`/`m_vk` derivation at **all five** sites (byEvoStage
   grouping, slotWinners recording, diff-evo conflict `vk`, `nextBest` `m_vk`, and the
   duplicate-slot dedup `vk`). Precedence kept as shadow > purified > lucky > dynamax (a
   Lucky-Dmax stays in `|lucky`), per the Opus watch-point. Dynamax now form an independent
   sub-group and never displace a regular GL/UL/LL winner.

2. **Exclude Dynamax from the regular Master pass.** Added `if (lg === 'M' && p.isDynamax)
   return false;` to the league-eligibility filter, and `!p.isDynamax` to the Master
   `extraCandidates` pool. This guarantees a Dmax **never** sets `wonMasterSlot` — keeping it
   orthogonal to the non-shadow Master single-keeper reconciliation, the ML-placeholder pass,
   and `best_overall` dedup (Opus Q2). This was required because Change 1 would otherwise let
   the best Dmax win the `|dynamax` Master sub-group and set `wonMasterSlot`.

3. **Flag the best-overall Dynamax (`wonDynamaxMaster`).** Rewrote the `dmaxCandidates`
   block: the best-IV Dmax per max-evo target gets `wonDynamaxMaster = true`, and **every**
   Dmax without a capped league slot gets the `dynamax` slot (kept as a raid candidate).
   Initialised `wonDynamaxMaster:false` in the parsed object literal. Gigantamax left
   unchanged.

4. **Nick generation (Change 3).** The `slot==='dynamax'` branch in `buildNickname` now emits
   `LC.M + IV%` (`NameⓂ{IV%}Ⓓ`) when `wonDynamaxMaster`, otherwise the existing
   capped-symbol / `Ⓡ` fallback.

5. **Decision routing (Change 4).** Added a `wonDynamaxMaster` branch in the decision block
   **above** `hasLeagueSlot`, so the best Dmax always renders `Ⓜ` even when it also holds a
   capped Dmax slot. Added `p.wonDynamaxMaster` to the green/gold `suggestStar` keep
   conditions for robustness.

### Docs (`RULES.md`)

Updated the `Ⓜ`/`Ⓡ` symbol rows + contextual note, the decision-priority table (new rule #2),
the special-slots table, the §4 Dynamax/Gigantamax sections, the buildNickname slot table,
and the Appendix keep rules. Documented that `Ⓜ` is now valid for both `wonMasterSlot` and
`wonDynamaxMaster` (different mechanisms), and that Gigantamax is unchanged.

### Version

Bumped `index.html` v3.5.50 → **v3.5.51**.

## Files modified

- `pokevault-refactor/js/analyse.js` — engine changes 1–5.
- `pokevault-refactor/tests/analyse.dynamax_master.test.js` — **new** (8 tests, the Opus
  required cases).
- `pokevault-refactor/tests/analyse.fixture.test.js` — updated Group 15 (Dmax no-slot → `Ⓜ`),
  Group 27a (best → `Ⓜ`, dupe kept as `Ⓡ` raid not traded), Group 27d (best Dmax+shiny → `Ⓜ`),
  Group 27e (hundo Dmax → `wonDynamaxMaster`/dynamax slot, not regular `M`).
- `pokevault-refactor/tests/analyse.eevee_master.test.js` — updated Group C/E (slot-less Dmax
  now kept; best gets `Ⓜ`) and the export187 smoke-test invariants.
- `RULES.md` — business-rule documentation.
- `pokevault-refactor/index.html` — version bump.

## Test results

`npx jest --env=node --testPathIgnorePatterns=csp.test.js`:

```
Test Suites: 29 passed, 29 total
Tests:       1 skipped, 711 passed, 712 total
```

- The 8 new `analyse.dynamax_master.test.js` tests cover: the Electabuzz golden case
  (`ElectabuⓂ96Ⓓ` / `ElectabuⓊ95Ⓓ` / `ElectabuⓇ87Ⓓ`), best-Dmax-also-wins-capped-slot
  stays `Ⓜ`, Dmax not displacing a regular Ultra winner, Eevee branching (one `Ⓜ` per evo
  target), and `wonDynamaxMaster` ⟂ `wonMasterSlot`.
- The 1 skip is the `export187.csv` smoke test, gated on the (gitignored) personal export.
- `csp.test.js` is an untracked, pre-existing-failing suite excluded from CI (per the
  repo's committed-test-count note) and is unrelated to this change.

## Deviations from Opus guidance

1. **Added a Master-pass exclusion for Dynamax** (engine change 2), which Opus did not
   spell out explicitly. It is required to satisfy Opus's own Q2 answer ("Dynamax never sets
   `wonMasterSlot`") because Change 1's `|dynamax` sub-grouping would otherwise let the best
   Dmax win the Master sub-group and set `wonMasterSlot`.

2. **Gigantamax left entirely unchanged** — no `|gigantamax` variantKey branch, no
   `wonGigantamaxMaster`, no Master-pass exclusion. The brief is Dynamax-only and Opus gated
   Gmax parity on Mariellen's confirmation. Adding `|gigantamax` to capped competition would
   also have regressed the existing Group 27b Gmax-Snorlax fixture (the Gmax would win a real
   Ultra slot and hand the gigantamax slot to the dupe). See **Open questions**.

3. **All slot-less Dynamax are now kept** (not just one per target). The brief's "Other
   Dynamax with no slot → `NameⓇ{IV%}Ⓓ` — keep as raid candidate" rule mandates this, and
   Opus's required Electabuzz test asserts the 87% slot-less Dmax keeps as `ElectabuⓇ87Ⓓ`.
   This changed existing behaviour where non-best slot-less Dmax traded with a visibility
   star — the affected fixtures (Group 27a, eevee_master Group C/E and the export187
   invariant) were updated to the new keep-all behaviour, which Opus anticipated ("Audit
   existing Dmax fixtures").

## Open questions for Mariellen

1. **Gigantamax parity.** Should Gmax get the same treatment (best Gmax → `Ⓜ`, all Gmax kept,
   excluded from capped competition with regulars)? Currently Gmax is unchanged. If yes, the
   Group 27b Gmax-Snorlax fixture expectations will need revisiting.
2. **Lucky-Dynamax precedence.** A Lucky-Dmax currently stays in the `|lucky` sub-group
   (shadow > purified > lucky > dynamax), so it competes as a Lucky, not in the `|dynamax`
   pool. Confirm this is the desired precedence.

## PR

Branch: `feature/dynamax-master-flag`. PR URL: _to be recorded once `gh`/push is available
(see HANDOFF.md)._
