ROUTE: OPUS-FIRST
BRIEF: playwright-expansion
VERSION_TARGET: v3.5.47

# Brief — Playwright E2E Test Expansion

## Context
Current Playwright tests are minimal smoke tests:
- App loads and shows `.logo`
- `#hdr-stats` is visible

We need meaningful E2E tests that catch real UI regressions — especially
around the CSV upload flow, search, nick copy, and mobile viewport.

## Constraints
- Tests must NOT require Google OAuth (no sign-in flow)
- Tests use a small synthetic CSV (create one if needed)
- Tests run in CI (headless Chromium) on every PR to main
- Keep suite fast — target under 60 seconds total

## Tests wanted (Opus to design and produce)

### Group 1 — CSV upload flow
- Upload a small synthetic CSV (10-20 Pokémon)
- Verify family count appears in header
- Verify at least one family renders with a nick
- Verify search box is functional

### Group 2 — Search
- Type a Pokémon name → correct family surfaces
- Type a Pokédex number → correct family surfaces
- Clear search → all families visible again

### Group 3 — Nick copy
- Click a nick → verify "Copied!" toast appears
- (Clipboard API may need mocking in CI — Opus to handle)

### Group 4 — Filter buttons
- Click "Stars" filter → verify only starred families show
- Click again to toggle off → all families return

### Group 5 — Mobile viewport
- Run smoke test at 390px width
- Verify header stats visible
- Verify family row renders without overflow

## Output expected from Opus
- `tests/e2e/collection.spec.js` — the new test file
- Any synthetic CSV fixture needed (small, no personal data)
- Notes on any CI-specific setup required (clipboard mocking etc.)
- Confirm tests pass against local server before handoff to Claude Code
