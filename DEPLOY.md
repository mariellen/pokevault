# PokéVault — Deployment Guide

## Infrastructure

| Resource | Value |
|---|---|
| S3 bucket | `pokevault.mariellen.com.au` (ap-southeast-2) |
| CloudFront distribution ID | `E2IMCPUABUXY1Y` |
| Live URL | `https://pokevault.mariellen.com.au/pokevault-refactor/` |
| IAM deploy user | `pokevault-deploy` |
| AWS access key | `AKIA43QQLXVS4KBTEANO` (stored in `~/.aws/credentials` as `[default]`) |
| AWS region | `ap-southeast-2` |

## What lives where

The S3 bucket root contains the full `pokevault-refactor/` directory. The live app is served from:

```
s3://pokevault.mariellen.com.au/pokevault-refactor/
```

The root `js/` and `index.html` at the bucket root are stale — ignore them.

## Prerequisites

AWS CLI installed and `~/.aws/credentials` set to the `pokevault-deploy` key:

```ini
[default]
aws_access_key_id = AKIA43QQLXVS4KBTEANO
aws_secret_access_key = <secret — stored in password manager>
```

```ini
# ~/.aws/config
[default]
region = ap-southeast-2
output = json
```

## Full deploy (all files)

Run from the repo root (`C:\ClaudeCode\pokevault\`):

```bash
aws s3 sync pokevault-refactor/ s3://pokevault.mariellen.com.au/pokevault-refactor/ \
  --exclude "*.md" \
  --exclude "node_modules/*" \
  --exclude "tests/*" \
  --exclude "scripts/*" \
  --exclude "*.json"

aws cloudfront create-invalidation \
  --distribution-id E2IMCPUABUXY1Y \
  --paths "/*"
```

CloudFront invalidation takes 30–60 seconds. Hard-reload the browser (`Ctrl+Shift+R`) after it completes.

## Single-file deploy (faster, targeted)

To deploy only changed JS files (e.g. `auth.js` and `supabase.js`):

```bash
aws s3 cp pokevault-refactor/js/auth.js \
  s3://pokevault.mariellen.com.au/pokevault-refactor/js/auth.js \
  --content-type "application/javascript"

aws s3 cp pokevault-refactor/js/supabase.js \
  s3://pokevault.mariellen.com.au/pokevault-refactor/js/supabase.js \
  --content-type "application/javascript"

aws cloudfront create-invalidation \
  --distribution-id E2IMCPUABUXY1Y \
  --paths "/*"
```

Note: CloudFront requires paths to start with `/`. Single-path invalidations like
`/pokevault-refactor/js/auth.js` fail with `InvalidArgument` — always use `/*`.

## Common files to deploy

| File | S3 path |
|---|---|
| `js/auth.js` | `pokevault-refactor/js/auth.js` |
| `js/supabase.js` | `pokevault-refactor/js/supabase.js` |
| `js/app.js` | `pokevault-refactor/js/app.js` |
| `js/analyse.js` | `pokevault-refactor/js/analyse.js` |
| `js/render.js` | `pokevault-refactor/js/render.js` |
| `js/config.js` | `pokevault-refactor/js/config.js` |
| `js/data.js` | `pokevault-refactor/js/data.js` |
| `index.html` | `pokevault-refactor/index.html` |
| `css/styles.css` | `pokevault-refactor/css/styles.css` |

## IAM permissions

The `pokevault-deploy` user has least-privilege access:
- `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on `pokevault.mariellen.com.au/*`
- `cloudfront:CreateInvalidation` on distribution `E2IMCPUABUXY1Y`
- No `s3:ListAllMyBuckets`, no `cloudfront:ListDistributions`, no IAM access

To verify a file uploaded correctly:
```bash
aws s3 ls s3://pokevault.mariellen.com.au/pokevault-refactor/js/
```

## Supabase

No deploy step needed — Supabase is a managed service. Credentials are in:
- `pokevault-refactor/js/config.js` — `SUPABASE_URL` and `SUPABASE_KEY` (anon key)
- Project ref: `jsozfpsfvvnnmipsksoh`
- Dashboard: https://supabase.com/dashboard/project/jsozfpsfvvnnmipsksoh

## Source of truth

`pokevault-refactor/` is the canonical source. The single-file HTML files at the repo root
(`pokevault_v3_NNN.html`) are retired — do not edit or deploy them.
