# PokéVault — Claude Code Context

PokéVault is a Pokémon GO collection manager. It parses a Pokégenie CSV export and assigns each Pokémon a decision (Keep / Review / Trade / Protected), a suggested nickname, and league slot badges.

**Why it exists:** The owner is actively culling their collection (storage maxed out) and needs accurate keep/trade recommendations across Little, Great, Ultra, and Master leagues.

---

## Two codebases — understand the relationship

| Path | Role |
|---|---|
| `pokevault_v3_130.html` | **Source of truth.** Single-file, most evolved logic. |
| `pokevault-refactor/` | Multi-file refactor. Being brought up to date with the HTML. |

**Changes flow HTML → refactor, never the other way.** When porting, read the HTML first and port exactly — don't invent improvements unless asked.

---

## Refactor architecture

```
pokevault-refactor/
├── index.html
├── css/styles.css
├── js/
│   ├── config.js     — RULES, DUST_THRESHOLDS, LEAGUE_CAPS, LC symbols
│   ├── analyse.js    — core engine: family grouping, slot assignment, nicknames
│   ├── render.js     — UI: buildRow, starCell, slotBadges, lrHTML
│   ├── supabase.js   — cloud sync (overrides + collection)
│   ├── data.js       — BEST_MOVES, SHADOW_MOVES, LEGENDARY/MYTHICAL/ULTRA_BEAST sets
│   └── app.js        — entry point, filters, family rendering, event handlers
```

---

## Infrastructure

- **Hosted:** AWS S3 + CloudFront → `pokevault.mariellen.com.au`
- **Supabase:** `jsozfpsfvvnnmipsksoh.supabase.co` (overrides + collection sync)
- **Deploy:** `aws s3 sync pokevault-refactor/ s3://pokevault.mariellen.com.au/pokevault-refactor/ --exclude "*.md"`
- **Cache bust:** `aws cloudfront create-invalidation --distribution-id E2IMCPUABUXY1Y --paths "/*"`

---

## Key conventions

- **Star colours:** Gold=already starred ✓, Green=should star, Blue=best but expensive dust, Cyan=cheaper alt at same rank, Red=starred but shouldn't be
- **Slot suffixes:** `_affordable` = within dust budget. Never use `_backup`.
- **Nickname format:** circled letters (Ⓖ Ⓤ Ⓛ) for ≥90% rank; plain letters below. Lucky = Ⓡ prefix when no league slot.
- **evolvedNameG/U/L** — comes from Pokégenie CSV columns `Name (G)`, `Name (U)`, `Name (L)`. These are the per-Pokémon recommended evolutions for each league based on IVs.
- **primaryName** — the family display name; computed from member counts, preferring non-evo-target species.
- **termMatchesViaEvo** — true when a search term matches via evolvedNameG/U/L rather than the family's primaryName (e.g. searching "Umbreon" finds the Eevee family).

---

## Known issues / pending work

See `pending_changes.md` for the full list. Key items:

- **Evo-search sort order:** Searching "Umbreon" correctly filters to Umbreon-candidate Eevees, but rows with `targetEvo='Umbreon'` (PokéVault's actual picks) should float to the top. Currently mixed in with `evolvedNameG='Umbreon'` secondaries. Hard to get right — study `_130.html` carefully.
- **Shiny nickname bug:** `isShiny` is set via Supabase override AFTER nickname is built — needs a post-override re-pass.
- **COLLECTION_SETS** (Vivillon/Furfrou keep-N logic): not yet ported to refactor.

---

## Rules for this project

See `RULES.md` for full decision rules. Short version:
- Always update `pending_changes.md` when a new feature, bug, or change is discussed.
- Port from HTML → refactor exactly. Don't guess at intent.
- Test against the user's real Pokégenie CSV data — many edge cases only surface there.
