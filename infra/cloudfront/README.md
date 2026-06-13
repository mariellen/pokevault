# infra/cloudfront — edge config: redirect, S3 cleanup, security headers

Brief: `briefs/refactor-redirect-cleanup.md` · Opus review: `reviews/refactor-redirect-cleanup-opus-pre.md`

Removes the stale `/pokevault-refactor/` build from production so mobile
browser history can no longer resurface the old app.

---

## Security headers (brief: csp-hardening, v3.5.47)

| File | What it is |
|---|---|
| `security-headers.json` | **Source of truth** for the production CSP + security response headers. The `<meta>` CSP in `index.html` is only a fallback; this header is authoritative. Holds the interim policy (`contentSecurityPolicy`, with `'unsafe-inline'` staged-retained) and the `targetPolicyAfterInlineMigration` (Opus end-state, no `'unsafe-inline'`). |
| `apply-security-headers.sh` | Renders + prints the CloudFront `ResponseHeadersPolicy` from the JSON. Requires an elevated infra/admin profile; associating the policy on the distribution is the final manual step. |
| `../../pokevault-refactor/tests/csp.test.js` | Jest assertions: inline-script removal, hardened CSP directives, base64/ZAP-10094 verdict, `esc()` XSS coverage, and that the artifact's target policy drops `'unsafe-inline'`. |

**Why no nonces:** static S3+CloudFront with no per-response edge compute → nonce-based CSP is not viable. We extract inline scripts to external files and (staged) migrate inline handlers to delegation instead. `'unsafe-inline'` removal is gated on that migration — see `reviews/csp-hardening-impl-summary.md` "Deviations".

## Files

| File | What it is |
|---|---|
| `redirect-refactor.js` | **Production artifact.** CloudFront Function (viewer-request). 301s any `/pokevault-refactor/*` request to `https://pokevault.mariellen.com.au/`. Pure cloudfront-js-2.0 — no exports. |
| `apply-redirect.sh` | Creates + publishes the function (needs elevated creds). Associating it on the distribution + invalidating is the final manual step. |
| `verify-gates.sh` | Read-only live verification of Opus gates 1-6 + captures the delete dry-run. Safe to re-run. |
| `../../pokevault-refactor/tests/cloudfront-redirect.test.js` | Jest unit tests for the redirect logic (gates 1-5 as code). Runs in `npx jest`. |

## Order of operations (do not reorder)

1. **Apply redirect first.** `AWS_PROFILE=<admin> ./apply-redirect.sh`, then associate the
   published function as a *viewer-request* `FunctionAssociation` on the distribution's
   DefaultCacheBehavior and `create-invalidation --paths "/*"`.
2. **Wait for propagation** (cache lag — a few minutes), then `./verify-gates.sh`. Gates 1-4 must pass.
3. **Only then** delete S3 files — and only with explicit human sign-off on the dry-run:
   - Confirm versioning: `aws s3api get-bucket-versioning --bucket pokevault.mariellen.com.au`
   - Review `/tmp/pokevault-refactor-dryrun.txt` — every line must be under `pokevault-refactor/`.
   - `aws s3 rm s3://pokevault.mariellen.com.au/pokevault-refactor/ --recursive`
   - Gate 7: `aws s3 ls s3://pokevault.mariellen.com.au/pokevault-refactor/ --recursive` → empty.
   - Gate 8: re-run `verify-gates.sh` → root still 200.

## Why the delete is not automated

Per the Opus review, `aws s3 rm --recursive` against production is irreversible and must
not be run unattended by an automated agent. The pipeline performs every non-mutating step
(unit tests, dry-run capture, gate checks) and stops at the delete for human sign-off.

## Credentials note

The default `pokevault-deploy` IAM user can delete S3 objects and invalidate CloudFront,
but **cannot** create/publish/associate CloudFront Functions or edit the distribution.
`apply-redirect.sh` therefore requires an elevated infra/admin profile.
