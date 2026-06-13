# Implementation Summary — eevee-master-dynamax-regression

_Implemented: 13 Jun 2026 · branch `feature/eevee-master-dynamax-regression` · v3.5.49_

## Context — Opus pre-review was blocked

The Opus pre-implementation review could not run: the four "Files needed"
(`analyse.js`, `PokéVault_Business_Rules.md`, `analyse.branching_evo.test.js`,
`analyse.master_league.test.js`) were not attached to its message, so it
produced **no implementation guidance** — only investigation leads and an
explicit "do not implement against these hypotheses." Per the brief's Opus
tasks #1–#5, the trace work was therefore done here in Claude Code against the
real source, with the conclusions below.

## What I traced

### Issue 1 — Glaceon Master slot (regression) → **already fixed; was a test gap only**

I reproduced every Glaceon Master scenario the brief describes against the live
engine:

- Lone Glaceon 15/14/15 (97.8%) → **`GlaceonⓂ98`**, `wonMasterSlot=true`,
  `slots=['M']`, `decision='keep'`. **Not** `Glaceon98m`.
- Glaceon inside the full Eevee branching family (with pre-evo Eevees pointing
  at Leafeon/Jolteon) → still wins Master with `Ⓜ`.
- Glaceon beaten by a hundo Eevee→Vaporeon → correctly demoted to a
  `best_overall` **keep** (`GlaceonⓇ98`), not a `…98m` review placeholder.
- Two final Eeveelutions competing → highest IV wins the single non-shadow
  Master slot, loser keeps via `best_overall`.

Glaceon is structurally identical to Jolteon, and the **Jolteon** form of this
exact symptom (`…98m` placeholder instead of `…Ⓜ98`) was already fixed by the
v3.5.x non-shadow Master demotion work that resets `hasBattleSlot=false`,
`wonMasterSlot=false`, and `slotConfirmed=false` on demoted loop-winners
(`analyse.js`, "Non-shadow Master pick" block; regression covered by
`analyse.master_league.test.js` Group J). The dust-tiebreak comparator change
(v3.5.44, the brief's "v3.5.45") does **not** mis-handle branching evo families:
Master groups by `stageName` (the evo target), an actual Glaceon **is** its own
`stageName`, `hasHigherEvo` is false for it, and the comparator's evolved/dust
tiebreak never excludes it.

**Conclusion:** Issue 1 needed **no code change** — only the missing
non-shiny-Glaceon Master test the brief explicitly called out as the gap that
let the original Jolteon regression ship. That coverage is now added.

### Issue 2 — Dynamax not separated per Eevee evolution → **real bug, fixed**

Reproduced: three Dynamax Eevee rows pointing at **Vaporeon / Flareon /
Jolteon** (all 97.8%) produced only **one** kept Dynamax — the third evolution
target fell through to `decision='review'` with `slots=[]`. Root cause: the
Dynamax (and Gigantamax) candidate pools were keyed on **`p.name`**, so every
Eevee landed in one `'Eevee'` pool and competed for a single `dynamax` slot.

**Fix** (`analyse.js`): key the Dmax/Gmax pools by **final evolution target**
(`evolvedNameU || evolvedNameG || name`) — the same base `buildNickname`
already uses for the Dmax/Gmax nick — via a small `maxTargetKey` helper. Each
evolution target now gets its own best-without-league-slot keeper. Already-
evolved final forms key on their own name (target === name), so single-stage
Dynamax species (Entei, Snorlax, etc.) are unaffected.

## Files modified

| File | Change |
|------|--------|
| `js/analyse.js` | Dmax + Gmax candidate pools keyed by evolution target (`maxTargetKey`) instead of `p.name`. No other engine logic touched. |
| `tests/analyse.eevee_master.test.js` | **New** — 12 self-contained synthetic tests (no personal CSV) covering all five required scenarios. |
| `index.html` | Version bump v3.5.48 → v3.5.49 (title + logo). |
| `RULES.md` | Added "Dynamax / Gigantamax slots (per evolution target)" rule under §4 Slot Assignment. |

## Test results

- **New suite `analyse.eevee_master.test.js`: 12/12 passing.**
  - Glaceon wins confirmed Master (`GlaceonⓂ98`, not `Glaceon98m`) — incl. grey-star guard.
  - Independent per-evolution Master consideration (highest wins, losers stay keep).
  - Dynamax best surfaces per evolution target (the fix).
  - Same-target Dynamax Eevees share one pool (no spurious duplicate slot).
  - Gigantamax parity.
  - Branching slot separation unaffected (Leafeon-LL + Jolteon-LL coexist).
  - Two-slot cap: one Shadow (purify-push `Ⓜ…p`) + one Non-Shadow Master per family.
- All analyse-engine suites green together: **322/322**
  (`analyse.eevee_master`, `analyse.branching_evo`, `analyse.master_league`,
  `analyse.dust_tiebreak`, `analyse.fixture`, `analyse.test`,
  `analyse.completeness`).
- Full repo run: **689 passing, 1 skipped, 4 failing.** The 4 failures are all
  in `tests/csp.test.js` and are **pre-existing on baseline** (verified via
  `git stash` — they fail without my change too). They belong to the separate
  in-flight CSP-hardening thread (untracked `tests/csp.test.js`,
  `js/gtag-init.js`) and are out of scope for this brief. No engine test
  regressed.

## Deviations from Opus guidance

None possible — Opus produced no implementation guidance (it was blocked on
missing files). I followed the brief's Opus tasks directly and stayed within
scope: the only engine change is the Dmax/Gmax keying in `analyse.js`. No render
layer changes were required — the `Ⓜ` confirmed-star vs `…m` placeholder
distinction is purely an engine slot-assignment outcome, and the engine already
assigns Glaceon's Master slot correctly.

## Open questions

- The brief's `VERSION_TARGET` was `TBD`; I used **v3.5.49** (next after the
  current v3.5.48 on the base branch). Adjust if the coordinator wants a
  different number.
- The 4 pre-existing `csp.test.js` failures are tracked under the CSP-hardening
  thread, not here. Flagging only so they aren't mistaken for a regression from
  this PR.

## PR URL

Branch pushed: `feature/eevee-master-dynamax-regression`.
`gh` CLI is not available in this environment, so the PR could not be opened
programmatically. Open it here (base `main`):

➡️ https://github.com/mariellen/pokevault/pull/new/feature/eevee-master-dynamax-regression

Note: the branch was cut from the unmerged `feature/version-bump` commit
(`dcee193`, v3.5.48), so the PR range to `main` (currently v3.5.47) shows that
shared commit plus this fix — net `index.html` transition v3.5.47 → v3.5.49.
Because `dcee193` is the same commit object on both branches, whichever of the
two PRs merges first absorbs it cleanly with no duplication or conflict.
