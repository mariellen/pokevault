#!/usr/bin/env python3
"""
PokéVault Pipeline Orchestrator
--------------------------------
Automates the coordinator → Opus review → Claude Code → Opus post-check flow.

Usage:
  python pipeline.py --brief briefs/my-bug-brief.md
  python pipeline.py --brief briefs/my-bug-brief.md --skip-pre-review   # skip initial Opus review
  python pipeline.py --status                                             # just show HANDOFF.md

Requires:
  pip install anthropic claude-agent-sdk
  export ANTHROPIC_API_KEY=your-key
"""

from __future__ import annotations

import argparse
import asyncio
import os
import re
import sys
import unicodedata
from datetime import datetime
from pathlib import Path

import anthropic

# ── Config ────────────────────────────────────────────────────────────────────

DEFAULT_REVIEW_MODEL = "claude-opus-4-8"   # swap to "claude-fable-5" to try Fable
HANDOFF_FILE         = Path("HANDOFF.md")
REVIEWS_DIR          = Path("reviews")
BRIEFS_DIR           = Path("briefs")

# Anchor every file lookup to where pipeline.py lives, NOT the current working
# directory — so resolution is the same no matter where you run the script from.
REPO_ROOT            = Path(__file__).resolve().parent

# ── File-attachment config ────────────────────────────────────────────────────
# Markdown headers (case-insensitive, prefix match) that introduce a file list.
FILE_SECTION_HEADERS = ("files needed", "files attached", "files to review")
# Path-resolution prefixes, tried in order. "" means "exact path from repo root".
RESOLVE_PREFIXES     = ("", "pokevault-refactor/js", "pokevault-refactor/tests", "reviews")
# Self-imposed cap on embedded file payload (input context, not the 4096 output cap).
MAX_FILE_TOKENS      = 100_000
# Conservative chars/token proxy for source code (no tokenizer dependency).
CHARS_PER_TOKEN      = 4

# ── File attachment: parse → resolve → embed (shared by all pipeline handoffs) ─

def parse_brief_file_list(brief_text: str) -> list[str]:
    """Extract file paths listed as bullets under a Files-needed/attached/review header."""
    paths: list[str] = []
    capturing = False
    seen_bullet = False
    for line in brief_text.splitlines():
        stripped = line.strip()
        if stripped.startswith("#"):
            header = stripped.lstrip("#").strip().lower()
            capturing = any(header.startswith(h) for h in FILE_SECTION_HEADERS)
            seen_bullet = False
            continue
        if not capturing:
            continue
        m = re.match(r"^[-*]\s+(.+)$", stripped)
        if m:
            seen_bullet = True
            raw = m.group(1).strip()
            # Drop any "→ resolve to ..." annotation, backticks, and trailing prose.
            raw = raw.split("→")[0].split("->")[0].strip().strip("`").strip()
            token = raw.split()[0].strip("`,") if raw else ""
            if token:
                paths.append(token)
        elif stripped == "":
            continue
        elif seen_bullet:
            # Prose after the bullet list ends the section.
            capturing = False
    # De-duplicate, preserving order.
    seen: set[str] = set()
    out: list[str] = []
    for p in paths:
        if p not in seen:
            seen.add(p)
            out.append(p)
    return out


def _exists_normalized(path: Path) -> Path | None:
    """Existence check that tolerates NFC/NFD unicode mismatch (e.g. the é in PokéVault)."""
    if path.exists():
        return path
    parent = path.parent
    if not parent.is_dir():
        return None
    target = unicodedata.normalize("NFC", path.name)
    for entry in parent.iterdir():
        if unicodedata.normalize("NFC", entry.name) == target:
            return entry
    return None


def resolve_brief_path(listed: str, repo_root: Path = REPO_ROOT) -> Path | None:
    """Resolve a brief-listed path to a real file confined under repo_root, or None."""
    listed = listed.strip().strip("`")
    rel = Path(listed)
    root = repo_root.resolve()
    for prefix in RESOLVE_PREFIXES:
        base = root / prefix if prefix else root
        # Try the full listed path under the prefix, then just the basename.
        # The basename attempt fixes paths like `tests/foo.test.js` against the
        # `pokevault-refactor/tests/` prefix (which would otherwise double `tests/`).
        for candidate in (base / rel, base / rel.name):
            hit = _exists_normalized(candidate)
            if hit is None:
                continue
            try:
                hit.resolve().relative_to(root)   # reject anything escaping repo root
            except ValueError:
                continue
            return hit
    return None


def gather_brief_files(brief_text: str, repo_root: Path = REPO_ROOT):
    """Resolve + read every file listed in the brief. Returns (found, missing).

    found:   list of (repo-relative path str, file contents)
    missing: list of items that could not be resolved or read
    """
    found: list[tuple[str, str]] = []
    missing: list[str] = []
    for item in parse_brief_file_list(brief_text):
        resolved = resolve_brief_path(item, repo_root)
        if resolved is None:
            missing.append(item)
            continue
        try:
            text = resolved.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError) as e:
            missing.append(f"{item} (unreadable: {e})")
            continue
        rel = resolved.resolve().relative_to(repo_root.resolve())
        found.append((str(rel), text))
    return found, missing


def _file_block(path: str, contents: str, note: str | None = None) -> str:
    opener = f"=== FILE: {path} ==="
    if note:
        opener += f"  [{note}]"
    return f"{opener}\n{contents}\n=== END FILE ==="


def build_embedded_files_block(
    brief_text: str,
    repo_root: Path = REPO_ROOT,
    max_tokens: int = MAX_FILE_TOKENS,
) -> str:
    """Inline file contents for a model with NO filesystem access (the Opus calls).

    Files are emitted smallest-first so the largest (e.g. analyse.js) is last and
    absorbs any truncation, guaranteeing smaller files always get through whole.
    Returns "" when the brief lists no files at all.
    """
    found, missing = gather_brief_files(brief_text, repo_root)
    for m in missing:
        print(f"  ⚠️  Listed file not found / unreadable: {m}")
    if not found and not missing:
        return ""

    found.sort(key=lambda ft: len(ft[1]))   # ascending size → largest last
    budget = max_tokens * CHARS_PER_TOKEN
    used = 0
    blocks: list[str] = []
    for relpath, text in found:
        remaining = budget - used
        if remaining <= 0:
            blocks.append(_file_block(relpath, "", note="omitted — token budget exhausted"))
            continue
        if len(text) > remaining:
            blocks.append(_file_block(
                relpath, text[:remaining],
                note=f"truncated to ~{remaining // CHARS_PER_TOKEN} tokens to fit budget",
            ))
            used = budget
        else:
            blocks.append(_file_block(relpath, text))
            used += len(text)

    header = ("## Attached Files\n\n"
              "The following files referenced by the brief are included for review:\n")
    if missing:
        header += "\n> ⚠️ Could not attach: " + ", ".join(missing) + "\n"
    return header + "\n" + "\n\n".join(blocks)


def build_file_manifest(brief_text: str, repo_root: Path = REPO_ROOT) -> str:
    """List resolved file paths for a consumer that reads files itself (Claude Code).

    Claude Code has Read/Glob/Grep, so it gets live paths rather than stale inline
    copies. Returns "" when the brief lists no files.
    """
    found, missing = gather_brief_files(brief_text, repo_root)
    if not found and not missing:
        return ""
    lines = ["## Files referenced by this brief (read them with your Read tool):"]
    for relpath, _ in found:
        lines.append(f"- `{relpath}`")
    for m in missing:
        lines.append(f"- ⚠️ `{m}` — listed in brief but not found at expected paths")
    return "\n".join(lines)

# ── Helpers ───────────────────────────────────────────────────────────────────

def now() -> str:
    return datetime.now().strftime("%d %b %Y %H:%M")

def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")

def write(path: Path, content: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")

def banner(msg: str):
    print(f"\n{'─'*60}\n  {msg}\n{'─'*60}")

def update_handoff(thread_name: str, status: str, action: str, agent: str):
    """Rewrite the HANDOFF.md entry for this thread."""
    # Read existing handoff or start fresh
    if HANDOFF_FILE.exists():
        existing = read(HANDOFF_FILE)
    else:
        existing = _empty_handoff()

    # Build the updated thread block
    thread_block = f"""### {thread_name}
**Status:** {status}
**Owner:** {agent}
**Next action:** {action}
_Updated: {now()}_
"""
    # Replace existing thread block or append
    marker = f"### {thread_name}"
    if marker in existing:
        # Find and replace the block
        lines = existing.split("\n")
        out, inside = [], False
        for line in lines:
            if line.strip() == marker.strip():
                inside = True
                out.append(thread_block)
                continue
            if inside:
                # Skip until next ### or section header
                if line.startswith("###") or line.startswith("##") or line.startswith("---"):
                    inside = False
                    out.append(line)
                continue
            out.append(line)
        content = "\n".join(out)
    else:
        # Append to NEEDS YOU NOW or WAITING section depending on agent
        section = "## 🔴 NEEDS YOU NOW" if agent == "YOU" else "## ⏳ WAITING FOR AN AGENT"
        content = existing.replace(section, f"{section}\n\n{thread_block}")

    write(HANDOFF_FILE, content)
    print(f"  ✓ HANDOFF.md updated → {agent} owns next step")

def _empty_handoff() -> str:
    return f"""# PokéVault Handoff
_Last updated: {now()}_

---

## 🔴 NEEDS YOU NOW

_Nothing waiting for you right now._

---

## ⏳ WAITING FOR AN AGENT

_No agents currently running._

---

## ✅ RECENTLY COMPLETED

_Nothing completed yet this session._
"""

# ── Opus calls (direct API — fast, no agent loop needed) ─────────────────────

def call_opus(system_prompt: str, user_content: str, label: str, model: str = DEFAULT_REVIEW_MODEL) -> str:
    """Call the review model directly via the Messages API and stream output."""
    banner(f"{model}: {label}")
    client = anthropic.Anthropic()

    full_response = []
    with client.messages.stream(
        model=model,
        max_tokens=4096,
        system=system_prompt,
        messages=[{"role": "user", "content": user_content}],
    ) as stream:
        for text in stream.text_stream:
            print(text, end="", flush=True)
            full_response.append(text)

    print()  # newline after streaming
    return "".join(full_response)


PRE_REVIEW_SYSTEM = """You are a senior architect and security reviewer for PokéVault — a Pokémon GO \
collection management tool. You have deep knowledge of the PvP slot assignment rules, evolution \
family logic, and the existing test suite.

When given a bug brief, you must produce a structured review with these sections:

## Root Cause Analysis
What is actually broken and why.

## Risk Assessment
- Scope: which Pokémon families / edge cases are affected?
- Security implications (if any)
- Regression risk: what existing tests might break?

## Implementation Guidance
Concrete instructions for the implementer. Be specific about file paths and function names.

## Required Tests
List the exact test cases that must pass before this fix is considered complete.

## Watch Points
Anything the implementer should be careful about that isn't obvious from the brief.

Be direct and specific. This review goes straight to Claude Code as its implementation brief."""


POST_REVIEW_SYSTEM = """You are a senior architect reviewing a completed implementation for PokéVault.

You will be given:
1. The original bug brief
2. The pre-implementation Opus review
3. A summary of what Claude Code actually did

Produce a structured post-implementation review:

## Implementation Assessment
Did Claude Code follow the guidance? What did it do well or miss?

## Test Coverage Check
Were all required tests written and passing?

## Remaining Concerns
Anything that still needs attention before merge.

## Merge Recommendation
APPROVE, APPROVE WITH NOTES, or REQUEST CHANGES — with clear reasoning.

Be decisive. Mariellen needs a clear signal, not a list of maybes."""


# ── Claude Code dispatch (via Agent SDK) ─────────────────────────────────────

async def run_claude_code(brief_path: Path, opus_review_path: Path, thread_name: str):
    """Dispatch Claude Code with the brief + Opus review as context."""
    try:
        from claude_agent_sdk import query, ClaudeAgentOptions
    except ImportError:
        print("\n⚠️  claude-agent-sdk not installed.")
        print("   Run: pip install claude-agent-sdk")
        print("   Then re-run this script.\n")
        print("   Alternatively, manually give Claude Code these two files:")
        print(f"   - {brief_path}")
        print(f"   - {opus_review_path}")
        return None

    banner("Claude Code: Implementation")

    brief_content = read(brief_path)
    opus_content  = read(opus_review_path)
    file_manifest = build_file_manifest(brief_content)

    prompt = f"""You are implementing a fix for PokéVault based on a coordinator brief and an Opus architecture review.

## Bug Brief
{brief_content}

{file_manifest}

## Opus Pre-Implementation Review
{opus_content}

## Your instructions
1. Follow the Implementation Guidance from the Opus review exactly.
2. Write tests FIRST (TDD) — all Required Tests listed by Opus must exist before you write implementation code.
3. Run the full test suite when done. All tests must pass.
4. When complete, write a file called `reviews/{thread_name.lower().replace(" ", "-")}-impl-summary.md` containing:
   - What you changed and why
   - Which files were modified
   - Test results summary
   - Any deviations from the Opus guidance and why
5. Update HANDOFF.md: set status to "Implementation complete — awaiting Opus post-check", owner "PIPELINE".

Do not ask clarifying questions. Follow the brief and Opus review. If genuinely blocked, write your question to the impl-summary file and stop."""

    result_chunks = []
    async for message in query(
        prompt=prompt,
        options=ClaudeAgentOptions(
            allowed_tools=["Read", "Edit", "Write", "Bash", "Glob", "Grep"],
            permission_mode="acceptEdits",
        ),
    ):
        if hasattr(message, "result"):
            result_chunks.append(message.result)
            print(message.result)

    return "\n".join(result_chunks) if result_chunks else None


# ── Main pipeline ─────────────────────────────────────────────────────────────

async def run_pipeline(brief_path: Path, skip_pre_review: bool = False, model: str = DEFAULT_REVIEW_MODEL):
    brief_path = Path(brief_path)
    if not brief_path.exists():
        print(f"❌ Brief not found: {brief_path}")
        sys.exit(1)

    # Derive thread name from brief filename
    thread_name = brief_path.stem.replace("-", " ").replace("_", " ").title()

    brief_content = read(brief_path)

    # Check for ROUTE: direct flag in brief
    first_line = brief_content.strip().splitlines()[0] if brief_content.strip() else ""
    direct_route = first_line.strip().upper() == "ROUTE: DIRECT"
    if direct_route:
        skip_pre_review = True
        print(f"\n⚡ ROUTE: DIRECT detected — skipping Opus pre-review")

    print(f"\n🚀 Starting pipeline for: {thread_name}")
    print(f"   Brief:  {brief_path}")
    print(f"   Model:  {model}")
    print(f"   Route:  {'direct → Claude Code' if direct_route else 'Opus review → Claude Code → Opus post-check'}")

    # ── Stage 1: Opus pre-review ───────────────────────────────────────────
    opus_review_path = REVIEWS_DIR / f"{brief_path.stem}-opus-pre.md"

    if skip_pre_review and opus_review_path.exists():
        banner("Skipping pre-review (ROUTE: DIRECT or --skip-pre-review, existing review found)")
        opus_pre = read(opus_review_path)
    else:
        update_handoff(thread_name, "Pre-review in progress", "Wait — reviewer is analysing", "REVIEWER")

        attached = build_embedded_files_block(brief_content)
        pre_user_content = f"## Bug Brief\n\n{brief_content}"
        if attached:
            pre_user_content += f"\n\n{attached}"

        opus_pre = call_opus(
            system_prompt=PRE_REVIEW_SYSTEM,
            user_content=pre_user_content,
            label="Pre-implementation review",
            model=model,
        )

        write(opus_review_path, f"# Opus Pre-Implementation Review\n_Generated: {now()}_\n\n{opus_pre}")
        print(f"\n  ✓ Saved to {opus_review_path}")

        update_handoff(
            thread_name,
            f"Pre-review complete → see `{opus_review_path}`",
            "Review findings, then press Enter to dispatch Claude Code (or Ctrl+C to pause)",
            "YOU",
        )

        # Pause for human review before dispatching Claude Code
        print(f"\n{'─'*60}")
        print("  Pre-review complete. Review the output above.")
        print(f"  Saved to: {opus_review_path}")
        print("  Press Enter to dispatch Claude Code, or Ctrl+C to pause here.")
        print(f"{'─'*60}")
        try:
            input()
        except KeyboardInterrupt:
            print("\n\n⏸  Pipeline paused. HANDOFF.md updated.")
            print(f"   Resume with: python pipeline.py --brief {brief_path} --skip-pre-review --model {model}")
            return

    # ── Stage 2: Claude Code implementation ───────────────────────────────
    update_handoff(thread_name, "Claude Code implementing", "Wait — Claude Code is working", "CLAUDE CODE")

    impl_summary_path = REVIEWS_DIR / f"{brief_path.stem}-impl-summary.md"
    impl_result = await run_claude_code(brief_path, opus_review_path, thread_name)

    if impl_result is None:
        # Agent SDK not installed — manual fallback
        update_handoff(
            thread_name,
            "Awaiting manual Claude Code run",
            f"Run Claude Code manually with {brief_path} and {opus_review_path}, then run: python pipeline.py --post-review {brief_path}",
            "YOU",
        )
        return

    # ── Stage 3: post-review ───────────────────────────────────────────────
    if direct_route:
        # Skip post-review for direct route — hand straight back to Mariellen
        update_handoff(
            thread_name,
            "Claude Code complete (direct route — no post-review)",
            "Check impl-summary, run tests locally, approve merge if happy",
            "YOU",
        )
        banner("Pipeline complete (direct route)!")
        print(f"  Thread:    {thread_name}")
        print(f"  Summary:   {impl_summary_path}")
        print(f"  Next step: Open HANDOFF.md\n")
        return

    update_handoff(thread_name, "Post-review in progress", "Wait — reviewer is checking implementation", "REVIEWER")

    impl_summary = read(impl_summary_path) if impl_summary_path.exists() else impl_result or "(No summary file written)"

    # Re-attach the files under review so Opus can verify against real code.
    # (v1: brief-listed files. Future: parse modified files from the impl-summary.)
    post_attached = build_embedded_files_block(brief_content)
    post_user_content = f"""## Original Brief
{brief_content}

## Pre-Implementation Review
{opus_pre}

## What Claude Code Did
{impl_summary}"""
    if post_attached:
        post_user_content += f"\n\n{post_attached}"

    opus_post = call_opus(
        system_prompt=POST_REVIEW_SYSTEM,
        user_content=post_user_content,
        label="Post-implementation review",
        model=model,
    )

    opus_post_path = REVIEWS_DIR / f"{brief_path.stem}-opus-post.md"
    write(opus_post_path, f"# Opus Post-Implementation Review\n_Generated: {now()}_\n\n{opus_post}")
    print(f"\n  ✓ Saved to {opus_post_path}")

    # ── Stage 4: Hand back to Mariellen ───────────────────────────────────
    # Extract merge recommendation for the handoff summary
    rec = "See Opus post-review"
    for line in opus_post.splitlines():
        if "APPROVE" in line.upper() or "REQUEST CHANGES" in line.upper():
            rec = line.strip().lstrip("#").strip()
            break

    update_handoff(
        thread_name,
        f"Pipeline complete · Opus says: {rec}",
        f"Read `{opus_post_path}` and decide: approve merge or send back to Claude Code",
        "YOU",
    )

    banner("Pipeline complete!")
    print(f"  Thread:      {thread_name}")
    print(f"  Opus says:   {rec}")
    print(f"  Post-review: {opus_post_path}")
    print(f"  Next step:   Open HANDOFF.md\n")


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="PokéVault pipeline orchestrator")
    parser.add_argument("--brief",           help="Path to brief.md file to process")
    parser.add_argument("--skip-pre-review", action="store_true", help="Skip pre-review if already done")
    parser.add_argument("--model",           default=DEFAULT_REVIEW_MODEL,
                                             help="Review model to use (default: claude-opus-4-8). Try: claude-fable-5")
    parser.add_argument("--status",          action="store_true", help="Print current HANDOFF.md and exit")
    parser.add_argument("--dry-run",          action="store_true",
                                             help="Preview the assembled prompts (with attached files) without calling any model")
    args = parser.parse_args()

    if args.dry_run:
        if not args.brief:
            print("--dry-run needs --brief")
            return
        bp = Path(args.brief)
        if not bp.exists():
            print(f"❌ Brief not found: {bp}")
            return
        bc = read(bp)
        block = build_embedded_files_block(bc)
        manifest = build_file_manifest(bc)
        print("=" * 60)
        print("DRY RUN — Opus pre-review payload (system prompt omitted)")
        print("=" * 60)
        print(f"## Bug Brief\n\n{bc}" + (f"\n\n{block}" if block else "\n\n(no files listed in brief)"))
        print("\n" + "=" * 60)
        print("DRY RUN — Claude Code file manifest")
        print("=" * 60)
        print(manifest or "(no files listed in brief)")
        return

    if args.status:
        if HANDOFF_FILE.exists():
            print(read(HANDOFF_FILE))
        else:
            print("No HANDOFF.md yet. Run with --brief to start a pipeline.")
        return

    if not args.brief:
        parser.print_help()
        return

    asyncio.run(run_pipeline(Path(args.brief), skip_pre_review=args.skip_pre_review, model=args.model))


if __name__ == "__main__":
    main()
