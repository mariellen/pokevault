ROUTE: DIRECT
BRIEF: refactor-redirect-cleanup
VERSION_TARGET: v3.5.46

# Brief — /pokevault-refactor/ Redirect + S3 Cleanup

## Context
Old files still exist under `/pokevault-refactor/` in the S3 bucket from
before the refactor was complete. On mobile, Mariellen occasionally lands
on the old version from browser history because the URL isn't fully
visible. A redirect and cleanup will prevent this.

## Task 1 — CloudFront redirect rule

Add a CloudFront function or redirect rule so any request to:
`/pokevault-refactor/*`
redirects to:
`https://pokevault.mariellen.com.au/`

Implement as a CloudFront redirect rule (not a Lambda — keep it simple).
Use a 301 permanent redirect.

## Task 2 — Delete old S3 files

Before deleting, confirm:
1. The deploy workflow (`deploy.yml`) does NOT reference `/pokevault-refactor/`
2. The live site at the bucket root is confirmed healthy

Then delete all files under `s3://pokevault.mariellen.com.au/pokevault-refactor/`

```bash
aws s3 rm s3://pokevault.mariellen.com.au/pokevault-refactor/ --recursive
```

Report back the file count deleted.

## Notes
- CloudFront distribution: E2IMCPUABUXY1Y
- Invalidate `/*` after applying redirect rule
- This is a non-code change — no version bump needed unless bundled
  with other changes in the same PR
