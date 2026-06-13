ROUTE: OPUS-FIRST
BRIEF: nick-override
VERSION_TARGET: v3.5.48

# Brief — Nick Override (Inline Editing)

## Context
Users with established Pokégenie naming conventions face a switching cost
when adopting PokéVault — their renamed Pokémon in GO won't match
PokéVault's suggested nicks. The nick override feature removes this
barrier by letting users set their own nick per Pokémon, stored in the
overrides system.

This also enables the workflow:
1. PokéVault suggests a nick based on slot/IV analysis
2. User copies it, or overrides it to match their preferred format
3. Either way, they copy from PokéVault and paste into GO

## Questions for Opus to design before implementation

### 1. UI — how does inline editing work?
Options:
- Tap/click nick → text becomes editable inline → blur/enter saves
- Tap/click a small edit ✏ icon next to the nick → edit modal appears
- Both?

Recommendation: tap the nick directly to edit inline (faster, fewer taps).
Opus to confirm this is feasible and suggest the exact interaction.

### 2. Storage — where does the override nick live?
The existing overrides system stores per-Pokémon data in Supabase
(keyed by stableKey). Can the nick override be added as a field to the
existing overrides table, or does it need a separate store?

### 3. Display — how are overridden nicks distinguished?
Suggested: show overridden nicks in a different colour or with a small
indicator (e.g. ✏ icon) so the user knows it's a custom value, not the
suggested one.

### 4. Sync — does the override survive a fresh CSV upload?
When a new CSV is uploaded, overrides are reloaded from Supabase and
applied. The nick override should survive CSV uploads — it's a manual
decision, not derived from the CSV data.

### 5. Reset — can the user restore the suggested nick?
Yes — if a user overrides a nick and then wants the suggested one back,
they should be able to clear the override. A small "reset to suggested"
option in the edit UI.

## Output expected from Opus
- UI interaction design (tap to edit inline or edit icon?)
- Storage approach (extend existing overrides or new field?)
- Display approach (how to show overridden vs suggested)
- Sync and reset behaviour confirmed
- Any schema changes needed in Supabase
- Implementation complexity estimate
- Handoff to Claude Code once design is approved by Mariellen
