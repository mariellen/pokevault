"""Tests for pipeline.py file-attachment logic.

Run: pytest test_pipeline_files.py -v
"""
import unicodedata
from pathlib import Path

import pytest

import pipeline


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def repo(tmp_path):
    """A miniature repo mirroring the real PokéVault layout."""
    root = tmp_path / "repo"
    (root / "pokevault-refactor" / "js").mkdir(parents=True)
    (root / "pokevault-refactor" / "tests").mkdir(parents=True)
    (root / "reviews").mkdir(parents=True)

    (root / "RULES.md").write_text("# rules at root\n", encoding="utf-8")
    (root / "pokevault-refactor" / "js" / "analyse.js").write_text(
        "// analyse engine\n" + ("x" * 4000), encoding="utf-8")
    (root / "pokevault-refactor" / "tests" / "analyse.branching_evo.test.js").write_text(
        "// branching evo tests\n", encoding="utf-8")

    # Business rules file written with an NFD-normalized 'é' to simulate a macOS
    # filesystem, while briefs reference it in NFC.
    nfd_name = unicodedata.normalize("NFD", "PokéVault_Business_Rules.md")
    (root / nfd_name).write_text("# business rules\n", encoding="utf-8")

    # A secret OUTSIDE the repo, to test path-escape confinement.
    (tmp_path / "secret.txt").write_text("TOP SECRET\n", encoding="utf-8")
    return root


# ── parse_brief_file_list ─────────────────────────────────────────────────────

def test_parse_extracts_bullets_under_known_headers():
    brief = (
        "# Brief\n\nsome context\n\n"
        "## Files needed\n"
        "- analyse.js\n"
        "- `RULES.md`\n"
        "- tests/analyse.branching_evo.test.js → resolve relative to repo root\n\n"
        "## Testing\n- not a file\n"
    )
    assert pipeline.parse_brief_file_list(brief) == [
        "analyse.js",
        "RULES.md",
        "tests/analyse.branching_evo.test.js",
    ]


def test_parse_ignores_briefs_without_a_file_section():
    assert pipeline.parse_brief_file_list("# Brief\n\njust prose, no files\n") == []


# ── resolve_brief_path ────────────────────────────────────────────────────────

def test_resolve_exact_root_file(repo):
    hit = pipeline.resolve_brief_path("RULES.md", repo)
    assert hit is not None and hit.name == "RULES.md"


def test_resolve_via_js_prefix(repo):
    hit = pipeline.resolve_brief_path("analyse.js", repo)
    assert hit is not None
    assert hit.relative_to(repo) == Path("pokevault-refactor/js/analyse.js")


def test_resolve_handles_double_tests_prefix(repo):
    # Brief lists `tests/...`; on disk it's under pokevault-refactor/tests/.
    # The basename fallback must avoid producing .../tests/tests/...
    hit = pipeline.resolve_brief_path("tests/analyse.branching_evo.test.js", repo)
    assert hit is not None
    assert hit.relative_to(repo) == Path(
        "pokevault-refactor/tests/analyse.branching_evo.test.js")


def test_resolve_unicode_nfc_nfd(repo):
    # Brief references NFC; file on disk is NFD. Exact match fails, scan must win.
    hit = pipeline.resolve_brief_path("PokéVault_Business_Rules.md", repo)
    assert hit is not None
    assert unicodedata.normalize("NFC", hit.name) == "PokéVault_Business_Rules.md"


def test_resolve_rejects_path_escape(repo):
    assert pipeline.resolve_brief_path("../secret.txt", repo) is None
    assert pipeline.resolve_brief_path("/etc/passwd", repo) is None


def test_resolve_returns_none_for_unknown(repo):
    assert pipeline.resolve_brief_path("does_not_exist.js", repo) is None


# ── gather + embed ────────────────────────────────────────────────────────────

def test_embed_reports_missing_files(repo, capsys):
    brief = "## Files needed\n- RULES.md\n- ghost.js\n"
    block = pipeline.build_embedded_files_block(brief, repo)
    assert "=== FILE: RULES.md ===" in block
    assert "Could not attach: ghost.js" in block
    assert "ghost.js" in capsys.readouterr().out  # warned to stdout too


def test_embed_orders_largest_last_and_truncates(repo):
    # Tiny budget forces analyse.js (largest) to be truncated; small files survive.
    brief = "## Files needed\n- RULES.md\n- analyse.js\n"
    block = pipeline.build_embedded_files_block(brief, repo, max_tokens=10)

    rules_pos = block.index("=== FILE: RULES.md ===")
    analyse_pos = block.index("analyse.js ===")
    assert rules_pos < analyse_pos, "smallest file should come before analyse.js"
    assert "truncated" in block.split("analyse.js ===")[1].split("=== END FILE ===")[0]
    # The small file is intact (its body present, untruncated).
    assert "# rules at root" in block


def test_embed_empty_when_no_files(repo):
    assert pipeline.build_embedded_files_block("# Brief\n\nno files\n", repo) == ""


# ── manifest ──────────────────────────────────────────────────────────────────

def test_manifest_lists_resolved_paths(repo):
    brief = "## Files needed\n- analyse.js\n- ghost.js\n"
    manifest = pipeline.build_file_manifest(brief, repo)
    assert "pokevault-refactor/js/analyse.js" in manifest
    assert "ghost.js" in manifest and "not found" in manifest
