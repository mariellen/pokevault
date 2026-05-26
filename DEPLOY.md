# PokéVault — Deployment Guide

## Infrastructure

| Resource | Value |
|---|---|
| S3 bucket | `pokevault.mariellen.com.au` (ap-southeast-2) |
| CloudFront distribution ID | `E2IMCPUABUXY1Y` |
| Live URL | `https://pokevault.mariellen.com.au/` |
| IAM deploy user | `pokevault-deploy` |
| AWS access key | `AKIA43QQLXVS4KBTEANO` (stored in `~/.aws/credentials` as `[default]`) |
| AWS region | `ap-southeast-2` |

## What lives where

The contents of `pokevault-refactor/` are deployed directly to the **S3 bucket root**. The live app is at:

```
https://pokevault.mariellen.com.au/
```

> ⚠️ **IMPORTANT** — always sync to the **bucket root**, not to `/pokevault-refactor/`.
> The `/pokevault-refactor/` S3 prefix is a stale redirect — deploying there will NOT update the live site.

Source → S3 mapping:
- `pokevault-refactor/index.html` → `s3://pokevault.mariellen.com.au/index.html`
- `pokevault-refactor/js/app.js` → `s3://pokevault.mariellen.com.au/js/app.js`
- etc.

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

## Pre-deploy checklist

- [ ] **Increment the version number** in `pokevault-refactor/index.html` `<title>` tag (e.g. `PokéVault v3.5.19` → `v3.5.20`) — every deployment must bump the version so users and Claude can tell which build is live.

## Full deploy (all files)

Run from the repo root (`C:\ClaudeCode\pokevault\`):

```bash
aws s3 sync pokevault-refactor/ s3://pokevault.mariellen.com.au/ \
  --exclude "*.md" \
  --exclude "node_modules/*" \
  --exclude "tests/*" \
  --exclude "scripts/*" \
  --exclude "*.json"

aws cloudfront create-invalidation \
  --distribution-id E2IMCPUABUXY1Y \
  --paths "/*"
```

Note the target is `s3://pokevault.mariellen.com.au/` — **no subfolder**.

CloudFront invalidation takes 30–60 seconds. Hard-reload the browser (`Ctrl+Shift+R`) after it completes.

## Single-file deploy (faster, targeted)

To deploy only changed JS files (e.g. `auth.js` and `supabase.js`):

```bash
aws s3 cp pokevault-refactor/js/auth.js \
  s3://pokevault.mariellen.com.au/js/auth.js \
  --content-type "application/javascript"

aws s3 cp pokevault-refactor/js/supabase.js \
  s3://pokevault.mariellen.com.au/js/supabase.js \
  --content-type "application/javascript"

aws cloudfront create-invalidation \
  --distribution-id E2IMCPUABUXY1Y \
  --paths "/*"
```

Note: CloudFront requires paths to start with `/`. Single-path invalidations like
`/pokevault-refactor/js/auth.js` fail with `InvalidArgument` — always use `/*`.

## Common files to deploy

| Local path | S3 path (bucket root) |
|---|---|
| `pokevault-refactor/js/auth.js` | `js/auth.js` |
| `pokevault-refactor/js/supabase.js` | `js/supabase.js` |
| `pokevault-refactor/js/app.js` | `js/app.js` |
| `pokevault-refactor/js/analyse.js` | `js/analyse.js` |
| `pokevault-refactor/js/render.js` | `js/render.js` |
| `pokevault-refactor/js/config.js` | `js/config.js` |
| `pokevault-refactor/js/data.js` | `js/data.js` |
| `pokevault-refactor/js/pokemon_go_base_stats.js` | `js/pokemon_go_base_stats.js` |
| `pokevault-refactor/index.html` | `index.html` |
| `pokevault-refactor/css/styles.css` | `css/styles.css` |

## IAM permissions

The `pokevault-deploy` user has least-privilege access:
- `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on `pokevault.mariellen.com.au/*`
- `cloudfront:CreateInvalidation` on distribution `E2IMCPUABUXY1Y`
- No `s3:ListAllMyBuckets`, no `cloudfront:ListDistributions`, no IAM access

To verify a file uploaded correctly:
```bash
aws s3 ls s3://pokevault.mariellen.com.au/js/
```

## Supabase

No deploy step needed — Supabase is a managed service. Credentials are in:
- `pokevault-refactor/js/config.js` — `SUPABASE_URL` and `SUPABASE_KEY` (anon key)
- Project ref: `jsozfpsfvvnnmipsksoh`
- Dashboard: https://supabase.com/dashboard/project/jsozfpsfvvnnmipsksoh

## Source of truth

`pokevault-refactor/` is the canonical source. The single-file HTML files at the repo root
(`pokevault_v3_NNN.html`) are retired — do not edit or deploy them.
