# PokéVault — Claude Code Context

PokéVault is a Pokémon GO collection manager. It parses a Pokégenie CSV export and assigns each Pokémon a decision (Keep / Review / Trade / Protected), a suggested nickname, and league slot badges.

**Why it exists:** The owner is actively culling their collection (storage maxed out) and needs accurate keep/trade recommendations across Little, Great, Ultra, and Master leagues.

---

## Source of truth

`pokevault-refactor/` is the canonical source of truth. All changes are made directly here.

The single-file HTML files (`pokevault_v3_NNN.html`) are retired — the last committed one is stale. Ignore them.

**Workflow between Claude Code and claude.ai sessions:**
- Claude Code works directly in `pokevault-refactor/` and commits after each session
- When starting a claude.ai session, Mariellen uploads the individual JS files that changed (analyse.js, app.js, etc.)
- claude.ai ports those files into a working HTML for UI testing, then provides the modified JS back as download
- Claude Code ports the claude.ai JS changes back into the refactor files and commits

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

## Test suite

- `pokevault-refactor/tests/analyse.test.js` — Phase 1 unit tests (keep count, slots, nicks, family grouping, purify)
- `pokevault-refactor/tests/moves.test.js` — deterministic move data tests (5 species)
- Fixture: `poke_genie_export 132.csv` (Mariellen's collection, April 2026)
- Run: `cd pokevault-refactor && npm install && npx jest`

---

## Known pending work

See `PENDING_CHANGES (2).md` (in handoff folder) for full list. Key items:

- **Nuzleaf cyan bug** — CP:498 (100% Little) showing green instead of cyan when CP:499 (99.8% Little) is already starred
- **Shadow slot displacement** — shadows competing for same slot as regular winner; should coexist
- **Pikachu +Fam button** — Pichu/Raichu ending up in separate families; likely costume variant grouping issue
- **Shiny nick** — should use league nick + ※ suffix; nick not regenerating when shiny override is ticked
- **Cloud save resilience** — draft status on save, prompt to complete/discard on partial saves

---

## Rules for this project

- Always test against the user's real Pokégenie CSV — many edge cases only surface with real data
- Auth/RLS work tracked in SUPABASE_AUTH_PLAN.md
