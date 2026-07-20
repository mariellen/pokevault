# Impl Summary — Per-costume best-IV keeper for Pikachu family (#83) — v3.5.73

Brief: `briefs/issue-83-per-costume-best-iv-keeper.md`. Extends the v3.5.64 per-form collection
keeper to Pikachu costumes.

## What changed
- **`js/data.js`:** new `COSTUME_KEEPER_SPECIES = new Set(['Pikachu','Pichu','Raichu'])` — per-form
  keeper species that get the keeper logic **without** a `COLLECTION_SETS` completeness set (100+
  costumes, no "missing" badge).
- **`js/analyse.js`:**
  - New top-level `isCollectionKeeperSpecies(name)` = `COLLECTION_SETS[name]` **or**
    `COSTUME_KEEPER_SPECIES.has(name)`. Now gates the per-form keeper block and the ML grey-placeholder
    exclusion.
  - Keeper block: best IV per `specialForm||vivillonPattern` costume → `collection` slot. **`'Unknown'`
    and `'None'` are excluded** (`isRealForm`) — no keeper, compete normally.
  - **Master-strip is now conditional:** unconditional for `COLLECTION_SETS` species (unchanged
    v3.5.64), but only for **tagged** costumes on `COSTUME_KEEPER_SPECIES` — so untagged / `'None'`
    Pikachu keep their IV-based Master/best-overall path.
  - `applyCollectionNick` now names the keeper via `terminalEvo(p.name, p.form)` → `RaichuⓇ{IV%}` for
    Pikachu; a no-op for single-/final-stage collection species.
- **`RULES.md`:** collection-keeper section extended (#83); slot table + nick rule updated.
- **`index.html`:** v3.5.72 → v3.5.73.

Star colours (green ≥90 / grey <90 / gold favourite) and PvP form-blindness are the existing
mechanisms — unchanged. A costume keeper that wins a real league slot keeps the **league** nick
(`RaichuⒼ99`) because that decision branch runs before the collection branch.

## Deviations / gotchas
- **Brief test 1** says the non-best 91% "gets trade"; a ≥90 non-best actually surfaces as **review**
  (existing "≥90 but not best in family" rule). Test asserts the real invariant: not a keeper.
- **GL-winner only wins G when IV < 90.** The M-first one-slot rule (Master rank = IV%) claims Master
  first for a ≥90-IV mon, so a costume Pikachu with high IV becomes an `Ⓡ` keeper (M stripped), not a
  `Ⓖ` winner. The fixture uses IV 86.7 to isolate a genuine GL win. Worth knowing in-app: only
  low-IV/high-rank Pikachu will show the `Ⓖ`/`Ⓤ` league nick.

## Tests
- **New `tests/analyse.pikachu-costume-keeper.test.js` (9):** best-of-costume `RaichuⓇ98` green;
  lone sub-90 `RaichuⓇ84` grey; gold favourite; `Unknown`/`None` excluded (compete normally);
  Lucky/Shiny kept; GL-winner `RaichuⒼ99`; Raichu keeper terminalEvo no-op.
- **865 passing** (was 856). 4 failures = pre-existing untracked `tests/csp.test.js`. `node --check`
  clean on analyse.js. Existing COLLECTION_SETS species tests unaffected (terminalEvo is a no-op there).

## Manual checklist (for Mariellen)
1. Two Rock Star Pikachu → highest IV shows `RaichuⓇ{IV}` (green ≥90 / grey <90); the other isn't a keeper.
2. A lone costume (e.g. one Santa Hat) → kept even sub-90 (grey).
3. Untagged / `'None'` Pikachu → no costume keeper.
4. Lucky / shiny costume Pikachu → kept.

## Version
v3.5.72 → v3.5.73.

## PR
https://github.com/mariellen/pokevault/pull/86
