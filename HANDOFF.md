# PokéVault Handoff
_Last updated: 19 Jul 2026_

> **How to use this file**
> Open this whenever you come back to PokéVault.
> The top section always tells you what needs a human decision.
> Run `python pipeline.py --status` to reprint this in your terminal.

---

## 🔴 NEEDS YOU NOW

### Pikachu costume dropdown (#77, v3.5.68) — URGENT
**Status:** Implemented on `feature/pikachu-costume-dropdown` (from main, post-#75+#76 merge).
Data-only: added `Pikachu` (83 costumes), `Pichu` (5), `Raichu` (2) to `FORM_DROPDOWNS` in data.js
so the ~1000 costumed Pikachu can be bulk-tagged via dropdown instead of free text. No engine
changes — the dropdown mechanism already keys off FORM_DROPDOWNS. NOT added to COLLECTION_SETS (83
costumes, no completeness tracking) per the brief. Costume strings are manual human-readable labels
(Pokégenie doesn't export costume data). Suite: **845 passed** (+5; 4 failures = pre-existing
untracked `csp.test.js`). v3.5.67 → v3.5.68.
**Owner:** YOU
**Next action:** Review + merge https://github.com/mariellen/pokevault/pull/78 (urgent — for today's
trading session), then open a Pikachu row's override panel / 🎨 Set Forms modal and confirm the
costume dropdown appears and saves. See `reviews/issue-77-pikachu-costume-dropdown-impl-summary.md`.
_Updated: 19 Jul 2026_

### Purify dedup (#73) + mobile override-panel wrap (#74, v3.5.67) — ✅ MERGED (PR #76)
**Status:** Merged to main. One `p` per final evolution target (pre-evos collapse into the evolved
keeper; branching families keep one per target). Mobile override panel pinned to viewport. See
`reviews/issue-73-74-purify-dedup-and-mobile-override-wrap-impl-summary.md`.
**Owner:** YOU
**Next action:** On your real export, confirm only the evolved shadow in a line keeps `p`.
_Updated: 19 Jul 2026_

### Collection nick + mobile form tag + Dmax flicker (#72, #67, v3.5.66)
**Status:** Implemented on `feature/collection-nick-mobile-tag-dmax-flicker` (the three source fixes
were already sitting uncommitted in the working tree pre-restart; this session added tests, bumped the
version, committed, and opened the PR). Three independent display fixes: (#72 Bug A) a per-form
collection keeper carrying a **tentative sub-90 league-slot artifact** now nicks `NameⓇ{IV%}` via a
shared `applyCollectionNick()` helper instead of the `Squawk98u95g` review holding nick; (#72 Bug B)
the cosmetic-form tag carries a `vt-form` class + the mobile collapse rule excludes it, so form tags
stay visible on mobile; (#67) ticking Dmax/Gmax in the override panel pushes the matching slot so the
nick preview immediately shows the evolved terminal name (`UnfezantⓇ84Ⓓ`), killing the `PidoveⓇ84Ⓓ`
flicker. New `set-override-loader.js` splices the **real** `setOverride()` so #67 is tested against
production code. Suite: **833 passed** (+11; 4 failures = the pre-existing untracked `csp.test.js`
thread). v3.5.65 → v3.5.66.
**Owner:** YOU
**Next action:** Review + merge https://github.com/mariellen/pokevault/pull/75 , then on a phone
confirm form tags are visible and the override-panel Dmax tick shows the evolved name with no flicker.
See `reviews/collection-keeper-nick-and-display-fixes-impl-summary.md`.
_Updated: 19 Jul 2026_

### Grey star sort (#69) + Rockruff formUnset (#68, v3.5.65)
**Status:** Implemented on `feature/rockruff-formunset-grey-sort` (from main, post-#66). #69:
`pokemonStarRank` now returns 3.5 for grey stars (were falling to the bottom); RULES.md already
documented 3.5. #68: **the brief's approach was wrong** — I confirmed against your real export
(`poke_genie_export 212.csv`) that Master Rockruffs do NOT have blank evo recs (all have
Name(G/U)=Lycanroc+form), FORM_SET_REQUIRED_EVOS is target-keyed (adding 'Rockruff' is a no-op;
'Lycanroc' breaks #39), and Part B was redundant. Redesigned: new `FORM_CHOICE_PREVOS={Rockruff}`
(formUnset-only) fires 📝 when a Rockruff has no league slot + no form + IV≥90. Verified: #39
winners (DayⓂ/RockrⒼ) unchanged, 28/81 real Rockruffs → 📝. **⚠️ Sign-off needed:** your best
Rockruff CP402 (was gold RockruffⓇ96 best-overall) is now 📝 review — one-line tweak if you'd
rather it keep gold. Suite: **822 passed** (+9; 4 failures = pre-existing untracked `csp.test.js`).
v3.5.64 → v3.5.65.
**Owner:** YOU
**Next action:** Review + merge https://github.com/mariellen/pokevault/pull/70 , and confirm the
CP402-best-overall → 📝 behavior is what you want. See
`reviews/rockruff-formunset-and-grey-star-sort-impl-summary.md`.
_Updated: 4 Jul 2026_

### Per-form collection keepers (#64, v3.5.64) — ✅ MERGED (PR #66)
**Status:** Implemented on `feature/per-form-collection-keepers` (OPUS-FIRST, from main post-#63).
Keeps the best IV of EACH tagged form (was top-N by IV → rare forms dropped); grey star sub-90,
green ≥90, gold favourite; nick is `NameⓇ{IV%}` (no colour prefix, #55). Fixed the four-way
Poké Ball string split + legacy read-path normalisation. Badge now shows "N/M patterns · missing:
…". **⚠️ One judgment call to review:** the brief said "don't change PvP slot assignment," but its
own example (`SquawkabⓇ84`) requires it — Master rank = IV%, so collection species were getting
pulled into Master (`Ⓜ`/review). I **excluded cosmetic collection-form species from IV-based
Master** so they render `Ⓡ` keepers; real Great/Ultra wins untouched. Push back if you'd rather
they show `Ⓜ`. Suite: **813 passed** (+11 new; no existing assertion changed; 4 failures = the
pre-existing untracked `csp.test.js` thread). v3.5.63 → v3.5.64.
**Owner:** YOU
**Next action:** Review + merge https://github.com/mariellen/pokevault/pull/66 — and confirm the
Master-exclusion judgment call is what you want. Then set forms on your Squawkabilly and check
Blue/White each get a keeper + the "missing: …" badge. See
`reviews/per-form-collection-keepers-impl-summary.md`.
_Updated: 28 Jun 2026_

### Dmax/Gmax nicks use terminal evolution (#60, v3.5.63) — ✅ MERGED (PR #63)
**Status:** Implemented on `feature/dmax-gmax-terminal-evo` (from main, post-#62). Confirmed via
your real CSV row: `ElectabuⓂ96Ⓓ` happens because Pokégenie recommends NO PvP evo (Name(G/U)=
Electabuzz), so base falls back to the species — the handlers already use the evolved base. New
`terminalEvo(name, form)` resolves the final evo from VALID_EVOLUTIONS (form-aware: Galar Meowth→
Perrserker, Kanto Meowth→Persian via regional-target exclusion; branching Eevee keeps base name).
Applied to dmax/gmax slots only → a raid Electabuzz now nicks `ElectiviⓂ96Ⓓ`; a Dmax that wins a
capped PvP slot keeps its (unevolved) Ultra name. Suite: **802 passed** (+5 guard tests; 2 dmax
assertions updated; 4 failures = pre-existing untracked `csp.test.js`). v3.5.62 → v3.5.63.
**Owner:** YOU
**Next action:** Review + merge https://github.com/mariellen/pokevault/pull/63 , then confirm a
raid-kept Dmax (no PvP evo) shows the final-evo name. See
`reviews/dmax-gmax-terminal-evo-impl-summary.md`. This closes the #59/#61/#60 UI batch.
_Updated: 28 Jun 2026_

### Set Forms scan-date sort (#59) + JS cache-busting (#61, v3.5.62) — ✅ MERGED (PR #62)
**Status:** Implemented on `feature/scan-sort-and-cache-busting` (from main, post-#57).
#59: added a "Scan Date ↓" sort to the 🎨 Set Forms modal (most-recent scan first). #61: the
"Squawkabilly/Deerling show free text" report was a **stale cached `data.js`** — your hard refresh
fixed it; the dropdown code already keyed off FORM_DROPDOWNS (#57). To stop it recurring, all local
css/js now load with `?v=3.5.62` cache-busting (future bumps must bump these too — documented in
CLAUDE.md + index.html). Suite: **797 passed** (4 failures = the pre-existing untracked
`csp.test.js` thread). v3.5.61 → v3.5.62.
**#60 (Dmax/Gmax evolved-name nick) deferred:** the handlers already use the evolved base; the
base-name case only happens when Pokégenie recommends no league evo, and the existing
dynamax_master tests assert the base name. Waiting on a real mis-nicking example from you before
scoping it (needs terminal-evo resolution + test rewrites).
**Owner:** YOU
**Next action:** Review + merge https://github.com/mariellen/pokevault/pull/62 . When you find the
Dmax/Gmax naming example, paste the species + its `Name (G)`/`Name (U)` and I'll scope #60. See
`reviews/scan-sort-and-cache-busting-impl-summary.md`.
_Updated: 28 Jun 2026_

### Known-form dropdowns (#48) + decision-only nick prefix (#55, v3.5.61) — ✅ MERGED (PR #57)
**Status:** Implemented on `feature/known-forms-and-decision-prefix` (from main, post-#54).
#48: Deerling/Sawsbuck/Squawkabilly added to FORM_DROPDOWNS + FORM_SEARCH + COLLECTION_SETS;
the main-list per-row form box is now a dropdown for known-form species; `setOverride` writes
BOTH `special_form` + `vivillon_pattern` so the nick and the list tag/search stay in lock-step
(Q2=write-both). #55 (targeted, Q1=b): removed Flabébé/Floette/Florges colours from
FORM_NICK_PREFIXES so a Blue Florges nicks `FlorgesⓊ100`, not `BlueⓊ100` — Lycanroc/Burmy
decision-forms keep prefixes; Furfrou/Vivillon/Castform/Deoxys retained (full whitelist deferred
to a later issue). Suite: **797 passed** (4 failures are the pre-existing untracked `csp.test.js`
thread). v3.5.60 → v3.5.61.
**Owner:** YOU
**Next action:** Review + merge https://github.com/mariellen/pokevault/pull/57 , then in-app:
confirm a Blue Florges reads `Florges…`, Deerling/Squawkabilly appear in 🎨 Set Forms, and the
per-row Form dropdown + orange tag/search work. See
`reviews/known-forms-and-decision-prefix-impl-summary.md`.
_Updated: 27 Jun 2026_

### Set Forms modal: show IVs + fix override count (#52 + #53, v3.5.60) — ✅ MERGED (PR #54)
**Status:** Implemented on `feature/set-forms-modal-improvements` (branched from main after #50
merged). Fix 1: modal rows now show Atk/Def/Sta (`… % IV · 14/13/14 · …`) so same-CP duplicates
are distinguishable. Fix 2: `loadOverrides` now paginates (`fetchAllOverrides`) — the un-paginated
GET was hitting PostgREST's 1000-row cap and **silently dropping overrides past 1000** (your
"stuck at 1000"); and `saveOverride` now reports the live total (`✓ Saved — N overrides`). These
unblock manual testing of the #48 forms dropdown. Suite: **797 passed** (4 failures are the
pre-existing untracked `csp.test.js` thread, not this change). v3.5.59 → v3.5.60.
**Owner:** YOU
**Next action:** Review + merge https://github.com/mariellen/pokevault/pull/54 , then load the app
and confirm the Set Forms modal (IVs visible, count moves, >1000 overrides all load). See
`reviews/set-forms-modal-improvements-impl-summary.md`.
_Updated: 27 Jun 2026_

### Purify indicator `p` + shiny/purify evolved name (#43 + #47, v3.5.59) — ✅ MERGED (PR #50)
**Status:** Implemented on `feature/purify-indicator-and-shiny-nick-fix`. Replaced the broken
`rank + improvement*0.4` purify heuristic with Pokégenie's own `Sha/Pur (G/U/L)` verdict — a
shadow gets `p` only when `Sha/Pur(lg)=2` AND `Rank %(lg) ≥ 90`, using that (already-purified)
rank verbatim. The brief's stat-product alternative was shown to also misfire, so we used the
Sha/Pur columns instead (you confirmed semantics against Duskull in-app). Bundled #47: shiny +
purify-review nicks now show the evolved target name (`ArctibaxⒼ95※`, not `FrigibaxⒼ95※`).
Suite: **797 passed**. ⚠️ 4 remaining failures are the **pre-existing untracked `csp.test.js`
thread** (CSP hardening), NOT from this change — verified by stashing. v3.5.58 → v3.5.59.
**Owner:** YOU
**Next action:** Review + merge https://github.com/mariellen/pokevault/pull/50 . See
`reviews/purify-indicator-and-shiny-nick-fix-impl-summary.md`. Note: the unrelated `csp.test.js`
failures will keep CI red until that separate CSP thread lands — flag if that blocks merge.
_Updated: 27 Jun 2026_

### Evolved-form Supabase persistence (#41, v3.5.57)
**Status:** Implemented on `feature/evolved-form-supabase-persistence`. Persists `evolved_form_g/u/l`
so the #39 form-aware nick (Lycanroc Day/Night/Dusk, Burmy cloak) survives a cloud round-trip.
**Migration already run** by you in the Supabase SQL editor (`ALTER TABLE pokemon_collection ADD
COLUMN … evolved_form_g/u/l`). Code: save payload + `COLLECTION_DB_FIELDS` + a new pure
`cloudRowToCsvRow` helper (extracted from app.js) that **restores `Form (G/U/L)` from
`evolved_form_*`** — the real bug was app.js hardcoding those to `''` on every cloud load, which
the brief missed. Brief also had the table name wrong (`pokemon` → `pokemon_collection`) and
mislocated Step 3; see deviations in the impl summary. Suite green: 770 passed / 2 skipped / 1 todo
(+4 new #41 tests). v3.5.56 → v3.5.57.
**Owner:** YOU
**Next action:** Review + merge https://github.com/mariellen/pokevault/pull/42 . Migration is already
applied, so it's safe to deploy on merge. See `reviews/evolved-form-supabase-persistence-impl-summary.md`.
_Updated: 24 Jun 2026_

### Form-aware evo-target identity (#39, v3.5.56)
**Status:** Implemented on `feature/evolved-form-in-nick`. `slotEvoTarget(p, lg)` makes evo-target
identity form-aware so Lycanroc's Midday/Midnight/Dusk each win an independent keeper slot on a
different physical Rockruff (no more one-Rockruff-holds-Great-Midnight-AND-Ultra-Midday). Plus the
inverse Burmy→Wormadam cloak carve-out (no confidently-wrong `Plnt` nick; FORMSET 📝 review star).
Suite GREEN: 732 passed / 36 skipped / 1 todo. 11 new assertions (A1–A11). Caught + fixed one
pre-existing tracked regression (`lycanroc_fixture.csv` Group E). See
`reviews/evolved-form-in-nick-v3-impl-summary.md`.
**Owner:** YOU
**Next action:** Review and merge https://github.com/mariellen/pokevault/pull/40
_Updated: 23 Jun 2026_

### Dmax/Gmax Rules (Issue #30)
**Status:** Ruleset fully defined (see Issue #30). Brief file needed at `briefs/dmax-gmax-league-rules-refinement.md` before pipeline dispatch.
**Owner:** YOU
**Next action:** Create brief locally, then dispatch via pipeline (OPUS-FIRST). Version target: v3.5.54.
_Updated: 21 Jun 2026_

### Dynamax Master Flag
**Status:** Implementation complete — Opus approved. PR #27 open, awaiting CI + merge.
**Owner:** YOU
**Next action:** Check CI is green on PR #27 then merge.
_Updated: 21 Jun 2026_

### GA4 Event Tracking
**Status:** PR #12 open — adds auth.js sign_in/sign_out tracking + 10-test tracking suite. GA4 helpers already shipped in PR #11. Minor conflict expected on version (both ga4 and sort bump to v3.5.47 from same base).
**Owner:** YOU
**Next action:** Review and merge https://github.com/mariellen/pokevault/pull/12
_Updated: 13 Jun 2026_

### Sort Scan Date
**Status:** PR #13 open — adds 19-test sort-scan-date suite. Sort helpers already shipped in PR #11. Version conflict note: bump to v3.5.47, same as PR #12 — whichever merges second needs a quick rebase to v3.5.48.
**Owner:** YOU
**Next action:** Review and merge https://github.com/mariellen/pokevault/pull/13
_Updated: 13 Jun 2026_

### Refactor Redirect Cleanup
**Status:** PR #10 open — CloudFront Function for /pokevault-refactor/* redirect + infra scaffolding.
**Owner:** YOU
**Next action:** Review and merge https://github.com/mariellen/pokevault/pull/10 (requires CloudFront deploy after merge)
_Updated: 13 Jun 2026_

---

## ⏳ WAITING FOR AN AGENT

### Gmax Master Flag Debug (#35, v3.5.55)
**Status:** Diagnosed + closed. The reported symptom (a capped-slot-winning Gmax showing the
capped nick `PersiU100Ⓧ` instead of `NameⓂ{IV%}Ⓧ`) is the **deployed v3.5.53 behaviour** —
`origin/main` has NO `wonGigantamaxMaster`. The fix already exists on this branch (v3.5.54,
commit `ed96ba9`: adds the flag + routes it above `hasLeagueSlot`). Verified against the brief's
real Meowth/Persian example via the engine: best Gmax → `PersianⓂ98Ⓧ` keep; lower Gmax →
`PersianⓇ82Ⓧ` keep. **No engine change needed.** Added the missing regression: first TWO-stage
gmax test (`gmax_master_overrides_capped_slot` in `analyse.gmax_master.test.js`; all prior gmax
tests used single-stage Electabuzz). Bumped v3.5.54 → v3.5.55. Suite green: 754 passed / 2
skipped (untracked `csp.test.js` is the separate CSP thread). Pushed commit `3f41fe1`.
**Owner:** YOU
**Next action:** #35 is fixed by merging the open Dmax/Gmax PR (this same branch,
`feature/dmax-gmax-league-rules-refinement`) to deploy it. See
`reviews/gmax-master-flag-debug-impl-summary.md`.
_Updated: 22 Jun 2026_

### Bug Batch June 2026 — Bugs 3–7
**Status:** Bugs 1 & 2 implemented (v3.5.50). Bugs 3–7 have NO Opus guidance and are NOT implemented. Opus review was truncated after Bug 2. See `reviews/bug-batch-june-2026-impl-summary.md`.

### Dmax/Gmax League Rules Refinement (#30, v3.5.54)
**Status:** Implementation complete — awaiting Opus post-check. Removed the spurious `|dynamax`
capped sub-group (PR #27 over-keep bug) so Dmax/Gmax now compete in the **main capped pool**
with a type-priority tiebreak (Shiny Gmax > Gmax > Shiny Dmax > Dmax > Shiny Normal > Normal);
added full Gigantamax Master parity (`wonGigantamaxMaster`), categorical Normal-Master
suppression when a family has any Gmax (hundo → grey star `NameⓇ{IV%}Ⓗ`; non-hundo → cull/review),
and Lucky-non-winner handling (`NameⓇ{IV%}`, no star, never traded). New `analyse.gmax_master.test.js`
(20 tests). Full suite green: **752 passed / 1 skipped**, only the unrelated untracked
`csp.test.js` fails (pre-existing, not in this branch). 3 documented deviations from Opus
(non-winner nick → `Ⓡ{IV%}`; no `masterDemoted` on Gmax suppression; raid Dmax/Gmax get no star)
+ 2 open questions — see `reviews/dmax-gmax-league-rules-refinement-impl-summary.md`.
**Owner:** PIPELINE
**Next action:** Opus post-check, then open PR (gh CLI not installed — create at
https://github.com/mariellen/pokevault/pull/new/feature/dmax-gmax-league-rules-refinement ).
Branch pushed (commit 6ec3d62). Resolve open question on `|lucky` pooling
(lone-Lucky-vs-higher-type) — see impl-summary §5.
_Updated: 21 Jun 2026_

### Dynamax Master Flag
**Status:** Implementation complete — awaiting Opus post-check. Engine + RULES.md already shipped in commit e63ca7a (v3.5.51); this pass verified behaviour against the Electabuzz golden case and closed two gaps in Opus's required-test list (added `dmax_excluded_from_regular_master` full form + `dmax_all_kept_none_traded`, 8→10 tests in analyse.dynamax_master.test.js). Full suite green: 713 passed / 1 skipped excluding the unrelated untracked csp.test.js.
**Owner:** PIPELINE
**Next action:** Opus post-check from Bug 3 onwards. PR: https://github.com/mariellen/pokevault/pull/18
_Updated: 21 Jun 2026_

### Pipeline File Attachment
**Status:** Pre-review complete → see `reviews\pipeline-file-attachment-opus-pre.md`
**Owner:** YOU
**Next action:** Review findings, then press Enter to dispatch Claude Code (or Ctrl+C to pause)
_Updated: 14 Jun 2026 17:09_

### Playwright Expansion
**Status:** Pipeline complete · Opus says: **APPROVE WITH NOTES.**
**Owner:** YOU
**Next action:** Read `reviews\playwright-expansion-opus-post.md` and decide: approve merge or send back to Claude Code
_Updated: 13 Jun 2026 08:19_

### Csp Hardening
**Status:** Pipeline complete · Opus says: **APPROVE WITH NOTES.**
**Owner:** YOU
**Next action:** Read `reviews\csp-hardening-opus-post.md` and decide: approve merge or send back to Claude Code
_Updated: 12 Jun 2026 20:19_

---

## ✅ RECENTLY COMPLETED

- Bug 1 (Lucky Master winner → Ⓜ) + Bug 2 (shiny non-winner → Ⓡ) — v3.5.50
- Dmax/Gmax ruleset fully defined — Issue #30 (capped pool unification + Gmax Master + Lucky/Normal culling)
- Nick Override (v3.5.46) — merged as PR #11 · inline nick editing, applyNickOverride, rerenderNickCell
- CI/CD pipeline via GitHub Actions — merged, branch protection active (v3.5.44)
- Opus Review #6 security findings — all resolved
- Non-atomic save rewrite — complete
- Branching-evolution regression tests — complete
