# Implementation Summary — Feature Batch June 2026

_Implemented: 20 Jun 2026 · Branch: `feature/feature-batch-june-2026` · Version: v3.5.50_

> Note: branch was rebased onto current `origin/main` (which had advanced with the
> RULES.md consolidation + CSP hardening). RULES.md/index.html/HANDOFF.md edits were
> re-applied against main's current content; version bumped v3.5.49 → **v3.5.50**.

## Scope decision

The brief bundled 6 features. Opus pre-reviewed and explicitly flagged two as
blocked, and the Opus review was **truncated mid-sentence during the Feature 6
guidance**. Following instruction #1 ("follow the Opus guidance exactly") and the
"if genuinely blocked, write your question and stop" rule, I implemented the four
features that have complete, unambiguous guidance and **deferred F4 and F6**:

| Feature | Status |
|---------|--------|
| F1 — 🔍⭐ bulk keeper search | ✅ Implemented + tested |
| F2 — 🔍🔀 bulk merge search | ✅ Implemented + tested |
| F3 — last-CSV filename persistence | ✅ Implemented + tested |
| F4 — trainer name | ⛔ Deferred — needs Supabase schema approval (see Open questions) |
| F5 — Urshifu keep both forms | ✅ Implemented + tested |
| F6 — Dynamax best-overall Ⓜ flag | ⛔ Deferred — Opus guidance truncated (see Open questions) |

---

## What changed and why

### F1 — 🔍⭐ Bulk keeper GO search (highest priority)
**`js/render.js`** — added three pure, testable helpers near `esc`:
- `goSpeciesToken(name)` — reduces a species name to a GO-search-safe token:
  lowercase, keep hyphens (`Ho-Oh`→`ho-oh`), strip spaces/dots/colons/apostrophes
  (`Tapu Koko`→`tapukoko`, `Mr. Mime`→`mrmime`, `Farfetch'd`→`farfetchd`), fold
  `é`→`e` (`Flabébé`→`flabebe`). This is the real risk Opus identified — spaced
  names would otherwise break a comma-joined search.
- `buildBulkCpSearch(members)` — joins `token&cpNNN` with commas, de-duping identical
  name+cp pairs. Produces the brief's exact format `ho-oh&cp2169,ho-oh&cp2727,...`.
- `familyStarKeepers(members)` — `decision==='keep' && suggestStar` (gold + green).

**`js/app.js`** — added the `🔍⭐` button to **both** `renderFamily` and
`renderFamilyFiltered` (the two duplicated header builders Opus warned about),
alongside the existing 🔍 Me / 🔍 + Fam buttons. Button is **hidden when the family
has no keepers**. Reuses the existing `copyGoSearch()` (clipboard + ✓ toast) and the
established `data-copy` + `this.dataset.copy` escaping pattern — no raw names in
`onclick`. Fires `trackEvent('bulk_search_copy',{kind,count})` with **count only, no
PII**.

### F2 — 🔍🔀 Bulk merge-candidate GO search
**`js/render.js`** — `familyMergeCandidates(members)` filters on the existing
`mergeCandidateKeys` Set (the 🔀 icon source). **`js/app.js`** — `🔍🔀` button added to
both header builders, same format/escaping/hide-when-empty/tracking as F1.

### F3 — Track name of last CSV loaded
**`js/app.js`** — centralised the previously-inconsistent filename handling into one
helper `setCsvFilename(name)`:
- persists to `localStorage['pokevault_last_csv']`, capped to 120 chars
- renders ` · name` into `#csvFilename` via **`textContent`** (auto-escaped — closes
  the filename-XSS path Opus flagged) and toggles visibility
- `setCsvFilename(null)` clears both storage and label

Wired into all three load paths:
- `handleFile` — replaced the inline set with `setCsvFilename(file.name)`
- `processCloudRows` — was *blanking* the label; now **restores** the persisted name
  as the collection's provenance (Opus's recommendation)
- `window 'load'` — restores the persisted name on startup (no-op if never set)

### F5 — Urshifu: keep both forms
**`js/analyse.js`** — `FORM_SPLIT_FORMS` already exists in the refactor (Opus reasoned
blind here without `analyse.js`; RULES.md §11 was stale). Added `'Single Strike'` and
`'Rapid Strike'` to the set, so each Urshifu battle form gets its own family key
(`892|Single Strike`, `892|Rapid Strike`) and competes for slots independently — the
same mechanism as regional/gender splits. No new keying logic needed.

### Docs
- **`RULES.md`** — §2 (FORM_SPLIT_FORMS list + Urshifu note, marked present not
  missing), §8 (🔍⭐/🔍🔀 buttons + token rule), §10 (Urshifu special case), §11
  (June 2026 feature status incl. F4/F6 deferral).
- **`index.html`** — version bump v3.5.49 → v3.5.50 (title + header).

---

## Files modified
- `pokevault-refactor/js/render.js` — F1/F2 helpers
- `pokevault-refactor/js/app.js` — F1/F2 buttons, F3 `setCsvFilename` + wiring
- `pokevault-refactor/js/analyse.js` — F5 form split
- `pokevault-refactor/index.html` — version bump
- `RULES.md` — documentation
- New tests: `tests/bulk-search.test.js`, `tests/analyse.urshifu.test.js`,
  `tests/csv-filename.test.js`, `tests/csv-filename-loader.js`
- `tests/render-loader.js` — export the new render helpers + `mergeCandidateKeys`

---

## Test results
- **30 new tests** added (TDD — written red, then green):
  - `bulk-search.test.js` — 21 tests (token transforms incl. Ho-Oh/Tapu Koko/Mr.
    Mime/Type: Null/Farfetch'd/Flabébé, de-dup, keeper/merge selectors, end-to-end)
  - `analyse.urshifu.test.js` — 4 tests (form split, one form per family, both kept,
    same-form not over-split)
  - `csv-filename.test.js` — 5 tests (persist, clear, overwrite, 120-char cap,
    textContent XSS-safety)
- **Committed suite (what CI runs): 721 passed, 1 skipped, 0 failed.** (721 includes
  main's `analyse.eevee_master` suite, picked up after rebasing onto current main.)
- Locally the workspace also shows 4 failing tests in `tests/csp.test.js`, but that file
  is **untracked** — it is not on `main` and not in this commit, so **CI will not run it**.
  It is leftover WIP from the separate CSP-hardening thread and is unrelated to this PR
  (verified: `git ls-tree origin/main -- tests/csp.test.js` is empty).
- The 1 skip is the standard personal-export `it.skip` smoke pattern.

---

## Deviations from Opus guidance
1. **Helper location.** Opus said to put the bulk-search helpers "in render.js near
   `buildGoSearchStr`". `buildGoSearchStr`/`renderFamily`/`renderFamilyFiltered`
   actually live in **app.js**, not render.js. I put the four pure helpers in
   **render.js** (so they load before app.js and are unit-testable via the existing
   `render-loader`) and the **buttons** in app.js's two header builders. Behaviour is
   exactly as specified.
2. **Keeper selector semantics.** Opus flagged a pending decision: the brief's literal
   wording (`suggestStar=true OR isFavorite=true`) would include red stars
   (`isFavorite && !suggestStar`), contradicting its own "gold/green starred" framing.
   I followed Opus's recommended implementation — `decision==='keep' && suggestStar`
   (gold + green only, red excluded). If Mariellen wants red stars included, it's a
   one-line change in `familyStarKeepers`.
3. **Tracking placement.** Opus said add `trackEvent('bulk_search_copy',…)` "inside"
   the copy path. `copyGoSearch` is shared by 🔍 Me / 🔍 + Fam, so I appended the
   `trackEvent` call to the **new buttons' onclick** instead of mutating the shared
   function — keeps existing telemetry unchanged.

---

## Open questions (for coordinator)

### F4 — Trainer name (BLOCKED on schema approval)
Per Opus and the brief, this needs a **Supabase schema change** that must be approved
before implementation:
```sql
ALTER TABLE user_profiles ADD COLUMN trainer_name text;  -- or new table if absent
-- RLS: user can read/write only their own row.
```
Constraints to confirm: which table (`user_profiles` vs extend existing user record),
GO trainer-name max length (enforce `<= 15`), allowed charset. Client side is then a
simple text input + `supabaseFetch` PATCH/POST, rendered as `${esc(trainerName)}'s
collection` (never unescaped, never to GA4). **Not implemented — awaiting your schema
decision.**

### F6 — Dynamax best-overall Master (Ⓜ) flag (DEFERRED)
The Opus pre-review **was truncated mid-sentence** exactly where it was about to rule
on whether F6 needs `analyse.js` engine changes or is a pure `render.js`/nick fix. The
brief's rules are approved and concrete, but implementing them touches the Dynamax slot
assignment + best-overall Master logic in `analyse.js` (lines ~1170–1220, 351–358),
which risks `analyse.dust_tiebreak` / `analyse.master_league` regressions. From my read
of the engine, F6 likely needs an engine change: a per-species "best Dynamax by IV"
must receive a Master (Ⓜ) marker **independently** of which Dynamax wins a capped
league slot — analogous to the existing `wonMasterSlot` path, but currently the
`dynamax` slot is assigned to a single best-without-league candidate and there is no
best-Dynamax→Ⓜ concept. **Recommend: complete the Opus F6 engine design (or re-run the
truncated review) before implementation.** I did not guess at the design to avoid
destabilising the slot engine without architectural sign-off.
