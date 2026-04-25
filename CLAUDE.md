# PokéVault — Claude Code Context

PokéVault is a Pokémon GO collection manager. It parses a Pokégenie CSV export and assigns each Pokémon a decision (Keep / Review / Trade / Protected), a suggested nickname, and league slot badges.

**Why it exists:** The owner is actively culling their collection (storage maxed out) and needs accurate keep/trade recommendations across Little, Great, Ultra, and Master leagues.

---

## Two codebases — understand the relationship

| Path | Role |
|---|---|
| `pokevault_v3_133.html` (or latest) | **Source of truth.** Single-file, most evolved logic. |
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

## Rules & documentation

- **`/RULES.md`** (repo root) — single source of truth for all business logic and pending changes
- `pokevault-refactor/RULES.md` has been removed — do not recreate it
- When logic changes are made in the HTML, RULES.md at the root is updated to match
- When porting to the refactor, read `/RULES.md` first, then read the HTML for exact implementation

---

## Infrastructure

- **Hosted:** AWS S3 + CloudFront → `pokevault.mariellen.com.au`
- **Supabase:** `jsozfpsfvvnnmipsksoh.supabase.co` (overrides + collection sync)
- **Deploy:** `aws s3 sync pokevault-refactor/ s3://pokevault.mariellen.com.au/pokevault-refactor/ --exclude "*.md"`
- **Cache bust:** `aws cloudfront create-invalidation --distribution-id E2IMCPUABUXY1Y --paths "/*"`

---

## Key conventions

- **Star colours:** Gold=already starred ✓, Green=should star, Cyan=cheaper alt at same rank (check before acting), Blue=best but expensive dust, Red=starred but shouldn't be
- **Star sort order:** Gold(0) → Green(1) → Cyan(2) → Blue(3) → Red(4) → None(5)
- **Slot suffixes:** `_affordable` = within dust budget. Never use `_backup`.
- **Nickname format:** circled letters (Ⓖ Ⓤ Ⓛ) for ≥90% rank; plain letters below. Lucky/Shadow/Master = Ⓡ prefix (intentionally shared — all mean "Raid/Master candidate").
- **evolvedNameG/U/L** — from Pokégenie CSV columns `Name (G)`, `Name (U)`, `Name (L)`. Per-Pokémon recommended evolutions for each league based on IVs.
- **primaryName** — family display name; computed from member counts, preferring non-evo-target species.
- **termMatchesViaEvo** — true when search matches via evolvedNameG/U/L (e.g. "Umbreon" finds Eevee family).
- **🔍 Me** — copies filtered GO search string for this form only
- **🔍 + Fam** — copies all family species names comma-joined (e.g. `Geodude,Graveler,Golem`)

---

## Known gaps in refactor (port from HTML)

See `/RULES.md` pending section for full list. Priority items in `analyse.js`:

1. **`FORM_SPLIT_FORMS`** — Deoxys/Castform/Oricorio etc. incorrectly grouped; copy set from HTML `buildFamilyMap`
2. **`STANDALONE_SPECIES`** (Kleavor, Galarian Weezing) — always own family; copy from HTML
3. **`isFinalEvoStage` guard on blue/cyan stars** — remove from expensive winner and cyan checks; fires at any evo stage
4. **Stable key includes CP** — remove `p.cp` from `makeStableKey` array
5. **`COLLECTION_SETS`** (Vivillon/Furfrou/Flabébé) — not ported; see HTML for full implementation

---

## Rules for this project

- Always update `/RULES.md` (root) when a new feature, bug, or change is discussed or implemented
- Port from HTML → refactor exactly. Don't guess at intent.
- Test against the user's real Pokégenie CSV data — many edge cases only surface there.
- Auth/RLS/Stripe work stays in Claude Code; logic/UI fixes happen in claude.ai sessions with the HTML
