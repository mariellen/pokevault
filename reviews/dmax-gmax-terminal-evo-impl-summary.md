# Impl Summary — Dmax/Gmax Nicks Use Terminal Evolution (#60) — v3.5.63

Brief: `briefs/ui-and-nick-fixes-batch.md` Fix 3 (#60). Implemented after the diagnosis was
confirmed against Mariellen's real CSV row.

## Root cause (corrected from the brief)
The brief said the dmax/gmax handlers "use `p.name` instead of the evolved target." They don't —
they already use `base = evolvedNameU||evolvedNameG||p.name`. The reported `ElectabuⓂ96Ⓓ` happens
because Pokégenie recommended **no PvP evolution** for that Electabuzz (`Name (G)`=`Name (U)`=
`Electabuzz`), so `evolvedName*` are empty and `base` correctly falls back to the species. A Dmax
is a raid power-up, so it should still show the final evolution.

## What changed
- **`js/analyse.js` — new `terminalEvo(name, form)`** resolves a species' single terminal
  evolution from `VALID_EVOLUTIONS`, form-aware:
  - Regional form (Alola/Galar/Hisui/Paldea) → `Name|Form` chain (Galar Meowth→Perrserker,
    Hisui Growlithe→Arcanine|Hisui).
  - Normal form → base chain **minus targets claimed by this species' regional form keys**, so
    Kanto Meowth→Persian (not the `Persian`/`Perrserker` union). Every other regional base key is
    already normal-only, so this exclusion only matters for Meowth — and it avoids changing the
    shared `'Meowth'` union that the form-blind family search in `app.js:362/651` relies on.
  - Branches to >1 terminal (Eevee) → returns the input name unchanged. Never guesses.
- **`js/analyse.js` — `buildNickname`:** for the `dynamax`/`gigantamax` slots only, when `base`
  fell back to `p.name`, set `base = terminalEvo(p.name, p.form)`. Master and capped-slot Dmax are
  untouched.
- **`index.html`:** v3.5.62 → **v3.5.63** (bare-number sed, so the `?v=` cache-bust strings bumped
  too — per the convention added in v3.5.62).
- **`RULES.md`:** Dynamax section documents the terminal-evo naming + scope.

## Scope decisions (confirmed with coordinator)
1. Branching families with no Pokégenie evo keep the base name (can't disambiguate safely).
2. A Dmax that also **wins a capped Great/Ultra slot** routes through the L/G/U handler and keeps
   its Pokégenie-recommended (possibly unevolved) name — only Master/slot-less Dmax+Gmax get the
   terminal-evo treatment. So the same species can read `Electabu` (Ultra pick) vs `Electivi`
   (raid pick) — different roles.

## Tests
- **802 passing** (+5 new `terminalEvo` guard tests: single-line, final, branching-Eevee,
  regional Galar/Hisui, Kanto-Meowth exclusion). 2 existing `analyse.dynamax_master.test.js`
  assertions updated `ElectabuⓂ96Ⓓ → ElectiviⓂ96Ⓓ` and `ElectabuⓇ87Ⓓ → ElectiviⓇ87Ⓓ`; the
  `ElectabuⓊ95Ⓓ` (Ultra-winner) assertion intentionally **unchanged** (confirms the scope).
- ⚠️ **4 failures remain — pre-existing & unrelated:** `tests/csp.test.js` (untracked CSP thread).
  Verified identical before/after.

## Manual checklist (for Mariellen)
1. A Dmax Electabuzz (kept for raids, no PvP evo recommended) now nicks `ElectiviⓂ96Ⓓ`.
2. A Dmax that wins an Ultra slot still shows the unevolved Ultra name.
3. Already-final Dmax (Snorlax, Charizard) unchanged.

## Deviations
- The brief's "apply evoDisplayName" was a no-op (base already = evolvedName||name); the real fix
  was terminal-evo resolution + the 2 fixture updates. #59/#61 shipped separately in v3.5.62.

## PR
https://github.com/mariellen/pokevault/pull/<TBD>
