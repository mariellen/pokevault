# Bug Batch June 2026 — Implementation Summary

_Brief: `briefs/bug-batch-june-2026.md` (ROUTE: OPUS-FIRST)_
_Implemented: 20 Jun 2026 — version bump v3.5.48 → v3.5.50_

## ⚠️ Scope note — the Opus review provided was truncated

The Opus pre-implementation review supplied to this thread **ends mid-Bug-2** (it cuts
off after the first "Required Tests" bullet for Bug 2, with a dangling `-`). It contains
**complete Implementation Guidance for only Bug 1 and Bug 2**. There is **no Opus diagnosis,
fix, or test guidance for Bugs 3–7.**

Per the OPUS-FIRST protocol and my instructions ("Follow the Implementation Guidance from
the Opus review exactly"), I implemented **only the two bugs Opus fully specified** (Bug 1
and Bug 2). Bugs 3–7 are **not implemented** — they need the completed Opus review (and, for
several, the Mariellen sign-off Opus itself flagged) before any code is written. See
**Open questions** below.

---

## What changed

### `pokevault-refactor/js/analyse.js`

**Bug 1 — Lucky Master winner showed Ⓡ instead of Ⓜ (reconciliation winner promotion).**
In the non-shadow Master reconciliation block, the winner-promotion was guarded by
`if (!winner.wonMasterSlot) { … }`, so a Lucky that won its own variant group in the main
loop (already `wonMasterSlot=true`) skipped the block and never had `slotConfirmed`
re-affirmed. The `(p.isLucky && !p.slotConfirmed)` guard in `hasLeagueSlot` then dropped it
to the Ⓡ fallback instead of Ⓜ. **Fix (exactly per Opus):** removed the conditional and
made the affirmation **unconditional** — `slots` gets `M` (and `M_tentative` filtered),
`wonMasterSlot`, `hasBattleSlot`, and `slotConfirmed` are all set `true` for the winner
regardless of how it won. The change is idempotent for loop-winners (every flag was already
set), so it causes **zero behaviour change** in existing passing tests.

**Bug 2 — Shiny (non-winner) showed a league-slot nick instead of Ⓡ.** Two-part fix per
Opus:
1. **Stop tentative slots claiming confirmed status** (the `slotConfirmed` assignment in the
   M-pass). Replaced `isConfirmed || !!best2.slotConfirmed` (which preserved any stale
   `slotConfirmed` across leagues) with a version that only preserves confirmation when it was
   genuinely earned: this rank ≥90, OR an existing confirmed capped/Master slot, OR a
   purify-push slot that qualifies at its purified rank.
2. **Harden `hasLeagueSlot`** so a Lucky/Shiny is treated as holding a league slot only when
   it owns a **confirmed (≥90) capped/Master slot** (`hasConfirmedCappedSlot`), rather than
   merely having `slotConfirmed` true. A sub-90 tentative slot now correctly falls through to
   the `Ⓡ`/shiny holding nick.

### `pokevault-refactor/tests/analyse.bug_batch_june.test.js` (new)
Single new file covering Bug 1 and Bug 2 per Opus's Required Tests:
- Bug 1: Lucky Leafeon 93% beats plain 98% → `LeafeonⓂ93`; asserts `wonMasterSlot===true`,
  `slotConfirmed===true`, nick `/Ⓜ93/`; exactly one non-shadow Master keeper; Group C
  Raikou Lucky-margin re-check.
- Bug 2: shiny Tapu Koko 73% with sub-90 Ultra rank → `Tapu KokⓇ73※` (not `Ⓤ74※`); plus an
  over-correction guard — a shiny **with** a confirmed ≥90 Ultra slot keeps its `Ⓤ92※` nick.
- One Opus required test (`plain Leafeon 98% loser → LeafeonⓇ98`) is present but **`it.skip`**
  with a detailed reason — it is gated on the Bug 3 decision (see below).

### `pokevault-refactor/index.html`
Version bumped `v3.5.48` → `v3.5.50` (title + logo span).

---

## Why (how this addresses the brief)
- Bug 1 and Bug 2 are the two bugs Opus diagnosed with concrete, line-level fixes. Both fixes
  are implemented verbatim to Opus's guidance, with one **safe deviation** (below) to avoid a
  purify regression.

## Deviations from Opus guidance
- **Bug 2, part 1 + `hasConfirmedCappedSlot`:** Opus's literal snippet preserved confirmation
  via `best2.slots.some(s => RULES.leagues.includes(s) && (best2['rankPct'+s]||0) >= keepThreshold)`.
  Taken literally this would have **broken purified-shadow Master/league keepers** (e.g.
  `RaikouⓂ87p`, `GurdurrⒼ92p`): a purify-push slot is confirmed via `purifyRankPct` (≥90),
  while the *raw* `rankPct` for that league is < 90. I added an explicit
  `isPurifySlot && purifyRankPct ≥ keepThreshold` clause to both the M-pass assignment and
  `hasConfirmedCappedSlot`. This matches Opus's stated **intent** ("preserve confirmation only
  when it was earned for a slot that is still ≥90" — the purify slot is ≥90 at its purified
  rank) and keeps Master-League Group G/F purify tests green. Verified: master_league +
  branching_evo suites = 32/32 pass.

## Test results
- New file `analyse.bug_batch_june.test.js`: **6 passed, 1 skipped** (the Bug-3-gated loser
  test).
- Full suite: **683 passed, 2 skipped, 4 failed**. All 4 failures are in `tests/csp.test.js`
  — a **pre-existing, untracked** test file that asserts a stale `v3.5.47` version string; it
  was already failing on baseline before any change in this thread and is unrelated to this
  brief. Every engine suite (master_league, branching_evo, dust-twopass, expensive_winner,
  fixture, tyrogue, gender_locked, completeness, etc.) passes.
- `npx jest tests/analyse.master_league.test.js tests/analyse.branching_evo.test.js` → 32/32.

## Open questions / BLOCKED items (need completed Opus review + Mariellen sign-off)

1. **Opus review is truncated.** The version provided contains guidance for Bug 1 and Bug 2
   only. Please supply the full review (Bugs 3–7) so they can be implemented. None of Bugs 3–7
   are in this PR.

2. **Bug 1 loser nick (`plain Leafeon 98% → LeafeonⓇ98`) is gated on Bug 3.** With the Bug 1
   winner-affirmation fix applied, the Lucky correctly wins → `LeafeonⓂ93`. But the demoted
   plain 98% loser does **not** become `LeafeonⓇ98`; it strands as a review placeholder
   `Leafeon98m` because `speciesWithConfirmedKeeper` (analyse.js ~L1200) blocks any
   same-species member from the `best_overall` (Ⓡ) slot once another individual holds a
   confirmed slot. Producing `LeafeonⓇ98` requires the **Bug 3** fix, whose keep-vs-trade
   ruling Opus flagged for Mariellen — and the brief's own Bug 3 text is internally tense
   ("second-best Legendaries should **TRADE**, not be kept as Ⓡ" vs Bug 1's "plain 98% →
   **LeafeonⓇ98**"). I did **not** guess; the loser test is `it.skip` with a pointer to this
   note.

3. **Could not synthesize a pre-fix-failing repro of Bug 2's exact symptom** (`Ⓤ74` leak) from
   a single synthetic Pokémon — the `slotConfirmed` leak that produced it in the field depends
   on a multi-member family shape not reconstructible from the brief. The new tests therefore
   assert the **correct** behaviour (regression lock) and the hardened guard is provably
   stricter (a shiny/lucky with only a sub-90 capped slot can no longer show a league nick).
   Both Bug 2 tests pass; no regressions.

## PR URL
https://github.com/mariellen/pokevault/pull/18
