"""Tests for the PreToolUse guard (.ai/hooks/guard_paths.py).

Run: python3 -m unittest discover -s .ai/hooks/tests   (or `make ai-hooks-test`)
"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import guard_paths as g  # noqa: E402


class GuardCase(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        base = Path(self.tmp.name)
        self.project = base / "homi.uz"
        self.ref = base / "Server" / "app.uz"
        for path in (
            self.project / ".ai",
            self.project / "backend" / "app",
            self.project / "infra" / "local" / "certs",
            self.project / ".claude",
            self.ref / "backend" / "app" / "Models",
            self.ref / "backend" / "storage",
            self.ref / ".claude",
        ):
            path.mkdir(parents=True)
        (self.project / ".ai" / "local.env").write_text(
            "# machine-specific\nAPPUZ_ROOT=%s\nHOMI_ROOT=\nTELEGRAMUZ_ROOT=/path/to/Server/local/telegram.uz\n"
            % self.ref
        )
        (self.project / "backend" / ".env").write_text("APP_KEY=secret\n")
        (self.project / "backend" / ".env.example").write_text("APP_KEY=\n")
        (self.project / "infra" / "local" / "certs" / "homi.loc.pem").write_text("cert")
        (self.project / "infra" / "local" / "certs" / "homi.loc-key.pem").write_text("key")
        (self.project / ".claude" / "settings.local.json").write_text("{}")
        (self.ref / "backend" / ".env").write_text("APP_KEY=theirs\n")
        (self.ref / "backend" / ".env.example").write_text("APP_KEY=\n")
        (self.ref / "backend" / "app" / "Models" / "User.php").write_text("<?php\n")
        (self.ref / ".claude" / "settings.local.json").write_text("{}")
        self.guard = g.Guard.from_project(self.project)

    def tearDown(self) -> None:
        self.tmp.cleanup()

    # helpers -----------------------------------------------------------------

    def decide(self, tool: str, tool_input: dict, cwd: Path | None = None) -> str | None:
        return self.guard.decide(tool, tool_input, str(cwd or self.project))

    def bash(self, command: str, cwd: Path | None = None) -> str | None:
        return self.decide("Bash", {"command": command}, cwd)

    def assertDenied(self, reason: str | None, *needles: str) -> None:
        self.assertIsNotNone(reason, "expected a denial, got None")
        assert reason is not None
        for needle in needles:
            self.assertIn(needle.lower(), reason.lower())

    # configuration -----------------------------------------------------------

    def test_reference_roots_come_from_local_env_and_skip_placeholders(self) -> None:
        self.assertEqual(self.guard.reference_roots, [self.ref.resolve()])

    def test_fallback_marker_when_local_env_is_missing(self) -> None:
        (self.project / ".ai" / "local.env").unlink()
        guard = g.Guard.from_project(self.project)
        self.assertEqual(guard.reference_roots, [])
        reason = guard.decide("Edit", {"file_path": "/Users/dev/Server/app.uz/backend/x.php"}, str(self.project))
        self.assertDenied(reason, "read-only")
        self.assertIsNone(guard.decide("Edit", {"file_path": str(self.project / "backend" / "x.php")}, str(self.project)))

    # file tools: reference codebases are read-only -----------------------------

    def test_edit_inside_reference_root_is_denied(self) -> None:
        reason = self.decide("Edit", {"file_path": str(self.ref / "backend" / "app" / "Models" / "User.php")})
        self.assertDenied(reason, "read-only", "app.uz")

    def test_write_and_notebook_edit_inside_reference_root_are_denied(self) -> None:
        self.assertDenied(self.decide("Write", {"file_path": str(self.ref / "notes.md")}), "read-only")
        self.assertDenied(self.decide("NotebookEdit", {"notebook_path": str(self.ref / "a.ipynb")}), "read-only")

    def test_relative_file_path_is_resolved_against_cwd(self) -> None:
        reason = self.decide("Write", {"file_path": "backend/x.php"}, cwd=self.ref)
        self.assertDenied(reason, "read-only")

    def test_write_inside_project_is_allowed(self) -> None:
        self.assertIsNone(self.decide("Write", {"file_path": str(self.project / "backend" / "app" / "X.php")}))

    def test_read_inside_reference_root_is_allowed(self) -> None:
        self.assertIsNone(self.decide("Read", {"file_path": str(self.ref / "backend" / "app" / "Models" / "User.php")}))

    # file tools: secrets ------------------------------------------------------

    def test_read_project_env_is_denied_with_a_keys_only_hint(self) -> None:
        reason = self.decide("Read", {"file_path": str(self.project / "backend" / ".env")})
        self.assertDenied(reason, "secret", "grep")

    def test_read_env_example_is_allowed(self) -> None:
        self.assertIsNone(self.decide("Read", {"file_path": str(self.project / "backend" / ".env.example")}))

    def test_read_any_env_file_in_reference_root_is_denied(self) -> None:
        self.assertDenied(self.decide("Read", {"file_path": str(self.ref / "backend" / ".env.example")}), "never")
        self.assertDenied(self.decide("Read", {"file_path": str(self.ref / "backend" / ".env")}), "never")

    def test_read_reference_settings_local_is_denied_but_own_is_allowed(self) -> None:
        self.assertDenied(self.decide("Read", {"file_path": str(self.ref / ".claude" / "settings.local.json")}))
        self.assertIsNone(self.decide("Read", {"file_path": str(self.project / ".claude" / "settings.local.json")}))

    def test_private_key_is_denied_public_cert_is_allowed(self) -> None:
        certs = self.project / "infra" / "local" / "certs"
        self.assertDenied(self.decide("Read", {"file_path": str(certs / "homi.loc-key.pem")}))
        self.assertIsNone(self.decide("Read", {"file_path": str(certs / "homi.loc.pem")}))

    def test_grep_tool_on_secret_file_is_denied(self) -> None:
        self.assertDenied(self.decide("Grep", {"pattern": "KEY", "path": str(self.project / "backend" / ".env")}))
        self.assertIsNone(self.decide("Grep", {"pattern": "KEY", "path": str(self.project / "backend")}))

    def test_other_tools_pass_through(self) -> None:
        self.assertIsNone(self.decide("WebFetch", {"url": "https://example.com"}))
        self.assertIsNone(self.decide("Glob", {"pattern": "**/*.php"}))

    # bash: secret dumps -------------------------------------------------------

    def test_bash_cat_env_is_denied(self) -> None:
        self.assertDenied(self.bash("cat backend/.env"), "secret")
        self.assertDenied(self.bash("cd backend && head -5 .env"), "secret")
        self.assertDenied(self.bash("sudo cat backend/.env"), "secret")

    def test_bash_command_substitution_is_inspected(self) -> None:
        self.assertDenied(self.bash("export $(cat backend/.env | xargs)"), "secret")
        self.assertDenied(self.bash("echo `cat backend/.env`"), "secret")

    def test_bash_keys_only_reads_are_allowed(self) -> None:
        self.assertIsNone(self.bash("grep -c '^APP_KEY=' backend/.env"))
        self.assertIsNone(self.bash("grep -o '^[A-Z_]*=' backend/.env | sort"))
        self.assertIsNone(self.bash("grep -q 'APP_KEY' backend/.env && echo present"))
        self.assertIsNone(self.bash("sed -n 's/=.*//p' backend/.env"))
        self.assertIsNone(self.bash("cut -d= -f1 backend/.env"))
        self.assertIsNone(self.bash("awk -F= '{print $1}' backend/.env"))
        self.assertIsNone(self.bash("wc -l backend/.env; ls -la backend/.env; test -f backend/.env"))

    def test_bash_value_exposing_reads_are_denied(self) -> None:
        self.assertDenied(self.bash("grep APP_KEY backend/.env"))
        self.assertDenied(self.bash("sed -n '1,5p' backend/.env"))
        self.assertDenied(self.bash("awk -F= '{print $2}' backend/.env"))
        self.assertDenied(self.bash("cut -d= -f2 backend/.env"))
        self.assertDenied(self.bash("diff backend/.env backend/.env.example"))
        self.assertDenied(self.bash("source backend/.env"))

    def test_bash_env_example_is_not_a_secret(self) -> None:
        self.assertIsNone(self.bash("cat backend/.env.example"))
        self.assertIsNone(self.bash("cp backend/.env.example backend/.env"))

    def test_bash_copying_a_secret_is_denied(self) -> None:
        self.assertDenied(self.bash("cp %s/backend/.env backend/.env" % self.ref), "never")
        self.assertDenied(self.bash("cp backend/.env /tmp/backup.env"))
        self.assertDenied(self.bash("cat infra/local/certs/homi.loc-key.pem"))

    # bash: reference codebases are read-only ----------------------------------

    def test_bash_destructive_commands_in_reference_root_are_denied(self) -> None:
        self.assertDenied(self.bash("rm -rf %s/backend/storage" % self.ref), "read-only")
        self.assertDenied(self.bash("touch %s/x" % self.ref), "read-only")
        self.assertDenied(self.bash("echo note >> %s/NOTES.md" % self.ref), "read-only")
        self.assertDenied(self.bash("sed -i '' 's/a/b/' %s/backend/app/Models/User.php" % self.ref), "read-only")
        self.assertDenied(self.bash("find %s -name '*.log' -delete" % self.ref), "read-only")

    def test_bash_project_tooling_inside_reference_root_is_denied(self) -> None:
        self.assertDenied(self.bash("cd %s && composer install" % self.ref), "read-only")
        self.assertDenied(self.bash("cd %s/backend && php artisan migrate" % self.ref), "read-only")
        self.assertDenied(self.bash("composer install -d %s/backend" % self.ref), "read-only")
        self.assertDenied(self.bash("cd backend && pnpm install", cwd=self.ref), "read-only")

    def test_bash_reading_in_reference_root_is_allowed(self) -> None:
        self.assertIsNone(self.bash("ls %s/backend/app" % self.ref))
        self.assertIsNone(self.bash("cd %s && rg -n 'class ApiController' backend/app" % self.ref))
        self.assertIsNone(self.bash("wc -l %s/backend/app/Models/User.php" % self.ref))
        self.assertIsNone(self.bash("cat %s/backend/app/Models/User.php" % self.ref))

    def test_bash_version_control_in_reference_root(self) -> None:
        self.assertIsNone(self.bash("git -C %s status" % self.ref))
        self.assertIsNone(self.bash("svn info %s" % self.ref))
        self.assertIsNone(self.bash("cd %s && svn log -l 5" % self.ref))
        self.assertDenied(self.bash("git -C %s checkout -- ." % self.ref), "read-only")
        self.assertDenied(self.bash("cd %s && svn revert -R ." % self.ref), "read-only")

    def test_bash_copying_folders_out_of_reference_root_is_denied_single_files_allowed(self) -> None:
        self.assertDenied(self.bash("cp -R %s/backend/app/Services backend/app/" % self.ref), "single files")
        self.assertDenied(self.bash("rsync -a %s/backend/app/ backend/app/" % self.ref), "single files")
        self.assertIsNone(self.bash("cp %s/backend/app/Models/User.php /tmp/User.php" % self.ref))

    def test_bash_copy_into_reference_root_is_denied(self) -> None:
        self.assertDenied(self.bash("cp README.md %s/README.md" % self.ref), "read-only")

    def test_bash_ordinary_project_commands_are_allowed(self) -> None:
        self.assertIsNone(self.bash("make dev-check"))
        self.assertIsNone(self.bash("cd backend && php artisan test --compact"))
        self.assertIsNone(self.bash("git status && git log --oneline -5"))
        self.assertIsNone(self.bash("rm -rf backend/storage/framework/cache/*"))


class LegacyTreeCase(unittest.TestCase):
    """The legacy kvadro² checkout (`KVADRO_ROOT`, KI-26): read-only, no builds, no dev server, no copies.

    The root is deliberately not named `kvadro.uz`, so the key and the folder-name fallback are tested apart.
    """

    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        base = Path(self.tmp.name)
        self.project = base / "homi.uz"
        self.legacy = base / "Server" / "legacy-checkout"
        self.ref = base / "Server" / "app.uz"
        for path in (self.project / ".ai", self.legacy / "demo" / "app" / "src", self.ref / "backend"):
            path.mkdir(parents=True)
        (self.project / ".ai" / "local.env").write_text(
            "APPUZ_ROOT=%s\nKVADRO_ROOT=%s\n" % (self.ref, self.legacy)
        )
        (self.legacy / "demo" / "app" / "package.json").write_text("{}\n")
        (self.legacy / "demo" / "app" / "src" / "App.vue").write_text("<template/>\n")
        (self.legacy / "demo" / "app" / ".env").write_text("API_KEY=theirs\n")
        self.guard = g.Guard.from_project(self.project)
        self.app = self.legacy / "demo" / "app"

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def decide(self, tool: str, tool_input: dict, cwd: Path | None = None) -> str | None:
        return self.guard.decide(tool, tool_input, str(cwd or self.project))

    def bash(self, command: str, cwd: Path | None = None) -> str | None:
        return self.decide("Bash", {"command": command}, cwd)

    def assertDenied(self, reason: str | None, *needles: str) -> None:
        self.assertIsNotNone(reason, "expected a denial, got None")
        assert reason is not None
        for needle in needles:
            self.assertIn(needle.lower(), reason.lower())

    def test_kvadro_root_is_a_reference_key(self) -> None:
        self.assertIn("KVADRO_ROOT", g.REFERENCE_KEYS)
        self.assertIn(self.legacy.resolve(), self.guard.reference_roots)

    def test_placeholder_from_the_example_file_is_skipped(self) -> None:
        (self.project / ".ai" / "local.env").write_text("KVADRO_ROOT=/path/to/Server/kvadro.uz\n")
        self.assertEqual(g.Guard.from_project(self.project).reference_roots, [])

    def test_edit_under_the_legacy_root_is_denied_with_the_legacy_reason(self) -> None:
        reason = self.decide("Edit", {"file_path": str(self.app / "src" / "App.vue")})
        self.assertDenied(reason, "read-only", "legacy", "never copy", "production")
        self.assertDenied(self.decide("Write", {"file_path": str(self.legacy / "NOTES.md")}), "read-only", "legacy")

    def test_the_legacy_reason_is_not_given_for_other_reference_codebases(self) -> None:
        reason = self.decide("Edit", {"file_path": str(self.ref / "backend" / "x.php")})
        self.assertDenied(reason, "read-only", "app.uz")
        assert reason is not None
        self.assertNotIn("legacy", reason.lower())

    def test_builds_and_package_managers_in_the_legacy_root_are_denied(self) -> None:
        for command in ("npm run build", "npm install", "pnpm install", "npx vite", "yarn dev", "make build"):
            with self.subTest(command=command):
                self.assertDenied(self.bash(command, cwd=self.app), "read-only", "legacy")
        self.assertDenied(self.bash("cd %s && npm run dev" % self.app), "read-only", "legacy")
        self.assertDenied(self.bash("./node_modules/.bin/vite build", cwd=self.app), "read-only")

    def test_svn_writes_in_the_legacy_root_are_denied(self) -> None:
        self.assertDenied(self.bash("svn commit -m x", cwd=self.legacy), "read-only", "svn commit")
        self.assertDenied(self.bash("svn update", cwd=self.legacy), "read-only", "svn update")
        self.assertDenied(self.bash("svn revert -R %s" % self.legacy), "read-only")

    def test_reading_the_legacy_root_is_allowed(self) -> None:
        self.assertIsNone(self.decide("Read", {"file_path": str(self.app / "src" / "App.vue")}))
        self.assertIsNone(self.decide("Grep", {"pattern": "template", "path": str(self.app)}))
        self.assertIsNone(self.bash("rg -n 'template' src", cwd=self.app))
        self.assertIsNone(self.bash("svn info", cwd=self.legacy))
        self.assertIsNone(self.bash("svn log -l 5 %s" % self.legacy))
        self.assertIsNone(self.bash("cat %s/package.json" % self.app))

    def test_env_files_in_the_legacy_root_are_never_read(self) -> None:
        self.assertDenied(self.decide("Read", {"file_path": str(self.app / ".env")}), "never")
        self.assertDenied(self.bash("cat .env", cwd=self.app), "never")
        self.assertDenied(self.bash("cp %s/.env /tmp/legacy.env" % self.app), "never")

    def test_folder_name_fallback_without_local_env(self) -> None:
        (self.project / ".ai" / "local.env").unlink()
        guard = g.Guard.from_project(self.project)
        self.assertEqual(guard.reference_roots, [])
        legacy = "/Users/dev/Server/kvadro.uz/demo/app"
        self.assertDenied(guard.decide("Edit", {"file_path": legacy + "/src/App.vue"}, str(self.project)), "read-only", "kvadro.uz", "legacy")
        self.assertDenied(guard.decide("Bash", {"command": "npm run build"}, legacy), "read-only", "legacy")
        self.assertDenied(guard.decide("Read", {"file_path": legacy + "/.env"}, str(self.project)), "never")
        self.assertIsNone(guard.decide("Read", {"file_path": legacy + "/src/App.vue"}, str(self.project)))


class HelperCase(unittest.TestCase):
    def test_split_segments_handles_operators_and_substitution(self) -> None:
        segments = g.split_segments("a && b | c; d $(e) `f` || g\nh")
        self.assertEqual([s.strip() for s in segments if s.strip()], ["a", "b", "c", "d", "e", "f", "g", "h"])

    def test_is_secret_name(self) -> None:
        for name in (".env", ".env.local", ".env.production", "envprod", "envprod.txt", "key.md", "id_rsa", "server.key", "homi.loc-key.pem", ".env.backup"):
            self.assertTrue(g.is_secret_name(name), name)
        for name in (".env.example", ".env.local.example", ".env.dist", "README.md", "homi.loc.pem", "keyboard.md", "environment.php"):
            self.assertFalse(g.is_secret_name(name), name)

    def test_load_local_env_parses_simple_assignments(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "local.env"
            path.write_text('# comment\nA=1\nB="two words"\nC=\nexport D=4\n')
            self.assertEqual(g.load_local_env(path), {"A": "1", "B": "two words", "C": "", "D": "4"})
        self.assertEqual(g.load_local_env(Path("/nonexistent/local.env")), {})


if __name__ == "__main__":
    unittest.main()
