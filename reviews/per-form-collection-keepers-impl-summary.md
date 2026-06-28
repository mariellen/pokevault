# Impl Summary — Per-Form Collection Keepers (#64) — v3.5.64

Brief: `briefs/per-form-collection-keepers.md` (OPUS-FIRST). Implemented in the Opus-specified order.

## ⚠️ One judgment call to flag (Opus didn't catch this — it couldn't run the suite)

The brief said "**no change to PvP slot assignment for collection-form species**," but its own
acceptance example (`White Plumage Squawkabilly 84% → SquawkabⓇ84`) is impossible without one,
because **Master rank = IV%** — so every collection mon "qualifies" for Master, and the
Master/placeholder passes were intercepting per-form keepers (turning them into `Ⓜ`/`review`
instead of `Ⓡ keep`). I resolved it the way the brief's example demands: **cosmetic
collection-form species are kept per-form (`NameⓇ{IV%}`) and are excluded from IV-based Master**
(strip `M`/`M_tentative` + affordability winner flags, exclude from the ML grey-placeholder pass).
**Real Great/Ultra rank wins are untouched** — a Green Plumage that wins GL still gets its `Ⓖ`
slot. If you'd rather collection species still show `Ⓜ` when they're the family's top IV, that's
the one thing to push back on. No existing test was rewritten to hide a regression — the suite was
green before and after (these paths simply had no prior unit coverage).

## What changed (in Opus's order)

1. **Form-string fix (`data.js`, `config.js`) + read-path normalisation.** Canonicalised the
   four-way `Poké Ball` split (`Poke Ball`/`Poké Ball`/`Pokéball`) → **`Poké Ball`** across
   `FORM_DROPDOWNS` (×3), `FORM_SEARCH`, `FORM_NICK_PREFIXES` (COLLECTION_SETS was already
   correct). A full programmatic audit confirmed this was the only mismatch. Added
   `normalizeFormString` (data.js) applied on the override READ path (analyse.js ×2, supabase.js)
   so legacy stored strings still match — no Supabase migration needed.
2. **Collection-keeper rewrite (`analyse.js`).** Replaced top-N-by-IV with **best IV of each
   tagged form** (`specialForm||vivillonPattern`), with the `m.name === p.name` guard for
   Deerling/Sawsbuck cross-contamination. Moved the block above the `hasLeagueSlot` computation so
   the Master strip is seen. Let collection keepers skip the `qualifiesAny → review` branch.
3. **Grey-star path + badge.** Star: favourite → gold, `IV ≥ 90` → green, else **grey** (ladder
   precedence, mirrors `gmaxSuppressedHundo`). Badge (`app.js`) now shows
   `N/M patterns · missing: …` (inline list capped at 3, full list in tooltip), keyed by the same
   form bucket as the keeper.
4. **Lucky per-form:** no code change — added a coexistence test (Q6).
5. **Case 1 (Lycanroc/Burmy decision-forms):** verify-only (slotEvoTarget already form-aware, #39);
   added a plumbing-verification test; per-form slot specifics remain covered by Group E.

## Tests
- **813 passing** (+11 new in `tests/analyse.per-form-collection.test.js`): per-form keep, grey/
  green/gold stars, favourite, untagged→review, Florges-no-colour-prefix (#55), Poké Ball
  normalisation, Lucky coexistence, Lycanroc verify.
- **No existing assertion changed** — the collection keeper had no prior unit coverage, so nothing
  broke (Opus predicted keep-count/reason-string breakage; none occurred).
- ⚠️ **4 failures remain — pre-existing & unrelated:** `tests/csp.test.js` (untracked CSP thread).
  Verified identical before/after.

## Manual checklist (for Mariellen)
1. Set forms on your Squawkabilly — Blue & White Plumage now each get a keeper (grey star if
   sub-90, green if ≥90). The family header shows `… · missing: <form>` for any you don't own.
2. A Vivillon you'd set to "Poke Ball" before now reads as the canonical Poké Ball (no longer shows
   as missing).
3. Furfrou/Vivillon/Squawkabilly no longer show a stray `Ⓜ` — they're `Ⓡ` collection keepers.

## Version
v3.5.63 → v3.5.64 (bare-number sed bumped the `?v=` cache-bust strings too).

## PR
https://github.com/mariellen/pokevault/pull/<TBD>
