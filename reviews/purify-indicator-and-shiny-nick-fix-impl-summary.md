# Impl Summary — Purify Indicator `p` + Shiny/Purify Evolved Name (v3.5.59)

Brief: `briefs/purify-indicator-and-shiny-nick-fix-v2.md` · Issues #43, #47

## What changed

- **`js/analyse.js` — `simulatePurify()` (Fix 1, #43):** replaced the broken
  `estimatedPurified = rank + improvement * 0.4` heuristic for L/G/U with Pokégenie's own
  per-league recommendation. A shadow is a purify candidate for a capped league **only when
  `Sha/Pur(lg) === 2`** (purify recommended) **and** the CSV `Rank %(lg) ≥ keepThreshold (90)`.
  In that case the CSV `Rank %` *is* the purified (battle-simulated) rank, so it's used
  verbatim — no estimation. `Sha/Pur = 1`/blank → never a candidate. Master is unchanged
  (`purifyIvAvg`, uncapped). The exact CP-cap guard is retained.
- **`js/analyse.js` — CSV parse:** added `shaPurG/U/L` (from `Sha/Pur (G/U/L)`) to the parsed
  Pokémon object. These columns existed in every Pokégenie export but were never parsed.
- **`js/analyse.js` — `buildNickname()` (Fix 2, #47 + bundled line-338):** added an
  `evoDisplayName(evoName, evoForm)` helper (strips the `|Form` qualifier, applies the
  short battle-form prefix, leaves regional forms as plain species). Used it in:
  - the **shiny / shiny_lower** nick (was `p.name` → now the evolved target of the displayed
    league; no-league fallback uses the U/G evo target),
  - the **shadow purify-review** nick (was `p.name` → now `p.purifyEvo`).
- **`index.html`:** version bump v3.5.58 → **v3.5.59** (title + logo).
- **`RULES.md`:** §1 column list (+`Sha/Pur (L/G/U)`), §7 rewritten (Sha/Pur-driven, no
  heuristic), §"Shadow"/"Shiny" nick notes updated.
- **`tests/poke_genie_fixture.csv` + `tests/analyse.fixture.test.js`:** the Gastly CP82 purify
  row encoded the *old heuristic* (`Sha/Pur=0`, rank 89.5% → fired via `+improvement*0.4`).
  Re-pointed it to a realistic case (`Sha/Pur(G)=2`, purified `Rank % (G)=93.5`) and refreshed
  the now-stale Group 7/Group 17 comments + test titles. Gastly now renders `HaunterⒼ94p`.

## Why this addresses the brief

The brief's proposed stat-product fix was demonstrated to still misfire on the exact Mankey/
Annihilape case (purified IVs ≥ shadow IVs → ratio ≥ 1 → estimate pushed *up*, not down).
The real signal was already in the export: `Sha/Pur (G/U/L)` is Pokégenie's battle-simulated
shadow-vs-purify verdict, and the `Rank %` column already reflects the purified form when the
verdict is "purify". Confirmed against the app (Duskull `Sha/Pur(U)=2`, CSV 99.17% == in-app
purified Dusknoir 99.1%). This makes the indicator exact and removes the guesswork. Because the
`p` suffix, the purify slot push, and the purify modal all read `purifyLeague`/`purifyRankPct`/
`purifyEvo`, fixing `simulatePurify()` fixes all three at once.

## Test results

- **797 passing** (was 795), 2 skipped, 1 todo.
- **4 failures remain — pre-existing and unrelated:** `tests/csp.test.js` (Phase 1 / Phase 5,
  CSP hardening) is from a separate in-flight thread (`csp.test.js` + `js/gtag-init.js` are
  untracked). Verified they fail identically with my changes stashed. **Not addressed here.**

## Deviations from the brief

- Did **not** implement the brief's stat-product `computePurifiedStatProd()` approach — it
  doesn't fix the reported bug (see above). Used the `Sha/Pur` columns instead (coordinator
  approved "Option 2", confirmed semantics against Pokégenie).
- Fix 2 was **not** a one-line `p.name → base` swap: for the shiny slot `base` is never the
  evolved name, so that swap is a no-op. Implemented via `evoDisplayName` + the displayed
  league's evo target instead.
- Bundled the line-338 purify-review nick fix (`p.name → p.purifyEvo`) per coordinator request.

## Open questions

- The capped-league `Sha/Pur=2` + `rank ≥ 90` case now correctly fires `p`, but the broader
  slot-assignment logic still reads `rankPctG/U/L` as if achievable by the shadow as-is. For a
  `Sha/Pur=2` mon that rank is the *purified* rank — so it shows as a league keeper carrying
  `p` ("keep & purify"). That's sensible, but if you want the un-purified shadow's own league
  standing represented differently, that's a larger slot-engine change (out of scope here).

## PR

https://github.com/mariellen/pokevault/pull/50
