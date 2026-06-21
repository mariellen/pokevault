# Implementation Summary — dmax-gmax-league-rules-refinement (v3.5.54)

**Brief:** dmax-gmax-league-rules-refinement · **Route:** DIRECT · **Target:** v3.5.54
**GitHub:** #30 · **Status:** Implementation complete — awaiting Opus post-check
**Branch:** `feature/dmax-gmax-league-rules-refinement` (commit `6ec3d62`, pushed)
**PR:** create at https://github.com/mariellen/pokevault/pull/new/feature/dmax-gmax-league-rules-refinement
(gh CLI not installed in this environment)

---

## 1. What changed and why

This brief corrects PR #27 (v3.5.51), which had introduced a `|dynamax` capped-league
sub-group that let a low-rank Dmax "win" a private slot it could never be beaten out of
(spurious over-keeps), and adds full Gigantamax Master parity. Confirmed game mechanics
(Mariellen, 21 Jun 2026): Dmax/Gmax battle in **normal form** in PvP, so they compete in
the **same capped pool** as normals; Gmax and Dmax serve **different Max Battle pools**, so
each gets an **independent Master slot**, and a Gmax in the family **suppresses** the Normal
Master slot.

### Engine changes (`pokevault-refactor/js/analyse.js`)
1. **Change 1 — `variantKey` no longer embeds `|dynamax`** (all 5 raw occurrences across the
   4 logical sites: main `byEvoStage`, `slotWinners`, `diffEvoConflicts`/`nextBest` `vk`+`m_vk`,
   duplicate-slot dedup). Dmax/Gmax now enter the **main capped pool**. `|shadow` / `|purified`
   / `|lucky` untouched. (`|gigantamax` never existed — Gmax already shared the pool.)
2. **Change 2 — type-priority tiebreak** in `eligible.sort()`, inserted *after* the
   already-evolved check and *before* effective-dust: `Shiny Gmax(6) > Gmax(5) > Shiny Dmax(4)
   > Dmax(3) > Shiny Normal(2) > Normal(1)`. Fires only on an exact rounded-rank tie. Added an
   explicit terminal tiebreak on scan `idx` (Amendment B). **`dust_tiebreak.test.js` re-run and
   green after this edit** (Opus blocking watch-point).
3. **Change 3 — `wonGigantamaxMaster`** pass mirroring `wonDynamaxMaster`, keyed by the same
   `maxTargetKey` closure (kept SEPARATE from `dmaxCandidates` — different Max Battle pools).
   Best Gmax per evo target → flag; every slot-less Gmax → `gigantamax` raid slot. New parsed
   flags: `wonGigantamaxMaster`, `gmaxSuppressedNormal`, `gmaxSuppressedHundo`, `luckyNonWinner`.
4. **Change 4 — Gmax excluded from the regular Master pass** (`lg==='M' && (isDynamax ||
   isGigantamax)`) and from `extraCandidates`.
5. **Change 5 — decision routing**: `wonGigantamaxMaster` branch added directly after
   `wonDynamaxMaster` (above `hasLeagueSlot`), plus a `luckyNonWinner` keep branch; both
   `won*Master` added to `suggestStar`.
6. **Change 6 — `buildNickname`**: early short-circuits for `gmaxSuppressedHundo` (→`NameⓇ{IV%}Ⓗ`)
   and `luckyNonWinner` (→`NameⓇ{IV%}`); `gigantamax` handler → `Ⓜ{IV%}` (winner) / `Ⓡ{IV%}`
   (non-winner); **`dynamax` handler simplified** so a non-winner is `Ⓡ{IV%}` (see Deviation 1).
7. **Change 7 — categorical Normal-Master suppression** when the family has any Gmax: the
   Normal Master winner loses `M`/`wonMasterSlot`/`hasBattleSlot`; hundo → kept (`hundo` slot,
   grey star); non-hundo → routes through existing cull/review.
8. **Change 8 — Lucky non-winner**: a Lucky that lost a capped contention (had a ≥`keepThreshold`
   capped claim but no slot) → `luckyNonWinner`, no `lucky` slot, no star, `decision` stays `keep`.
9. **Change 9 — star ladder**: `gmaxSuppressedHundo → grey` (beats gold) and
   `luckyNonWinner → none` (explicit, beats gold) inserted at the top of the ladder.
10. **Supporting fixes:** `best_overall` filter now excludes `gmaxSuppressed*` members (so a
    suppressed Normal loses `suggestStar` per brief); the ML-placeholder guard now treats
    `wonDynamaxMaster`/`wonGigantamaxMaster` as a Master keeper (prevents a suppressed Normal
    being re-promoted into a grey ML placeholder); `dynamax`/`gigantamax` raid slots removed
    from the `suggestStar` list and `isLucky` gated by `!luckyNonWinner` (brief: non-winners
    earn no star).

### Docs
- `RULES.md` — §3 type-priority tiebreak; §3 special-slots table (dynamax/gigantamax rewritten);
  §4 Dynamax (refined), Gigantamax (full parity), new "Master League — three independent slots
  & Gmax suppression" and "Lucky non-winner" sections; §5 star decision-tree (grey/none precedence).
- `index.html` — version bumped **v3.5.51 → v3.5.54**.

---

## 2. Files modified
- `pokevault-refactor/js/analyse.js` — Changes 1-10 above
- `pokevault-refactor/tests/analyse.gmax_master.test.js` — **NEW**, 20 tests (Opus required 1-18,
  11b, plus a real-example Electabuzz assertion)
- `pokevault-refactor/tests/analyse.dynamax_master.test.js` — Group C rewritten (Dmax now competes
  with normals)
- `pokevault-refactor/tests/analyse.eevee_master.test.js` — Gigantamax smoke test updated to the
  parity invariant (best Gmax per target carries `Ⓜ`; multiple keepers per target now allowed)
- `pokevault-refactor/tests/analyse.fixture.test.js` — Group 15 (Gmax no-slot → `Ⓜ`), Group 18
  (non-winning Dmax → `Ⓡ{IV%}`), Group 27b (Gmax full parity with 27a) updated
- `RULES.md`, `pokevault-refactor/index.html`

---

## 3. Test results
- **Full suite: 30 of 31 suites pass — 752 passed, 1 skipped.**
- New `analyse.gmax_master.test.js`: **20/20 pass.**
- `analyse.dust_tiebreak.test.js` + `analyse.dust-twopass.test.js`: 26/26 (re-run after the
  comparator edit, per Opus watch-point).
- `dynamax_master` / `eevee_master` / `master_league`: all green.
- **The only failing suite is `tests/csp.test.js` (4 tests).** It is **pre-existing and unrelated**:
  an *untracked* file from the in-flight `csp-hardening` thread, failing at baseline before any
  of this work (it asserts CSP/`unsafe-inline` markers in `index.html`). It is not part of this
  branch/commit and will not run in CI for this PR.

---

## 4. Deviations from the Opus review (and why)

The Opus review and the brief's Mariellen-confirmed examples diverge in a few places. Where
they conflicted I followed the **brief's concrete examples** (the acceptance criteria) and
documented it here.

1. **Dynamax/Gigantamax non-winner nick = `Ⓡ{IV%}` (not the best-league symbol).** Opus's
   Change 6 kept the existing "find best league rank ≥90 → `Ⓛ/Ⓖ/Ⓤ`" branch for the gigantamax
   handler (and left the dynamax handler untouched). But the brief's examples require IV-based
   `Ⓡ` for *any* non-winning Dmax/Gmax — e.g. Electabuzz "Dmax 89% IV, 95.1% UL → **NameR89D**"
   and Meowth "Gmax 82% IV, 97% UL → **NameR82X**". Under the new same-pool model a league rank
   alone no longer means a league keeper (the Dmax *lost* that slot), so both handlers now emit
   `Ⓡ{IV%}`. A Dmax/Gmax that *wins* a capped slot still routes through the `L/G/U` handler.
2. **`masterDemoted` is NOT set for Gmax suppression.** Opus's Change 7 set it; but the brief's
   Charizard example requires the suppressed non-hundo Normal to be **culled** (`Normal CP701
   96% → CULLED`). `masterDemoted` would protect it via `best_overall`'s `!masterDemoted` clause.
   Instead the suppressed Normal is excluded from `best_overall` outright and falls to the normal
   cull/review rules. (The existing normal-vs-normal `masterDemoted` path is unchanged — Test 10
   confirms those are still never traded.)
3. **`best_overall` excludes `gmaxSuppressed*`; `suggestStar` drops the raid `dynamax`/`gigantamax`
   slots.** Additions beyond Opus's literal list, required to honour the brief's "non-winning
   Dmax/Gmax → **no star**" and "suppressed Normal loses suggestStar".
4. **ML-placeholder guard extended** to `wonDynamaxMaster`/`wonGigantamaxMaster` — without it a
   Gmax-suppressed Normal (now slot-less + `review`) was re-promoted into a grey ML placeholder,
   re-adding an `M` slot. Necessary for Change 7 to hold.
5. **Version bump v3.5.51 → v3.5.54** (Opus said v3.5.53 → v3.5.54). The base of this branch is
   v3.5.51 — the v3.5.52/53 work is not in this branch's history (see Environment note). Target
   v3.5.54 reached as required.
6. **Test group labels.** Opus referenced "Groups 15/27a/27d/27e and eevee C/E". The actual
   files use different labels; the *behaviourally* affected tests were updated: `dynamax_master`
   Group C, `fixture` Groups 15/18/27b, and the `eevee_master` gigantamax smoke test. Groups 27a
   (Dmax) and 27d already matched the parity model and needed no change.

---

## 5. Open questions for Opus / Mariellen

1. **Lone Lucky vs. a higher type (Meowth Lucky → `NameR93`).** Per Opus Change 1 I kept the
   `|lucky` capped sub-group. A consequence: a **single** Lucky still wins its own `|lucky` slot,
   so it does **not** become `luckyNonWinner` when out-classed by a Gmax/Dmax in the same evo
   pool — `luckyNonWinner` only fires for **Lucky-vs-Lucky** contention (the Pikachu "multiple
   RaichuU99" case, which works correctly). The brief's Meowth sub-example ("Lucky 93% IV,
   99.7% UL → NameR93, loses type tiebreak") would require **also** removing `|lucky` from the
   capped pool so Lucky competes against other types directly. That is higher-risk (Opus
   explicitly said "do NOT touch `|lucky`"; 100+ Lucky assertions across the suite) so I did
   **not** make that change. **Please confirm**: keep `|lucky` separate (current behaviour), or
   pull Lucky into the single capped pool too? All numbered required tests (1-18, 11b) pass under
   the current behaviour.
2. **Suppressed non-hundo Normal: `review` vs `trade`.** With a qualifying ML rank (ivAvg ≥ 90) a
   suppressed Normal surfaces as `review` (not auto-`trade`) via the existing `qualifiesAny`
   branch; it is culled (`trade`) only when it has no ≥90 rank anywhere. This matches "loses Ⓜ +
   star, existing cull/review rules" and keeps it out of `best_overall`. Confirm this is the
   intended granularity for "CULLED".
