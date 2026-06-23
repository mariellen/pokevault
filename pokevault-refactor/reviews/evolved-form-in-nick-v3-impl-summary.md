# Impl summary — evolved-form-in-nick (#39, v3.5.56)

ROUTE: CLAUDE-CODE · Opus pre-review complete · branch `feature/evolved-form-in-nick`

## What changed

**`js/analyse.js`** — form-aware evo-target identity + Burmy carve-out
- Added module-scope helper `slotEvoTarget(p, lg)` — returns the IDENTITY of the thing a
  Pokémon evolves into for a league: `name + '|' + form` (e.g. `Lycanroc|Midnight`). Guards:
  (1) a double-pipe guard returns already-pipe-qualified regional names untouched
  (`Arcanine|Hisui`, never `Arcanine|Hisui|Hisui`); (2) the Burmy→Wormadam carve-out returns
  plain `Wormadam` until `specialForm` is recorded.
- **Slot grouping (Step 2):** the per-league grouping key now uses `slotEvoTarget` so the three
  Lycanroc battle forms key as distinct targets and each wins its own slot. Inside the group loop
  added `stageTarget = slotEvoTarget(group[0], lg)` (form-aware target) alongside the existing
  species-only `stageName = groupKey.split('|')[0]`.
- **Cross-league conflict checks (Step 3):** `thisLgEvo`, `esEvo`, and both `shouldProtect`
  lower-league derivations now use `slotEvoTarget`/`stageTarget`.
- **Post-assignment passes:** every name-only evo derivation that participates in slot identity
  (slotWinners recording, the `slotEvo` deconfliction closure, nextBest `candidateEvo`/`slEvo`,
  and the "remove duplicate slots" `byEvo` key) now uses `slotEvoTarget`. **This was the main
  implementation risk** — see the stageName audit below.
- **Master pre-evo race:** the "no final evo present" branch now compares IV across all
  SAME-VARIANT family pre-evos (every form) instead of the form subgroup, so a strong
  capped-league pre-evo isn't pulled into Master for topping its own small subgroup.
- **Burmy carve-out:** `buildNickname` suppresses the evo-target form prefix when the target is a
  `FORM_SET_REQUIRED_EVOS` line and `specialForm` is unset (no `Plnt` nick). Added a `p.formUnset`
  flag (target needs a cloak, none set, max league rank ≥ 90); a `formUnset` decision branch
  (placed before `hasLeagueSlot` so a slot-winning Burmy is caught) → `review` + cloak reason; a
  `formUnset` re-pass guard; and `p.starType='formset'` placed high in the star ladder.

**`js/config.js`** — added `'Plant':'Plnt'` to `FORM_NICK_PREFIXES`; added
`FORM_SET_REQUIRED_EVOS = new Set(['Wormadam'])`.

**`js/analyse.js` FORM_SPLIT_FORMS** — added `'Midday'` (was asymmetric: Midnight/Dusk present,
Midday missing). NOTE: FORM_SPLIT_FORMS exists **once** (in `buildFamilyMap`), not duplicated —
the brief conflated it with STANDALONE_SPECIES (which is duplicated, and was not touched).

**`js/render.js`** — added the `formset` 📝 indicator after the swirl line.

**`css/styles.css`** — added `.star-formset` (amber "needs your input").

**`js/data.js`** — added `'Basculin|Hisui':['Basculegion']` to `VALID_EVOLUTIONS` (see Deviations).

**`RULES.md`** — documented form-aware evo-target identity, the Burmy→Wormadam carve-out, the
FORMSET star (0c in the ladder); version header bumped to v3.5.56.

**`index.html`** — version v3.5.55 → v3.5.56 (title + logo span).

**Tests** — appended the 11 fixture rows to `tests/poke_genie_fixture.csv`; added the
"Lycanroc form-aware evo-target identity (#39)" describe block (11 assertions + 1 `it.todo`) to
`tests/analyse.fixture.test.js`.

## stageName audit (Step 2 — the main risk)

`stageName` was made form-aware at the grouping key (line ~761). Inside the group loop it is
re-derived as **species-only** (`groupKey.split('|')[0]`) and a separate **form-aware**
`stageTarget` was added. Each existing use was classified:

| Use | Meaning | Kept |
|-----|---------|------|
| M `hasHigherEvo` (`m.name === stageName`) | species membership | species `stageName` |
| M pre-evo gate (`p.name !== stageName`) | species (pre-evo vs final) | species `stageName` |
| `finalEvosInGroup` / `maxPreEvoIV` filters (`m.name === stageName`) | species membership | species `stageName` |
| `targetEvo = stageName !== p.name ? …` | display target (species elsewhere too) | species `stageName` |
| `isFinalEvoStage` (`m.name === stageName`) | species membership | species `stageName` |
| `shouldProtect` `thisEvo` + alt | "thing this slot evolves into" | **form-aware `stageTarget`** |
| slotWinners / slotEvo / nextBest / byEvo dedup | slot identity | **form-aware `slotEvoTarget`** |
| `thisLgEvo`, `esEvo` (cross-league conflict) | "thing this slot evolves into" | **form-aware `slotEvoTarget`** |
| dimorphic lookup (`GENDER_DIMORPHIC.has(stageName)`) | species | guarded with `.split('|')[0]` |

## Why this addresses the brief

Lycanroc's three battle forms shared one species name (`evolvedNameG=evolvedNameU=evolvedNameL=
'Lycanroc'`); the form lived in `evolvedFormG/U/L` which slot-grouping and conflict logic never
read, so all three collapsed into one group and one Rockruff could hold Great-as-Midnight AND
Ultra-as-Midday. Making evo-target identity form-aware (`slotEvoTarget`) makes multi-FORM
evolutions resolve exactly like multi-SPECIES ones — three forms → three independent keeper slots
on three distinct physical Rockruffs. The Burmy→Wormadam carve-out is the deliberate inverse: the
cloak is unknowable pre-evolution, so we never emit the Pokégenie-default Plant nick and instead
surface a FORMSET review flag.

## Test results

- Full suite **GREEN: 732 passed, 36 skipped, 1 todo** (`cd pokevault-refactor && npm ci && npm test`).
- The 36 skips are pre-existing personal-export `it.skip`/`describe.skip` guards (unchanged count).
- The 11 new assertions (A1–A11) pass; A-todo (`Burmy with specialForm override`) left as `it.todo`
  per the brief.
- Step 4 (nick prefix) required **no nick-code change**: once Steps 2–3 split the forms,
  `evoFormsDiffer`/`evoFormPrefix` fire and produce `NightⒼ97`/`DayⓊ97`/`DuskⒼ95`.
- One pre-existing regression caught and fixed: `tests/analyse.review4.test.js` Group E (tracked
  `lycanroc_fixture.csv`) — CP531 (99% Great-as-Rockruff) was wrongly pulled into Master by the
  form-aware split; fixed by the SAME-VARIANT family-wide pre-evo IV comparison above.

## PR URL

https://github.com/mariellen/pokevault/pull/40

## Deviations

1. **`data.js` edited** (brief said READ-only except noted). The A6 regression asserts
   `evolvedNameU` matches `Basculegion`, but `VALID_EVOLUTIONS` had no Basculin entry, so the evo
   was dropped. Added `'Basculin|Hisui':['Basculegion']` (Burmy was NOT added to data.js, per the
   brief). This is the minimal data needed for the mandated regression.
2. **A6 assertion adapted.** The brief's A6 asserts `evolvedNameG` matches `/Basculin/`, but
   Great's `Name(G)=Basculin` equals the own species, so `validateEvo` returns `''` (stay-as-self)
   — `evolvedNameG` is empty by design. Re-expressed A6 with observable fields that prove the same
   split: `evolvedFormG==='Hisui'` (Great stays Hisui Basculin) vs `evolvedNameU~Basculegion` +
   `evolvedFormU==='Male'` (Ultra → Basculegion|Male).
3. **FORMSET star placed high, not "before swirl".** The brief said insert `else if (p.formUnset)`
   before the swirl branch (~1560). That position is dominated by GOLD (and RED for a favourited
   Burmy — CP203 is favourited), so A9 (`starType==='formset'`) would fail. Placed it right after
   `luckyNonWinner` so it overrides GOLD/RED, matching the test's intent. Documented as ladder rung
   0c in RULES.md.
4. **FORM_SPLIT_FORMS is not duplicated.** The brief said update "BOTH copies (~17/594)"; only one
   definition exists (line ~17). STANDALONE_SPECIES is the duplicated one, and it did not need
   editing for this change.

## Open questions

- **formUnset decision = `review`.** A keep-worthy unset female Burmy is surfaced as `review` (not
  `keep`) so the family's Master/keeper slot reflects "needs your input". If you'd prefer it stay a
  `keep` with the FORMSET star (still no Plant nick), that's a one-line change — flag it.
- **`FORM_SET_REQUIRED_EVOS` currently `{Wormadam}` only.** Other catch-locked-cosmetic evolutions
  (none currently mis-defaulted by Pokégenie that I'm aware of) can be added to the set as needed.
