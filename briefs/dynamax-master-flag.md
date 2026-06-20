ROUTE: OPUS-FIRST
BRIEF: dynamax-master-flag
VERSION_TARGET: TBD

# Brief — Dynamax best-overall Master (Ⓜ) flag

## Context
Dynamax Pokémon are currently competing for capped league slots (GL/UL/LL)
alongside regular Pokémon. The best Dynamax should additionally be flagged
as the Master-level power-up candidate with Ⓜ in the nick.

## Files needed
- analyse.js
- RULES.md

## Approved rules

- **Best Dynamax by IV** → `NameⓂ{IV%}Ⓓ` — the one to power up to Master level
- **Other Dynamax that win a capped league slot** → `NameⒼ{rank}Ⓓ` / `NameⓊ{rank}Ⓓ` / `NameⒾ{rank}Ⓓ`
- **Other Dynamax with no slot** → `NameⓇ{IV%}Ⓓ` — keep as raid candidate
- The best-overall Dynamax gets Ⓜ even if another Dynamax wins a capped league slot
- Dynamax should NOT compete with regular Pokémon for capped league slots

## Real example (Electabuzz family)
- CP:1326, 96% IV → `ElectabuⓂ96Ⓓ` (best Dynamax, power up to Master)
- CP:1310, 89% IV → `ElectabuⓊ95Ⓓ` (if it wins Ultra slot independently)
- CP:1303, 87% IV → `ElectabuⓇ87Ⓓ` (no slot, keep as raid candidate)

## Questions for Opus
1. Does this require engine changes to `analyse.js` Dynamax slot assignment
   or is it purely a nick generation fix in the existing Dynamax nick path?
2. How does the best-Dynamax-Ⓜ interact with the existing `wonMasterSlot`
   logic — should it use the same flag or a separate `wonDynamaxMasterSlot`?
3. Should Dynamax compete with regular Pokémon for capped league slots at all?
   If not, how should they be separated?
4. What tests are needed?

## Output expected
- Root cause analysis and fix approach
- Diff or clear implementation guidance for Claude Code
- New test cases
- Flag any decisions needed from Mariellen before implementing
