# Impl Summary — Purify indicator dedup (#73) + Mobile override panel wrap (#74) — v3.5.67

Brief: `briefs/issue-73-74-purify-dedup-and-mobile-override-wrap.md`. Two independent fixes.

## ⚠️ Fix 1 deviates from the brief's stated mechanism — you chose the criterion

The brief said "keep the **highest `purifyRankPct`**", but its own desired output keeps
`AurorusⓊ95p` over `AmauⒼ100p` (95 < 100) — so highest-rank is provably not the real rule. I
surfaced this and you chose **best per evolution target** (option 1 of the three I laid out):

- One purify `p` per **final evolution target** (`terminalEvo(evolvedNameU||G||L||name)`).
- Pre-evos collapse into the evolved keeper (three shadow Amaura + one Aurorus → only the evolved
  Aurorus keeps `p`).
- **Branching families keep one per distinct target** — a shadow Eevee bound for Vaporeon **and**
  one bound for Umbreon each keep their `p`. (Options 2 "strictly one per family" and 3 "highest
  rank" would have wrongly collapsed Eevee to a single keeper — you rejected those for that reason.)
- Within a target the keeper is: already-evolved form first, then higher `purifyRankPct`, then IV.

## What changed

- **`js/analyse.js` (#73):** new `dedupePurifyCandidates(parsed)` (defined after `simulatePurify`).
  The purify loop was split: `parsed.forEach(simulatePurify)` → `dedupePurifyCandidates(parsed)` →
  the existing slot-push. Running the dedup **before** the slot-push means losers never get a
  spurious confirmed purify slot. Losers have `purifyLeague` cleared (`''`) and `isPurifySlot=false`,
  which drops the `p` suffix, the review purify nick, and the purify-modal entry (all gate on
  `purifyLeague`/`isPurifySlot`).
- **`js/render.js` (#74):** the override-panel `<div>` gets `class="override-panel"`.
- **`css/styles.css` (#74):** mobile (`≤600px`) rule
  `.override-panel{position:sticky;left:0;max-width:calc(100vw - 16px);box-sizing:border-box}`.
- **`index.html`:** v3.5.65 → v3.5.67 (skips 3.5.66 — see Version).
- **`RULES.md` (root) §7:** documents the dedup.

## Deviation on Fix 2 (informational — no decision needed)

The brief said "add `flex-wrap:wrap` to the override panel". It was **already there** inline
(render.js). The real cause of horizontal scroll is that the panel lives in a `<td colspan=12>`
inside the horizontally-scrollable results table, so `flex-wrap` wrapped it to the wide *table*
width, not the screen. The effective fix pins the panel to the viewport (`position:sticky;left:0`)
and caps its width, so the controls reflow within the screen.

## Tests

- **New `tests/analyse.purify-dedup.test.js` (5):** Amaura/Aurorus collapse to the evolved keeper;
  single-candidate unchanged; no-candidate unchanged; branching Eevee (→Vaporeon vs →Jolteon) keeps
  both; same-target two evolved copies → higher purified rank wins. Assertions are on
  `purifyLeague`/`isPurifySlot` (the M-league IV+2 path makes raw nicks noisy; fixtures use IV≥90 to
  suppress it).
- **New `tests/mobile-override-panel.test.js` (2):** `.override-panel` class in `buildRow` output +
  the mobile CSS rule (sticky + `max-width:calc(100vw…)`).
- **Updated `tests/analyse.fixture.test.js` Groups 7 & 17:** the fixture's pre-evo Gastly CP:82
  (Great, purify→Haunter) now correctly collapses into the evolved **Gengar CP:1327** keeper (same
  terminal evo). The two Gastly assertions were flipped to assert the dedup; Machop CP:120 (only
  shadow of its line) already covers the positive `Ⓖ88p✪` case, so `p`-suffix coverage is intact.
- **829 passing** (was 822). ⚠️ 4 failures remain — the pre-existing untracked `tests/csp.test.js`
  (separate CSP thread).

## One behaviour change to be aware of

Any family where a **pre-evo shadow** was previously advertising its own purify `p` while an
**evolved shadow** of the same line also qualifies will now show `p` on **only the evolved one**
(the Gastly→Gengar and Amaura→Aurorus cases). This is the intended #73 fix and the criterion you
chose, but it is a visible reduction in `p` indicators on your real export — flag if any specific
family should behave differently.

## Version
v3.5.65 → **v3.5.67**. Skips 3.5.66, which is **PR #75** (collection-nick/mobile-tag/dmax-flicker),
still open on `main`. Whichever of #75/#76 merges second needs a one-line version rebase; the code
changes are in different regions and auto-merge cleanly.

## PR
https://github.com/mariellen/pokevault/pull/76
