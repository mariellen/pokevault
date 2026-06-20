# PokéVault — Business Rules & Design Reference

> Last updated: 2026-06-13
> Version: v3.5.49
> Source of truth: analyse.js (refactor is canonical — HTML is retired)

This is the single canonical reference for PokéVault's analysis engine. Where any
description here disagrees with `analyse.js`, **`analyse.js` wins** and this document
is the bug. Use it to orient any new Claude session (coordinator, Claude Code, or Opus
review). Constants referenced as living in `config.js` / `render.js` are authoritative
in those files; this doc summarises their effect.

---

## Table of Contents

1. [Core Constants](#1-core-constants)
2. [Keep / Trade / Review Decision Logic](#2-keep--trade--review-decision-logic)
3. [Slot Assignment](#3-slot-assignment)
4. [Special Pokémon Type Rules](#4-special-pokémon-type-rules)
5. [Nickname Generation System](#5-nickname-generation-system)
6. [Star Ranking System](#6-star-ranking-system)
7. [Purification Simulation](#7-purification-simulation)
8. [Family Grouping Rules](#8-family-grouping-rules)
9. [Conflict Resolution](#9-conflict-resolution)
10. [Merge Candidate Detection](#10-merge-candidate-detection)
11. [Stable Key Format](#11-stable-key-format)
12. [Search](#12-search)
13. [Overrides (Supabase)](#13-overrides-supabase)
14. [Pending Bugs](#14-pending-bugs)
15. [Appendix — Slot Badges & Dynamax/Gigantamax Rules](#appendix--slot-badges--dynamaxgigantamax-rules)
16. [⚑ Coordinator Review](#-coordinator-review)

---

## 1. Core Constants

Defined in `config.js`.

### Data Source
- **Input:** Pokégenie CSV export.
- **Key columns:** `Name`, `Pokemon Number`, `Form`, `Gender`, `CP`, `HP`, `Atk IV`,
  `Def IV`, `Sta IV`, `IV Avg`, `Level Min/Max`, `Rank % (L/G/U)`, `Rank # (L/G/U)`,
  `Name (L/G/U)`, `Form (L/G/U)`, `Dust Cost (L/G/U)`, `Lucky`, `Shadow/Purified`,
  `Favorite`, `Scan Date`, `Catch Date`, `Quick Move`, `Charge Move`, `Charge Move 2`.

### League Symbols (circled letters — displayed in nicknames)
| Symbol | Unicode | Meaning |
|--------|---------|---------|
| `ⓛ` | U+24DB | Little League (≤500 CP) |
| `Ⓖ` | U+24C6 | Great League (≤1500 CP) |
| `Ⓤ` | U+24CA | Ultra League (≤2500 CP) |
| `Ⓜ` | U+24C2 | Master League (no cap) — **confirmed Master slot WINNER only** |
| `Ⓡ` | U+24C7 | Best overall, **no confirmed league slot** — used for Lucky (no league), best Dmax/Gmax/Legendary with no league slot, best Shadow with no slot, and Master *non-winners* / demoted Master keepers |

> **`Ⓜ` vs `Ⓡ` is contextual, not a global rename.** The single non-shadow Master
> *winner* per family gets `Ⓜ`. Demoted Master keepers and all other no-league-slot
> "raid/best-overall" candidates keep `Ⓡ`. Do **not** sweep-replace one with the other.

### Nick Special Symbols
| Symbol | Constant | Meaning |
|--------|----------|---------|
| `100` | `PERFECT` | Displayed when rank rounds to 100% (✪ fails in GO after circled letters) |
| `⓪` | `NUNDO` | 0/0/0 Pokémon |
| `Ⓗ` | `HUNDO_SFX` | 15/15/15 IVs — appended to any nick where atkIV=defIV=staIV=15 |
| `Ⓓ` | — | Dynamax indicator — always shown on Dynamax nicks regardless of keep/trade |
| `Ⓧ` | — | Gigantamax indicator — always shown on Gigantamax nicks regardless of keep/trade |
| `※` | `SHINY_SFX` | Shiny suffix |
| `*` | — | Purified marker (replaced `✦`, which doesn't render in GO) |

### Nick Suffix Order (canonical — as emitted by `buildNickname`)
```
[name][ⓛ/Ⓖ/Ⓤ/Ⓜ/Ⓡ][IV%/rank%][$ /$$/$$$][p /p✪][Ⓓ/Ⓧ][Ⓗ][☆/b][※][*]
```

Built in this exact append order:
1. **Dust dollars** (`$`/`$$`/`$$$`) — only when dust > affordable threshold for the slot's league; suppressed entirely for hundos.
2. **Shadow purify** (`p` / `p✪`) — only for shadows with a `purifyLeague` and **no confirmed own-league slot** (the purify slot itself doesn't count).
3. **Dynamax** (`Ⓓ`).
4. **Gigantamax** (`Ⓧ`).
5. **Hundo** (`Ⓗ`) — whenever atkIV=defIV=staIV=15.
6. **Move flags** (`☆` = all best moves, no TMs; `b` = two moves with at least one best).
7. **Shiny** (`※`).
8. **Purified** (`*`) — **always the genuine final character, after `※`.**

> **The purified `*` is the last character, even after shiny `※`.** Raikou is the
> canary: a correct render is `RaikouⓂ100Ⓗ*` and, when shiny+purified,
> `…※*`. If `*` ever renders before `※`, the nick is wrong. (For the shiny *slot*
> specifically, `buildNickname` re-orders so the trailing pair is `※` then `*`.)

`fitName(name, mid, suf, 12)` maximises name length before truncating to GO's 12-char limit.

### Thresholds
| Constant | Value | Meaning |
|----------|-------|---------|
| `keepThreshold` | 90% | Minimum rank% to qualify for a confirmed keep slot |
| `dustExcludeThreshold` | 300,000 | Dust over this → non-final, non-legendary excluded from a league slot (when rank < 90%) |
| `dustWarnPerfect` | 200,000 | Warn if dust > this for a 100% rank |
| `dustWarnNormal` | 100,000 | Warn if dust > this for normal rank |
| `luckyMasterMargin` | 5 (pp) | Lucky's IV bonus (+5pp) in the Master-winner precedence comparison (§3) |

### Dust Affordability & Dollar-Suffix Thresholds (per league)
| League | Affordable | `$` | `$$` | `$$$` |
|--------|-----------|-----|------|-------|
| Little | 100k | 100k | 200k | 300k |
| Great | 150k | 150k | 250k | 350k |
| Ultra | 300k | 300k | 400k | 500k |
| Master | ∞ | — | — | — |

Dollar signs appear in nicks **only when dust exceeds the affordable threshold** for that
league, and are **suppressed entirely for hundos**.

---

## 2. Keep / Trade / Review Decision Logic

Decisions are assigned in priority order. **The first matching rule wins.** (Order as
implemented in the decision/nick block of `analyse.js`.)

| # | Condition | Decision | Reason string |
|---|-----------|----------|---------------|
| 1 | `nundo` slot (0/0/0) | `keep` | `Nundo — 0/0/0` |
| 2 | League slot, confirmed (rank ≥ 90% **or** affordable-only backup) | `keep` | `Best <leagues>` / `Affordable backup for <league>` |
| 3 | League slot, best available but **below 90%** | `review` | `Best available for <leagues> (below 90% threshold)` |
| 4 | `lucky` slot | `keep` | `Lucky — always keep` |
| 5 | `shiny` / `shiny_lower` slot | `keep` | `Shiny — always favourite` |
| 6 | `dynamax` slot | `keep` | `Best Dynamax — keep` |
| 7 | `gigantamax` slot | `keep` | `Best Gigantamax — keep` |
| 8 | `best_overall` slot | `keep` | `Best Legendary — keep` (legendary) / `Best in family — keep` (non-legendary) |
| 9 | `shadow` slot | `keep` | `Best shadow — keep for raids/Master League` |
| 10 | `purified` slot | `keep` | `Best purified` |
| 11 | Qualifies in any league (≥90%) but not best in family | `review` | `≥90% but not best in family — review` |
| 12 | `collection` slot | `keep` | `Collection — keeping N for full set` |
| 13 | `isLucky` fallthrough (no slot above) | `keep` | `Lucky — always keep (Master/Raid candidate)` |
| 14 | Hundo (15/15/15) fallthrough | `keep` | `Hundo (15/15/15) — always keep` (sets `suggestStar=true`) |
| 15 | Everything else | `trade` | `IV X% — not best in any slot` |

**Collection edge case:** at rule 15, if the species is in `COLLECTION_SETS` and has no
`specialForm`/`vivillonPattern` set, the decision is upgraded to `review` with
`Collection species — set pattern in override panel` (prompts the user to set the form).

### Force-Keep Overrides (applied after the decision block)
- Manual decision override from Supabase → replaces the computed decision.
- `is_shiny` / `is_dynamax` / `is_gigantamax` overrides applied here (see §13 known-bug note about shiny set *after* nick build).

### Shiny Duplicate Reconciliation
When a family has multiple shinies, the highest `ivAvg` is kept (prefer `isFavorite` on
tie). All others → `decision='trade'`, reason `Shiny duplicate — <keeper> X% IV is keeper`.

---

## 3. Slot Assignment

Slots are internal tags marking what a Pokémon is being kept **for**.

### League slot priority order: **M → U → G → L** (higher leagues pick first)

### ⚠️ One Slot Per Pokémon (core rule — 2026-05-28)
Each *physical* Pokémon can win only **one** league slot. Once it wins any league slot it
is excluded from all other league competitions. This is what lets a CP:494 Marowak win
Great while the Little slot opens for the next-best candidate (e.g. Cubone → MarowakⓁ96).
Shadow / Lucky / gender variants are separate Pokémon objects and each win one slot
independently.

### Eligible candidates per evolution-stage group
- Must be ≤ league CP cap × 1.05 (5% rounding buffer).
- Non-final, non-legendary: excluded if dust > 300k **and** rank < 90%.
- Pre-evos for Ultra excluded if they have no valid evo path (`evolvedNameU` empty) and aren't final/legendary.
- **Committed-to-lower-league exclusion is evo-target-scoped:** a Pokémon committed to a
  lower league is excluded from Great/Ultra/Master **only when the evo target for that
  league is the SAME physical form** as the lower league's. Different evo targets (e.g.
  Skwovet-as-itself for Little vs Skwovet→Greedent for Ultra) are independent — both valid.
- **Master:** only final evolutions, with three exceptions:
  1. Hundo pre-evos always allowed.
  2. Pre-evo allowed when no evolved form exists in the group.
  3. Pre-evo allowed when it strictly outranks **all** final evos in the group.

### Master League single-keeper precedence (June 2026)
The per-evo-stage Master pass can confirm several non-shadow winners (it groups by variant
and evo stage), but Master allows **only ONE non-shadow keeper per family**. Reconcile to a
single winner by this precedence (`masterCmp`):

```
Hundo  >  Lucky-adjusted IV (Lucky +5pp)  >  shiny-lucky  >  purified  >  normal
         (raw ivAvg is the final deterministic tiebreak)
```

- **Lucky margin direction:** the comparison adds `luckyMasterMargin` (5pp) to a Lucky's
  IV. So a **non-Lucky wins only if its raw IV exceeds the Lucky's by MORE THAN 5pp.**
- **Category tiebreak** (`catRank`, used when adjusted IVs tie within 0.01): shiny-lucky (3)
  > lucky (2) > purified (1) > normal (0).
- Losers are **demoted**, not deleted: `masterDemoted=true`, M slot stripped,
  `hasBattleSlot`/`slotConfirmed` cleared so they can be reconsidered for capped leagues.
- A `masterDemoted` Pokémon **bypasses** the `speciesWithConfirmedKeeper` same-species dedup
  so it can still reach a `best_overall` slot and surface as `NameⓇ{IV%}` — it must not be
  stranded (this fixes the `…98m` bug).
- Shadows are untouched — they hold Master independently via the purify-push
  (`isPurifySlot` on the `M` league).

### Sorting within each group (best candidate wins)
Priority: **highest rounded rank% → prefer already-evolved → cheapest effective dust →
higher raw rank** (final deterministic tiebreak only).

#### Rank comparison and dust tiebreak (regression-critical)
- **Rounded integer ranks.** All league rank percentages are rounded to the nearest whole
  number before slot competition. 99.6% and 99.9% both round to 100 and are **tied**.
- **Already-evolved wins the tie.** At equal rounded rank, an already-evolved Pokémon beats
  a pre-evolution that still needs evolving (evolution cost is implicit). Checked *before* dust.
- **Dust tiebreak when rounded ranks are equal.** Lower effective dust wins (affordable-first).
- **Missing/null dust = 0.** A Pokémon already at/above the cap may export null dust; treat
  as `dust = 0` (already there, no investment) — the most affordable outcome, always wins
  the dust tiebreak against a same-ranked Pokémon with non-zero dust.
- **Lucky half-dust applies in the tiebreak** (`Math.round(dust/2)`), consistent with the
  two-pass affordable-first logic.
- Comprehensive coverage lives in `analyse.dust_tiebreak.test.js` — must stay green.

**Rank tiers:** Tier 0 ≥99.99% (exact 100) · Tier 1 ≥99.0% · Tier 2 ≥90.0% ·
Tier 3 below 90% (tentative — review, no circled-letter nick).

**No hard floor for capped leagues (LL/GL/UL):** best-in-family always surfaces as review
regardless of rank. Master retains a 70% floor (ivAvg-based) in the next-best pass.
`slotConfirmed` requires rank ≥ `keepThreshold` — slot membership alone is not enough.

### Affordable winner vs expensive winner (Pass 2)
If the best candidate's effective dust exceeds the league's affordable threshold:
- The best candidate gets `isExpensiveWinner` → **blue star** (`suggestStarExpensive`).
  **Fires at any evo stage** (no `isFinalEvoStage` guard on this path).
- The best affordable alternative (effective dust ≤ threshold, rank ≥ 90%) gets an
  `X_affordable` slot and `suggestStarCheaper` (cyan).

If the best candidate is itself affordable, it gets `isAffordableWinner` — **but only when
it is the final evo stage and confirmed** (the `isFinalEvoStage` guard remains on *this*
self-flag path only, not on the blue/expensive path).

### Special slots
| Slot | Rule |
|------|------|
| `shiny` | Best-IV shiny per family (highest `ivAvg`; prefer `isFavorite` on tie) |
| `shiny_lower` | All other shinies in family |
| `shadow` | Best-IV shadow per family |
| `purified` | Best-IV purified per family |
| `lucky` | Every Lucky gets one |
| `nundo` | Every 0/0/0 |
| `dynamax` | Best-IV Dynamax per max-evo target, **only when no league slot**; if best holds a league slot, the best slot-less candidate inherits it |
| `gigantamax` | Same logic as `dynamax` |
| `best_overall` | Best-IV per species with no confirmed league slot — **all species** (legendary and non-legendary; non-legendaries must qualify ≥90% in some league and have no confirmed family keeper unless `masterDemoted`). Nick: `NameⓇ{IV%}` |
| `collection` / `collection_keep` | Top N by IV% for `COLLECTION_SETS` species |

Shadow / purified / lucky are **separate slot groups** — a shadow Great winner and a regular
Great winner coexist in the same family. **Gender-dimorphic** species get separate slot
groups per gender (see §8).

### Standalone-species exclusion
If a Pokémon's `Name (G/U/L)` points to a `STANDALONE_SPECIES` (`Kleavor`, `Weezing|Galar`),
that league's `rankPct` is ignored and no slot is assigned for that league.

---

## 4. Special Pokémon Type Rules

### Shiny
- **Always keep** (forced, regardless of rank/slot). `isShiny` is set via Supabase override
  (Pokégenie doesn't export it).
- Best shiny → `shiny`; others → `shiny_lower`.
- Nick uses league symbol + rank% if a qualifying slot exists, else `NameⓇ{IV%}※`.
- `※` trails everything except a purified `*`. Duplicate shinies: highest IV keeps, others trade.

### Lucky
- **Always keep**, regardless of rank. Pays half effective dust in all cost calculations.
- With a qualifying league slot (≥90%): circled-letter nick for that league.
- Without: `NameⓇ{IV%}` (Master/Raid candidate).
- Separate slot sub-group — won't displace a regular same-species/league winner.
- In Master precedence, Lucky gets +5pp adjusted IV (see §3).

### Hundo (15/15/15)
- **Always keep**, `suggestStar=true` always. `Ⓗ` appended to any nick.
- Wins the Master precedence outright (highest tier). Nick `NameⓇ100Ⓗ` (no league) or
  `NameⒼ100Ⓗ` etc. with a league slot. Dust dollar-suffixes suppressed for hundos.

### Nundo (0/0/0)
- **Always keep** — collector's item. Nick `Name⓪`, `nundo` slot, `decision='keep'`.

### Shadow (`Shadow/Purified = '1'`)
- Best shadow per family → `shadow` slot → keep. No-league nick: `NameⓇ{IV%}` (via the
  `lucky` slot handler).
- Purify suffix `p` (or `p✪` if purified IVs would be 15/15/15) appended **only when the
  shadow holds no confirmed own-league slot** (purify slot excluded).
- If purified IVs would qualify (≥92% estimated, see §7), the shadow gets a purify league
  slot and league-style nick with `p`.
- Frustration as fast move always generates a TM note.

### Purified (`Shadow/Purified = '2'`)
- Best purified per family → `purified` slot → keep.
- Nick suffix `*` (the genuine final character). Pays half dust to power up (effective-dust
  not yet applied in slot sorting for this path).

### Dynamax / Gigantamax
- Set via Supabase override (`is_dynamax` / `is_gigantamax`); not from CSV. Mutually
  exclusive in-game.
- Best-IV per max-evo target gets the slot **when it has no league slot**; if the best holds
  a league slot, the best slot-less candidate inherits it (branching families like Eevee key
  by final evo target so Dmax →Vaporeon and →Flareon each keep one).
- Suffix `Ⓓ`/`Ⓧ` always shown, even on a league nick and even when traded.
- Non-best duplicate with no slot → `trade`, visibility star.

### Legendary / Mythical / Ultra Beast
- Skip Master in regular league evaluation (handled by `best_overall`).
- Best-IV per species (not Dmax/Gmax, no league slot) → `best_overall` → keep, nick
  `NameⓇ{IV%}`. Dust exclusion threshold does **not** apply to these types.
- Duplicate with no slot → `trade`, visibility star.

### Costumed
- `isCostumed=true` (override) → `suggestStar=true` always.

### Collection species (`COLLECTION_SETS`)
- Top N by `ivAvg` (N = `cset.target`) → `collection` slot.
- No `specialForm`/`vivillonPattern` set → `review` to prompt the user.
- Nick: `NameⓇ{IV%}`.

---

## 5. Nickname Generation System

Built by `buildNickname(p, slot)` in `analyse.js`. Max length 12 (GO cap), enforced by
`fitName()` which truncates `name` from the right so `name + mid + suf` fits.

### Nick conventions
| Convention | Format | Example |
|------------|--------|---------|
| `pvpvault` (default) | League symbol + rank% | `GlaceonⒼ100` |
| `ivpct` | ShortName + rounded IV% | `Glaceon56` |
| `rawiv` | ShortName + AtkDefSta digits | `Glaceon2914` |
| `moves` | ShortName + QCode/CCode | `SwamperMS/HC` (falls back to ivpct) |

### Nick by slot
| Slot | Mid | Notes |
|------|-----|-------|
| `nundo` | `⓪` | Early return before suffix building |
| `L` / `G` / `U` | `ⓛ`/`Ⓖ`/`Ⓤ` + rank% (or `100`) | `base` = evo target name when it differs from current form |
| `M` | **`Ⓜ`** + rank% **if winner**, else **`Ⓡ`** + rank% | `holdsMaster = wonMasterSlot \|\| (isPurifySlot && purifyLeague==='M')`; `base` = highest evo target |
| `shiny` / `shiny_lower` | Best qualifying league symbol + rank%, else `Ⓡ` + IV% | suffix forced to end `…※[*]` |
| `dynamax` | Best qualifying league symbol + rank%, else `Ⓡ` + IV% | `Ⓓ` in suffix |
| `gigantamax` | Best qualifying league symbol + rank%, else `Ⓡ` + IV% | `Ⓧ` in suffix |
| `lucky` | `Ⓡ` + Master/IV% | also used for `best_overall`, shadow no-slot, and pure-hundo no-slot |
| `trade` | IV% + `t` | e.g. `Glaceon56t` |
| `review` | Holding name: qualifying leagues as lowercase letters + rank%, e.g. `95g93u` | Shadow-purify uses purify league symbol + purifyRankPct; excludes dust >300k leagues for non-final non-legendary; falls back to best+master, never bare IV% |

### Form prefix system
When `p.specialForm`/`p.form` matches a key in `FORM_NICK_PREFIXES` (`config.js`), the short
prefix replaces the species name as `base` (e.g. `SnowyⒼ97`, `DandⓊ100`). Examples:
Castform Snowy→`Snow`, Lycanroc Midnight→`Night`/Midday→`Day`/Dusk→`Dusk`, Deoxys
Attack→`Atk`/Defense→`Def`/Speed→`Spd`, Origin→`Orig`, Therian→`Ther`, Primal→`Prml`,
Furfrou trims, Vivillon patterns, Flabébé colours. Full table in `config.js`.

### Evo-target form prefix (per-league form from CSV)
Apply the recommended-form prefix **only when the form differs across leagues** for the same
Pokémon (`evolvedFormG ≠ evolvedFormU` or `evolvedFormG ≠ evolvedFormL`):
- **Rockruff (apply):** GL→Midnight `NightⒼ97`, UL→Midday `DayⓊ97` — forms differ ✓
- **Alolan Vulpix (don't apply):** all leagues → Ninetales|Alola — only one evolution → `NinetaⒼ99`
- **Hisuian Growlithe (don't apply):** all leagues → Arcanine|Hisui → `ArcaⒼ98`

Regional form evo names (`Ninetales|Alola`, `Arcanine|Hisui`) use the species name before
the pipe as the nick base — family grouping already separates regional from normal lines.

### Alt nicks
When a Pokémon qualifies (≥90%) for both Great **and** Ultra with different evo targets, an
alternate nick for the non-primary league is computed and shown in smaller UI text
(click-to-copy). The main nick uses the highest-ranked capped league.

---

## 6. Star Ranking System

Star type is set by `p.starType` in `analyse.js` and rendered by `render.js`.

### Decision tree (first match wins)
```
1. GOLD   ★  suggestStar && isFavorite && (!isShiny || hasRealSlot)
             OR suggestStarExpensive && isFavorite
             → "Starred correctly ✓"
             (Favourited expensive winners render GOLD — the keep action is already done
              in GO; the $ dust suffix is stripped from the display nick when gold.)
2. GREEN  ★  suggestStar && !isFavorite && !suggestStarCheaper && (!isShiny || hasRealSlot)
             → "Should be starred — action needed"
3. BLUE   ★  suggestStarExpensive && !isFavorite
             → "Recommended but costly — over affordable threshold"
4. CYAN   ★  suggestStarCheaper && !isFavorite
             → "Equivalent to your starred pick — check before acting"
5. SHINY  ✨ isShiny && no real PvP/lucky/nundo slot
             → "Shiny — always keep"
6. RED    ★  !suggestStar && !suggestStarExpensive && !suggestStarCheaper && isFavorite
             → "Currently starred — may not be needed"
7. SWIRL  🌀 evolutionUnknown (Wurmple/Clamperl) && max league rank ≥ 90%
             → "Unknown evo path — high PvP rank, consider evolving"
8. GREY   ★  ML placeholder — best slot-less family member when no confirmed ML keeper
             exists (isMlPlaceholder, decision='review', nick via M_placeholder)
             → "Master League candidate — star before culling"
9. VISIBILITY ★ decision='trade' && (isDynamax || isGigantamax || isLegendary)
             → "Notable — tradeable but worth reviewing"
10. NONE  ·  Everything else
```

### Sort ladder (★ column)
Two sort functions, both in `app.js`:

**Row-level — `pokemonStarRank(p)`** (orders Pokémon within a family):
```
Gold(0) → Green(1) → Cyan(2) → Blue(3) → Grey(3.5) → Red(4) → Visibility(5) → None(6)
```
The Grey ML-placeholder rank is a **half-integer (3.5)**, distinct from Blue (3, action
needed), and **Cyan sorts ahead of Blue** — the reverse of the assignment order above. A
shiny with no other star reason falls through to None(6) here. (Red requires `!isShiny`.)

**Family-level — `familyStarPriority(fam)`** (orders families in the list by their best
member): `Gold(0) → Green(1) → Cyan(2) → Blue(3) → Shiny(4) → Red(5) → None(6)`. Note shiny
sits between blue and red at the family level (it has no grey/visibility tiers).

The `starType` strings, the grey ML-placeholder, and the visibility star
(`star-visibility` class) are all confirmed in `render.js`; the engine names it the
**visibility** star, not "purple".

### Key flags
- **`suggestStar`** (green/gold): `suggestStarExpensive=false` AND any of — `decision='keep'`
  with a league/affordable/lucky/best-shiny/nundo/shadow/purified/dynamax/gigantamax/
  best_overall slot; `isProtectedBest` (best-IV Legendary in family); `isLucky`; `isCostumed`.
- **`suggestStarExpensive`** (blue): `isExpensiveWinner=true` — best candidate but effective
  dust over the league affordable threshold. Fires at any evo stage.
- **`suggestStarCheaper`** (cyan): `isCheaperAlternative=true` — cheaper than a currently-
  starred Pokémon at the same rounded rank, not itself the expensive winner.
- **`hasRealSlot`**: has a league slot (L/G/U/M) OR `lucky` OR `nundo` — distinguishes
  "keep because shiny" from "keep because PvP + shiny".

---

## 7. Purification Simulation

Run by `simulatePurify(p)` for all shadows before slot assignment.

### IV improvement
```js
pAtk = min(15, atkIV + 2); pDef = min(15, defIV + 2); pSta = min(15, staIV + 2);
purifyHundo  = (pAtk===15 && pDef===15 && pSta===15);
purifyIvAvg  = ((pAtk + pDef + pSta) / 45) * 100;
purifiedMinLevel = max(currentLevel, 25);   // purified boosted to ≥ L25
```

### CP cap check (exact)
Uses `GO_BASE_STATS_BY_NAME` + `CP_MULTIPLIERS`:
```
cp = floor((baseAtk + pAtk) * sqrt(baseDef + pDef) * sqrt(baseSta + pSta) * cpm² / 10)
exceedsCap = cp > leagueCap
```
Falls back to heuristic `round(cp * 1.07) > cap` when base stats unavailable.

### Qualifying threshold
`estimatedPurifiedRank ≥ 92%` (raised from 90% to buffer the heuristic). Capped leagues
also require purified CP not to exceed the cap; Master uses `purifyIvAvg` directly.

### Result
`p.purifyLeague` = best qualifying league after purification; `p.purifyRankPct` = estimated
rank%. If `purifyRankPct ≥ 90%`, the purify league is added to `p.slots` (`isPurifySlot`,
`slotConfirmed`) and the shadow gets a league-style nick with `p`. The `p`/`p✪` suffix
appears **only if** the shadow holds no confirmed own-league slot at ≥90% (excluding the
purify slot).

---

## 8. Family Grouping Rules

Implemented in `buildFamilyMap()`. Union-find on Pokémon Numbers with majority-vote evo-link
detection (>40% threshold) so noisy data can't create spurious merges.

### Family key format
- **Normal species:** `PokemonNumber` (e.g. `133` Eevee).
- **Regional / form-split:** `PokemonNumber|Form` (e.g. `52|Galar`).
- **Gender-split dimorphic:** `PokemonNumber|Gender` (e.g. `592|♂`).

### Forms that get their own family key (`FORM_SPLIT_FORMS`)
Alola, Galar, Hisui, Paldea, Male, Female, Origin, Altered, Therian, Incarnate, Attack,
Defense, Speed, Primal, Mega, Unbound, Rainy, Sunny, Snowy, Baile, Pa'u, Pom-Pom, Sensu,
Small, Average, Large, Super, Combat, Blaze, Aqua, Plant, Sandy, Trash, Midnight, Dusk,
Burn, Chill, Douse, Shock, Roaming, Hero, Aria, Pirouette, Land, Sky, 10%, 50%, Complete.

> **`Normal` is NOT in this list** — it is normalised to `''` so species with and without an
> explicit Normal form group together correctly.

### Standalone species (`STANDALONE_SPECIES`)
`Kleavor` and `Weezing|Galar` — never merged into another family even when Pokégenie lists
them as evo targets; their pre-evolution `rankPct` is ignored for slot assignment.

### Gender-split families (`GENDER_SPLIT_SPECIES`)
`Frillish`, `Jellicent`, `Pyroar` — split by gender into separate families (appearance
differs by gender). Genderless rows fall into an ungrouped bucket flagged for rescanning.

### Gender-dimorphic (separate league slots, same family — `GENDER_DIMORPHIC`)
Each gender competes independently for the league slot within the family. Members
(`config.js`): Meowstic, Indeedee, Frillish, Jellicent, Hippopotas, Hippowdon, Unfezant,
Pyroar, Lechonk, Oinkologne, Combee, Wooper.

### Gender-locked evolution (`GENDER_LOCKED_EVO`)
Members (`config.js`): **Combee, Kirlia, Snorunt, Burmy.** For these, gender determines
evolution eligibility, so if the row's gender is **unknown** the engine clears
`evolvedNameG/U/L` and sets `genderUnknownLocked=true` — the Pokémon is **not assigned to a
slot for an undetermined evolution**. The set itself is just these four names (no targets
stored); the in-game directions are: Combee → Vespiquen (female only), Kirlia → Gallade
(male only), Snorunt → Froslass (female only), and Burmy → Wormadam (female) / Mothim (male)
— the only **dual-path** entry, where both genders evolve but to different targets, which is
why the "non-evolvable when unknown" rule still applies (the target is undetermined).

### Unknown evolution path (`FAMILY_OVERRIDES.unknownEvo`)
Wurmple and Clamperl — random evo. `evolutionUnknown=true` → swirl star (🌀) if rank ≥ 90%.

### Evo override (`EVO_OVERRIDES`)
Species where Pokégenie omits evo data. Currently `Gothita|♂` →
`{G:'Gothorita', U:'Gothitelle', L:'Gothorita'}`.

### Tyrogue IV-based correction
ATK > DEF → Hitmonlee; DEF > ATK → Hitmonchan; ATK = DEF → Hitmontop (corrects Pokégenie's
equality-case misreport against `VALID_EVOLUTIONS['Tyrogue']`).

### Eevee family
Manually united in `buildFamilyMap` — all 9 Eeveelutions share one family key regardless of
evo-vote data.

---

## 9. Conflict Resolution

### Evo-stage conflict
A Pokémon can't be two evo stages at once. When it holds slots needing different stages, keep
the **highest-priority** league slot (M > U > G > L) and release lower slots with conflicting
evo targets.

### Same-evo conflict (one slot per Pokémon — 2026-05-28)
Each Pokémon keeps only its highest-priority slot and releases the rest. Released slots are
filled by `nextBest`. No Pokémon holds G+U, U+M, G+L etc. simultaneously — those require two
different physical Pokémon.

### After conflict resolution (per released slot)
1. Decrement the winner count for that evo+league.
2. If no winner remains, find `nextBest`: must not already hold that league, must have the
   correct evo target, rank ≥ 70%, dust ≤ 300k (or final evo / legendary); sorted by rank
   tier → actual rank → effective dust.
3. If found, assign the slot and promote to `keep` on the re-pass.

### Duplicate slot deduplication
If two Pokémon still hold the same league + evo target, the lower-ranked one loses (sort by
rounded rank → prefer already-evolved → effective dust).

---

## 10. Merge Candidate Detection

`findMergeCandidates()`. A merge group = same family, identical IVs, different CP, and at
least one member missing a catch date OR two members sharing a catch date — likely the same
Pokémon scanned before and after a power-up (Pokégenie creates a new row instead of updating).

**Display:** `row-merge-candidate` CSS (opacity 0.7) and a 🔀 icon; clicking opens the Merge
modal at that group.

---

## 11. Stable Key Format

```
{PokemonNumber}|{Form}|{Gender}|{AtkIV}|{DefIV}|{StaIV}|{date}
```
where `date = catchDate || originalScanDate || ('_idx' + idx)`.

- **Catch date format:** `D/M/YYYY` (Australian).
- **Original Scan Date** fallback: ~100% coverage vs ~33% catch date; set on first scan,
  stable if Pokégenie merge is used.
- **CP is excluded** — it changes on power-up and would lose overrides.
- Genuine duplicates (all fields equal) get `_2`, `_3` suffixes.

**User responsibility:** always use Pokégenie **merge** after powering up — without it a new
scan date is generated, the stable key changes, and overrides are lost.

**Known cloud-reload mismatch (diagnostic in progress):** Dmax/Gmax overrides may not match
after reload because `processCloudRows()` (a) hardcodes `Gender: ''` (CSV keys carry `♀`/`♂`),
and (b) never saves `original_scan_date` (not in `COLLECTION_DB_FIELDS`), so fallback keys
become `_idx0` etc. Diagnostic logging added in `applyOverridesToPokemon()`; full fix pending.

---

## 12. Search

- Family search matches `primaryName`, `evolvedNameG/U/L`.
- An evo-target match (e.g. "umbreon" finds Eevees) shows a banner and filters rows to those
  targeting that evo; each row shows a reason tag (e.g. `G→Umbreon`) when below 90%.
- **🔍 Me** copies the GO search string for this form only (with `!variant` exclusions).
- **🔍 + Fam** copies all family species names comma-joined for Pokégenie
  (e.g. `Geodude,Graveler,Golem`).

---

## 13. Overrides (Supabase)

Table `pokemon_overrides`, keyed by `stableKey`.

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

A nick override (user-authored) is re-applied as the final post-derivation step so it
survives every earlier nick reassignment.

> **Known bug (both engines):** `is_shiny` set via override is applied *after* the nickname
> is built, so the shiny `※` can be missing from the derived nick until re-derivation.

---

## 14. Pending Bugs

### Active / unresolved
| Bug | Priority | Detail |
|-----|----------|--------|
| **A2 — `'G'` vs `'G_tentative'` ambiguity** | LOW | Downstream code can't distinguish confirmed from tentative via `slots.includes('G')`. Deliberate refactor needed — touches many call sites. **Intentionally retained debt.** |
| **Cetitan (1/15/15) red-starred despite 99.9% Ultra** | LOW | Cetoddle/Cetitan pre-evo issue |
| **Deerling "All forms already set"** | LOW | Unknown counts as set incorrectly |
| **Budew/Roselia family split** | LOW | Evolution chain-walk issue |
| **B4 — shiny+league suffix order in tests** | LOW | Harness has no override injection to set `isShiny=true`; needs harness extension |

---

## Appendix — Slot Badges & Dynamax/Gigantamax Rules

### Slot badges
| Slot | CSS | Label |
|------|-----|-------|
| `L` / `G` / `U` / `M` | `sl-L`/`sl-G`/`sl-U`/`sl-M` | Little / Great / Ultra / Master |
| `L_affordable` / `G_affordable` / `U_affordable` | `sl-L`/`sl-G`/`sl-U` | …(affordable) |
| `shiny` / `shiny_lower` | `sl-shiny` | Best Shiny / Shiny |
| `shadow` | `sl-shadow` | Best Shadow |
| `purified` | `sl-purified` | Best Purified |
| `lucky` | `sl-lucky` | Lucky |
| `nundo` | `sl-nundo` | Nundo |
| `collection_keep` | `sl-lucky` | Collection |

Decision badge classes: `dec-keep`, `dec-trade`, `dec-review`, `dec-protected`.

### Dynamax / Gigantamax keep rules
- Best league slot → keep with league nick + `Ⓓ`/`Ⓧ`.
- Best overall IV% (no league slot) → keep with `NameⓇ{IV%}Ⓓ/Ⓧ`, green star.
- Duplicate (not best, no slot) → trade, **visibility star** (rank 5) — surfaces
  above red but below none; does not affect keep counts or Pokédex counters.
- `Ⓓ`/`Ⓧ` always appears in the nick regardless of keep/trade.

---

## ⚑ Coordinator Review

**Verification status:** `analyse.js`, `config.js`, `render.js`, and `app.js` have all been
checked. Every June-2026 rule claim is now confirmed against source. No open verification
items remain.

### Confirmed against source
- **`luckyMasterMargin: 5`** — `config.js`
  (`// Lucky Pokémon get +5pp bonus in Master non-shadow winner comparison`); additive
  direction verified in `analyse.js`.
- **`GENDER_LOCKED_EVO`** — `config.js`: `new Set(['Combee', 'Kirlia', 'Snorunt', 'Burmy'])`.
  Stores **names only**, no evolution targets — the engine just clears evo when gender is
  unknown. The per-gender directions in §8 are correct in-game facts, not encoded in config.
- **`GENDER_DIMORPHIC`** — `config.js`: the 12 species listed in §8.
- **Star-type machinery** — `starType` strings, grey ML-placeholder, and the visibility star
  confirmed in `render.js` (the engine names it **visibility**, not "purple").
- **Star sort ladders** — both confirmed in `app.js`: `pokemonStarRank` (row level, with
  **Grey 3.5** and Cyan ahead of Blue) and `familyStarPriority` (family level, shiny between
  blue and red). See §6.

### Doc-vs-engine note (resolved toward engine, flagged for awareness)
1. The prior `PokéVault_Business_Rules.md` §5 listed the purified `*` at suffix position 3
   (after the shadow `p`, before `Ⓓ`). `analyse.js` emits `*` as the **final** character,
   after `※` (lines 282-295, with the shiny-slot re-order at 374-375). This doc follows the
   engine. No engine change is implied; flagged only because it reverses the older doc's order.

### Resolved stale items removed during consolidation
No longer pending — now correct in the engine: `FORM_SPLIT_FORMS`, `STANDALONE_SPECIES`, and
`COLLECTION_SETS` ported to the refactor; the `isFinalEvoStage` guard removed from the
blue/expensive-winner path (it remains only on the affordable-winner self-flag); CP removed
from the stable key; the shared-`Ⓡ` Master rule superseded by `Ⓜ` winner / `Ⓡ` non-winner;
and the retired single-file HTML reference.

---

*End of PokéVault Business Rules & Design Reference — v3.5.49, 2026-06-13.*
