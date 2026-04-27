# \# PokéVault — Pending Changes Log

# 

# > Captured during claude.ai session, April 2026. Hand off to next session or Claude Code as needed.

# 

# \---

# 

# \## Small UI improvements

# 

# \### ✕ clear button in search box

# Add an × button inside the search input to clear the text in one tap. May already be implemented in the refactor — check before building. If not in refactor, add to both HTML and refactor.

# 

# \---

# 

# \## Bugs to fix

# 

# \### + Fam search string — regional form names

# The 🔍 + Fam button builds a comma-joined search string of all family species names (e.g. `Geodude,Graveler,Golem`). Regional variants like `Rattata (Alola)` or `Grimer (Alola)` may not concatenate correctly — the parentheses or space in the name likely breaks the Pokégenie search string. Claude Code flagged this previously. Needs investigation and a sanitisation step on the name before joining (strip form suffix, or use base name only).

# 

# \---

# 

# \## Features to build

# 

# \### Shiny naming convention

# Shiny nicks should follow the Lucky pattern:

# \- If the shiny qualifies for a league slot → use the league nick with `※` suffix

# \- If no league slot → use `NameⓇIV%※` format  

# \- Ticking the shiny override should regenerate the nick immediately (already works for other flags, confirm for shiny)

# \- If a red-starred record is being kept because it's shiny, the nick should regenerate to reflect that

# 

# \### Dynamax / Gigantamax suffixes

# \- Gigantamax → `Ⓧ` suffix (circled X)

# \- Dynamax → `Ⓓ` suffix (circled D)

# \- Do alongside shiny nick work (same session)

# 

# \### Individual Pokémon 🔍 search button — already built in v3.140

# \- Main row: copies `name\&cp{N}` e.g. `snorlax\&cp450` ✅

# \- Purify modal: copies `name\&cp{N}\&shadow` e.g. `snorlax\&cp450\&shadow` ✅

# 

# \---

# 

# \## Design discussions

# 

# \### Best Moves — conversational advisor

# \- Starting point: one specific Pokémon + one league

# \- User provides current moves (Pokégenie scanning unreliable for moves)

# \- User states constraints: elite TM availability, legacy/CD moves

# \- Claude asks follow-up questions conversationally

# \- Narrative: "if you can't use an elite TM, your best bet is X"

# \- Build moves database in background; surface personalised recommendations

# \- MVP prototype already built as a claude.ai artifact (chat panel)

# \- Next step: integrate into PokéVault as a slide-in panel with collection context injected

# 

# \### Naming convention configuration

# \- User talks through their preferred naming style conversationally

# \- Maybe upload a sample of their existing named Pokémon so AI can extrapolate the rules

# \- Would need to be refactored per-user (big job, post-MVP)

# \- Current naming logic is hardcoded — making it user-configurable is a significant refactor

# 

# \### Shadow purify modal — rescan reminder

# \- Rank estimates in the purify modal are approximate (heuristic, not full rank table recalculation)

# \- ⚠ warning already shown in modal

# \- User should always rescan in Pokégenie after purifying to get accurate ranks

# \- After rescan + reimport, PokéVault will show correct nick and slot assignment automatically

# 

\### fusion - help the user decide which pokemon to "fuse" together

# \---

# 

# \## Notes for Claude Code

# 

# \- See `ANALYSE\_JS\_DIFFS\_v2.md` for all analysis engine fixes (12 total, priority ordered)

# \- See `SUPABASE\_AUTH\_PLAN.md` for auth/RLS/Stripe work — Phase 1 first, zero risk

# \- See `INTERACTIONS\_PROTOTYPE\_PLAN.md` for the moves advisor and onboarding wizard plan

# \- Single-file HTML (`pokevault\_v3\_142.html`) is always ahead of the refactor — port HTML → refactor only



