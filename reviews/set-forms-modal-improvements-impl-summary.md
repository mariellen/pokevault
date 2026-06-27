# Impl Summary — Set Forms Modal: Show IVs + Fix Override Count (v3.5.60)

Brief: `briefs/set-forms-modal-improvements.md` · Issues #52, #53

## What changed

- **`js/app.js` — `openCleanupModal()` (Fix 1, #52):** the Set Forms modal row meta now shows
  the Atk/Def/Sta spread between IV% and the nick:
  `CP:892 · 93% IV · 14/13/14 · …`. (`p.atkIV/defIV/staIV` were already on the object.)
- **`js/supabase.js` — `loadOverrides()` (Fix 2A, #53):** replaced the single un-paginated
  `GET pokemon_overrides?select=*` with a new `fetchAllOverrides()` that pages via
  `limit=1000&offset=…&order=pokemon_index` until a short page — mirroring the existing
  `loadCollectionFromCloud` batching. PostgREST caps a single response at 1000 rows, so the
  old call **silently dropped every override past 1000** (the "stuck at 1000" symptom). The
  retry-once/offline handling is preserved (`fetchAllOverrides` returns `null` on failure).
- **`js/supabase.js` — `saveOverride()` (Fix 2B, #53):** the post-save status now shows the
  live total `✓ Saved — N overrides` (from `Object.keys(overridesCache).length`) instead of a
  static `✓ Saved`, so the count reflects new saves immediately. Also gives the previously
  status-less offline path a `✓ Saved (offline) — N overrides` message.
- **`index.html`:** version bump v3.5.59 → **v3.5.60** (title + logo).

## Why

These unblock proper testing of the #48 forms dropdown: Mariellen needs the IV spread to tell
same-CP duplicates apart, and an accurate override count to trust that all forms are loaded.

## Test results

- **797 passing**, 2 skipped, 1 todo — unchanged from before (these are browser-only
  network/UI functions with no unit coverage; brief test cases are manual).
- ⚠️ **4 failures remain — pre-existing & unrelated:** `tests/csp.test.js` (CSP hardening,
  separate untracked thread). Verified identical before/after this change.

## Manual verification checklist (for Mariellen)

1. Open 🎨 Set Forms — each row now shows `… % IV · A/D/S · …`. Two same-CP Furfrou are now
   distinguishable.
2. Save a form/flag override — status shows `✓ Saved — N overrides` and N goes up for a new one.
3. If you had >1000 overrides, reload — the load count should now exceed 1000 (was capped).

## Deviations

- None substantive. The brief was unsure whether Part A (1000 cap) or Part B (count refresh)
  was the cause; both are fixed. Part A is the real data-loss fix (overrides past 1000 were
  not loaded), Part B is the display refresh.

## Open questions

- None blocking. Note `saveOverride`'s count counts override *rows* in cache; unchecking a flag
  leaves the row (count drops only on Clear overrides → `deleteOverride`). That matches "number
  of Pokémon with an override on file".

## PR

https://github.com/mariellen/pokevault/pull/<TBD>
