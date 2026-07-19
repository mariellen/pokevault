# Impl Summary — GO Fest 2026 Global costumes + alphabetized dropdowns (#77 follow-up) — v3.5.69

Follow-up to `reviews/issue-77-pikachu-costume-dropdown-impl-summary.md` (PR #78, v3.5.68). Mariellen
flagged the GO Fest 2026 Global costumes mid-review, plus asked to alphabetize the dropdown. These
additions were originally pushed to the #78 branch **after it had already merged**, so they never
reached main — re-applied here on `feature/gofest-2026-costumes-alphabetize` (PR #79).

## What changed
- **`js/data.js` — `FORM_DROPDOWNS` only:**
  - `Pikachu` — added GO Fest 2026 Global team hats: `Team Instinct Hat`, `Team Mystic Hat`,
    `Team Valor Hat`. List **alphabetized** (`'Unknown'` first, rest case-insensitive/numeric-aware,
    so `World Cap 2022 < 2023 < 2024 < 2025`).
  - `Pichu`, `Raichu` — alphabetized.
  - **Kanto starters** — GO Fest 2026 Global `Pikachu Visor`. The costume survives evolution, so all
    three stages of each family get a dropdown: Bulbasaur/Ivysaur/Venusaur,
    Charmander/Charmeleon/Charizard, Squirtle/Wartortle/Blastoise, each `['Unknown','Pikachu Visor']`.
- **`index.html`:** v3.5.68 → v3.5.69.

Alphabetical order was generated with a one-off script (not hand-sorted) and verified for zero
duplicates. Source: pokemonblog.com GO Fest 2026 Global article (12 Jul 2026) + theclick.gg tracker.

## Tradeoff (flagged for Mariellen)
The Kanto starters were free-text before; they're now focused `['Unknown','Pikachu Visor']` dropdowns.
A dropdown only offers what's listed — if any of those species need other costume labels (e.g. a
party-hat Squirtle), add them to the list. One-line additions.

## Tests
- **`tests/pikachu-costume-dropdown.test.js` (8):** team hats present; alphabetical invariant for
  Pikachu/Pichu/Raichu; Pichu/Raichu exact (alphabetized) lists; starter families carry Pikachu Visor
  across all 3 stages; plus the existing shape/render/regression checks.
- **848 passing.** 4 failures = the pre-existing untracked `tests/csp.test.js`.

## Why a separate PR
PR #78 merged before these commits landed, so they were stranded on the merged branch. This is a
clean re-application off current main with a proper version bump (v3.5.69), not a re-merge of #78.

## Version
v3.5.68 → v3.5.69.

## PR
https://github.com/mariellen/pokevault/pull/79
