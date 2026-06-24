# Impl Summary — evolved-form-supabase-persistence (#41, v3.5.57)

## 1. What changed

- **Supabase schema (run manually by Mariellen in the SQL editor, before code):**
  ```sql
  ALTER TABLE pokemon_collection
    ADD COLUMN IF NOT EXISTS evolved_form_g text DEFAULT '',
    ADD COLUMN IF NOT EXISTS evolved_form_u text DEFAULT '',
    ADD COLUMN IF NOT EXISTS evolved_form_l text DEFAULT '';
  ```
  (The brief said `ALTER TABLE pokemon`; the real table is `pokemon_collection` — corrected. Migration confirmed run.)
- **`js/supabase.js`**
  - Save payload (`slim` map): added `evolved_form_g/u/l: p.evolvedFormG/U/L || ''`.
  - `COLLECTION_DB_FIELDS`: added the three columns (or the schema-validation test fails).
  - New pure helper **`cloudRowToCsvRow(r, i)`** + exported it via `module.exports`. This is the cloud-row → synthetic-CSV-row reconstruction, **moved out of app.js** so it is unit-testable, and **fixed** to map `evolved_form_*` → `Form (G/U/L)`.
- **`js/app.js`** — `processCloudRows` now calls `cloudRowToCsvRow(r, i)` instead of an inline object literal. The old literal **hardcoded `'Form (G)':'','Form (U)':'','Form (L)':''`**, which was the actual bug (it discarded the form on every cloud load). Also dropped four duplicate keys that existed in the old literal (identical values — no behaviour change).
- **`tests/schema.test.js`** — `PARSER_TO_DB` gains `evolvedFormG/U/L → evolved_form_g/u/l` so the schema guard covers the new fields.
- **`tests/supabase.test.js`** — new `#41` describe block (4 tests): save payload includes the fields; `cloudRowToCsvRow` restores `Form (G/U/L)`; a form-less Pokémon stays empty (no regression); and a full **round-trip** (DB row → `cloudRowToCsvRow` → `analyse()`) asserting `evolvedFormG`/`U` are restored.
- **`index.html`** — version v3.5.56 → **v3.5.57** (`<title>` + logo span).

## 2. Why — and where the brief was wrong

Root cause is two-sided: the form was **never saved** (brief got this right) **and** the cloud-load reconstruction **actively threw it away** (brief missed this). Cloud load does not assign `evolvedFormG` to an in-memory object as the brief's Step 3 assumed — it **rebuilds synthetic Pokégenie CSV rows and re-runs `analyse()`**, which derives `evolvedFormG` from the `Form (G/U/L)` columns. Those columns were hardcoded to `''` (app.js, old line 2158). So the brief's Step 3 patch (`evolvedFormG: row.evolved_form_g` in the "cloud load function") would have set a field `analyse()` ignores, in a function (`loadCollectionFromCloud`) that doesn't do the remap — the bug would have survived. Correct fix: feed `evolved_form_*` into the synthetic `Form (G/U/L)` columns.

## 3. Test results

- `tests/supabase.test.js` + `tests/schema.test.js`: **15 passed** (incl. 4 new #41 tests).
- Full suite (excluding the untracked `tests/csp.test.js`, a separate CSP thread not on this branch): **770 passed, 2 skipped, 1 todo, 33 suites green**.
- `node --check` passes on both `app.js` and `supabase.js` (app.js isn't covered by Jest).

## 4. PR URL

`feature/evolved-form-supabase-persistence` → main: https://github.com/mariellen/pokevault/pull/42

## 5. Deviations from the brief

1. **Table name**: `pokemon` → `pokemon_collection` (brief error).
2. **Step 3 relocated + corrected**: from `supabase.js loadCollectionFromCloud` (wrong function, wrong mechanism) to **`app.js processCloudRows` / `Form (G/U/L)` mapping**, now extracted into `supabase.js cloudRowToCsvRow`.
3. **Added `COLLECTION_DB_FIELDS` + `PARSER_TO_DB`** updates (brief omitted; schema test would otherwise fail).
4. **Testability refactor**: extracted `cloudRowToCsvRow` so the load side is unit-testable (brief's proposed test couldn't reach the DOM-coupled mapping).
5. No `analyse.js` / nick-logic / RULES.md changes — consistent with the brief (pure persistence fix; no business-rule change).

## 6. Open questions

- **Backfill**: existing cloud rows saved before this change have `evolved_form_* = ''`. They self-heal on the next CSV import + save (the form re-derives from the CSV and persists). No data migration is needed; flag if you'd prefer a one-off backfill from a fresh export instead of waiting for the next save.
- **Deploy ordering**: migration is already run, so merging this PR is safe to deploy immediately. (Holding deploy per your instruction until you confirm.)
