# Impl Summary — Set Forms Scan-Date Sort (#59) + JS Cache-Busting (#61) — v3.5.62

Brief: `briefs/ui-and-nick-fixes-batch.md` (#59, #61, #60). **#60 deferred** — see below.

## What changed

### #59 — Scan Date sort in the Set Forms modal
- **`js/app.js` (`openCleanupModal`):** added a **"Scan Date ↓"** sort button alongside
  Stable ID / CP / IV%, and a `cleanupSortMode==='scan'` branch that sorts most-recent-first via
  `(b.scanDate||'').localeCompare(a.scanDate||'')`. `scanDate` is an ISO-ish string
  (`"YYYY-MM-DD HH:MM"`), so a descending string compare orders chronologically; blanks sort last.

### #61 — durable cache-busting (the real fix; the dropdown code was already correct)
- **`index.html`:** appended `?v=3.5.62` to all 9 local assets (`css/styles.css` + the 8 `js/*.js`
  includes) so browsers re-fetch JS/CSS on each release instead of serving a stale copy after a
  CloudFront `/*` invalidation. Added an HTML comment + a CLAUDE.md note that these must be bumped
  with the version (bare-number global sed, since a `v3.5.NN` replace misses the `?v=` strings).
- Version bump v3.5.61 → **v3.5.62**.

### #60 — NOT changed (deferred, by agreement)
The dynamax/gigantamax handlers **already** use `base = evolvedNameU||evolvedNameG||p.name`, so they
already render the evolved name when Pokégenie provides a league evo (verified:
`ElectiviⓂ96Ⓓ`, `PersianⓂ98Ⓧ`). The `Electabu…` case only occurs when no league evo is
recommended, and the existing `analyse.dynamax_master.test.js` *asserts* the base-name nicks
(`ElectabuⓂ96Ⓓ` etc.), so the brief's desired behaviour would break those tests and needs
terminal-evo resolution for branching species. Held until a concrete real-world example is found.

## Why
#61's reported symptom (new species showed free text) was a stale browser `data.js`, confirmed by
a hard refresh fixing it — the per-row dropdown already keys off `FORM_DROPDOWNS` (shipped #57).
The cache-busting prevents that class of "stale JS after deploy" from recurring.

## Test results
- **797 passing**, 2 skipped, 1 todo — unchanged. The scan sort is browser-only modal code (no
  unit coverage); `node --check js/app.js` clean.
- ⚠️ **4 failures remain — pre-existing & unrelated:** `tests/csp.test.js` (untracked CSP thread).
  Verified identical after the index.html edits (cache-bust adds query strings to external `src=`
  scripts, not inline content, so CSP assertions are unaffected).

## Manual checklist (for Mariellen)
1. 🎨 Set Forms → a **Scan Date ↓** sort button appears; clicking it orders most-recent scans first.
2. Other sort buttons (Stable ID / CP / IV%) unchanged.
3. After this deploys, future releases shouldn't need a manual hard-refresh to pick up JS changes.

## Deviations
- #61 implemented as cache-busting (durable) rather than the brief's described code change, which
  was already done in #57 (would have been a no-op). #60 deferred per discussion.

## PR
https://github.com/mariellen/pokevault/pull/<TBD>
