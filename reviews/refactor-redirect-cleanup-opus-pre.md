# Opus Pre-Implementation Review
_Generated: 12 Jun 2026 19:50_

## Root Cause Analysis

There is **no application bug here**. This is an infrastructure cleanup brief, not a code defect. Stale build artifacts from an in-progress refactor were left under `/pokevault-refactor/` in the production S3 bucket. Because they remain web-accessible via CloudFront, browser history on mobile can resurface the old, unmaintained version of the app. The "root cause" is an incomplete deploy hygiene step: the refactor promotion to bucket root never cleaned up the old prefix.

I want to flag the routing here before any implementation: this brief is marked `ROUTE: DIRECT` and asks for live mutations against production CloudFront (`E2IMCPUABUXY1Y`) and an irreversible recursive S3 delete. My role is architecture and security review for application logic — PvP slot assignment, evolution families, the test suite. **None of my domain expertise applies to this task, and I cannot validate the safety of destructive infra commands.** Proceed with caution; see Watch Points.

## Risk Assessment

- **Scope:** No Pokémon families, evolution logic, or PvP slot code is touched. Zero application surface area. The affected surface is entirely deploy/CDN/S3.
- **Security implications:**
  - `aws s3 rm --recursive` against a production bucket is **destructive and unguarded**. A mistyped prefix (e.g., dropping the trailing path segment) deletes the live site. There is no dry-run in the brief as written.
  - A blanket redirect rule on `/pokevault-refactor/*` is low-risk, but a malformed CloudFront function pattern could over-match and redirect-loop legitimate paths.
  - Confirm the executing AWS credentials are scoped to this bucket/distribution only. A broadly-privileged CI token running an unscoped delete is the real exposure.
- **Regression risk:** No unit/integration tests cover infra. The genuine regression risk is **operational**: deleting files the live root still depends on (shared assets, fonts, sprite sheets referenced by absolute `/pokevault-refactor/...` paths). Verify the live root does not load any asset from that prefix before deleting.

## Implementation Guidance

This is not a code-implementation task in the usual sense. Concrete steps:

**Task 1 — Redirect**
- Add a CloudFront Function (viewer-request) or a redirect via the distribution config for `E2IMCPUABUXY1Y`. The brief says "redirect rule, not Lambda" — use a lightweight **CloudFront Function**, not Lambda@Edge.
- Match `^/pokevault-refactor/` (anchored, with leading slash) and return HTTP 301 with `Location: https://pokevault.mariellen.com.au/`.
- Keep the function file in the repo (e.g., `infra/cloudfront/redirect-refactor.js`) so it is reviewable and version-controlled — do not hand-edit only in the console.
- Invalidate `/*` after attaching the function.

**Task 2 — S3 cleanup (gated)**
1. Grep the deploy workflow: `grep -ri "pokevault-refactor" .github/workflows/deploy.yml` — must return nothing.
2. Confirm live root health (HTTP 200, app loads, no console 404s for `/pokevault-refactor/` assets).
3. **Run a dry-run first:** `aws s3 rm s3://pokevault.mariellen.com.au/pokevault-refactor/ --recursive --dryrun` and capture the output.
4. Only after the dry-run list is reviewed and matches expectations, run the real delete.
5. Report the deleted file count (derived from the dry-run/delete output).

## Required Tests

There is no automated test harness for this. Required verification gates (all must pass before "done"):

1. `curl -sI https://pokevault.mariellen.com.au/pokevault-refactor/index.html` returns **301** with `Location: https://pokevault.mariellen.com.au/`.
2. `curl -sI https://pokevault.mariellen.com.au/pokevault-refactor/anything/deep/path` also returns **301** (pattern matches subpaths).
3. `curl -sI https://pokevault.mariellen.com.au/` returns **200** and the app's normal entry point — confirm the redirect does **not** over-match the root.
4. Spot-check 2–3 real app routes (not under the refactor prefix) still return 200 — no redirect loop or collateral matching.
5. `grep -ri "pokevault-refactor" .github/workflows/deploy.yml` returns empty.
6. The `--dryrun` delete output is captured and reviewed before the real delete.
7. Post-delete: `aws s3 ls s3://pokevault.mariellen.com.au/pokevault-refactor/ --recursive` returns empty.
8. Post-delete: re-run gate #3 — live root still 200.

## Watch Points

- **Irreversible delete:** S3 `rm --recursive` has no undo unless versioning is enabled. **Confirm bucket versioning status first.** If versioning is off, the dry-run gate is mandatory, not optional.
- **Trailing-slash / prefix precision:** The delete targets the `pokevault-refactor/` prefix. Do not let shell autocomplete or a missing slash widen the scope. Never run this command against the bare bucket root.
- **Redirect ordering bug:** Ensure the redirect runs as **viewer-request** and that the match is anchored (`/pokevault-refactor/`). An unanchored `pokevault-refactor` substring could theoretically match a query string or a similarly-named future path.
- **Cache lag:** After invalidation, the 301 may take a few minutes to propagate. Test gates 1–4 *after* the invalidation completes, not immediately.
- **Order of operations:** Apply and verify the redirect **before** deleting files. If you delete first, users hitting the old URL get raw 404s/AccessDenied instead of a clean redirect during the propagation window.
- **Version bump:** Per the brief, no bump needed unless bundled with code changes. Since this should be infra-only, keep it out of `v3.5.46` application changes — do not co-mingle this with an app PR, or you'll couple an irreversible infra action to a code review cycle.
- **Routing concern:** This `DIRECT`-routed brief asks an application-logic reviewer to authorize production infra mutations. Whoever executes the live `aws` commands should have explicit human sign-off on the dry-run output — do not let an automated agent run the destructive delete unattended.