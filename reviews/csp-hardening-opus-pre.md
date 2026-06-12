# Opus Pre-Implementation Review
_Generated: 12 Jun 2026 19:58_

# CSP Hardening Review — v3.5.47

**Note:** This brief asks investigative questions about files I cannot directly read in this session. The review below is structured as decision guidance plus a concrete investigation protocol. Where I make assumptions about file contents, they are flagged explicitly as **ASSUMPTION** and must be verified by the implementer before acting. Do not treat unverified assumptions as findings.

---

## Root Cause Analysis

`unsafe-inline` exists in the CSP for one of two reasons, and the fix path is completely different depending on which:

1. **Genuine inline `<script>` / `<style>` blocks** in `index.html` (or inline `style=""` / `onclick=""` attributes in markup). These force `unsafe-inline` because the browser cannot distinguish author-trusted inline code from injected code.
2. **Runtime-generated inline styles/scripts** — e.g. `element.style.x = ...`, `innerHTML` writes that contain `<style>` or event-handler attributes, or libraries that inject `<style>` tags.

The critical distinction:
- **`element.style.color = 'red'` (DOM style property) is NOT blocked by `style-src` CSP and does NOT require `unsafe-inline`.** This is the single most common false assumption in CSP hardening. Do not move working DOM-property style code anywhere — it's already CSP-clean.
- **`<div style="...">` attributes in HTML strings written via `innerHTML` ARE blocked** by `style-src 'unsafe-inline'` removal.

The base64/ZAP finding (rule 10094) is independent of CSP and is an information-disclosure issue, not an XSS issue. Treat it as a separate workstream.

---

## Risk Assessment

### Scope
This is platform/security infrastructure, not family-logic. **No Pokémon evolution family or PvP slot-assignment logic is touched by this brief.** If the implementer finds themselves editing `slots.js`, evolution family resolvers, or CP/IV calculators, they have gone off-scope — stop and re-scope.

The scope that matters here:
- `index.html` inline blocks (affects all pages/views uniformly).
- `render.js` innerHTML sites (affects every rendered collection card, search result, and detail panel — i.e. **every family**, so a regression here is high-blast-radius).

### Security implications
- Removing `unsafe-inline` is a **defence-in-depth hardening**, not a vulnerability fix. The real XSS defence is correct output encoding (`esc()`). **CSP is the second line, not the first.** Do not let CSP work distract from auditing actual interpolation sites (Question 4 is the highest-value item in this brief).
- A **nonce-based CSP requires the nonce to be generated per-response server-side** and injected into both the CSP header and every inline tag. **CloudFront cannot generate per-request nonces in a static-hosting setup without Lambda@Edge / CloudFront Functions.** If PokéVault is static-hosted on S3+CloudFront, nonce-based CSP is operationally expensive. **Recommend external-file extraction over nonces** for a static SPA. State this clearly to the implementer.
- Base64 in `config.js`: must verify whether it's an API key, signed URL token, analytics ID, or harmless encoded constant. **If it decodes to any credential, the fix is rotation + removal, not obfuscation.** Obfuscation of a real secret is a non-fix and must be rejected.

### Regression risk
- **Any test asserting on the CSP meta tag / header string** will break when the policy string changes. Find and update CSP-assertion tests.
- **Visual/DOM tests** that rely on inline `style=""` attributes in rendered HTML will break if those are migrated to classes.
- **The esc() helper (v3.5.37)** — any test that pins exact innerHTML output will break if you change interpolation patterns. Run the full render test suite.
- Removing inline event handlers (`onclick="..."`) and replacing with `addEventListener` can silently break handlers if the listener is attached before the element exists or after a re-render replaces the node. **High regression risk in `app.js` event wiring.**

---

## Implementation Guidance

### Phase 0 — Investigation (do this before any edit; produce findings, not fixes)
Run and record output:
```
grep -rn "<script" index.html
grep -rn "<style" index.html
grep -rn 'style="' index.html js/
grep -rn 'on[a-z]*="' index.html          # inline event handlers
grep -rn "innerHTML" js/render.js js/app.js
grep -rn "\.style\." js/                  # DOM style props — these are FINE, catalogue them as no-action
grep -rni "atob\|btoa\|base64" js/config.js js/
```
Classify every hit as: (a) genuine inline requiring `unsafe-inline`, (b) DOM property — no action, (c) innerHTML interpolation — audit for esc().

### Phase 1 — script-src
1. Move every genuine `<script>...</script>` block from `index.html` into a new file, e.g. `js/inline-bootstrap.js`, loaded via `<script src=...>`.
2. Replace all inline `onclick=`/`onchange=` handlers (`app.js`-wired markup and `render.js`-generated markup) with delegated `addEventListener` on a stable parent container, keyed by `data-action` attributes. Delegation survives re-renders; per-node listeners do not.
3. Only after zero inline scripts remain: remove `'unsafe-inline'` from `script-src`.

### Phase 2 — style-src
1. For inline `style=""` attributes in HTML-string templates inside `render.js`, migrate to CSS classes in an external stylesheet.
2. Leave `element.style.x = ...` DOM-property assignments untouched.
3. If a small number of truly dynamic styles remain (e.g. computed positioning), consider `style-src 'self'` plus setting via DOM property (which is exempt) rather than retaining `unsafe-inline`.

### Phase 3 — config.js base64 (ZAP 10094)
1. Decode the flagged value. Record what it is in the PR description.
2. Decision tree:
   - **Decodes to a secret/credential/token** → rotate the credential, remove from client bundle entirely, move to server/edge. Client code must never ship secrets. **Obfuscation is not acceptable.**
   - **Decodes to a non-sensitive constant** (public key, public config, encoded SVG, etc.) → acceptable; suppress the ZAP rule with a documented justification rather than changing code.
3. Do not "fix" this by re-encoding — ZAP will still flag it and it provides zero security.

### Phase 4 — XSS audit (highest priority)
For every `innerHTML` site in `render.js` / `app.js`, confirm **every** user-controlled or external value passes through `esc()`. User-controlled includes: nickname/custom tags, search query echoes, imported collection data (PoGO export JSON), URL params. **Imported data is the most likely missed vector** — values from a file/clipboard import often bypass the search-input escaping path.

### Phase 5 — Final CSP
Deliver as a CloudFront response-header (not meta tag). **Verify each directive against actual app dependencies before shipping** — the string below is a TEMPLATE, not a validated final answer:

```
default-src 'self';
script-src 'self';
style-src 'self';
img-src 'self' data: https:;        # data: only if base64 images genuinely used; https: only if remote sprite CDN used
connect-src 'self' https://<verified-api-host>;
font-src 'self';
object-src 'none';
base-uri 'self';
frame-ancestors 'none';
form-action 'self';
upgrade-insecure-requests
```
Implementer must replace `<verified-api-host>` with the real PokéAPI/sprite/analytics hosts found in `connect-src` audit (`grep -rn "fetch\|XMLHttpRequest\|\.src =" js/`). **Do not ship `img-src ... https:` (wildcard) if a specific sprite host can be enumerated** — tighten it.

---

## Required Tests

Before this fix is considered complete, all of the following must pass:

1. **No inline script test:** automated assert that `index.html` contains zero inline `<script>` content and zero `on*=` attributes (regex/DOM scan in test).
2. **No inline style-attr test:** assert generated render output (`render.js`) contains no `style="..."` attributes.
3. **CSP string test:** update existing CSP-assertion test(s) to the new policy; assert `unsafe-inline` is absent from both `script-src` and `style-src`.
4. **Full render suite:** existing `render.js` tests pass with new class-based markup (update fixtures intentionally, review each diff).
5. **Event delegation tests:** click/change handlers fire correctly **after a re-render** (regression test for delegation surviving DOM replacement) — for at least: add-to-PvP-slot action, search input, and collection card detail open.
6. **esc() coverage tests:** for each interpolation site, a test injecting `"><img src=x onerror=alert(1)>` as nickname, search query, **and imported collection field** produces escaped, inert output.
7. **config.js base64 test:** assert the flagged value is either absent from the bundle (secret case) or documented-as-public (constant case).
8. **Smoke test:** app loads under the new CSP with **zero CSP violation reports** in console (run against a real browser with the production header applied).

---

## Watch Points

- **DOM `.style` is not CSP-inline.** Do not migrate working `element.style.x` code — it wastes effort and risks regressions for zero security gain.
- **Nonces don't fit static CloudFront hosting.** If anyone proposes nonces, confirm whether there's an edge-compute layer first; default to external-file extraction.
- **Event delegation must attach to a parent that is never replaced.** If `render.js` replaces the whole container's innerHTML, listeners on children die. Attach to the stable ancestor, not the re-rendered node.
- **Imported collection data is the sneaky XSS vector.** The search-input esc() path does not necessarily cover values that arrive via PoGO JSON import. Audit that path explicitly.
- **Re-encoding base64 is theatre.** If it's a secret, it must be rotated and removed; encoding hides nothing from an attacker who reads the bundle.
- **`img-src https:` wildcard is sloppy** if the sprite host is enumerable — tighten before shipping.
- **CSP belongs at the CloudFront/edge layer**, but keep a matching meta-tag fallback only if there's a real risk of header stripping; otherwise the header is authoritative and a divergent meta tag becomes a future footgun.
- **Out of scope guardrail:** no evolution-family, PvP-slot, or CP/IV logic should be touched. If the diff reaches those files, stop.

**Confidence note:** The investigation protocol and decision trees are high-confidence and platform-standard. The specific findings (what the base64 is, which scripts are inline, the final host list in CSP) are **unverified** in this session and must be established by Phase 0 before implementation proceeds.