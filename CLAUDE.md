# PokéVault — Claude Code Context

PokéVault is a Pokémon GO collection manager. It parses a Pokégenie CSV export and assigns each Pokémon a decision (Keep / Review / Trade / Protected), a suggested nickname, and league slot badges.

**Why it exists:** The owner is actively culling their collection (storage maxed out) and needs accurate keep/trade recommendations across Little, Great, Ultra, and Master leagues.

---

## Source of truth

`pokevault-refactor/` is the canonical source of truth. All changes are made directly here.

The single-file HTML files (`pokevault_v3_NNN.html`) are retired — ignore them.

---

## Refactor architecture

```
pokevault-refactor/
├── index.html
├── css/styles.css
├── js/
│   ├── config.js     — RULES, DUST_THRESHOLDS, LEAGUE_CAPS, LC symbols
│   ├── analyse.js    — core engine: family grouping, slot assignment, nicknames
│   ├── render.js     — UI: buildRow, starCell, slotBadges, lrHTML
│   ├── supabase.js   — cloud sync (overrides + collection)
│   ├── data.js       — BEST_MOVES, SHADOW_MOVES, LEGENDARY/MYTHICAL/ULTRA_BEAST sets
│   └── app.js        — entry point, filters, family rendering, event handlers
├── tests/            — Jest test suite (572+ passing)
│   ├── analyse.test.js
│   ├── analyse.fixture.test.js
│   ├── analyse.expensive_winner.test.js
│   ├── analyse.master_league.test.js
│   ├── analyse.branching_evo.test.js
│   ├── analyse.dust_tiebreak.test.js
│   ├── supabase.test.js
│   └── moves.test.js
├── .github/
│   └── workflows/
│       ├── test.yml      — Jest on every push
│       ├── e2e.yml       — Playwright on PR to main
│       ├── security.yml  — OWASP ZAP on PR to main
│       └── deploy.yml    — auto S3 sync + CloudFront on merge to main
├── briefs/           — coordinator-written implementation briefs
├── reviews/          — Opus pre/post review outputs + impl summaries
├── pipeline.py       — orchestration script
├── HANDOFF.md        — current state of all in-flight threads
└── RULES.md          — business logic reference (keep in sync with changes)
```

---

## Rules & documentation

- **`/RULES.md`** (repo root) — single source of truth for all business logic
- Update `RULES.md` as part of every relevant fix or feature
- The coordinator also maintains `PokéVault_Business_Rules.md` externally —
  keep `/RULES.md` in sync with any rule changes

---

## ⚠️ WORKFLOW — branch + PR (no manual deploys)

**All work goes through GitHub Actions. Never run `aws s3 sync` manually.**

1. Create a feature branch: `git checkout -b feature/description`
2. Implement on the feature branch
3. Commit and push
4. Open a PR to `main`
5. GitHub Actions runs automatically:
   - Jest unit tests (every push)
   - Playwright E2E tests (PRs to main)
   - OWASP ZAP security scan (PRs to main)
6. Tests must be green before merge
7. Coordinator reviews and approves the PR
8. Merge → auto-deploys to S3 + CloudFront invalidation

**Branch protection is enforced** — direct pushes to `main` are blocked.

### Version bumps
Bump the version number in `index.html` as part of every PR before merge.
Current version: check `index.html` for the latest.

Local JS/CSS are loaded with a `?v=<version>` cache-busting query string (added v3.5.62, #61).
Bump these **together** with the `<title>`/logo version — the simplest way is a bare-number
global replace so all three update at once: `sed 's/3\.5\.62/3.5.63/g' index.html`. (A plain
`v3.5.NN` replace misses the `?v=` strings.)

### After implementing — HANDOFF.md
Update `HANDOFF.md` and write `reviews/[brief-name]-impl-summary.md`.
Include the PR URL in the HANDOFF.md next action block.

---

## Infrastructure

- **Hosted:** AWS S3 + CloudFront → `pokevault.mariellen.com.au`
- **S3 bucket:** `pokevault.mariellen.com.au` (ROOT — not `/pokevault-refactor/`)
- **CloudFront:** `E2IMCPUABUXY1Y`
- **Deploy:** automatic via `.github/workflows/deploy.yml` on merge to main
- **Supabase:** `jsozfpsfvvnnmipsksoh.supabase.co` (overrides + collection sync)
- **GA4:** `G-8TPX6P50XM`

---

## Key conventions

- **Star colours:** Gold=already starred ✓, Green=should star, Cyan=cheaper alt
  at same rank (check before acting), Blue=best but expensive dust,
  Red=starred but shouldn't be, Grey=ML placeholder
- **Star sort order:** Gold(0) → Green(1) → Cyan(2) → Blue(3) → Grey(3.5) →
  Red(4) → Purple(5) → None(6)
- **Slot suffixes:** `_affordable` = within dust budget. Never use `_backup`.
- **Nickname format:** circled letters (Ⓖ Ⓤ Ⓛ Ⓜ) for league slots.
  Suffix order: `[name][slot][IV%][Ⓓ/Ⓧ][Ⓗ][※][*]`
- **evolvedNameG/U/L** — from Pokégenie CSV `Name (G/U/L)` columns.
  Per-Pokémon recommended evolutions for each league based on IVs.
- **primaryName** — family display name; computed from member counts.
- **termMatchesViaEvo** — true when search matches via evolvedNameG/U/L.
- **🔍 Me** — copies filtered GO search string for this form only
- **🔍 + Fam** — copies all family species names comma-joined

---

## Test suite

Run: `cd pokevault-refactor && npm test`

- Tests use `testEnvironment: 'node'` (loader uses `new Function`)
- Fixture CSVs in `tests/` — personal exports are gitignored, use `it.skip`
  pattern when file not present (same as `export187.csv` smoke tests)
- Never hardcode absolute paths — use `path.join(__dirname, 'filename.csv')`
- 572+ tests passing — suite must stay green on every PR

---

## Handoff protocol

### Updating HANDOFF.md
When you complete any task, update `HANDOFF.md` before finishing:

```
### [Thread name]
**Status:** [What you did / what state it's in now]
**Owner:** YOU
**Next action:** [One specific sentence — include PR URL if applicable]
_Updated: [date]_
```

Move to correct section:
- `## 🔴 NEEDS YOU NOW` — Mariellen needs to decide or approve the PR
- `## ✅ RECENTLY COMPLETED` — fully done and merged

### Writing impl-summary
After implementing, write `reviews/[brief-name]-impl-summary.md`:

1. **What changed** — file names and what you did
2. **Why** — how this addresses the brief
3. **Test results** — final test count, any skips
4. **PR URL** — link to the open PR
5. **Deviations** — if you couldn't follow Opus guidance exactly, explain why
6. **Open questions** — list rather than guess

---

## Pipeline routing (pipeline.py)

Briefs in `briefs/` have a `ROUTE:` header:
- `ROUTE: DIRECT` — goes straight to Claude Code
- `ROUTE: OPUS-FIRST` — Opus pre-reviews, Mariellen approves, then Claude Code implements, Opus post-reviews

Check `python pipeline.py --status` to see current state of all threads.

---

## Autonomy & Boundaries

### Proceed without asking for approval
These are routine operations — complete them automatically:

**Navigation & inspection:**
- `Set-Location` / `cd` — change directory
- `Get-ChildItem` / `ls` / `dir` — list files
- `git status` / `git log` / `git diff` / `git branch -a` — read-only git
- `python pipeline.py --status` — check pipeline state

**Git workflow:**
- `git checkout -b feature/...` — create feature branch
- `git checkout main` — switch to main
- `git fetch origin` / `git pull` — update local
- `git add` — stage files
- `git commit` — commit changes
- `git push origin feature/...` — push feature branch
- `git stash` / `git stash pop` — stash management
- `git rebase origin/main` — rebase onto main
- `git merge --no-ff` — merge commit

**Node / testing:**
- `npm install` / `npm ci` — install packages
- `npm test` / `npx jest` — run test suite
- `npx jest tests/specific.test.js` — run specific test file
- `npx serve . -p 8080` — start local server

**File operations within repo:**
- Reading any file in the repo
- Writing or editing any file under `pokevault-refactor/` or repo root
- Creating new files within the repo directory

### Always ask before proceeding
These can cause irreversible damage — never auto-approve:

**Destructive git:**
- `git push --force` or `git push -f` — only with explicit coordinator approval
- `git branch -D` — force delete branch
- `git reset --hard` — discard uncommitted changes

**AWS / infrastructure:**
- `aws s3 rm` — deleting S3 files (read the exact path carefully)
- `aws s3 sync` with `--delete` flag — verify path is bucket root
- Any CloudFront distribution changes
- Any IAM changes

**Supabase:**
- Any SQL schema changes (ALTER TABLE, DROP, CREATE POLICY)
- Any RLS policy changes

**System / outside repo:**
- Any operation on `C:/` outside the repo directory
- Any operation on paths not under `C:\ClaudeCode\pokevault\`
- Installing global npm packages (`npm install -g`)
- Any network request not to GitHub, npm, or the project's own AWS/Supabase endpoints
