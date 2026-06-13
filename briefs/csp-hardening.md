ROUTE: OPUS-FIRST
BRIEF: csp-hardening
VERSION_TARGET: v3.5.47

# Brief — CSP Header Hardening

## Context
The current Content Security Policy uses `unsafe-inline` for both
script-src and style-src. While necessary for some inline code, this
weakens the XSS protection CSP provides. OWASP ZAP also flagged a
Base64 disclosure in config.js.

## Questions for Opus to answer before implementation

1. **Can `unsafe-inline` be removed from script-src?**
   Review `index.html` and all JS files for inline scripts. Can they
   be moved to external files? Or can a nonce-based CSP be implemented?

2. **Can `unsafe-inline` be removed from style-src?**
   Review for inline styles. Same question — external file or nonce?

3. **Base64 disclosure in config.js (ZAP rule 10094)**
   What is the base64 value in config.js? Is it sensitive? Should it
   be removed, obfuscated, or is it acceptable?

4. **Are there remaining XSS vectors?**
   After the esc() helper added in v3.5.37, are there any remaining
   unescaped user input interpolation sites?

5. **Recommended CSP for production**
   Provide the final recommended CSP string for CloudFront (not meta tag)
   once unsafe-inline is removed or minimised.

## Files to review
- `index.html` — inline scripts and styles
- `js/config.js` — base64 value
- `js/render.js` — innerHTML interpolation sites
- `js/app.js` — any remaining inline event handlers

## Output expected from Opus
- Diagnosis of what's causing `unsafe-inline` requirement
- Recommended fix approach (nonce vs external files)
- Final CSP string
- Verdict on config.js base64 value
- Any remaining XSS sites not covered by current esc() usage
