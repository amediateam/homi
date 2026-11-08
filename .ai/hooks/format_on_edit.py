#!/usr/bin/env python3
"""HOMI PostToolUse hook — format the file an agent just edited, with the project's own tools.

Routing (see `plan_for`):
- `backend/**/*.php`            → `vendor/bin/pint --format agent <file>` (Laravel Boost rule: Pint after every PHP edit)
- `frontend/{landing,app,arm}/` → `pnpm exec eslint --fix <file>` for ts/tsx/js/jsx/mjs/cjs
- `backend/resources/js/`       → `npx vp fmt <file>` (Vite+ formatter of the frozen Inertia UI)
Vendor, build output, storage and workspace packages (no lint rules yet) are skipped.

Silent when nothing changed. When the formatter rewrote the file, or failed (syntax error, remaining lint
errors), the hook returns `additionalContext` so the model re-reads the file / fixes the problem.
Tools that are not installed are skipped, never reported as failures.

Python 3.9+, standard library only. Tests: `.ai/hooks/tests/test_format_on_edit.py`.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

NEXT_APPS = ("landing", "app", "arm")
JS_SUFFIXES = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}
SKIP_PARTS = {"vendor", "node_modules", ".next", "storage"}
TIMEOUT_SECONDS = 60


@dataclass
class Plan:
    tool: str
    cwd: Path
    argv: list
    required: Path  # the binary that must exist for the plan to run


def plan_for(root: Path, file_path: Path) -> Optional[Plan]:
    try:
        relative = file_path.resolve().relative_to(root.resolve()) if file_path.is_absolute() else file_path
    except ValueError:
        return None
    parts = relative.parts
    if not parts or any(part in SKIP_PARTS for part in parts) or parts[:3] == ("backend", "bootstrap", "cache"):
        return None

    if parts[0] == "backend":
        inner = Path(*parts[1:])
        if relative.suffix == ".php":
            return Plan("pint", root / "backend", ["vendor/bin/pint", "--format", "agent", str(inner)], root / "backend" / "vendor" / "bin" / "pint")
        if relative.suffix in JS_SUFFIXES and parts[1:3] == ("resources", "js"):
            return Plan("vp", root / "backend", ["npx", "vp", "fmt", str(inner)], root / "backend" / "node_modules" / ".bin" / "vp")
        return None

    if parts[0] == "frontend" and len(parts) > 2 and parts[1] in NEXT_APPS and relative.suffix in JS_SUFFIXES:
        app_dir = root / "frontend" / parts[1]
        inner = Path(*parts[2:])
        return Plan("eslint", app_dir, ["pnpm", "exec", "eslint", "--fix", str(inner)], app_dir / "node_modules" / ".bin" / "eslint")

    return None


def summarize(plan: Optional[Plan], returncode: int, stdout: str, stderr: str) -> Optional[str]:
    if plan is None:
        return None
    output = (stdout or "").strip()
    if plan.tool == "pint":
        try:
            report = json.loads(output.splitlines()[0]) if output else {}
        except (ValueError, IndexError):
            report = {}
        result = report.get("result")
        if returncode == 0 and result in (None, "passed"):
            return None
        if result == "fixed":
            files = ", ".join(f.get("path", "?") for f in report.get("files", []))
            return "Pint reformatted %s after your edit — re-read the file before editing it again." % (files or plan.argv[-1])
        errors = "; ".join("%s: %s" % (e.get("path", "?"), e.get("message", "?")) for e in report.get("errors", []))
        return "Pint failed on %s (exit %d): %s" % (plan.argv[-1], returncode, errors or (stderr or output)[:600])
    if returncode == 0:
        return None
    head = "\n".join(((stdout or "") + "\n" + (stderr or "")).strip().splitlines()[:25])
    return "%s reported problems in %s (exit %d):\n%s" % (plan.tool, plan.argv[-1], returncode, head)


def run(plan: Plan) -> Optional[str]:
    if not plan.required.exists():
        return None  # toolchain not installed on this machine — nothing to do
    try:
        completed = subprocess.run(
            plan.argv, cwd=str(plan.cwd), capture_output=True, text=True, timeout=TIMEOUT_SECONDS, check=False
        )
    except subprocess.TimeoutExpired:
        return "%s timed out after %ds on %s" % (plan.tool, TIMEOUT_SECONDS, plan.argv[-1])
    except OSError as error:
        return "%s could not start: %s" % (plan.tool, error)
    return summarize(plan, completed.returncode, completed.stdout, completed.stderr)


def project_root() -> Path:
    env_root = os.environ.get("CLAUDE_PROJECT_DIR")
    if env_root:
        return Path(env_root).resolve()
    return Path(__file__).resolve().parents[2]


def main() -> int:
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw) if raw.strip() else {}
        tool_input = payload.get("tool_input") or {}
        tool_response = payload.get("tool_response") or {}
        file_path = tool_input.get("file_path") or (tool_response.get("filePath") if isinstance(tool_response, dict) else None)
        if not file_path:
            return 0
        root = project_root()
        path = Path(file_path)
        if not path.is_absolute():
            path = Path(payload.get("cwd") or os.getcwd()) / path
        plan = plan_for(root, path)
        if plan is None:
            return 0
        message = run(plan)
        if message:
            print(json.dumps({"hookSpecificOutput": {"hookEventName": "PostToolUse", "additionalContext": message}}))
    except Exception as error:  # formatting must never block the agent
        print(json.dumps({"systemMessage": "HOMI format_on_edit.py failed: %s" % error}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
