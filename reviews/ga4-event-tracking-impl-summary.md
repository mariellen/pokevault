# Implementation Summary — GA4 Event Tracking

_Ticket: ga4-event-tracking · Version target: v3.5.46 · Implemented: 12 Jun 2026_
_Route: DIRECT · TDD (tests written before implementation)_

## What changed and why

GA4 already tracks page views; this ticket adds custom **event** instrumentation
so we can see which features are used, how often, and in what order. The work is
fire-and-forget telemetry inserted at defined user-action points — no Pokémon
family / PvP-slot / cull / purify computation logic was touched.

Per the Opus pre-implementation review, two hardening decisions were applied:

1. **Hardened guard.** `trackEvent` uses `typeof gtag === 'function'` (not
   `!== 'undefined'`) **and** a `try/catch`, so a defined-but-broken `gtag`
   cannot throw inside a save / OAuth / clipboard handler and abort the real
   user action.

2. **PII redaction (BLOCKING item from Opus).** The brief asked to send the raw
   `nick` (in `nick_copy`) and raw `term` (in `search`) to GA4. Nicknames and
   search terms are free-text and routinely contain personal data — sending them
   raw is a PII leak into a third party (GDPR/CCPA risk) and also breaches GA4's
   100-char param-value limit. Instead we send **shape descriptors only**:
   - `nick_copy` → `{ nick_length, has_iv_pattern, has_cp }`
   - `search`    → `{ term_length, is_numeric }`

   These satisfy the stated analytic goal ("which nick formats are most common")
   with zero PII egress. **This is a deliberate deviation from the brief's
   literal param spec, mandated by the Opus review — flag for product sign-off
   if raw values are ever genuinely required.**

## Helpers added (top of `app.js`)

```javascript
function trackEvent(name, params = {}) { try { if (typeof gtag === 'function') gtag('event', name, params); } catch (e) { ... } }
function buildNickShape(nick)   { return { nick_length, has_iv_pattern, has_cp }; }   // PII-safe
function buildSearchShape(term) { return { term_length, is_numeric }; }               // PII-safe
let _searchTrackTimer;
function trackSearchDebounced(term) { /* 500ms debounce → trackEvent('search', buildSearchShape(term)) */ }
```

## Events wired up (13 total)

| Event | Location | Params | Notes |
|---|---|---|---|
| `csv_upload` | `handleFile` success path (after analyse + applyFilters) | `{ pokemon_count }` | fires on success, not on read start |
| `cloud_save` | `handleCloudSave` — after `saveCollectionToCloud` resolves | `{ pokemon_count }` | in the success branch only |
| `cloud_load` | `processCloudRows` success path (after state applied) | `{ pokemon_count }` | after data rendered |
| `cull_modal_open` | `openCullModal`, after `allPokemon.length` guard | none | in open fn, not button click |
| `purify_modal_open` | `openPurifyModal`, after guard | none | in open fn |
| `shinies_modal_open` | `openShinyModal`, after guard | none | in open fn |
| `nick_copy` | `copyNick`, after successful copy | `buildNickShape(text)` | **redacted shape, never raw nick** |
| `search` | both `searchBox` input handlers → `trackSearchDebounced` | `buildSearchShape(term)` | **500ms debounce; redacted** |
| `filter_click` | 8 shared toggle handlers | `{ filter: <enum> }` | controlled internal enum, safe raw |
| `family_expand` | `toggleFamily`, only on expand transition | none | guarded against firing on collapse |
| `sign_in` | `auth.js` `onAuthStateChange` `SIGNED_IN` | none | OAuth success callback |
| `sign_out` | `auth.js` `signOut`, **before** `auth.signOut()` | none | fires before state-clear/beacon race |
| `export_click` | `exportCSV`, before download | none | |

`filter_click` is wired into the **shared** toggle handlers (not per-button):
`setDecFilter` (`filter: f`), `toggleLeague` (`league_<L>`), `toggleDmaxFilter`
(`dmax`), `toggleGmaxFilter` (`gmax`), `cycleHundoFilter` (`hundo`),
`filterBestInLeague` (`best_in_league`), `filterCostlyWinners` (`costly`),
`togglePractical` (`practical`).

## Files modified

- `pokevault-refactor/js/app.js` — helpers + 11 of 13 event call-sites
- `pokevault-refactor/js/auth.js` — `sign_in` / `sign_out` (guarded with
  `typeof trackEvent === 'function'` because auth.js loads before app.js; calls
  only happen at runtime, but the guard makes analytics non-fatal if app.js
  failed to load)
- `pokevault-refactor/tests/tracking.test.js` — **new** unit tests (Opus Required Tests)
- `pokevault-refactor/tests/tracking-loader.js` — **new** Node shim to load the
  GA4 helpers out of `app.js` (mirrors existing `tests/loader.js` pattern;
  stubs DOM so app.js top-level executes harmlessly, returns only the helpers)

## Test results

All Opus "Required Tests" implemented and passing in `tests/tracking.test.js`:

1. `trackEvent` no-op + no throw when `gtag` undefined ✓
2. `trackEvent` no throw when `gtag` defined-but-throwing ✓
3. `trackEvent` calls `gtag('event', name, params)` correctly (mock) ✓
4. `nick_copy` payload contains **no** substring of the raw nick (tested with a
   nick containing a fake email — redaction proven) ✓
5. `search` debounce: rapid calls within 500ms → exactly **one** `gtag` call,
   with the last term's params (fake timers) ✓
6. `search` payload contains **no** raw term string ✓

Plus extras: default-params, plain-nick (no IV/CP), null-nick safety, numeric-term.

**Full suite:** `npx jest` → **22 suites passed, 611 passed, 1 skipped** (the
skipped test is the personal CSV fixture, absent on this machine — unchanged
behaviour). Zero changes in PvP-slot, evolution-family, cull, or purify results,
confirming no tracking call was placed inside computation logic.

## Deviations from Opus guidance

- **Param redaction for `nick_copy` and `search`** — applied exactly as Opus
  mandated (shape descriptors, not raw values). This is the one substantive
  divergence from the brief's literal param table, and it is intentional. Raw
  values must not ship without a privacy/GDPR sign-off.
- **`nick_copy` placement.** Instrumented `copyNick` (the dedicated nick-copy
  handler used by the Cull modal), not the generic `copyGoSearch` (which copies
  GO search strings, not nicks, in most call-sites). This keeps the event
  semantically "a nick was copied" and avoids false positives.
- No other deviations. The hardened `trackEvent` guard, success-path placement,
  single-shared-handler `filter_click`, expand-only `family_expand`, and
  pre-reload `sign_out` were all implemented as specified.

## Manual verification still required (post-deploy)

GA4 is external, so confirm on the live site after deploy:
1. GA4 → Reports → Realtime → Events
2. Perform each action; confirm events appear within ~30s
3. Spot-check that `nick_copy` / `search` carry only the shape params (no raw text)
