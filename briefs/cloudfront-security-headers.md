ROUTE: OPUS-FIRST
BRIEF: cloudfront-security-headers
VERSION_TARGET: v3.5.47

# Brief — Move Security Headers to CloudFront

## Context
Security headers are currently implemented as `<meta>` tags in
`index.html`. HTTP response headers set by CloudFront are more secure
(can't be overridden by page content) and apply to all responses
including CSS, JS, and other assets — not just the HTML page.

## Questions for Opus

### 1. Which headers should move to CloudFront?
Current meta tags:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Content-Security-Policy` (complex — see note below)

Which of these are better as CloudFront response headers vs meta tags?

### 2. CSP consideration
CSP as a CloudFront response header is more powerful but also more
complex to manage. If the CSP hardening brief (csp-hardening.md) is
resolved first, the final CSP string should go to CloudFront.
Coordinate these two briefs — this one depends on csp-hardening.md.

### 3. CloudFront Response Headers Policy configuration
Produce the AWS CLI commands or console steps to:
1. Create a CloudFront Response Headers Policy with the recommended headers
2. Attach it to the existing distribution (E2IMCPUABUXY1Y)
3. Invalidate cache after applying

### 4. What stays as meta tags?
Some headers only work as HTTP headers (not meta tags) so moving them
to CloudFront is an upgrade. But some CSP directives may need to stay
as meta tags for technical reasons. Opus to clarify.

## Output expected from Opus
- List of headers to move to CloudFront vs keep as meta tags
- CloudFront Response Headers Policy JSON or AWS CLI commands
- Updated `index.html` with redundant meta tags removed
- Confirmation this doesn't break any existing functionality

## Dependencies
- Run after `csp-hardening.md` is resolved (CSP string needed first)
- CloudFront distribution: E2IMCPUABUXY1Y
