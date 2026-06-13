ROUTE: DIRECT
BRIEF: ga4-event-tracking
VERSION_TARGET: v3.5.46

# Brief — GA4 Event Tracking

## Context
GA4 is installed and tracking page views. We need custom event handlers
to understand how the app is actually being used — which features get
used, how often, in what order.

## Implementation

Add `gtag('event', ...)` calls to key user actions in `app.js`.
Guard every call so the app works if GA4 fails to load:

```javascript
function trackEvent(name, params = {}) {
  if (typeof gtag !== 'undefined') gtag('event', name, params);
}
```

### Events to add

| Event name | Where | Params |
|---|---|---|
| `csv_upload` | After CSV parsed successfully | `{ pokemon_count: n }` |
| `cloud_save` | After cloud save completes | `{ pokemon_count: n }` |
| `cloud_load` | After cloud load completes | `{ pokemon_count: n }` |
| `cull_modal_open` | When Cull modal opens | none |
| `nick_copy` | When nick is copied to clipboard | `{ nick: nick }` |
| `search` | After search term applied (debounce 500ms) | `{ term: term }` |
| `filter_click` | When any filter button is toggled | `{ filter: filterName }` |
| `family_expand` | When a family row is expanded | none |
| `sign_in` | After Google OAuth completes | none |
| `sign_out` | When user signs out | none |
| `purify_modal_open` | When Purify modal opens | none |
| `shinies_modal_open` | When Shinies modal opens | none |
| `export_click` | When Export button clicked | none |

## Testing
No Jest tests needed — GA4 is external.

Manual verification after deploy:
1. Open GA4 → Reports → Realtime → Events
2. Perform each action on the live site
3. Confirm events appear in GA4 within 30 seconds

## Notes
- Use the `trackEvent` helper for all calls — do not call `gtag` directly
- Search event should be debounced (500ms after last keypress) to avoid
  flooding GA4 with every character typed
- Nick param in `nick_copy` is useful for understanding which nick formats
  are most common — keep it
