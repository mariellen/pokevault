# Opus Pre-Implementation Review
_Generated: 13 Jun 2026 15:05_

# PokéVault Review — `eevee-master-dynamax-regression`

I have to flag a blocking issue before this review can be actionable, and I want to be direct about it rather than producing confident-sounding guidance on code I cannot see.

## Process Blocker — Required Files Were Not Provided

The brief lists four files as "Files needed":

- `analyse.js`
- `PokéVault_Business_Rules.md`
- `analyse.branching_evo.test.js`
- `analyse.master_league.test.js`

**None of these were attached to this message.** I have no access to the actual source of `analyse.js`, the sort comparator that allegedly changed in v3.5.45, the `isFinalStage` / `wonInLoop` logic, the Dynamax slot assignment block, or the existing test expectations.

The brief's core Opus tasks are all *trace* tasks — "trace exactly where in `analyse.js` it fails," "review whether the dust tiebreak sort comparator change affected Master slot assignment," "confirm whether each Eevee evolution gets independent Dynamax slot consideration." Every one of these requires reading the code. I cannot trace a regression through code I do not have.

If I were to write the five sections below from the brief's *suspicions* alone, I would be inventing function bodies, line numbers, and comparator semantics. That output would look authoritative and would go "straight to Claude Code as its implementation brief" — which is precisely the situation where a fabricated root cause does real damage. A wrong "the bug is in the `isFinalStage` check at the non-shadow Master block" instruction could send the implementer to refactor correct code.

So I will not guess. Here is what I need, and here is the partial review I *can* responsibly give.

## What I Need To Complete This Review

1. **`analyse.js`** in full (or at minimum: the league loop, the Master pass / non-shadow Master pick block, the `eligible.sort` comparator as of v3.5.45, the `isFinalStage` helper, the `wonInLoop` logic, and the Dynamax slot assignment block).
2. The **v3.5.45 diff** specifically — the brief claims it "removed the raw-rank bypass." I need to see before/after of that comparator.
3. **`PokéVault_Business_Rules.md`** — specifically the Master slot rules, the two-slot cap definition (one Shadow + one Non-Shadow per family), branching-evo separation rules, and the Dynamax recommendation rule.
4. **`analyse.branching_evo.test.js`** and **`analyse.master_league.test.js`** — so I can assess real regression risk and match the existing test harness style.
5. The **render-layer code** for the `Glaceon98m` vs `GlaceonⓂ98` formatting (v3.5.48 nick override) — to confirm/rule out Issue 1 being a render bug vs. an assignment bug. `98m` (grey, ML placeholder) vs `Ⓜ98` (gold, confirmed) is a rendering distinction; I need to verify whether the engine is failing to *assign* the slot or failing to *render* an assigned slot.

## Preliminary Analysis (Hypotheses Only — Unverified)

These are **investigation leads, not conclusions.** Do not implement against them.

- **Issue 1 framing matters.** `Glaceon98m` (placeholder) vs `GlaceonⓂ98` (confirmed) could be either (a) the Master slot never being assigned, or (b) the slot being assigned but rendered as unconfirmed. The brief assumes (a) and points at the comparator. The v3.5.48 nick override touched the render layer — this cannot be dismissed as "less likely" without reading both layers. **First triage step is to log whether `wonInLoop` / the Master slot field is actually set for Glaceon before blaming the comparator.**

- **The v3.5.45 "raw-rank bypass" removal** is the most plausible regression vector *if* Issue 1 is an assignment failure. A comparator that previously short-circuited on raw rank and now falls through to dust tiebreak could reorder branching-evo candidates such that a placeholder/ML entry sorts above the confirmed Glaceon within a shared group — but only if Eevee evolutions are grouped into one `eligible` array. That grouping question is the crux and is unanswerable without the code.

- **Issue 2 (Dynamax) and Issue 1 may share one root cause:** improper grouping key for branching families (keying on `Eevee` / base species rather than on final evolution target). If both the Master pool and the Dynamax pool group by base species, one fix to the grouping key could resolve both. This is the single most important thing to verify — it determines whether this is one fix or two.

## What I Can Commit To Now

Once the files arrive I will produce the full structured review (Root Cause Analysis / Risk Assessment / Implementation Guidance / Required Tests / Watch Points), including:

- A concrete trace of where Glaceon falls out of the Master competition (with actual line/function references).
- A determination of whether Issues 1 and 2 share a grouping-key root cause.
- A ruling on the v3.5.48 render-layer involvement in Issue 1.
- The full `analyse.eevee_master.test.js` matching your existing harness conventions, with synthetic fixtures (no personal CSV) covering all five required scenarios.
- An explicit statement if the fix must touch anything beyond `analyse.js` (e.g., the render layer for the `Ⓜ` confirmed-star formatting), flagged for coordinator review per your scope constraint.

**Please attach the five items above and I will turn the complete review around immediately.** If you intended the files to be inline and they were stripped, re-send `analyse.js` first — it unblocks the majority of the trace work.