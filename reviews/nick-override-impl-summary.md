# Implementation Summary — Nick Override (Inline Editing)

**Brief:** `briefs/nick-override.md` · **Route:** OPUS-FIRST · **Version:** v3.5.48
**Status:** Implementation complete — awaiting Opus post-check

---

## 1. What changed & why

Added a user-authored **nick override** so users can replace PokéVault's suggested
nick with their own (e.g. to match an established Pokégenie convention) while keeping
the core copy-to-GO workflow intact. Implemented per the Opus pre-review's locked
design decisions: extend the existing overrides record, apply post-derivation, distinct
indicator, CSV-immune, reset-to-suggested, `null` ≠ `''`.

### Files modified

| File | Change |
|------|--------|
| `js/config.js` | New `MAX_NICK_LENGTH = 64` + `clampNick(value)` — sanitises/caps a nick; preserves the `null` (no override) vs `''` (real "no nick" override) distinction. |
| `js/analyse.js` | New `applyNickOverride(p, ov, suggestedNick)` (post-derivation merge: sets `p.nickname`, `p.suggestedNickname`, `p.nickOverridden`). New **final pass** in `analyse()` re-applies overrides over the freshly-derived nicks — runs last so it survives every earlier nick reassignment and a fresh CSV upload. |
| `js/supabase.js` | New `saveNickOverride(idx, nick)` — optimistic local update + field-level cache merge + **rollback on write failure**. `applyOverridesToPokemon()` now recomputes the suggested nick then re-applies the override on top (and restores the suggested nick when an override record is removed). SQL comment + `nick text` column documented. |
| `js/render.js` | Nick cell: `data-nick` now fully `esc()`-escaped (XSS-safe), `data-key` added, `nick-overridden` accent class + `✏` badge when overridden, always-present `✎` edit button, `↺` reset button when overridden. Copy-on-tap preserved on the `.main-nick` span. |
| `js/app.js` | New `nickEditKey` (pure Enter/Esc decision), `beginNickEdit` (swaps span → controlled `<input>`, **never contenteditable**), `commitNickEdit`, `cancelNickEdit`, `resetNick`, `rerenderNickCell`. `setNickConvention` and `setOverride` now re-apply the override on top of recomputed nicks so toggling convention/shiny/dmax never silently discards a custom nick. `clearOverride` drops the nick override too. |
| `css/styles.css` | Styling for `.nick-overridden`, `.nick-ovr-badge`, `.nick-edit-btn`, `.nick-reset-btn`, `.nick-edit-input`. |
| `supabase_phase1.sql` | `ALTER TABLE pokemon_overrides ADD COLUMN IF NOT EXISTS nick text DEFAULT NULL;` (columnar table → nullable column; existing FOR-ALL policy already scopes column writes). |
| `RULES.md` | New "Nick override" subsection in §9 + `nick` field row. |
| `index.html` | Version bump v3.5.46 → **v3.5.48**. |

### New test infra

- `tests/nick-override.test.js` — 28 tests (all 10 Opus Required Tests).
- `tests/render-loader.js` — loads config+data+stats+analyse+render for `buildRow`/`esc`.
- `tests/nick-edit-loader.js` — loads app.js inline-edit handlers with injectable `saveNickOverride`.
- `tests/loader.js`, `tests/supabase-loader.js` — extended to expose the new API (`applyNickOverride`, `clampNick`, `saveNickOverride`, `createNickEnv`).

---

## 2. How it addresses the brief / Opus guidance

- **UI:** tap **✎** to edit inline → controlled `<input>` → Enter/blur commits, Esc cancels; `↺` reset shown only when overridden. (Kept tap-to-copy on the nick text itself — see Deviations.)
- **Storage:** extended the existing `pokemon_overrides` record with a `nick` field — same `stableKey` keying, same load/apply/sync lifecycle.
- **Display:** `nick-overridden` accent colour + `✏` badge.
- **Sync:** override re-applied in the post-derivation merge (last step of `analyse()` and in `applyOverridesToPokemon`), so it survives CSV uploads / cloud reloads.
- **Reset:** `resetNick` → `saveNickOverride(idx, null)` restores the suggested nick.
- **Schema:** nullable `nick text` column added to the migration.

---

## 3. Test results

```
npx jest
Test Suites: 1 failed, 24 passed, 25 total
Tests:       4 failed, 1 skipped, 677 passed, 682 total
```

- **+28 new tests** for nick-override — all green.
- The **4 failures are pre-existing and unrelated** — all in `tests/csp.test.js`
  (the in-flight `csp-hardening` thread expects `js/gtag-init.js` / a `v3.5.47`
  marker / inline-handler removal that is not part of this brief). Baseline before
  my changes was identical: `4 failed, 649 passed`. My change added 28 passing tests
  (649 → 677) and introduced **zero** new failures.

Required-test coverage (Opus list → test):
1. Set override ✓ · 2. CSV-survival ✓ · 3. Reset ✓ · 4. `''` vs `null` ✓ ·
5. Max-length (client + write) ✓ · 6. XSS escaping ✓ · 7. Esc cancels (no write) ✓ ·
8. Per-Pokémon isolation ✓ · 9. Write-failure rollback ✓ ·
10. Authz — payload carries `user_id` ✓ (see Deviations re: true RLS).

---

## 4. Deviations from Opus guidance

1. **Edit trigger is an explicit ✎ button, not tap-the-nick-text.** Opus recommended
   tapping the nick directly. PokéVault's nick cell already binds tap → *copy to
   clipboard*, which is the load-bearing core workflow ("copy from PokéVault, paste
   into GO" — Opus's own "copy-to-GO workflow unaffected" watch point). Tapping the
   text to edit would break copy. Resolution: tap-the-nick still copies; a small **✎**
   enters edit mode. This is the "Both?" option from the brief, chosen to protect the
   copy path. **Flagging for Mariellen's confirmation.**

2. **Authz test (#10) asserts the write payload is `user_id`-scoped** rather than
   exercising a live RLS rejection. The Node/Jest harness has no Supabase instance, so
   a true cross-user RLS denial can't be unit-tested here. The existing
   `anon_full_access` policy plus the `user_id` on every write is the same posture as
   all other overrides; no policy change is needed for the new column.

3. **Max-length cap = 64** (Opus's suggested headroom value). This was one of the three
   items Opus left "pending Mariellen's sign-off." I proceeded with 64 per the brief's
   instruction not to ask clarifying questions; **easily changed** via `MAX_NICK_LENGTH`.

4. **Empty-string = a real override (stored as-is), not coerced to the suggested nick.**
   Opus's stated default. Reset (`↺` → `null`) is the only path back to suggested.

5. **`stableKey` changes on evolution → the override is orphaned.** Confirmed:
   `makeStableKey` includes `PokemonNumber`, which changes on evolution. This matches
   the behaviour of *every* existing per-Pokémon override (shiny/dmax/etc.), so it's
   consistent, not a new surprise. Documented in `RULES.md`.

---

## 5. Open questions for the coordinator

- **Confirm the ✎-edit-button vs tap-to-edit decision** (Deviation 1).
- **Confirm `MAX_NICK_LENGTH = 64`** (vs GO's 12) (Deviation 3).
- **Working-tree hygiene:** this branch was cut from a working tree that already
  contained **uncommitted work from other in-flight threads** (GA4 tracking in
  `js/auth.js` + `js/app.js`, CSP hardening in `index.html`). To keep this PR focused,
  I committed **only** the nick-override files and left `js/auth.js` (purely GA4) and
  other threads' staged files untouched. `js/app.js`, `js/config.js`, `js/render.js`
  and `index.html` unavoidably also carry those threads' edits because the changes are
  interleaved in the same files and `git add -p` is non-interactive here. The
  coordinator should reconcile branch hygiene before merge (e.g. rebase once the GA4/CSP
  PRs land).

---

## 6. PR URL

_To be filled in once the PR is opened (see HANDOFF.md next-action)._
