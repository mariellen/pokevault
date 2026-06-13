ROUTE: DIRECT
BRIEF: sort-scan-date
VERSION_TARGET: v3.5.46

# Brief — Sort by Scan Date (Newest First)

## Context
After a big catching session, Mariellen wants to review the most recently
scanned Pokémon first. The scan date column is hidden but the data exists
in the Pokégenie CSV.

## Implementation

Add "Scan date (newest first)" to the sort dropdown in `app.js`.

The Pokégenie CSV has two date fields:
- `Scan Date` — when Pokégenie scanned the Pokémon
- `Original Scan Date` — first scan date

Use `Scan Date` as the primary sort key (most recent scan wins).
Parse as a date for correct chronological comparison.

Sort applies at the family level — families with the most recently
scanned member appear first. Within a family, existing sort order
(by star/decision) is preserved.

## UI
Add to the existing sort dropdown alongside current options:
- "Scan date ↓" (newest first) — primary addition
- "Scan date ↑" (oldest first) — optional, lower priority

## Notes
- Scan date column remains hidden — this is a sort key only
- If scan date is missing/unparseable for a Pokémon, treat as oldest
  (sort to bottom)
- Bundle with GA4 event tracking brief (same version target v3.5.46)
