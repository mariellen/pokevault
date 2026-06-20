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

### Bug Batch June 2026
**Status:** Implementation complete — awaiting Opus post-check. Implemented Bug 1 (Lucky Master winner → Ⓜ) and Bug 2 (shiny non-winner → Ⓡ) per Opus guidance; v3.5.50. ⚠️ Opus review provided was TRUNCATED after Bug 2 — Bugs 3–7 have NO Opus guidance and are NOT implemented. Bug 1's plain-loser→Ⓡ98 case is gated on the (un-reviewed, Mariellen-sign-off) Bug 3 decision and left as a skipped test. See `reviews/bug-batch-june-2026-impl-summary.md`. Suite green (683 pass; 4 pre-existing csp.test.js fails are unrelated).
**Owner:** PIPELINE
**Next action:** Opus post-check the Bug 1/Bug 2 fixes, then supply the completed review for Bugs 3–7. PR: _(to be filled after push)_
_Updated: 20 Jun 2026_

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

- Nick Override (v3.5.46) — merged as PR #11 · inline nick editing, applyNickOverride, rerenderNickCell
- CI/CD pipeline via GitHub Actions — merged, branch protection active (v3.5.44)
- Opus Review #6 security findings — all resolved
- Non-atomic save rewrite — complete
- Branching-evolution regression tests — complete
