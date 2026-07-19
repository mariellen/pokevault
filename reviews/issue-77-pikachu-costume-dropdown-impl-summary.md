# Impl Summary — Pikachu + GO Fest 2026 costume dropdowns (#77) — v3.5.68

Brief: `briefs/issue-77-pikachu-costume-dropdown.md` **plus** the GO Fest 2026 Global costumes
Mariellen flagged mid-review. **Urgent** (trading session today). Data-only.

## What changed
- **`js/data.js` — `FORM_DROPDOWNS` only:**
  - `Pikachu` — full theclick.gg tracker list **+ GO Fest 2026 Global team hats** (`Team Instinct
    Hat`, `Team Mystic Hat`, `Team Valor Hat`); **alphabetized** (`'Unknown'` first, rest
    case-insensitive/numeric-aware).
  - `Pichu`, `Raichu` — own lists, also alphabetized.
  - **Kanto starters** (GO Fest 2026 Global `Pikachu Visor`) — the costume survives evolution, so
    all three stages of each family get a dropdown: Bulbasaur/Ivysaur/Venusaur,
    Charmander/Charmeleon/Charizard, Squirtle/Wartortle/Blastoise, each `['Unknown','Pikachu Visor']`.
  - Each list starts with `'Unknown'`, matching the existing convention.
- **`index.html`:** v3.5.67 → v3.5.68.

## Tradeoff (flagged for Mariellen)
The Kanto starters were free-text before; they're now focused `['Unknown','Pikachu Visor']`
dropdowns. A dropdown only offers what's listed — if any of those species need other costume labels
(e.g. a party-hat Squirtle), add them to the list. Easy one-line additions.

No engine / analyse.js / render.js / app.js changes — the dropdown mechanism (override panel
`render.js:234` + Set Forms modal `app.js:2000`) already keys off `FORM_DROPDOWNS`. `COSTUME_SPECIES`
already listed Pikachu/Pichu/Raichu, so no change there.

## Deliberately not done (per brief)
- **Not** added to `COLLECTION_SETS` — 83 costumes, no completeness tracking wanted.
- **Not** added to `FORM_SEARCH` — costumes are manual labels for bulk tagging, not search targets.

## Notes
- Costume strings are manual, human-readable labels Mariellen sets herself (Pokégenie does not
  export costume data) — they only need to be consistent. Sources: theclick.gg tracker + the GO
  Fest 2026 Global article (pokemonblog.com, 12 Jul 2026).

## Tests
- **`tests/pikachu-costume-dropdown.test.js` (8):** Pikachu list shape (Unknown-first, ≥80, no
  duplicate labels, spot-checks); team hats present; alphabetical invariant for Pikachu/Pichu/Raichu;
  Pichu/Raichu exact lists; starter families carry Pikachu Visor across all 3 stages; existing
  dropdowns unchanged (Squawkabilly/Furfrou/Deerling); Pikachu renders a `<select>` in the override
  panel; a non-dropdown species (Rattata) still renders free-text.
- **848 passing**. 4 failures = the pre-existing untracked `tests/csp.test.js`.

## Manual checklist (for Mariellen)
1. Open a Pikachu row's override panel (and the 🎨 Set Forms modal) → costume dropdown appears.
2. Pick a costume → saves to Supabase `special_form`; the orange form tag shows it.
3. Squawkabilly/Furfrou/Deerling dropdowns still work.

## Version
v3.5.67 → v3.5.68.

## PR
https://github.com/mariellen/pokevault/pull/78
