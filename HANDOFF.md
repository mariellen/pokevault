# PokéVault Handoff
_Last updated: 21 Jun 2026_

> **How to use this file**
> Open this whenever you come back to PokéVault.
> The top section always tells you what needs a human decision.
> Run `python pipeline.py --status` to reprint this in your terminal.

---

## 🔴 NEEDS YOU NOW

### Dmax/Gmax Rules (Issue #30)
**Status:** Ruleset fully defined (see Issue #30). Brief file needed at `briefs/dmax-gmax-league-rules-refinement.md` before pipeline dispatch.
**Owner:** YOU
**Next action:** Create brief locally, then dispatch via pipeline (OPUS-FIRST). Version target: v3.5.54.
_Updated: 21 Jun 2026_

### Dynamax Master Flag
**Status:** Implementation complete — Opus approved. PR #27 open, awaiting CI + merge.
**Owner:** YOU
**Next action:** Check CI is green on PR #27 then merge.
_Updated: 21 Jun 2026_

### GA4 Event Tracking
**Status:** PR #12 open — adds auth.js sign_in/sign_out tracking + 10-test tracking suite. GA4 helpers already shipped in PR #11. Minor conflict expected on version (both ga4 and sort bump to v3.5.47 from same base).
**Owner:** YOU
**Next action:** Review and merge https://github.com/mariellen/pokevault/pull/12
_Updated: 13 Jun 2026_

### Sort Scan Date
**Status:** PR #13 open — adds 19-test sort-scan-date suite. Sort helpers already shipped in PR #11. Version conflict note: bump to v3.5.47, same as PR #12 — whichever merges second needs a quick rebase to v3.5.48.
**Owner:** YOU
**Next action:** Review and merge https://github.com/mariellen/pokevault/pull/13
_Updated: 13 Jun 2026_

### Refactor Redirect Cleanup
**Status:** PR #10 open — CloudFront Function for /pokevault-refactor/* redirect + infra scaffolding.
**Owner:** YOU
**Next action:** Review and merge https://github.com/mariellen/pokevault/pull/10 (requires CloudFront deploy after merge)
_Updated: 13 Jun 2026_

---

## ⏳ WAITING FOR AN AGENT

<<<<<<< HEAD
### Bug Batch June 2026 — Bugs 3–7
**Status:** Bugs 1 & 2 implemented (v3.5.50). Bugs 3–7 have NO Opus guidance and are NOT implemented. Opus review was truncated after Bug 2. See `reviews/bug-batch-june-2026-impl-summary.md`.
=======
### Dmax/Gmax League Rules Refinement (#30, v3.5.54)
**Status:** Implementation complete — awaiting Opus post-check. Removed the spurious `|dynamax`
capped sub-group (PR #27 over-keep bug) so Dmax/Gmax now compete in the **main capped pool**
with a type-priority tiebreak (Shiny Gmax > Gmax > Shiny Dmax > Dmax > Shiny Normal > Normal);
added full Gigantamax Master parity (`wonGigantamaxMaster`), categorical Normal-Master
suppression when a family has any Gmax (hundo → grey star `NameⓇ{IV%}Ⓗ`; non-hundo → cull/review),
and Lucky-non-winner handling (`NameⓇ{IV%}`, no star, never traded). New `analyse.gmax_master.test.js`
(20 tests). Full suite green: **752 passed / 1 skipped**, only the unrelated untracked
`csp.test.js` fails (pre-existing, not in this branch). 3 documented deviations from Opus
(non-winner nick → `Ⓡ{IV%}`; no `masterDemoted` on Gmax suppression; raid Dmax/Gmax get no star)
+ 2 open questions — see `reviews/dmax-gmax-league-rules-refinement-impl-summary.md`.
**Owner:** PIPELINE
**Next action:** Opus post-check, then open PR for `feature/dmax-gmax-league-rules-refinement`
(PR URL pending push — gh CLI not installed). Resolve open question on `|lucky` pooling
(lone-Lucky-vs-higher-type).
_Updated: 21 Jun 2026_

### Dynamax Master Flag
**Status:** Implementation complete — awaiting Opus post-check. Engine + RULES.md already shipped in commit e63ca7a (v3.5.51); this pass verified behaviour against the Electabuzz golden case and closed two gaps in Opus's required-test list (added `dmax_excluded_from_regular_master` full form + `dmax_all_kept_none_traded`, 8→10 tests in analyse.dynamax_master.test.js). Full suite green: 713 passed / 1 skipped excluding the unrelated untracked csp.test.js.
>>>>>>> 6ec3d62 (feat(analyse): Dmax/Gmax capped-pool competition + Gmax Master parity (v3.5.54))
**Owner:** PIPELINE
**Next action:** Opus post-check from Bug 3 onwards. PR: https://github.com/mariellen/pokevault/pull/18
_Updated: 21 Jun 2026_

### Pipeline File Attachment
**Status:** Pre-review complete → see `reviews\pipeline-file-attachment-opus-pre.md`
**Owner:** YOU
**Next action:** Review findings, then press Enter to dispatch Claude Code (or Ctrl+C to pause)
_Updated: 14 Jun 2026 17:09_

### Playwright Expansion
**Status:** Pipeline complete · Opus says: **APPROVE WITH NOTES.**
**Owner:** YOU
**Next action:** Read `reviews\playwright-expansion-opus-post.md` and decide: approve merge or send back to Claude Code
_Updated: 13 Jun 2026 08:19_

### Csp Hardening
**Status:** Pipeline complete · Opus says: **APPROVE WITH NOTES.**
**Owner:** YOU
**Next action:** Read `reviews\csp-hardening-opus-post.md` and decide: approve merge or send back to Claude Code
_Updated: 12 Jun 2026 20:19_

---

## ✅ RECENTLY COMPLETED

- Bug 1 (Lucky Master winner → Ⓜ) + Bug 2 (shiny non-winner → Ⓡ) — v3.5.50
- Dmax/Gmax ruleset fully defined — Issue #30 (capped pool unification + Gmax Master + Lucky/Normal culling)
- Nick Override (v3.5.46) — merged as PR #11 · inline nick editing, applyNickOverride, rerenderNickCell
- CI/CD pipeline via GitHub Actions — merged, branch protection active (v3.5.44)
- Opus Review #6 security findings — all resolved
- Non-atomic save rewrite — complete
- Branching-evolution regression tests — complete
