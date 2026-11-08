#!/usr/bin/env python3
"""HOMI PreToolUse guard — the two red lines of the master prompt that tooling can enforce.

1. Reference codebases are read-only (master prompt §4, CLAUDE.md): no Edit/Write/NotebookEdit, no
   destructive shell commands, no project tooling (composer, artisan, pnpm, git/svn writes) under the
   paths listed in `.ai/local.env` (`APPUZ_ROOT`, collectors, nginx mirrors). Without that file the
   guard falls back to path segments named `app.uz`, `telegram.uz`, `datahub.uz`, `geo.uz`.
2. Secrets are never printed or copied: `.env*` (except `*.example|dist|sample|template`), `envprod*`,
   `key.md`, private keys. Inside a reference codebase this extends to every `.env*`, `settings.local.json`
   and database dumps. Key *names* may still be listed (`grep -o '^[A-Z_]*=' backend/.env`).

Input: the PreToolUse JSON on stdin. Output: nothing (allow) or a JSON `permissionDecision: deny` with the
reason. Internal errors never block a tool call; they surface as a `systemMessage`.
Python 3.9+ (macOS system python), standard library only — chosen over bash + jq because jq is not
guaranteed on every machine and these path rules need unit tests. Tests: `.ai/hooks/tests/test_guard_paths.py`.
"""

from __future__ import annotations

import json
import os
import re
import shlex
import sys
from pathlib import Path
from typing import Dict, Iterable, List, Optional

REFERENCE_KEYS = (
    "APPUZ_ROOT",
    "TELEGRAMUZ_ROOT",
    "DATAHUB_ROOT",
    "GEOUZ_ROOT",
    "NGINX_MIRROR_WEB",
    "NGINX_MIRROR_CDN",
    "CDN_DOCS_PATH",
)
FALLBACK_MARKERS = ("app.uz", "telegram.uz", "datahub.uz", "geo.uz")

WRITE_TOOLS = {"Edit", "Write", "NotebookEdit", "MultiEdit"}
READ_TOOLS = {"Read", "Grep"}

SECRET_EXACT = {".env", "envprod", "key.md", "id_rsa", "id_ed25519", "id_ecdsa", "id_dsa"}
SECRET_EXEMPT_SUFFIXES = (".example", ".dist", ".sample", ".template", ".pub")
SECRET_RE = re.compile(
    r"^(\.env(\..+)?|envprod.*|.*-key\.pem|.*\.key|.*\.p12|.*\.pfx|.*\.keystore|id_rsa.*|id_ed25519.*|id_ecdsa.*)$"
)
REFERENCE_SECRET_RE = re.compile(r"^(\.env.*|settings\.local\.json|.*\.sql|.*\.sql\.gz|.*\.sqlite3?|.*\.dump)$")

WRAPPERS = {"sudo", "doas", "nice", "nohup", "time", "command", "exec", "env", "builtin", "xargs", "stdbuf", "caffeinate"}
DUMP_COMMANDS = {
    "cat", "bat", "less", "more", "head", "tail", "tac", "nl", "strings", "xxd", "hexdump", "od", "base64",
    "view", "vim", "vi", "nvim", "nano", "emacs", "code", "subl", "open", "pbcopy", "source", ".", "diff",
    "cmp", "comm", "paste", "column", "jq", "yq", "tee", "sort", "uniq", "rev", "fold", "fmt", "pr", "iconv",
}
GREP_COMMANDS = {"grep", "egrep", "fgrep", "rg", "ugrep", "ug", "ag", "ack", "zgrep"}
GREP_SAFE_LONG = {"--count", "--quiet", "--silent", "--files-with-matches", "--files-without-match", "--only-matching"}
COPY_COMMANDS = {"cp", "mv", "rsync", "scp", "install", "ln"}
FS_WRITE_COMMANDS = {
    "rm", "rmdir", "mv", "touch", "mkdir", "chmod", "chown", "chgrp", "ln", "truncate", "unlink", "shred",
    "install", "patch", "tee", "dd", "mkfifo", "rename", "chattr", "setfacl",
}
TOOLING_COMMANDS = {"composer", "npm", "pnpm", "yarn", "npx", "bun", "bunx", "make", "artisan", "pint", "phpstan", "pest", "phpunit"}
GIT_READ = {
    "status", "log", "diff", "show", "blame", "ls-files", "grep", "rev-parse", "describe", "shortlog", "cat-file",
    "ls-tree", "ls-remote", "reflog", "help", "version", "--version", "rev-list", "name-rev", "count-objects",
}
SVN_READ = {"info", "status", "st", "stat", "log", "diff", "di", "cat", "list", "ls", "blame", "praise", "annotate", "ann",
            "propget", "pget", "pg", "proplist", "plist", "pl", "help", "h", "?", "--version"}
RECURSIVE_FLAGS = {"-r", "-R", "-a", "--recursive", "--archive"}

SEGMENT_SPLIT_RE = re.compile(r"\|\||&&|;|\||\n|&|\$\(|`|\(|\)")
ASSIGNMENT_RE = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)=(.*)$")
VARIABLE_RE = re.compile(r"\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?")


# --- helpers -------------------------------------------------------------------------------------


def is_secret_name(name: str) -> bool:
    lower = name.lower()
    if lower.endswith(SECRET_EXEMPT_SUFFIXES):
        return False
    if lower in SECRET_EXACT:
        return True
    return bool(SECRET_RE.match(lower))


def is_reference_secret_name(name: str) -> bool:
    return is_secret_name(name) or bool(REFERENCE_SECRET_RE.match(name.lower()))


def load_local_env(path: Path) -> Dict[str, str]:
    """Parse `.ai/local.env` (KEY=value lines, optional `export`, quotes, comments)."""
    values: Dict[str, str] = {}
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return values
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export "):].strip()
        match = ASSIGNMENT_RE.match(line)
        if not match:
            continue
        key, value = match.group(1), match.group(2).strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        values[key] = value
    return values


def split_segments(command: str) -> List[str]:
    """Split a shell command into simple-command segments (operators, newlines, substitutions)."""
    return SEGMENT_SPLIT_RE.split(command)


def tokenize(segment: str) -> List[str]:
    try:
        return shlex.split(segment, posix=True)
    except ValueError:
        return segment.split()


def project_root() -> Path:
    env_root = os.environ.get("CLAUDE_PROJECT_DIR")
    if env_root:
        return Path(env_root).resolve()
    return Path(__file__).resolve().parents[2]


# --- guard ---------------------------------------------------------------------------------------


class Guard:
    def __init__(self, project_root: Path, reference_roots: List[Path]) -> None:
        self.project_root = Path(os.path.realpath(str(project_root)))
        self.reference_roots = reference_roots

    @classmethod
    def from_project(cls, root: Path) -> "Guard":
        env = load_local_env(root / ".ai" / "local.env")
        roots: List[Path] = []
        for key in REFERENCE_KEYS:
            value = env.get(key, "").strip()
            if not value or value.startswith("/path/to"):
                continue
            resolved = Path(os.path.realpath(os.path.expanduser(value)))
            if resolved not in roots:
                roots.append(resolved)
        return cls(root, roots)

    # path classification --------------------------------------------------------------------

    def resolve(self, raw: str, cwd: str) -> Optional[Path]:
        candidate = raw.strip().strip("\"'")
        if not candidate or candidate.startswith("$"):
            return None
        candidate = os.path.expanduser(candidate)
        path = Path(candidate)
        if not path.is_absolute():
            path = Path(cwd) / path
        return Path(os.path.realpath(str(path)))

    def is_under(self, path: Path, root: Path) -> bool:
        return path == root or root in path.parents

    def is_project(self, path: Path) -> bool:
        return self.is_under(path, self.project_root)

    def is_reference(self, path: Path) -> bool:
        if self.is_project(path):
            return False
        if any(self.is_under(path, root) for root in self.reference_roots):
            return True
        return any(part in FALLBACK_MARKERS for part in path.parts)

    def reference_label(self, path: Path) -> str:
        for root in self.reference_roots:
            if self.is_under(path, root):
                return root.name
        for part in path.parts:
            if part in FALLBACK_MARKERS:
                return part
        return "the reference codebase"

    # reasons ----------------------------------------------------------------------------------

    def readonly_reason(self, path: Path, detail: str = "") -> str:
        label = self.reference_label(path)
        suffix = " (%s)" % detail if detail else ""
        return (
            "HOMI guard: `%s` is a READ-ONLY reference codebase (master prompt §4, CLAUDE.md). "
            "Writing, deleting or running project tooling there is blocked%s: %s. "
            "Port single files or patterns into homi.uz instead." % (label, suffix, path)
        )

    def secret_reason(self, path: Path) -> Optional[str]:
        name = path.name
        if self.is_reference(path) and is_reference_secret_name(name):
            return (
                "HOMI guard: never read or copy `.env*`, local agent settings or data dumps of the read-only "
                "reference codebase `%s` (master prompt §4) — blocked: %s." % (self.reference_label(path), path)
            )
        if is_secret_name(name):
            try:
                shown = str(path.relative_to(self.project_root))
            except ValueError:
                shown = str(path)
            return (
                "HOMI guard: `%s` holds secrets and is never printed, read or copied (master prompt §15). "
                "To check which keys exist use names only: grep -o '^[A-Z_]*=' %s — or run `make dev-check` "
                "for the .env/.env.example parity report." % (name, shown)
            )
        return None

    # decision ---------------------------------------------------------------------------------

    def decide(self, tool_name: str, tool_input: dict, cwd: str) -> Optional[str]:
        if tool_name in WRITE_TOOLS or tool_name in READ_TOOLS:
            raw = tool_input.get("file_path") or tool_input.get("notebook_path") or tool_input.get("path") or ""
            path = self.resolve(str(raw), cwd) if raw else None
            if path is None:
                return None
            if tool_name in WRITE_TOOLS and self.is_reference(path):
                return self.readonly_reason(path)
            return self.secret_reason(path)
        if tool_name == "Bash":
            return self.decide_bash(str(tool_input.get("command") or ""), cwd)
        return None

    def decide_bash(self, command: str, cwd: str) -> Optional[str]:
        context = Path(cwd)
        variables: Dict[str, str] = {
            "HOME": str(Path.home()),
            "CLAUDE_PROJECT_DIR": str(self.project_root),
            "PWD": cwd,
        }
        for segment in split_segments(command):
            tokens = tokenize(segment)
            if not tokens:
                continue
            tokens = [self.expand(token, variables) for token in tokens]
            # leading assignments: remember them (A=/x; cd "$A") and skip them
            while tokens and ASSIGNMENT_RE.match(tokens[0]):
                match = ASSIGNMENT_RE.match(tokens[0])
                assert match is not None
                variables[match.group(1)] = match.group(2).strip("\"'")
                tokens = tokens[1:]
            tokens = self.strip_wrappers(tokens)
            if not tokens:
                continue
            command_word = tokens[0]
            if command_word in {"cd", "pushd"}:
                target = next((t for t in tokens[1:] if not t.startswith("-")), None)
                if target is None:
                    context = Path.home()
                else:
                    resolved = self.resolve(target, str(context))
                    if resolved is not None:
                        context = resolved
                continue
            reason = self.check_segment(segment.strip(), command_word, tokens, context)
            if reason:
                return reason
        return None

    def expand(self, token: str, variables: Dict[str, str]) -> str:
        def replace(match: "re.Match[str]") -> str:
            return variables.get(match.group(1), match.group(0))

        return VARIABLE_RE.sub(replace, token)

    def strip_wrappers(self, tokens: List[str]) -> List[str]:
        index = 0
        while index < len(tokens):
            word = os.path.basename(tokens[index])
            if word in WRAPPERS:
                index += 1
                # skip the wrapper's own short options (sudo -u user, env -i, nice -n 5)
                while index < len(tokens) and tokens[index].startswith("-"):
                    if tokens[index] in {"-u", "-n", "-g", "-C"} and index + 1 < len(tokens):
                        index += 1
                    index += 1
                continue
            if word == "timeout":
                index += 2
                continue
            break
        return tokens[index:]

    def check_segment(self, segment: str, command_word: str, tokens: List[str], context: Path) -> Optional[str]:
        word = os.path.basename(command_word)
        args = tokens[1:]
        positional = [t for t in args if not t.startswith("-") and t not in {">", ">>", "&>", ">|", "<", "<<", "<<<"}]
        resolved = {t: self.resolve(t, str(context)) for t in positional}
        reference_paths = [p for p in resolved.values() if p is not None and self.is_reference(p)]
        context_in_reference = self.is_reference(context)

        # 1. secrets ------------------------------------------------------------------------
        secret_hits = [
            (raw, path) for raw, path in resolved.items()
            if path is not None and (is_secret_name(path.name) or (self.is_reference(path) and is_reference_secret_name(path.name)))
        ]
        if secret_hits:
            if word in COPY_COMMANDS:
                sources = [path for raw, path in secret_hits if raw != positional[-1]] if len(positional) > 1 else [p for _, p in secret_hits]
                for path in sources:
                    return self.secret_reason(path)
            elif word in GREP_COMMANDS:
                if not self.grep_is_names_only(args):
                    return self.secret_reason(secret_hits[0][1]) + " (grep without -c/-q/-l/-o prints values)"
            elif word == "sed":
                if not any(a.startswith("-i") or a == "--in-place" for a in args) and not re.search(r"=\.\*\$?//", segment):
                    return self.secret_reason(secret_hits[0][1])
            elif word in {"awk", "gawk", "mawk"}:
                if "$1" not in segment or re.search(r"\$(?:[02-9]|NF)", segment):
                    return self.secret_reason(secret_hits[0][1])
            elif word == "cut":
                if not re.search(r"(^|\s)-f\s?1(\s|$)", segment):
                    return self.secret_reason(secret_hits[0][1])
            elif word in DUMP_COMMANDS or (word in {"python", "python3", "php", "node", "perl", "ruby"}):
                return self.secret_reason(secret_hits[0][1])
            # ls, wc, stat, test, rm, touch, chmod, … only touch metadata or the file as a whole: allowed

        # 2. reference codebases are read-only -------------------------------------------------
        if not reference_paths and not context_in_reference:
            return None
        anchor = reference_paths[0] if reference_paths else context

        # redirects into the reference tree
        for index, token in enumerate(tokens):
            if token in {">", ">>", "&>", ">|"} and index + 1 < len(tokens):
                target = self.resolve(tokens[index + 1], str(context))
                if target is not None and self.is_reference(target):
                    return self.readonly_reason(target, "shell redirect")
            if (token.startswith(">") or token.startswith("&>")) and len(token) > 1 and token not in {">", ">>", "&>", ">|"}:
                target = self.resolve(token.lstrip("&>|"), str(context))
                if target is not None and self.is_reference(target):
                    return self.readonly_reason(target, "shell redirect")

        if word in COPY_COMMANDS and word not in {"ln"}:
            destination = resolved.get(positional[-1]) if positional else None
            if destination is not None and self.is_reference(destination):
                return self.readonly_reason(destination, word)
            sources_in_reference = [resolved[t] for t in positional[:-1] if resolved.get(t) is not None and self.is_reference(resolved[t])]  # type: ignore[arg-type]
            if sources_in_reference and (word == "rsync" or any(a in RECURSIVE_FLAGS or (a.startswith("-") and not a.startswith("--") and set(a[1:]) & {"r", "R", "a"}) for a in args)):
                return (
                    "HOMI guard: copy single files or patterns from the reference codebase, never folders "
                    "(reference-codebase.md rules) — blocked: %s" % segment
                )
            return None

        if word in FS_WRITE_COMMANDS and (reference_paths or (context_in_reference and word in {"touch", "mkdir", "tee", "rm", "rmdir", "mv", "chmod", "chown"})):
            return self.readonly_reason(anchor, word)

        if word in {"sed", "perl"} and any(a.startswith("-i") or a == "--in-place" for a in args) and reference_paths:
            return self.readonly_reason(anchor, "%s -i" % word)

        if word == "find" and any(a in {"-delete", "-exec", "-execdir", "-ok", "-okdir"} for a in args) and (reference_paths or context_in_reference):
            return self.readonly_reason(anchor, "find -delete/-exec")

        if word == "git":
            return self.check_git(args, context, context_in_reference, anchor)

        if word == "svn":
            subcommand = next((a for a in args if not a.startswith("-")), "")
            if (context_in_reference or reference_paths) and subcommand not in SVN_READ:
                return self.readonly_reason(anchor, "svn %s" % subcommand)
            return None

        is_artisan = word == "php" and any(os.path.basename(a) == "artisan" for a in positional[:1])
        is_vendor_bin = "/vendor/bin/" in command_word or "node_modules/.bin/" in command_word
        if (word in TOOLING_COMMANDS or is_artisan or is_vendor_bin) and (context_in_reference or reference_paths):
            return self.readonly_reason(anchor, "project tooling (%s) must run in homi.uz" % word)

        return None

    def grep_is_names_only(self, args: Iterable[str]) -> bool:
        for arg in args:
            if arg in GREP_SAFE_LONG:
                return True
            if arg.startswith("-") and not arg.startswith("--") and set(arg[1:]) & {"c", "q", "l", "L", "o"}:
                return True
        return False

    def check_git(self, args: List[str], context: Path, context_in_reference: bool, anchor: Path) -> Optional[str]:
        repo = context
        rest: List[str] = []
        index = 0
        while index < len(args):
            arg = args[index]
            if arg == "-C" and index + 1 < len(args):
                resolved = self.resolve(args[index + 1], str(context))
                if resolved is not None:
                    repo = resolved
                index += 2
                continue
            if arg == "-c" and index + 1 < len(args):
                index += 2
                continue
            if arg.startswith("--git-dir=") or arg.startswith("--work-tree="):
                resolved = self.resolve(arg.split("=", 1)[1], str(context))
                if resolved is not None:
                    repo = resolved
                index += 1
                continue
            rest.append(arg)
            index += 1
        if not self.is_reference(repo):
            return None
        subcommand = next((a for a in rest if not a.startswith("-")), "")
        options = [a for a in rest if a.startswith("-")]
        safe = subcommand in GIT_READ
        if subcommand == "branch":
            safe = not any(o in {"-d", "-D", "-m", "-M", "-c", "-C", "--delete", "--move", "--copy", "-f", "--force"} for o in options) and len([a for a in rest if not a.startswith("-")]) == 1
        elif subcommand == "tag":
            safe = len([a for a in rest if not a.startswith("-")]) == 1 or "-l" in options or "--list" in options
        elif subcommand == "config":
            safe = any(o in {"--get", "--get-all", "--get-regexp", "--list", "-l"} for o in options)
        elif subcommand == "remote":
            safe = len(rest) == 1 or rest[1:2] in (["-v"], ["show"], ["get-url"])
        elif subcommand == "stash":
            safe = rest[1:2] in (["list"], ["show"])
        elif subcommand == "worktree":
            safe = rest[1:2] == ["list"]
        if safe:
            return None
        return self.readonly_reason(repo if self.is_reference(repo) else anchor, "git %s" % subcommand)


# --- entry point ---------------------------------------------------------------------------------


def main() -> int:
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw) if raw.strip() else {}
        guard = Guard.from_project(project_root())
        reason = guard.decide(
            str(payload.get("tool_name") or ""),
            payload.get("tool_input") or {},
            str(payload.get("cwd") or os.getcwd()),
        )
        if reason:
            print(json.dumps({
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": reason,
                }
            }))
    except Exception as error:  # fail open, but never silently
        print(json.dumps({"systemMessage": "HOMI guard (guard_paths.py) failed: %s" % error}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
