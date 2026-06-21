# PokéVault Coordinator Handover
_Last updated: 21 Jun 2026_

This document is the cross-session state file for the Coordinator Claude instance. It supplements `HANDOFF.md` (which tracks Mariellen-facing decisions) with context relevant to pipeline orchestration.

---

## Current Version

**v3.5.53**

---

## Infrastructure

### GitHub PAT
- Secret name: `pokevault-coordinator`
- Scope: `contents:write`, `issues:write`, `pull_requests:write`
- Status: Active and confirmed working (21 Jun 2026)
- Used by: Coordinator sessions via GitHub MCP

### Pipeline
- `pipeline.py` — orchestrates DIRECT vs OPUS-FIRST routing, file attachment support, `HANDOFF.md` status updates
- `RULES.md` — canonical single-source business rules reference (verified against `analyse.js`, `config.js`, `render.js`, `app.js`)
- CI/CD — GitHub Actions with Jest + Playwright + OWASP ZAP; auto-deploy on merge to main; branch protection active (PRs required, `test` check must pass)

### Branch protection note
Direct pushes to `main` are blocked. Coordinator must always create a branch + PR. Docs-only PRs will pass the `test` suite and can be merged immediately.

---

## Active Work

### Issue #30 — Dmax/Gmax League Rules Refinement
**Status:** Brief needed locally before pipeline dispatch
**Route:** OPUS-FIRST
**Brief location:** `briefs/dmax-gmax-league-rules-refinement.md` (to be created before dispatch)
**Summary of approved rules:**
- Capped leagues (GL/UL/LL): single pool, one slot per league. Type-priority tiebreak (Shiny Gmax > Normal Gmax > Shiny Dmax > Normal Dmax > Shiny Normal > Normal > Lucky dust tiebreak)
- Master League: three independent slots — Gmax winner (`NameM{IV%}X`), Dmax winner (`NameM{IV%}D`), Normal winner (suppressed if ANY Gmax exists in family)
- Hundo exception: loses M/star → `NameR{IV%}H`, keep, grey star
- Non-winners: Dmax → `NameR{IV%}D` keep no star; Gmax → `NameR{IV%}X` keep no star; Lucky (beaten by any type) → `NameR{IV%}` keep no star
- Engine: remove `|dynamax`/`|gigantamax` from capped `variantKey`, add type-priority tiebreak; add `wonGigantamaxMaster` flag mirroring `wonDynamaxMaster`
- Version bump target: v3.5.54
**Next action:** Create brief file, then dispatch via pipeline (OPUS-FIRST)
**See:** https://github.com/mariellen/pokevault/issues/30

### Bug Batch June 2026 — Bugs 3–7 (outstanding)
**Status:** Bugs 1 & 2 implemented (v3.5.50, PR #18 open). Bugs 3–7 have NO Opus guidance and are NOT implemented. Opus review was truncated after Bug 2.
**Blocked on:** Opus completing the review for Bugs 3–7
**See:** `reviews/bug-batch-june-2026-impl-summary.md`, PR #18

### PR #27 — Dynamax Master Flag
**Status:** Implementation complete, Opus approved. Awaiting CI green + merge by Mariellen.

---

## Open Issues Reference

| # | Title | Status |
|---|-------|--------|
| #19 | Nick truncation Unicode bug | Open |
| #20 | Filter lost on sort regression | Open |
| #21 | Tiebreak flickering | Open |
| #22–#25 | Engine edge cases (batch) | Open |
| #30 | Dmax/Gmax league rules refinement | Open — brief needed |

---

## Recently Completed

- v3.5.50 — Bug 1 (Lucky Master winner → Ⓜ) + Bug 2 (shiny non-winner → Ⓡ) implemented
- v3.5.53 — current version
- GA4 + GitHub MCP servers connected to Coordinator
- Coordinator PAT updated to `pokevault-coordinator`

---

## Notes for Next Coordinator

1. Always read `HANDOFF.md` first for Mariellen-facing decisions.
2. Check `RULES.md` before any engine interpretation question — it is source-verified.
3. Bug batch 3–7 needs Opus attention before any more implementation work.
4. Issue #30 (Dmax/Gmax) is the priority feature — brief must exist before pipeline dispatch.
5. Branch protection is active — always push to a branch and open a PR, never directly to main.
