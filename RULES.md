# PokéVault — Business Rules & Design Reference

> **For developers:** This document captures all business logic, naming conventions, and decision rules for PokéVault. Read this before making changes to the analysis engine (`analyse.js`).

---

## Overview

PokéVault analyses a Pokégenie CSV export and assigns each Pokémon a **decision** (Keep / Review / Trade / Protected), a **suggested nickname** (12-char GO limit), and **league slot badges**. It syncs to Supabase for cross-device access.

---

## 1. Data Source

- **Input:** Pokégenie CSV export (`poke_genie_export.csv`)
- **Key columns used:**
  - `Name`, `Pokemon Number`, `Form`, `Gender`, `CP`, `HP`
  - `Atk IV`, `Def IV`, `Sta IV`, `IV Avg`
  - `Level Min`, `Level Max`
  - `Rank % (L/G/U)`, `Rank # (L/G/U)` — league rank percentage and number
  - `Name (L/G/U)` — target evolution for each league (e.g. Pawmi → Pawmot for Ultra)
  - `Dust Cost (L/G/U)` — stardust to reach optimal CP for that league (**remaining cost, not total**)
  - `Lucky`, `Shadow/Purified`, `Favorite`
  - `Scan Date`, `Catch Date`
  - `Quick Move`, `Charge Move`, `Charge Move 2`

---

## 2. Family Grouping

Pokémon are grouped into **evolution families** using a union-find algorithm on Pokémon Numbers.

- Families are identified by the **root Pokémon Number** (e.g. all Abra/Kadabra/Alakazam share root `63`)
- **Regional variants** (Alolan, Galarian, Hisuian, Paldean) are separate families: key = `pokeNum|form`
- **Eevee family** is manually united (9 separate evolutions)
- **Kleavor** is treated as a separate family from Scyther/Scizor (only obtainable via raids in GO, not by evolving Scyther)
- **Wurmple** is flagged as "evolution unknown" (Silcoon vs Cascoon is random, not predictable from data)

**Primary name** = most evolved / most common species name in the family (not first in CSV).

---

## 3. Stable Identity Key

Each Pokémon gets a **stable key** for Supabase override storage that survives re-exports and evolution:

```
PokemonNumber|Form|Gender|AtkIV|DefIV|StaIV|CatchDate|CP
```

- `PokemonNumber` is stable through evolution (Abra→Kadabra→Alakazam all map to `63`)
- `CP` is a tiebreaker for same-day catches with identical IVs
- When `CatchDate` is empty: fallback to `_idx{N}` (unstable after re-export — avoid setting overrides on undated Pokémon before purging)
- Truly identical Pokémon (same all fields) get `_2`, `_3` suffixes via `deduplicateKeys()`

---

## 4. League Eligibility

### CP Commitment
- If `CP > leagueCap × 1.05` → excluded from that league (already powered past it)
- Little cap: 500 | Great cap: 1500 | Ultra cap: 2500

### Dust Exclusion (300k threshold)
- If dust cost for a league > 300k **AND** the Pokémon is **non-final evolution** **AND** **non-legendary** → excluded from that league entirely (slot AND holding name)
- **Final evolutions and legendaries are never excluded** regardless of dust cost
- Rationale: Pawmi needing 310k to reach Pawmot for Ultra should not block Pawmi's Little League candidacy

### Evolution Stage Groups
For each league, candidates are grouped by their **evo target for that league** (`Name (L/G/U)`):
- Pawmi → Pawmi | Pawmi → Pawmo | Pawmi → Pawmot are three separate groups
- Each group competes independently — one winner per group per league
- Gender dimorphic species split by gender within each group

### Gender Dimorphic Species
These species keep **one slot per gender** per league (visually different in GO):
`Meowstic, Indeedee, Frillish, Jellicent, Hippopotas, Hippowdon, Unfezant, Pyroar, Lechonk, Oinkologne, Combee, Wooper`

---

## 5. Slot Assignment

### League Priority Order
**M → U → G → L** (highest league evaluated first)

### Sorting Within Each Group
1. **Rounded rank% descending** — `Math.round(rankPct)` — 99.8% rounds to 100, beats 99.3% which rounds to 99
2. **Cheapest effective dust** as tiebreaker within same rounded rank
   - Lucky Pokémon: effective dust = `dustCost / 2`

### Protection Rule
When assigning a slot, check if the best candidate rounds to 100% in a **lower league with a different evo target**. If so, skip it for the higher league and try the next candidate.

Example: Gurdurr CP:1128 is 99.8% Great (→100%) as Gurdurr AND 98.9% Ultra (→99%) as Conkeldurr.
- Ultra evaluation skips Gurdurr (protected for Great)
- Conkeldurr CP:2485 (already evolved, 0 dust) wins Ultra instead
- Gurdurr wins Great at 99.8% ✓

### Claimed Set
After winning a slot, a Pokémon is **claimed** (excluded from lower leagues) only if:
1. Confirmed (rank ≥ 90%)
2. Affordable (effective dust < 150k)
3. Final evolution stage

The claimed filter respects **evo stage boundaries** — a Pokémon claimed as Pawmot (Ultra) can still compete as Pawmo (Little) because those are different evo stages.

### Affordable Backup
If the best-in-league costs ≥ 150k (`$$+`) AND is a final evolution → also keep the best affordable candidate (< 150k) as a backup slot. Lower evo stages don't get backups (their dust is almost always cheap).

### Duplicate Deduplication
After all slots are assigned, a cleanup pass removes duplicate slots — if two Pokémon hold the same league+evo stage slot, the lower-ranked one is removed.

### Evo-Committed Conflict Resolution
If a Pokémon holds slots requiring **different evolution stages**, the conflict is resolved:
- Keep the slot where it rounds to 100% (if applicable)
- Otherwise keep the highest-priority league
- For the removed slot, find the next best available candidate

---

## 6. Decisions

| Decision | Condition |
|----------|-----------|
| `keep` | Has a confirmed league slot (≥90%), OR Lucky, OR best shiny, OR best shadow, OR best purified, OR nundo, OR manual override |
| `review` | Qualifies for a league (≥90%) but not the confirmed best; OR best candidate below 90% (auto-promoted) |
| `trade` | Not best in any slot, not Lucky, not special |
| `protected` | Legendary/Mythical/Ultra Beast with no 90%+ candidates — only the best-IV one gets starred |

**Special rules:**
- **Lucky** → always `keep`, never `trade`, regardless of IV%
- **Nundo** (0/0/0) → always `keep`
- **Shadow** → best shadow by IV% always `keep`
- **Manual override** → stored in Supabase, overrides analysis decision

---

## 7. Naming Convention (12-char GO limit)

All names built by `buildNickname(p, slot)` then truncated by `fitName(name, mid, suffix, 12)`.

### League Symbols
| League | Symbol | Unicode |
|--------|--------|---------|
| Little | `ⓛ` | U+24DB (lowercase circled l — matches Pokégenie) |
| Great | `Ⓖ` | U+24C6 |
| Ultra | `Ⓤ` | U+24CA |
| Master/Raid | `Ⓜ` | U+24C2 |
| Master/Raid candidate | `Ⓡ` | U+24C7 |

### Perfect Rank Symbol
`100` (literal — GO renders better than ✪ which fails after circled letters)

### Confirmed League Slot (KEEP)
```
{Name}{LeagueSymbol}{RoundedRank%}{DustSuffix}
```
Examples: `AlakazamⒼ96` | `PawmotⓁ100` | `AbsolⓊ97$$$`

### Review / Holding Name
```
{Name}{RoundedRank%}{leaguel}{RoundedRank%}{leagueg}...
```
Leagues sorted by rank% descending, lowercase letters, excludes leagues where dust > 300k.
Example: `Pin95l93g` = 95% Little, 93% Great

### Lucky (no league slot)
```
{Name}Ⓡ{IV%}{DustSuffix}
```
Example: `AbsolⓇ91$` — Master/Raid candidate

### Shadow (no league slot)
```
{Name}Ⓡ{MasterRank%}{DustSuffix}
```
Same format as Lucky — flagged as Master/Raid candidate.

### Shadow + qualifies when purified
```
{Name}{LeagueSymbol}{Rank%}p
```
Example: `GurdurrⒼ92p` — `p` suffix = purify before using

### Trade
```
{Name}{IV%}t
```
Example: `Ferali67t`

### Nundo
```
{Name}⓪
```

### Shiny Suffix
`※` appended (replaces any S suffix)

### Move Suffixes
- `b` = both best moves set
- `☆` = fully completed (all best moves)

### Dust Dollar Suffixes
| Dust | Suffix |
|------|--------|
| 100k–149k | `$` |
| 150k–199k | `$$` |
| 200k+ | `$$$` |

Lucky Pokémon show **half the dust cost** (they cost half to power up).

---

## 8. Starring Rules

| Star Colour | Meaning |
|-------------|---------|
| 🟡 Gold ★ | Should be starred AND already favourited in GO — correct |
| 🟢 Green ★ | Should be starred but NOT favourited — action needed |
| 🔴 Red ★ | Currently favourited but shouldn't be |
| · | Not starred, not recommended — correct |

**Suggest star if:**
- KEEP + has a league slot, Lucky slot, shiny slot, shadow slot, purified slot, or nundo slot
- Decision = Protected (legendary best-IV only)
- isLucky (always, regardless of other conditions)

---

## 9. Override System (Supabase)

Manual flags stored in `pokemon_overrides` table, keyed by `stableKey`.

| Field | Type | Purpose |
|-------|------|---------|
| `is_shiny` | bool | Manual shiny flag (not in CSV) |
| `is_dynamax` | bool | Dynamax flag |
| `is_gigantamax` | bool | Gigantamax flag |
| `vivillon_pattern` | text | Vivillon form (e.g. "Polar") |
| `manual_decision` | text | Force keep/trade/review |
| `notes` | text | Free text notes |

Overrides are applied **after** analysis, so manual decisions override computed ones.

**Stability warning:** Overrides on Pokémon without a catch date use `_idx{N}` fallback which is unstable after re-exports. A warning is shown in the override panel for these.

---

## 10. Cloud Collection Sync (Supabase)

After CSV import, the full parsed collection is saved to `pokemon_collection` table in batches of 100. Any device can load the last collection via "☁ Load from cloud" without needing the CSV file.

The collection table stores pre-parsed data (IVs, ranks, dust costs, evo targets etc.) — the analysis engine re-runs on load to apply current rules.

---

## 11. Special Cases

| Pokémon | Rule |
|---------|------|
| **Lucky** | Never trade; always keep; `NameⓇIV` if no league slot |
| **Nundo** (0/0/0) | Always keep; `Name⓪` nickname |
| **Legendary/Mythical/Ultra Beast** | Protected if no 90%+ slot; only best-IV gets starred |
| **Shadow** | Best shadow by IV always kept; `NameⓇIV` if no league slot; `p` suffix if purifying would qualify for a league |
| **Shiny** | Manual flag only (not in CSV); always star |
| **Furfrou** | Forms not in CSV — manually tag via override panel |
| **Scatterbug/Vivillon** | Forms not in CSV — manually tag via override panel |
| **Wurmple** | Evolution path (Silcoon vs Cascoon) is random — flagged as unknown |
| **Kleavor** | Only obtainable via raids, not evolution — treated as separate family |
| **Dynamax/Gigantamax** | Manual flag only — not in CSV |
| **2016 Pokémon** | Catch date before Jan 2017 = Lucky-eligible (higher trade probability) |

---

## 12. Thresholds (RULES config)

All configurable in the `RULES` object at the top of `config.js`:

| Key | Default | Meaning |
|-----|---------|---------|
| `keepThreshold` | 90 | Min rank% for confirmed keep slot |
| `dustTier1` | 100000 | `$` threshold |
| `dustTier2` | 150000 | `$$` threshold |
| `dustTier3` | 200000 | `$$$` threshold |
| `dustExcludeThreshold` | 300000 | Exclude non-final non-legendary from league |
| `dustWarnPerfect` | 200000 | Warn on dust for 100% rank |
| `dustWarnNormal` | 100000 | Warn on dust for normal rank |

---

## 13. Pending Features (Change Log)

- [ ] **✎ Override button on mobile** — not visible on small screens
- [ ] **Clear overrides resets checkboxes** — visual reset on clear
- [ ] **Shiny toggle updates Keep count immediately**
- [ ] Regional form filters — Alolan/Galarian/Hisuian/Paldean toolbar buttons
- [ ] Gender filter toolbar button
- [ ] Trading tab — separate view of all TRADE-marked Pokémon
- [ ] 2016 Lucky-eligible flag — badge + filter
- [ ] Movesets — expand hardcoded database + Claude API for 100%-ranked + store in Supabase
- [ ] Family completion indicator — "✦ Complete" badge
- [ ] Committed Pokémon rule — CP at/near league cap = committed slot
- [ ] Investigate CP:400 Ultra backup slot
- [ ] Subscription/multi-tenant — user auth, per-user data isolation, Stripe payments

---

## 14. Architecture Notes

Currently a **single HTML file** (~120KB) containing all HTML, CSS, and JavaScript inline. Planned refactor to multi-file structure:

```
pokevault/
├── index.html        — shell + layout
├── css/styles.css    — all styling
├── js/
│   ├── config.js     — RULES, constants, GENDER_DIMORPHIC, LEGENDARY sets
│   ├── analyse.js    — core analysis engine (family grouping, slot assignment, nicknames)
│   ├── render.js     — UI rendering (buildRow, lrHTML, starCell etc.)
│   ├── supabase.js   — cloud sync (overrides + collection)
│   └── app.js        — main entry point, event handlers
└── RULES.md
```

**Supabase project:** `jsozfpsfvvnnmipsksoh.supabase.co`
**GitHub:** `github.com/mariellen/pokevault`
**Hosting:** AWS S3 + CloudFront → `pokevault.mariellen.com.au`