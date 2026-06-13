# Opus Pre-Implementation Review
_Generated: 12 Jun 2026 19:49_

## Root Cause Analysis

This is not a bug fix — it's a feature addition for analytics instrumentation. There is no broken logic in the PvP slot assignment, evolution family, or culling systems. The "root cause" framing doesn't apply; the work is inserting fire-and-forget telemetry calls at defined user-action points.

However, one item in the brief **is** a genuine defect risk that I'm flagging now rather than letting it ship: the `nick_copy` event sends the raw `nick` value as an event parameter. See Risk Assessment — this needs to change before implementation.

## Risk Assessment

- **Scope:** No Pokémon family logic is touched. All evolution-family, PvP-slot, purify, and cull computation paths must remain byte-for-byte unchanged. The instrumentation only *observes* these flows; it must not participate in them.

- **Security / Privacy implications — BLOCKING:**
  - `nick_copy` with `{ nick: nick }` ships user-authored Pokémon nicknames to Google Analytics. Nicknames are free-text and frequently contain personal data (owner names, trainer handles, inside jokes, occasionally emails/phone fragments). Sending raw nicks to GA4 is a **PII leak into a third-party system** and is very likely a GDPR/CCPA violation. The brief's justification ("which nick formats are most common") does **not** require the raw value.
    - **Required change:** Do not send the raw nick. Send a *shape descriptor* instead — e.g. `{ nick_length: nick.length, has_iv_pattern: /\d{1,2}\/\d{1,2}\/\d{1,2}/.test(nick), has_cp: /\bcp\s*\d+/i.test(nick) }`. This satisfies the stated analytic goal (format prevalence) with zero PII egress.
  - `search` with `{ term: term }` has the **same class of problem**. Users search by nickname fragments and personal labels. Truncate/categorize rather than send raw: send `{ term_length: term.length, is_numeric: /^\d+$/.test(term) }` or hash if raw value is genuinely needed. Confirm with product before shipping raw search terms.
  - GA4's own param limit: event param string values are capped at 100 chars and param names at 40 chars — another reason not to dump raw user strings.

- **Regression risk:** Low *if* the helper is correctly guarded. The realistic failure modes:
  - `trackEvent` throwing if `gtag` is defined-but-broken (the `typeof` guard only checks existence, not callability). A thrown error inside a copy/save/OAuth handler could abort the real user action.
  - Debounce timer for `search` leaking or firing after component teardown.
  - Inserting a tracking call *before* the underlying action's success is confirmed (e.g. `cloud_save` firing on the attempt, not the completion), corrupting the analytics.
  - No Jest tests target `app.js` user-action handlers directly, so there's no existing suite that will catch a misplaced call. The absence of test coverage is itself the regression risk.

## Implementation Guidance

All work in `app.js` unless noted.

1. **Add the helper**, hardened beyond the brief:
```javascript
function trackEvent(name, params = {}) {
  try {
    if (typeof gtag === 'function') gtag('event', name, params);
  } catch (e) {
    // analytics must never break the app
    if (window.console) console.debug('trackEvent failed', name, e);
  }
}
```
Note `typeof gtag === 'function'` (not `!== 'undefined'`) and the `try/catch`. This is mandatory — telemetry sits inside save/OAuth/clipboard handlers.

2. **Placement — fire on success, after the action completes:**
   - `csv_upload`: inside the CSV parse success path, after the parsed array is built, `{ pokemon_count: parsed.length }`. Not in the `onload` start.
   - `cloud_save`: in the resolve/`.then` of the save promise, after the server confirms. `{ pokemon_count: collection.length }`.
   - `cloud_load`: in the resolve of the load promise, after data is applied to state.
   - `sign_in`: in the OAuth success callback, after the credential/profile resolves — not on the redirect kick-off.
   - `sign_out`: in the sign-out handler, before any page reload/state wipe that would prevent the call (a reload can kill an in-flight beacon — fire `trackEvent` first, then clear state).

3. **Modal opens** (`cull_modal_open`, `purify_modal_open`, `shinies_modal_open`): place inside the single function that actually shows each modal, not on the button click — buttons may be disabled or the open may early-return. Find the `show…Modal` / `open…` functions.

4. **`filter_click`**: instrument the shared filter-toggle handler once, passing the filter's identifier. Do **not** sprinkle per-button. `{ filter: filterName }` is a controlled internal enum — safe to send raw.

5. **`family_expand`**: in the expand handler only (not collapse). If expand/collapse share a toggle, guard so the event fires only on the expand transition.

6. **`export_click`**: on the export button handler, fire before the download is triggered.

7. **`nick_copy`** — apply the privacy redaction from Risk Assessment. In the clipboard-copy handler, after the successful copy, send the shape descriptor, **never** the raw nick.

8. **`search`** — implement a module-level debounce:
```javascript
let _searchTrackTimer;
function trackSearchDebounced(term) {
  clearTimeout(_searchTrackTimer);
  _searchTrackTimer = setTimeout(() => {
    trackEvent('search', { term_length: term.length, is_numeric: /^\d+$/.test(term) });
  }, 500);
}
```
Call this from the search input handler. Do not also fire the un-debounced version.

## Required Tests

The brief says "no Jest tests needed." I'm overriding that for the parts that are now real logic, not external calls. Add a small test file (`trackEvent.test.js` or co-located) covering the pieces that live in our code:

1. `trackEvent` does nothing and **throws nothing** when `gtag` is undefined.
2. `trackEvent` does nothing and throws nothing when `gtag` is defined but throws when called.
3. `trackEvent` calls `gtag('event', name, params)` with correct args when `gtag` is a working function (use a mock).
4. `nick_copy` payload builder: given a raw nick, the emitted params contain **no** substring of the raw nick — assert the raw value is absent. Test with a nick containing a fake email to prove redaction.
5. `search` debounce: rapid successive calls within 500ms result in exactly **one** `gtag` call, with the params of the last term (use fake timers).
6. `search` payload contains no raw term string.

Existing suite: run the full Jest suite and confirm **zero** changes in PvP-slot, evolution-family, cull, and purify test results. Any diff there means a tracking call was placed inside computation logic — back it out.

## Watch Points

- **`gtag` guard is `=== 'function'`**, not `!== 'undefined'`. A defined-but-non-function `gtag` would otherwise throw.
- **`sign_out` and any reload race:** if sign-out triggers `location.reload()`, the GA beacon may be killed mid-flight. Fire `trackEvent('sign_out')` synchronously *before* the reload/state clear. Consider GA4's `transport_type: 'beacon'` if drops are observed.
- **Don't double-fire modal events** if a modal can be reopened without closing, or if open is called from multiple entry points. Centralize in the open function.
- **`family_expand` on toggles:** ensure it doesn't also fire on collapse.
- **Debounce timer is module-scoped** — fine for a singleton search box, but if search is ever instantiated per-view this becomes a cross-talk bug. Note it.
- **The two raw-string params (`nick`, `term`) are the whole risk surface of this ticket.** Everything else is mechanical. If product pushes back on redaction and insists on raw values, that decision must be made by someone who can sign off on the privacy-policy and GDPR implications — not resolved silently in code review. Flag it explicitly in the PR description.
- GA4 param-name limit is 40 chars, value limit 100 chars — keep param keys short and don't pass large objects.