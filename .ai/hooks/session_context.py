#!/usr/bin/env python3
"""HOMI SessionStart hook — injects the live repository memory into every new session.

CLAUDE.md carries the stable rules; this hook adds what changes between sessions and what agents forget:
the session handoff (`.ai/memory/session-handoff.md`, verbatim), high-severity known issues, the next
ASSUMPTION_MISMATCH / known-issue numbers, the latest phase reports, the git branch state and warnings
about an incomplete local environment. Output is the SessionStart `additionalContext` JSON.

Python 3.9+, standard library only. Tests: `.ai/hooks/tests/test_session_context.py`.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import List, Optional

MANDATE_RULES = (
    "Rule 7: never claim a check you did not run — paste the command and its result.",
    "Subagent summaries are not verified facts: spot-check them; at most 3 agents in parallel.",
    "sudo, destructive, paid and production actions need the developer's explicit approval each time.",
    "Every phase ends with a commit and a §26 report in docs/ai/reports/phase-N.md.",
    "Read before acting: CLAUDE.md → the latest phase report → .ai/memory/{current-state,known-issues}.md.",
)

PHASE_RE = re.compile(r"phase-(\d+)")
AM_RE = re.compile(r"\bAM-(\d+)\b")
KI_RE = re.compile(r"\bKI-(\d+)\b")


def read_text(path: Path) -> Optional[str]:
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return None


def latest_reports(root: Path, limit: int = 3) -> List[Path]:
    reports_dir = root / "docs" / "ai" / "reports"
    if not reports_dir.is_dir():
        return []
    reports = [p for p in reports_dir.glob("*.md")]

    def key(path: Path) -> tuple:
        match = PHASE_RE.search(path.name)
        phase = int(match.group(1)) if match else -1
        return (phase, path.stat().st_mtime)

    return sorted(reports, key=key, reverse=True)[:limit]


def next_number(pattern: "re.Pattern[str]", texts: List[str]) -> int:
    highest = 0
    for text in texts:
        for match in pattern.finditer(text):
            highest = max(highest, int(match.group(1)))
    return highest + 1


def high_severity_rows(known_issues: str) -> List[str]:
    rows = []
    for line in known_issues.splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) >= 4 and cells[0].startswith("KI-") and cells[1].lower() in {"high", "critical"}:
            issue = cells[3] if len(cells[3]) <= 160 else cells[3][:157].rstrip() + "…"
            rows.append("%s (%s): %s" % (cells[0], cells[1], issue))
    return rows


def environment_warnings(root: Path) -> List[str]:
    warnings = []
    if not (root / ".ai" / "local.env").is_file():
        warnings.append(
            ".ai/local.env is missing — copy .ai/local.env.example and set APPUZ_ROOT etc.; "
            "until then the path guard recognises reference codebases only by folder name."
        )
    if (root / "backend" / "composer.json").is_file() and not (root / "backend" / "vendor" / "bin" / "pint").exists():
        warnings.append("backend/vendor is missing — run `composer install` in backend/ (Pint, PHPStan and Boost are unavailable).")
    if (root / "backend" / ".env.example").is_file() and not (root / "backend" / ".env").is_file():
        warnings.append("backend/.env is missing — `make dev-setup` creates it from .env.example.")
    if (root / ".ai" / "skills").is_dir() and not (root / ".claude" / "skills").is_dir():
        warnings.append(".claude/skills is not generated — run `make ai-sync` (php artisan boost:update).")
    return warnings


def git_summary(root: Path) -> str:
    def git(*args: str) -> str:
        try:
            return subprocess.run(
                ["git", "-C", str(root), *args], capture_output=True, text=True, timeout=5, check=False
            ).stdout.strip()
        except (OSError, subprocess.SubprocessError):
            return ""

    branch = git("rev-parse", "--abbrev-ref", "HEAD")
    if not branch:
        return "not a git checkout"
    last = git("log", "-1", "--format=%h %s")
    dirty = git("status", "--porcelain")
    dirty_count = len([line for line in dirty.splitlines() if line.strip()])
    state = "clean" if dirty_count == 0 else "%d changed path(s)" % dirty_count
    return "branch `%s`, %s; last commit: %s" % (branch, state, last or "none")


def build_context(root: Path, source: str, git_summary: str) -> str:
    memory = root / ".ai" / "memory"
    handoff = read_text(memory / "session-handoff.md")
    known_issues = read_text(memory / "known-issues.md") or ""
    reports = latest_reports(root)
    report_texts = [read_text(p) or "" for p in (root / "docs" / "ai" / "reports").glob("*.md")] if (root / "docs" / "ai" / "reports").is_dir() else []

    lines: List[str] = []
    lines.append("# HOMI session context (hook .ai/hooks/session_context.py, source=%s)" % source)
    lines.append("")
    lines.append("## Mandate rules that tooling cannot enforce")
    lines.extend("- %s" % rule for rule in MANDATE_RULES)
    lines.append("")
    lines.append("## Repository state")
    lines.append("- Git: %s" % (git_summary or "unknown"))
    if reports:
        lines.append("- Latest phase reports: %s" % ", ".join("docs/ai/reports/%s" % p.name for p in reports))
    highs = high_severity_rows(known_issues)
    lines.append("- Known issues with high severity: %s" % ("; ".join(highs) if highs else "none"))
    lines.append(
        "- Next numbers: ASSUMPTION_MISMATCH AM-%d, known issue KI-%d"
        % (next_number(AM_RE, report_texts + [known_issues]), next_number(KI_RE, [known_issues]))
    )
    lines.append("")
    warnings = environment_warnings(root)
    lines.append("## Environment")
    if warnings:
        lines.extend("- WARNING: %s" % w for w in warnings)
    else:
        lines.append("- local tooling present (.ai/local.env, backend/vendor, backend/.env, .claude/skills)")
    lines.append("")
    lines.append("## Session handoff (.ai/memory/session-handoff.md, verbatim)")
    if handoff is None:
        lines.append("- MISSING: .ai/memory/session-handoff.md — restore it from git before working.")
    else:
        lines.append(handoff.rstrip())
    return "\n".join(lines) + "\n"


def render_output(context: str) -> str:
    return json.dumps({"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": context}})


def project_root() -> Path:
    env_root = os.environ.get("CLAUDE_PROJECT_DIR")
    if env_root:
        return Path(env_root).resolve()
    return Path(__file__).resolve().parents[2]


def main() -> int:
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw) if raw.strip() else {}
        root = project_root()
        context = build_context(root, source=str(payload.get("source") or "unknown"), git_summary=git_summary(root))
        print(render_output(context))
    except Exception as error:  # never break session start
        print(json.dumps({"systemMessage": "HOMI session_context.py failed: %s" % error}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
