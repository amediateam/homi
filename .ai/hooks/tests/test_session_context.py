"""Tests for the SessionStart hook (.ai/hooks/session_context.py)."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import session_context as sc  # noqa: E402

HANDOFF = "# Session handoff\n\n## Developer's standing instruction\n**No application code until told.**\n"
KNOWN_ISSUES = (
    "# Known issues\n\n| # | Severity | Found | Issue | Workaround / owner |\n|---|---|---|---|---|\n"
    "| KI-1 | resolved | 2026-11-08 | old | fixed |\n"
    "| KI-13 | high | 2026-11-08 | nginx must not run via brew services | sudo nginx |\n"
    "| KI-17 | info | 2026-11-08 | boost.json skills | add there |\n"
)


class SessionContextCase(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / ".ai" / "memory").mkdir(parents=True)
        (self.root / "docs" / "ai" / "reports").mkdir(parents=True)
        (self.root / ".ai" / "memory" / "session-handoff.md").write_text(HANDOFF)
        (self.root / ".ai" / "memory" / "known-issues.md").write_text(KNOWN_ISSUES)
        (self.root / "docs" / "ai" / "reports" / "phase-2.md").write_text("AM-26 … AM-34 recorded\n")
        (self.root / "docs" / "ai" / "reports" / "phase-4-plan.md").write_text("plan\n")
        (self.root / ".ai" / "local.env.example").write_text("APPUZ_ROOT=/path/to\n")

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_context_embeds_the_handoff_verbatim(self) -> None:
        text = sc.build_context(self.root, source="startup", git_summary="branch main, clean")
        self.assertIn("No application code until told.", text)
        self.assertIn("branch main, clean", text)
        self.assertIn("source=startup", text)

    def test_context_lists_high_severity_known_issues_only(self) -> None:
        text = sc.build_context(self.root, source="startup", git_summary="")
        self.assertIn("KI-13", text)
        self.assertNotIn("KI-1 ", text)
        self.assertNotIn("KI-17", text)

    def test_context_computes_next_numbers(self) -> None:
        text = sc.build_context(self.root, source="startup", git_summary="")
        self.assertIn("AM-35", text)
        self.assertIn("KI-18", text)

    def test_context_names_latest_reports(self) -> None:
        text = sc.build_context(self.root, source="startup", git_summary="")
        self.assertIn("phase-4-plan.md", text)
        self.assertIn("phase-2.md", text)

    def test_context_warns_when_local_env_is_missing_and_not_when_present(self) -> None:
        self.assertIn("local.env", sc.build_context(self.root, source="startup", git_summary="").split("## Environment")[1])
        (self.root / ".ai" / "local.env").write_text("APPUZ_ROOT=/x\n")
        self.assertNotIn(".ai/local.env is missing", sc.build_context(self.root, source="startup", git_summary=""))

    def test_missing_memory_files_do_not_crash(self) -> None:
        (self.root / ".ai" / "memory" / "session-handoff.md").unlink()
        text = sc.build_context(self.root, source="resume", git_summary="")
        self.assertIn("session-handoff.md", text)  # reported as missing

    def test_render_output_is_a_session_start_hook_payload(self) -> None:
        payload = json.loads(sc.render_output("hello"))
        self.assertEqual(payload["hookSpecificOutput"]["hookEventName"], "SessionStart")
        self.assertEqual(payload["hookSpecificOutput"]["additionalContext"], "hello")


if __name__ == "__main__":
    unittest.main()
