# Implementation Summary — refactor-redirect-cleanup (v3.5.46, infra-only)

_Implemented by PIPELINE · 12 Jun 2026_

## What & why

The stale `/pokevault-refactor/` build prefix could resurface the old app from
mobile browser history. The brief asked for (1) a CloudFront 301 redirect from
`/pokevault-refactor/*` → site root, and (2) deletion of the old S3 files under
that prefix. Per the Opus pre-review, this is infra-only (zero application
surface) and the destructive S3 delete must be **human-gated, not run unattended
by an automated agent**. I implemented every non-mutating step and gated the
irreversible ones.

## Files added

| File | Purpose |
|---|---|
| `infra/cloudfront/redirect-refactor.js` | **Production artifact** — CloudFront Function (viewer-request, cloudfront-js-2.0). 301s `/pokevault-refactor/*` and the bare `/pokevault-refactor` to `https://pokevault.mariellen.com.au/`. Anchored match (`indexOf(...)===0` / exact equality) so look-alikes (`/pokevault-refactored/`, `/pokevault-refactor-v2/`) and query strings don't match. Pure — no exports — so it deploys verbatim. |
| `infra/cloudfront/apply-redirect.sh` | Creates + publishes the function (needs elevated creds; see below). |
| `infra/cloudfront/verify-gates.sh` | Read-only live gate checks (Opus gates 1–6) + captures the delete dry-run. Safe to re-run; performs **no** delete. |
| `infra/cloudfront/README.md` | Runbook + strict order of operations. |
| `pokevault-refactor/tests/cloudfront-redirect.test.js` | **Tests (written first, TDD)** — 17 unit tests covering Opus gates 1–5 as deterministic logic. |

No application code touched. No version bump to app (`v3.5.46` is infra-only, kept
out of any app PR per Opus watch point).

## Tests (TDD — written before implementation)

- Wrote `cloudfront-redirect.test.js` first → confirmed **red** (15 failed, function file absent).
- Added `redirect-refactor.js` → **green** (17/17).
- The test loads the production function via a `vm` sandbox so the deployable file
  stays pure. Coverage maps to Opus Required Tests:
  - Gate 1 — `/pokevault-refactor/index.html` and bare `/pokevault-refactor` → 301 + `Location` = live root.
  - Gate 2 — deep subpaths (`/pokevault-refactor/anything/deep/path`, `/pokevault-refactor/js/app.js`) → 301.
  - Gate 3 — root `/` passes through (no over-match / no loop).
  - Gate 4 — real routes (`/index.html`, `/js/app.js`, `/css/styles.css`, `/favicon.ico`) + look-alike prefixes pass through.
  - Gate 5 — `deploy.yml` has no `s3://…/pokevault-refactor/` **destination**.

### Full suite result

`npx jest` → **22 suites passed, 611 passed, 1 skipped** (the 1 skip is pre-existing).

## Live checks performed (read-only / non-destructive)

Ran with the live `pokevault-deploy` credentials (`sts get-caller-identity` confirmed
`arn:…:user/pokevault-deploy`, account `883723844965`):

| Check | Result |
|---|---|
| `aws s3 ls …/pokevault-refactor/ --recursive` | **empty (0 objects)** |
| `aws s3 rm …/pokevault-refactor/ --recursive --dryrun` | **0 objects** (captured to `/tmp/pokevault-refactor-dryrun.txt`) |
| `aws s3 ls …/` (root) | populated & healthy (index.html, js/, css/, …) — confirms ListBucket works, so the empty prefix is genuine, not a silent deny |
| `curl -I …/pokevault-refactor/index.html` | **404** (no objects, redirect not yet attached) |
| `curl -I …/` (root) | **200** (live root healthy — Opus gate 3/8) |
| Gate 5 grep of `deploy.yml` | no S3 prefix destination |

### ⇒ Task 2 file count deleted: **0**

The `/pokevault-refactor/` S3 prefix is **already empty** — there are no objects to
delete. DEPLOY.md describes it as a "stale redirect"; whatever objects once existed
are already gone. The real delete was therefore correctly a no-op and was not run.

## What is NOT done (intentionally gated / blocked) — needs human / elevated action

1. **Attaching the redirect to CloudFront** — `create-function` / `publish-function` /
   distribution `FunctionAssociation` require CloudFront perms the `pokevault-deploy`
   IAM user **does not have** (it has only `cloudfront:CreateInvalidation`, per
   DEPLOY.md IAM note). Run `infra/cloudfront/apply-redirect.sh` with an elevated
   infra/admin profile, associate as viewer-request on the DefaultCacheBehavior, then
   `create-invalidation --paths "/*"`. After propagation, run `verify-gates.sh` for
   live gates 1–4.
2. **Real S3 delete** — not run. It is a no-op (0 objects) and, per Opus, a destructive
   recursive delete must not be executed unattended by an automated agent. Kept behind
   the human-sign-off step in `verify-gates.sh` / README.

## Deviations from Opus guidance (and why)

1. **Gate 5 literal grep relaxed to intent.** Opus said
   `grep -ri "pokevault-refactor" .github/workflows/deploy.yml` must be empty. That is
   impossible as written: `deploy.yml` legitimately uses `pokevault-refactor/` as the
   **local source directory** that syncs to the bucket **root**
   (`aws s3 sync pokevault-refactor/ s3://…/`). The meaningful invariant is that no S3
   **destination** points at the prefix. The test asserts that intent
   (`/s3:\/\/[^\s]*\/pokevault-refactor\//` absent) and also asserts the legitimate
   root-sync is present.
2. **Function file kept pure (no `module.exports`).** CloudFront's cloudfront-js-2.0
   runtime rejects Node exports, so the test loads `handler` via a `vm` sandbox instead.
3. **Live mutations (function attach, delete, `/*` invalidation) not executed.** Blocked
   by credential scope (function attach) and by the Opus "no unattended destructive
   delete" rule (the delete — also moot since the prefix is empty). Delivered as
   version-controlled, reviewable scripts + runbook instead of console-only changes,
   per Opus.

## Hand-off checklist for the operator

- [ ] `AWS_PROFILE=<admin> infra/cloudfront/apply-redirect.sh`, then associate the
      published function (viewer-request, DefaultCacheBehavior) and invalidate `/*`.
- [ ] `infra/cloudfront/verify-gates.sh` → gates 1–4 pass after propagation.
- [ ] S3 delete is a no-op (0 objects); gate 7 (`aws s3 ls …/pokevault-refactor/`) is
      already empty. No delete required unless objects reappear.
