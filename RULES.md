# PokéVault — Business Rules & Design Reference

> **Source of truth:** The single-file `pokevault_v3_133.html` is always ahead of the refactor. Port HTML → refactor, never the other way. When in doubt, read the HTML.

---

## 1. Data Source

- **Input:** Pokégenie CSV export
- **Key columns:** `Name`, `Pokemon Number`, `Form`, `Gender`, `CP`, `HP`, `Atk IV`, `Def IV`, `Sta IV`, `IV Avg`, `Level Min/Max`, `Rank % (L/G/U)`, `Rank # (L/G/U)`, `Name (L/G/U)`, `Dust Cost (L/G/U)`, `Lucky`, `Shadow/Purified`, `Favorite`, `Scan Date`, `Catch Date`, `Quick Move`, `Charge Move`, `Charge Move 2`

---

## 2. Family Grouping

Union-find algorithm on Pokémon Numbers with majority-vote evo link detection (>40% threshold).

### Separate family keys for:
- **Regional variants** (Alola/Galar/Hisui/Paldea): key = `pokeNum|form`
- **FORM_SPLIT_FORMS** — also get separate family keys (⚠️ missing from refactor `analyse.js`):
  `Male, Female, Origin, Altered, Therian, Incarnate, Attack, Defense, Speed, Primal, Mega, Unbound, Normal, Rainy, Sunny, Snowy, Baile, Pa'u, Pom-Pom, Sensu, Small, Average, Large, Super, Combat, Blaze, Aqua, Plant, Sandy, Trash, Midnight, Dusk, Burn, Chill, Douse, Shock, Roaming, Hero, Aria, Pirouette, Land, Sky, 10%, 50%, Complete`
- **STANDALONE_SPECIES** (always own family, ⚠️ missing from refactor): `Kleavor`, `Weezing|Galar`
- **Eevee family**: manually united — all 9 evolutions share one family

### Stable key format
```
PokemonNumber|Form|Gender|AtkIV|DefIV|StaIV|CatchDate
```
- CP excluded (`STABLE_KEY_NO_CP = true`) — powers-up don't lose overrides (⚠️ refactor still includes CP)
- No catch date → fallback `_idx{N}` (unstable after re-export)

---

## 3. League Eligibility

### CP caps
- Little: 500 | Great: 1500 | Ultra: 2500 | Master: none
- `CP > cap × 1.05` → excluded from that league
- `CP >= cap × 0.97` AND dust = 0 → flagged `isCommitted`

### Dust exclusion
Non-final, non-legendary Pokémon with dust > 300k for a league → excluded from slot assignment AND from the review nickname for that league.

### Evolution stage groups
Each league groups by evo target (`Name (L/G/U)`). Pawmi→Pawmi, Pawmi→Pawmo, Pawmi→Pawmot = 3 separate groups competing independently.

Master league groups by `evolvedNameU || evolvedNameG || name` (final evo only).

### Gender dimorphic species (one slot per gender per league)
`Meowstic, Indeedee, Frillish, Jellicent, Hippopotas, Hippowdon, Unfezant, Pyroar, Lechonk, Oinkologne, Combee, Wooper`

---

## 4. Slot Assignment

### Priority order: M → U → G → L

### Master league
Only final evolution stage competes. A Pokémon is excluded if any family member shares its `stageName` but has a higher evo available.

### Sort within each group
1. `Math.round(rankPct)` descending — 99.8% rounds to 100, beats 99.3%
2. Cheapest effective dust as tiebreaker (Lucky: dust/2)

### Protection rule
If best candidate rounds to 100% in a lower league with a different evo target → skip it for this league, try next candidate. Only fires when lower rounds to 100 AND current rounds to < 100.

### Claimed set
Claimed (excluded from lower leagues) only if ALL:
1. Rank ≥ 90%
2. Effective dust < affordable threshold
3. Final evo stage for that league (Master claims regardless)

### Affordable vs expensive split
If best-in-league dust > affordable threshold:
- Best gets `isExpensiveWinner` → **blue star**
- Best affordable alternative (≤ threshold, ≥ 90%) gets `_affordable` slot
- Fires at **any evo stage** (not just final) ⚠️ refactor still has isFinalEvoStage guard here

Thresholds: Little 100k | Great 150k | Ultra 300k | Master ∞

### Dust dollar suffixes (per league, shown only above affordable threshold)
| League | `$` | `$$` | `$$$` |
|--------|-----|------|-------|
| Little | 100k | 200k | 300k |
| Great | 150k | 250k | 350k |
| Ultra | 300k | 400k | 500k |

---

## 5. Decisions

| Decision | Condition |
|----------|-----------|
| `keep` | Confirmed slot (≥90%), Lucky, best shiny, best shadow, best purified, nundo, hundo (15/15/15), costumed, or override |
| `review` | ≥90% but not confirmed best; auto-promoted best below 90%; best purified |
| `trade` | Not best in any slot, not special |
| `protected` | Legendary/Mythical/Ultra Beast — always kept |

### Special rules
- **Lucky** → always keep; circled-letter nick if qualifies for league, else `NameⓇIV`
- **Nundo** (0/0/0) → always keep; `Name⓪`
- **Hundo** (15/15/15) → always keep; `NameⓇ100`; always gets `suggestStar=true`
- **Shadow** → best by IV kept; `NameⓇIV` if no league slot; `p` suffix if purifying qualifies
- **Purified** → best kept; review nickname
- **Collection species** (Vivillon, Furfrou, Flabébé) → keep top N by IV%; review if pattern not set (⚠️ not in refactor)
- **Manual override** → Supabase, applied after analysis

---

## 6. Naming Convention (12-char GO limit)

`fitName(name, mid, suffix, 12)` — mid and suffix have fixed length, name fills the rest.

### Symbols
| Context | Symbol | Unicode |
|---------|--------|---------|
| Little | `ⓛ` | U+24DB |
| Great | `Ⓖ` | U+24C6 |
| Ultra | `Ⓤ` | U+24CA |
| Master / Lucky / Shadow | `Ⓡ` | U+24C7 |

> `Ⓡ` is intentionally shared by Master, Lucky (no-league), and Shadow. All mean "Raid/Master candidate."

### Formats
| Slot | Format | Example |
|------|--------|---------|
| Confirmed league | `{Name}{Ⓛ/Ⓖ/Ⓤ}{Rank%}{$}{moves}` | `AlakazamⒼ96` |
| Master | `{Name}Ⓡ{MasterRank%}` | `HippowdonⓇ96` |
| Review/holding | `{Name}{rank%}{league}...` lowercase | `Pin95l93g` |
| Lucky (no league) | `{Name}Ⓡ{IV%}` | `AbsolⓇ91` |
| Lucky (with league) | Same as confirmed league | `AbsolⒼ97` |
| Shadow (no league) | `{Name}Ⓡ{IV%}` | `MachampⓇ82` |
| Shadow (purify) | `{Name}{League}{Rank%}p` | `GurdurrⒼ92p` |
| Trade | `{Name}{IV%}t` | `Ferali67t` |
| Nundo | `{Name}⓪` | `Geodude⓪` |
| Shiny | `{Name}{BestLeague}{Rank%}※` | `AbsolⒼ97※` |

### Move suffixes
- `b` = both best moves set
- `☆` = all best moves set, no TMs needed

---

## 7. Starring Rules

| Star | Condition | Meaning |
|------|-----------|---------|
| 🟡 Gold | `suggestStar && isFavorite` | Correctly starred |
| 🟢 Green | `suggestStar && !isFavorite` | Should be starred — act now |
| 🩵 Cyan | `suggestStarCheaper && !isFavorite` | Cheaper option at same rank as a gold star — check before acting (may already be levelled) |
| 🩵 Cyan→Gold | `suggestStarCheaper && isFavorite` | Cheaper alt already starred — correct *(TODO: shows dot currently)* |
| 🔵 Blue | `suggestStarExpensive && !isFavorite` | Winner but costly — lower priority |
| 🔴 Red | `isFavorite && !suggestStar && !suggestStarExpensive && !suggestStarCheaper` | Starred but shouldn't be |
| · | none | No action |

**Priority:** Green/Gold > Blue > Cyan. `suggestStarCheaper` evaluated AFTER both others are resolved.

**Sort order (★ column):** Gold(0) → Green(1) → Cyan(2) → Blue(3) → Red(4) → None(5)

### `suggestStar` fires when:
- `keep` + any of: league slot, affordable slot, lucky, best shiny, nundo, shadow, purified
- OR `protected` + best IV in family
- OR `isLucky` OR `isCostumed`
- Does NOT fire if `suggestStarExpensive` is true

### `suggestStarExpensive` (blue): `isExpensiveWinner && !hasAffordableSlot` — any evo stage
### `suggestStarCheaper` (cyan): `isCheaperAlternative && !suggestStar && !suggestStarExpensive` — any evo stage

---

## 8. Search

- Family search matches on `primaryName`, `evolvedNameG`, `evolvedNameU`, `evolvedNameL`
- Evo-target match (e.g. "umbreon" finds Eevees) shows a banner + filters rows to only those targeting that evo
- Each matching row shows a reason tag under the nickname (e.g. `G→Umbreon`) when below 90%
- **🔍 Me** button — copies filtered GO search string for this form only (with `!variant` exclusions)
- **🔍 + Fam** button — copies all family species names comma-joined for Pokégenie (e.g. `Geodude,Graveler,Golem`)

---

## 9. Overrides (Supabase)

Table: `pokemon_overrides`, keyed by `stableKey`.

| Field | Purpose |
|-------|---------|
| `is_shiny` | Manual shiny |
| `is_dynamax` | Dynamax |
| `is_gigantamax` | Gigantamax |
| `is_costumed` | Costumed |
| `vivillon_pattern` | Vivillon form |
| `special_form` | Furfrou trim etc. |
| `manual_decision` | Force keep/trade/review |
| `notes` | Free text |

---

## 10. Special Cases

| Pokémon | Rule |
|---------|------|
| Lucky | Never trade; always keep |
| Nundo (0/0/0) | Always keep |
| Hundo (15/15/15) | Always keep; always star |
| Legendary/Mythical/UB | Always protected; best-IV gets starred |
| Shadow | Best by IV kept; Ⓡ nick if no league slot |
| Purified | Best kept |
| Shiny | Manual flag; always star; ※ suffix |
| Costumed | Manual flag; always star |
| Furfrou/Vivillon/Flabébé | Collection set — keep N for full set (⚠️ not in refactor) |
| Wurmple | Random evo; flagged unknown |
| Kleavor | Raid-only; standalone family (⚠️ not in refactor) |
| Galarian Weezing | Standalone family (⚠️ not in refactor) |
| Eevee | All 9 evolutions manually united |

---

## 11. Pending Features

### Bugs / missing from refactor (port from HTML v3.133)
- [ ] `FORM_SPLIT_FORMS` — Deoxys/Castform/Oricorio etc. incorrectly grouped in refactor
- [ ] `STANDALONE_SPECIES` (Kleavor, Galarian Weezing) — missing from refactor
- [ ] `isFinalEvoStage` guard on blue/cyan stars — still present in refactor, should be removed
- [ ] Stable key includes CP in refactor — should be removed (`STABLE_KEY_NO_CP`)
- [ ] `COLLECTION_SETS` (Vivillon/Furfrou/Flabébé) — not ported to refactor
- [ ] `suggestStarCheaper && isFavorite` → should show gold star (shows dot in both versions)
- [ ] Shiny nickname bug — `isShiny` set via Supabase override AFTER nickname built (both versions)

### UI pending
- [ ] Override button not visible on mobile
- [ ] Clear overrides resets checkboxes
- [ ] Shiny toggle updates Keep count immediately
- [ ] Regional form filter buttons
- [ ] Gender filter button
- [ ] Trading tab
- [ ] 2016 Lucky-eligible flag

### Planned
- [ ] Movesets — expand DB + Claude API + Supabase cache
- [ ] Family completion badge
- [ ] Committed Pokémon rule (CP at/near cap)
- [ ] PokeAPI-sourced evolution database
- [ ] Auth/RLS/Stripe — Claude Code only
