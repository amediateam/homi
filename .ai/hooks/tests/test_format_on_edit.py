"""Tests for the PostToolUse formatter hook (.ai/hooks/format_on_edit.py) — routing only, no tools run."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import format_on_edit as fmt  # noqa: E402

ROOT = Path("/repo/homi.uz")


class RoutingCase(unittest.TestCase):
    def plan(self, relative: str) -> "fmt.Plan | None":
        return fmt.plan_for(ROOT, ROOT / relative)

    def test_backend_php_goes_to_pint(self) -> None:
        plan = self.plan("backend/app/Models/User.php")
        assert plan is not None
        self.assertEqual(plan.cwd, ROOT / "backend")
        self.assertEqual(plan.argv, ["vendor/bin/pint", "--format", "agent", "app/Models/User.php"])
        self.assertEqual(plan.required, ROOT / "backend" / "vendor" / "bin" / "pint")

    def test_generated_and_vendor_php_is_skipped(self) -> None:
        for relative in ("backend/vendor/x/y.php", "backend/storage/framework/views/a.php", "backend/bootstrap/cache/x.php"):
            self.assertIsNone(self.plan(relative), relative)

    def test_next_app_sources_go_to_eslint_fix(self) -> None:
        for app in ("landing", "app", "arm"):
            plan = self.plan("frontend/%s/app/page.tsx" % app)
            assert plan is not None, app
            self.assertEqual(plan.cwd, ROOT / "frontend" / app)
            self.assertEqual(plan.argv, ["pnpm", "exec", "eslint", "--fix", "app/page.tsx"])
            self.assertEqual(plan.required, ROOT / "frontend" / app / "node_modules" / ".bin" / "eslint")

    def test_next_build_output_and_workspace_packages_are_skipped(self) -> None:
        for relative in ("frontend/app/node_modules/x.js", "frontend/app/.next/x.js", "frontend/packages/ui/src/cn.ts"):
            self.assertIsNone(self.plan(relative), relative)

    def test_frozen_inertia_ui_goes_to_vite_plus_fmt(self) -> None:
        plan = self.plan("backend/resources/js/pages/welcome.tsx")
        assert plan is not None
        self.assertEqual(plan.cwd, ROOT / "backend")
        self.assertEqual(plan.argv, ["npx", "vp", "fmt", "resources/js/pages/welcome.tsx"])

    def test_other_files_are_ignored(self) -> None:
        for relative in ("docs/x.md", "Makefile", "backend/composer.json", ".ai/hooks/guard_paths.py"):
            self.assertIsNone(self.plan(relative), relative)
        self.assertIsNone(fmt.plan_for(ROOT, Path("/elsewhere/a.php")))


class SummaryCase(unittest.TestCase):
    def setUp(self) -> None:
        self.pint = fmt.plan_for(ROOT, ROOT / "backend/app/X.php")
        self.eslint = fmt.plan_for(ROOT, ROOT / "frontend/app/app/page.tsx")

    def test_clean_runs_are_silent(self) -> None:
        self.assertIsNone(fmt.summarize(self.pint, 0, '{"tool":"pint","result":"passed"}', ""))
        self.assertIsNone(fmt.summarize(self.eslint, 0, "", ""))

    def test_reformatted_files_are_reported_so_the_model_rereads_them(self) -> None:
        text = fmt.summarize(self.pint, 0, '{"tool":"pint","result":"fixed","files":[{"path":"app/X.php","issues":["braces"]}]}', "")
        assert text is not None
        self.assertIn("Pint", text)
        self.assertIn("app/X.php", text)

    def test_failures_are_reported_with_the_first_lines(self) -> None:
        text = fmt.summarize(self.eslint, 1, "app/page.tsx\n  3:1 error  Unexpected any  @typescript-eslint/no-explicit-any\n", "")
        assert text is not None
        self.assertIn("eslint", text.lower())
        self.assertIn("no-explicit-any", text)


if __name__ == "__main__":
    unittest.main()
