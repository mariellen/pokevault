ROUTE: OPUS-FIRST
BRIEF: opus-review-7
VERSION_TARGET: TBD

# Brief — Opus Review #7: Engine Health Check

## Context
Since Opus Review #6, significant changes have landed:
- Master League special categories (v3.5.39-v3.5.42)
- Dust tiebreak fix (v3.5.45) — 275 nick corrections on real export
- Branching evo regression tests (v3.5.41)
- Multiple bug fixes (gender-locked species, form nicks, Dynamax nicks)

Time for a holistic engine health check.

## Review scope

### 1. Pre-existing grouping artifact (flagged by Opus in dust tiebreak review)
Some same-species/same-gender Pokémon land in separate `byEvoStage`
pools and never compete head-to-head for the same slot.

Example: two ♀ Pidgey at 99.98% UL — one keeps a slot while a cheaper
twin doesn't, because they're in separate pools.

Questions:
- Is this intentional? (Same species/gender/form competing = one-slot rule applies?)
- Or is it a dedup/grouping artifact that's unintentionally creating
  separate pools for identical Pokémon?
- If a bug: what's the fix and what's the impact on the real collection?
- If intentional: document it clearly in Business Rules

### 2. Dust tiebreak validation
Verify the v3.5.45 fix is comprehensive:
- Rounded rank used consistently everywhere in the sort path
- No other place in `analyse.js` does raw rank comparison before dust
- Already-evolved preference fires correctly in all cases
- Lucky half-dust in tiebreak works correctly
- No new edge cases introduced by the fix

### 3. Master League consistency check
After all the Master League changes (v3.5.39-v3.5.42), verify:
- Two-slot cap holds (one Shadow + one Non-Shadow per family) across
  the full real export
- No Legendary is still falling through to best_overall incorrectly
- Purified * is always trailing correctly
- Lucky margin (5pp) firing correctly — check a few real examples

### 4. General engine health
- Any new slot collisions introduced since Review #6?
- Any nick truncation issues (12-char limit)?
- Any families with unexpected zero keepers?
- Any inconsistencies between the Business Rules doc and the code?

## Files needed
- `analyse.js`
- `PokéVault_Business_Rules.md` (current version from repo RULES.md)
- `export_187.csv` or current export for validation

## Output expected from Opus
- Verdict on grouping artifact (bug vs intentional)
- Confirmation dust tiebreak is comprehensive
- Master League consistency results
- Any new issues found with fix recommendations
- Updated test suggestions if gaps found
