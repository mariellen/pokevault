# PokéVault

Pokémon GO collection manager — analyses your Pokégenie export and assigns league slots, suggested nicknames, and keep/trade decisions.

## File Structure

```
pokevault/
├── index.html          — app shell, loads all modules
├── css/
│   └── styles.css      — all styling
├── js/
│   ├── config.js       — ★ all configurable values (credentials, symbols, thresholds)
│   ├── data.js         — static game data (Legendary sets, moveset database)
│   ├── supabase.js     — cloud sync (overrides + collection storage)
│   ├── analyse.js      — core analysis engine (family grouping, slot assignment, nicknames)
│   ├── render.js       — HTML generation helpers (table cells, badges, rows)
│   └── app.js          — UI controller (filters, sorting, pagination, event handlers)
└── RULES.md            — complete business rules reference
```

## Quick Start

1. Open `index.html` in a browser (served from a web server, not file://)
2. Import your Pokégenie CSV export
3. Collection auto-saves to Supabase — load from any device without CSV

## Configuration

All configurable values are in `js/config.js`:
- Supabase credentials
- League symbols (circled letters)
- Rank/dust thresholds
- Gender dimorphic species list
- Special family overrides

## Tech Stack

- Vanilla JS (no framework)
- Supabase (Postgres) for cloud storage
- AWS S3 + CloudFront for hosting
- GitHub for version control

## Version

v3.5.19
