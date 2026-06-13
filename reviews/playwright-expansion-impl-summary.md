# Implementation Summary — Playwright E2E Expansion

**Brief:** `playwright-expansion` · **Route:** OPUS-FIRST · **Version target:** v3.5.47
**PR:** https://github.com/mariellen/pokevault/pull/9
**Branch:** `feature/playwright-expansion`
_Implemented: 13 Jun 2026_

---

## 1. What changed

| File | Change |
|------|--------|
| `pokevault-refactor/tests/e2e/collection.spec.js` | **New.** 11 E2E tests covering the CSV → family → render pipeline (Groups 1–5 from the brief + preserved smoke assertions). |
| `pokevault-refactor/tests/e2e/fixtures/synthetic-collection.csv` | **New.** 14-row / 12-family synthetic Pokégenie export. Zero personal data. |
| `.gitignore` | Added a negation exception so the synthetic fixture is tracked despite the root `*.csv` ignore rule. |

The existing `tests/e2e/smoke.spec.js` (2 tests) was **left intact** — its assertions are also mirrored inside `collection.spec.js` so the smoke coverage exists in both places (no regression either way).

### Test inventory (maps to Opus's 10 Required Tests)
1. CSV upload → header shows `Total 14` **and** exactly 12 family cards render.
2. CSV upload → at least one family renders with a non-empty nick.
3. Search by name (`Bulbasaur`) → exactly that family surfaces.
4. Search by Pokédex number (`133` → Eevee) → exactly that family surfaces.
5. Clear search → full 12-family baseline restored.
6. Nick copy → `Copied!` toast **and** `window.__copied` last entry equals the clicked cell's `data-nick`.
7. Great-league filter ON → only the 3 Great-qualifying families show.
8. Great-league filter toggle OFF → all 12 families return.
9. Mobile 390px → `#hdr-stats` visible **and** no horizontal page overflow.
10. Smoke — `.logo` + `#hdr-stats` visible after load (plus `smoke.spec.js` retained).
Extra: "search box present and editable" (Group 1 functional check).

## 2. Why — how this addresses the brief

The prior suite only asserted the app boots and two static elements exist — it exercised **zero** business logic. These tests now drive the real client-side CSV importer (no OAuth) and assert on family grouping, search (name + dex), the clipboard nick-copy path, a real toggle filter, and responsive layout — exactly the regression surface the brief and Opus review called out.

The synthetic fixture deliberately covers the historically-fragile grouping cases: a 3-stage family (Bulbasaur), a branched family (Eevee), singletons, and a mix of starred / non-starred rows, with `Rank % (G)` values chosen so the Great-league filter outcome is fully deterministic.

## 3. Key design decision — deterministic seeding without OAuth

On `window.load` the app calls `autoLoadFromCloud()`, a Supabase **anonymous-read** pull that renders a real demo collection (~40+ families). Left alone this makes every count non-deterministic (the first test run actually saw 40 family cards from the demo, not the fixture).

**Fix:** the seed helper aborts every `**/*.supabase.co/**` request via `page.route`. The app's documented behaviour is to "fall back silently to the CSV import screen if cloud is empty or unavailable", so this leaves the synthetic fixture as the sole, deterministic data source. `page.goto(..., { waitUntil: 'networkidle' })` + waiting for `#fileInput` to be enabled ensures the cloud probe has settled (`loadInProgress` cleared) before the upload is driven.

**Clipboard:** `addInitScript` installs a `navigator.clipboard.writeText` stub recording to `window.__copied` (headless Chromium otherwise rejects on permissions). Fresh page per test → no cross-test bleed.

## 4. Test results

- **Playwright:** `13 passed (~22s)` — headless Chromium, well under the 60s budget.
  (11 in `collection.spec.js` + 2 in the retained `smoke.spec.js`.)
- **Jest unit suite:** `653 passed, 1 skipped` — unchanged (the `.spec.js`/`.csv` additions are outside Jest's `*.test.js` matcher).

## 5. Deviations from Opus guidance

1. **Group 4 uses the Great-league filter, not a "Stars filter."** The app has **no stars-only filter** — `★ Stars` (`#sortCountBtn`) is a *sort-mode cycle*, not a family filter. Implementing the requested test verbatim would have required adding a new app feature/test-seam to the render layer (out of scope, and risky while csp/ga4 threads have `app.js`/`render.js` checked out). The Great-league toggle is the faithful representative of "click a filter → subset shows → toggle off → all return," and its outcome is deterministic from the fixture's `Rank % (G)` column.

2. **Header assertion is `Total N`, not "families."** `#hdr-stats` renders `Total / Keep / Trade`, not a family count (the "N families" string only appears in pagination, which a 12-family single page never shows). Per Opus's own watch-point ("match whatever the header actually renders"), I assert `Total 14` and verify the family count via `.family-card` element count instead.

3. **Mobile overflow asserted at page level**, not on the family-row container. `.family-body` uses `overflow-x:auto` **by design** for its wide table, so `scrollWidth <= clientWidth` on that container would fail on purpose. The genuine mobile regression is horizontal **page** overflow, so I assert `document.documentElement.scrollWidth <= clientWidth + 1`.

4. **No `data-testid` attributes added.** Opus offered this as the lower-regression option, but adding them means editing `render.js`/`app.js` — files currently modified by other in-flight threads (csp-hardening, ga4). To keep this PR strictly test-only, I relied on existing stable IDs/classes (`#hdr-stats`, `#fileInput`, `#searchBox`, `.family-card`, `.main-nick`, `[data-l="G"]`), which were sufficient.

5. **No version bump in `index.html`.** This is a test-only change with no app/version-facing impact, and the working-tree `index.html` already carries **unrelated uncommitted changes** from other threads (csp/ga4, already at v3.5.47). Committing it would smuggle those into this PR. Flagging for the coordinator: if a version bump is required on this PR specifically, it should be applied as an isolated one-line change once the other threads land.

6. **Existing `smoke.spec.js` kept** rather than deleted/migrated-and-removed. Its assertions are duplicated in `collection.spec.js`; keeping both guarantees no loss of the original smoke coverage.

## 6. CI-specific setup notes (for the coordinator)

- `.github/workflows/e2e.yml` already runs `npx playwright install --with-deps chromium` then `npx playwright test`, and `playwright.config.js` already starts `npx serve . -p 8080` via its `webServer` block — **no workflow changes needed.**
- Supabase blocking is handled per-test inside the spec (route abort), so CI needs no secrets or network config.
- Locally, `npx playwright install chromium` had to be run once to fetch the browser binary; CI installs it fresh each run.

## 7. Open questions

- **Version bump policy on test-only PRs** (deviation #5) — proceed without, or apply an isolated bump? Left to coordinator since the working tree is mid-flight.
- Should a future PR add a genuine "stars-only" family filter so Group 4 can test stars directly (per the brief's literal wording)? Currently no such filter exists.
