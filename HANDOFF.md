# PokéVault Handoff
_Last updated: 13 Jun 2026_

> **How to use this file**
> Open this whenever you come back to PokéVault.
> The top section always tells you what needs a human decision.
> Run `python pipeline.py --status` to reprint this in your terminal.

---

## 🔴 NEEDS YOU NOW

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

### Eevee Master + Dynamax Regression
**Status:** Implementation complete — awaiting Opus post-check. v3.5.49 on branch `feature/eevee-master-dynamax-regression`. Opus pre-review was blocked (files not attached), so the trace was done in Claude Code. Issue 1 (Glaceon Master `…98m` placeholder) was already fixed by the prior Jolteon `hasBattleSlot` reset — only the missing non-shiny-Glaceon Master test was added. Issue 2 (Dynamax not separated per Eevee evolution) was a real bug: Dmax/Gmax pools keyed by `p.name` collapsed branching Eevees into one pool — fixed by keying on evolution target. New `analyse.eevee_master.test.js` (12 tests). Engine suites 322/322; the 4 pre-existing `csp.test.js` failures are unrelated (separate CSP thread).
**Owner:** PIPELINE
**Next action:** Push branch, open PR, run Opus post-review — see `reviews/eevee-master-dynamax-regression-impl-summary.md`
_Updated: 13 Jun 2026_

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

- Nick Override (v3.5.46) — merged as PR #11 · inline nick editing, applyNickOverride, rerenderNickCell
- CI/CD pipeline via GitHub Actions — merged, branch protection active (v3.5.44)
- Opus Review #6 security findings — all resolved
- Non-atomic save rewrite — complete
- Branching-evolution regression tests — complete
