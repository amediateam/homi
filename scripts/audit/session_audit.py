#!/usr/bin/env python3
"""Where the wall clock of Claude Code sessions went.

Reads the session transcripts Claude Code keeps under `~/.claude/projects` (one JSON object per line) and splits the
wall clock of every session inside a time window into what its main thread was doing:

  model            a model request in flight
  tools            a foreground tool running (tests, builds, git, reads)
  wait developer   idle until the human typed (prompt or slash command), an AskUserQuestion dialog open,
                   or a tool call waiting for a click on a permission prompt
  wait CI          idle until a background `gh` watch reported (or a foreground `gh run watch`)
  wait agents      idle until a subagent or teammate reported
  wait commands    idle until any other background command reported (local test runs, polling loops)
  compaction       a context compaction
  other            gaps nothing explains, plus harness overhead under five seconds

It then details the sessions of one project (the current directory unless `--project` is given): time per git branch,
what the steps did, the longest waits and tool calls, request latency against context size and against concurrent
sessions, compactions, subagents and the developer's prompts. With `--gh` it adds the pull requests merged in the
window (added lines split into docs, tests and code) and the CI runs.

Usage (standard library only):

    python3 scripts/audit/session_audit.py                      # the last 24 hours, this project
    python3 scripts/audit/session_audit.py --hours 72 --gh      # three days, with GitHub ground truth
    python3 scripts/audit/session_audit.py --since 2026-11-19T22:00Z --until 2026-11-20T22:00Z
    python3 scripts/audit/session_audit.py --json audit.json    # also write the bucket totals as JSON

Reading the numbers:
- Timestamps are facts; the buckets are a partition of each session's main thread (model > question or click >
  tool > gap). A subagent launch returns at once, so its cost shows as "wait agents"; a background `gh` watch shows as
  "wait CI". Time per branch follows the branch checked out when the entry was written.
- "What the steps did" is approximate: a Bash call counts as a write when it has a heredoc, a redirect to a source file
  or an in-place edit, and its target decides between code, tests and docs.
- Privacy: prompt text is printed for the detailed project only. Other projects appear as aggregates. Nothing is sent
  anywhere unless `--gh` is given, which asks GitHub about the detailed project's own repository.
"""

from __future__ import annotations

import argparse
import bisect
import json
import os
import re
import shutil
import statistics
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

LOCAL = datetime.now().astimezone().tzinfo
PROJECTS = os.path.join(os.path.expanduser("~"), ".claude", "projects")

BUCKETS = ["model", "tools", "wait developer", "wait CI", "wait agents", "wait commands", "compaction", "other"]
PRIORITY = {"compaction": 5, "model": 4, "question": 3, "click": 3, "ci-foreground": 2, "tool": 2}
AGENT_TOOLS = {"Agent", "Task", "SendMessage", "TaskStop", "Workflow", "advisor"}
READ_TOOLS = {"Read", "Grep", "Glob", "ToolSearch"}
EDIT_TOOLS = {"Edit", "Write", "NotebookEdit"}
READ_COMMANDS = {"rg", "grep", "sed", "cat", "ls", "wc", "head", "tail", "find", "awk", "jq", "nl", "diff", "stat", "file", "echo", "printf"}
STEP_ORDER = ["write code", "write tests", "write docs", "verify", "git/gh", "delegate", "question", "other tool", "read"]


def epoch(stamp: str) -> float:
    return datetime.fromisoformat(stamp.replace("Z", "+00:00")).timestamp()


def local(seconds: float, fmt: str = "%d %H:%M") -> str:
    return datetime.fromtimestamp(seconds, LOCAL).strftime(fmt)


def hm(seconds: float) -> str:
    minutes = int(round(seconds / 60))
    return f"{minutes // 60}:{minutes % 60:02d}"


def slug(path: str) -> str:
    """The folder name Claude Code gives a project directory under `~/.claude/projects`."""
    return re.sub(r"[^A-Za-z0-9]", "-", os.path.abspath(path))


def median(values) -> float:
    values = list(values)
    return statistics.median(values) if values else 0.0


def p90(values) -> float:
    values = sorted(values)
    if len(values) < 10:
        return values[-1] if values else 0.0
    return statistics.quantiles(values, n=10)[-1]


def text_of(content) -> str:
    if isinstance(content, str):
        return content
    return " ".join(part.get("text", "") for part in (content or []) if isinstance(part, dict) and part.get("type") == "text")


def load(path: str, t0: float, t1: float, main_only: bool = True) -> list:
    entries = []
    with open(path, errors="replace") as handle:
        for line in handle:
            try:
                entry = json.loads(line)
            except ValueError:
                continue
            stamp = entry.get("timestamp")
            if not stamp:
                continue
            try:
                at = epoch(stamp)
            except ValueError:
                continue
            if at < t0 or at > t1 or (main_only and entry.get("isSidechain")):
                continue
            entries.append((at, entry))
    entries.sort(key=lambda pair: pair[0])
    return entries


def bare_command(command: str) -> str:
    """The command without leading `cd … &&` and `VAR=value` prefixes."""
    command = command.strip()
    command = re.sub(r"^(cd\s+\S+\s*(&&|;)\s*)+", "", command)
    return re.sub(r"^([A-Za-z_]+=\S*\s+)+", "", command)


def path_kind(path: str) -> str:
    path = path or ""
    if re.search(r"(^|/)docs/|(^|/)\.ai/|/memory/|scratchpad|\.md$", path):
        return "docs"
    if re.search(r"/tests?/|/e2e/|\.test\.|\.spec\.|/testing/", path):
        return "tests"
    return "code"


def bash_kind(command: str) -> str:
    bare = bare_command(command)
    first = bare.split(None, 1)[0] if bare else ""
    if re.search(r"gh run watch|gh pr checks[^|;&]*--watch", command):
        return "ci-foreground"
    if first in ("git", "gh"):
        return "git/gh"
    if re.search(
        r"\b(pnpm|npm|npx|yarn)\b[^|;&]*\b(test|vitest|lint|build|typecheck|tsc|eslint|playwright|types:\w+)\b"
        r"|\bmake (ci|e2e|test)|artisan test|\btsc\b|\beslint\b|\bvitest\b|playwright test|phpstan|pint|pytest|unittest",
        command,
    ):
        return "verify"
    if re.search(r"<<-?\s*['\"]?[A-Za-z_]+|\.write_text\(|open\([^)]*['\"][wa]['\"]|\bsed -i|\bperl -[0-9]*pi|>\s*\S+\.(tsx?|jsx?|css|md|json|php|mjs|ya?ml|py)\b", command):
        kinds = Counter(path_kind("/" + found) for found in re.findall(r"[\w@./\[\]()-]+\.(?:tsx?|jsx?|css|md|json|php|mjs|ya?ml|py)\b", command))
        if kinds:
            return "write " + kinds.most_common(1)[0][0]
    if first in READ_COMMANDS:
        return "read"
    return "other tool"


def tool_kind(name: str, tool_input: dict) -> str:
    if name == "Bash":
        return bash_kind(tool_input.get("command", ""))
    if name in EDIT_TOOLS:
        return "write " + path_kind(tool_input.get("file_path", ""))
    if name in READ_TOOLS:
        return "read"
    if name in AGENT_TOOLS:
        return "delegate"
    if name == "AskUserQuestion":
        return "question"
    return "other tool"


def analyse(path: str, t0: float, t1: float) -> dict | None:
    entries = load(path, t0, t1)
    if not entries:
        return None

    requests, blocks, uses, results = {}, defaultdict(list), {}, {}
    humans, notifications, stops, compactions = [], [], [], []
    branches, pr_links, prompts = [], {}, []
    previous_at = entries[0][0]

    for at, entry in entries:
        kind = entry.get("type")
        if entry.get("gitBranch"):
            branches.append((at, entry["gitBranch"]))
        if kind == "api-request":
            params = entry.get("params") or {}
            requests[entry.get("id")] = {"at": at, "model": params.get("model"), "effort": (params.get("output_config") or {}).get("effort")}
        elif kind == "assistant":
            # Transcripts older than the `api-request` entry: the request starts at the entry before its first block.
            ref = entry.get("requestRef") or ("rid:" + str(entry.get("requestId")))
            if ref not in requests:
                requests[ref] = {"at": previous_at, "model": (entry.get("message") or {}).get("model"), "effort": entry.get("effort")}
            blocks[ref].append((at, entry))
            for part in (entry.get("message") or {}).get("content") or []:
                if isinstance(part, dict) and part.get("type") == "tool_use":
                    uses[part.get("id")] = {"at": at, "name": part.get("name", ""), "input": part.get("input") or {}, "ref": ref}
        elif kind == "user":
            content = (entry.get("message") or {}).get("content")
            is_result = False
            if isinstance(content, list):
                for part in content:
                    if isinstance(part, dict) and part.get("type") == "tool_result":
                        is_result = True
                        results[part.get("tool_use_id")] = {
                            "at": at,
                            "error": bool(part.get("is_error")),
                            "raw": entry.get("toolUseResult"),
                            "by_user": str((entry.get("permissionDecision") or {}).get("source") or "").startswith("user"),
                        }
            if not is_result:
                origin = (entry.get("origin") or {}).get("kind")
                text = text_of(content)
                if origin in ("task-notification", "peer"):
                    notifications.append((at, text, origin))
                elif not entry.get("isMeta") and not entry.get("isCompactSummary") and (origin == "human" or "<command-name>" in text):
                    slash = "<command-name>" in text
                    humans.append((at, "slash command" if slash else "prompt"))
                    if origin == "human" and not slash:
                        prompts.append((at, text.strip().replace("\n", " ")))
        elif kind == "queue-operation" and entry.get("operation") == "enqueue":
            notifications.append((at, entry.get("content") or "", "queue"))
        elif kind == "system":
            subtype = entry.get("subtype")
            if subtype == "stop_hook_summary":
                stops.append(at)
            elif subtype == "compact_boundary":
                meta = entry.get("compactMetadata") or {}
                compactions.append({"at": at, "seconds": (meta.get("durationMs") or 0) / 1000.0, "tokens": meta.get("preTokens"), "trigger": meta.get("trigger")})
        elif kind == "pr-link":
            pr_links.setdefault(entry.get("prNumber"), at)
        previous_at = at

    # One record per model request.
    steps = {}
    for ref, request in requests.items():
        parts = blocks.get(ref)
        if not parts:
            continue
        end = max(at for at, _ in parts)
        usage, thinking, effort = None, [], request["effort"]
        for _, entry in parts:
            usage = (entry.get("message") or {}).get("usage") or usage
            if entry.get("thinkingDurationMs") is not None:
                thinking.append(entry["thinkingDurationMs"])
            effort = entry.get("effort") or effort
        usage = usage or {}
        read, created, fresh = usage.get("cache_read_input_tokens") or 0, usage.get("cache_creation_input_tokens") or 0, usage.get("input_tokens") or 0
        steps[ref] = {
            "at": request["at"], "end": end, "seconds": max(0.0, end - request["at"]), "model": request["model"], "effort": effort,
            "context": read + created + fresh, "cache_read": read, "cache_created": created, "fresh": fresh,
            "output": usage.get("output_tokens") or 0, "thinking": (max(thinking) / 1000.0) if thinking else 0.0, "tools": [],
        }

    # Background tasks: which tool call started the task a notification names.
    tasks = {}
    calls = []
    for use_id, use in uses.items():
        result = results.get(use_id)
        if not result:
            continue
        kind = tool_kind(use["name"], use["input"])
        raw = result["raw"] if isinstance(result["raw"], dict) else {}
        command = use["input"].get("command", "") if isinstance(use["input"].get("command"), str) else ""
        if use["name"] in AGENT_TOOLS:
            for key in ("agentId", "agent_id"):
                if raw.get(key):
                    tasks[raw[key]] = "wait agents"
        for key in ("backgroundTaskId", "taskId"):
            if raw.get(key):
                tasks[raw[key]] = "wait CI" if re.search(r"(^|[\s;&|(])gh\s", command) else "wait commands"
        label = "question" if use["name"] == "AskUserQuestion" else "click" if result["by_user"] else "ci-foreground" if kind == "ci-foreground" else "tool"
        call = {
            "from": use["at"], "to": result["at"], "seconds": result["at"] - use["at"], "kind": kind, "name": use["name"], "label": label,
            "error": result["error"], "what": (bare_command(command)[:80] if use["name"] == "Bash" else str(use["input"].get("file_path") or use["input"].get("description") or "")[-70:]),
        }
        calls.append(call)
        if use["ref"] in steps:
            steps[use["ref"]]["tools"].append(call)

    def notification_kind(text: str, origin: str) -> tuple:
        found = re.search(r"<task-id>(.*?)</task-id>", text, re.S)
        summary = re.search(r"<summary>(.*?)</summary>", text, re.S)
        what = (summary.group(1) if summary else text).strip().replace("\n", " ")[:90]
        if found and found.group(1).strip() in tasks:
            return tasks[found.group(1).strip()], what
        if origin == "peer" or re.search(r"\b[Aa]gent\b|teammate", what):
            return "wait agents", what
        if re.search(r"PR #\d+|\bCI\b|checks", what):
            return "wait CI", what
        return "wait commands", what

    # Sweep: label every moment of the main thread.
    intervals = [(c["at"] - c["seconds"], c["at"], "compaction") for c in compactions]
    intervals += [(s["at"], s["end"], "model") for s in steps.values()]
    intervals += [(c["from"], c["to"], c["label"]) for c in calls]
    events = []
    for start, end, label in intervals:
        if end > start:
            events.append((start, 1, label))
            events.append((end, -1, label))
    events.sort(key=lambda event: (event[0], event[1]))
    bounds = sorted({event[0] for event in events} | {entries[0][0], entries[-1][0]})
    active, segments, cursor = Counter(), [], 0
    for index in range(len(bounds) - 1):
        start, end = bounds[index], bounds[index + 1]
        while cursor < len(events) and events[cursor][0] <= start:
            active[events[cursor][2]] += events[cursor][1]
            cursor += 1
        label, best = "gap", 0
        for name, count in active.items():
            if count > 0 and PRIORITY[name] > best:
                best, label = PRIORITY[name], name
        if segments and segments[-1][2] == label and abs(segments[-1][1] - start) < 1e-6:
            segments[-1] = (segments[-1][0], end, label)
        else:
            segments.append((start, end, label))

    humans.sort()
    notifications.sort(key=lambda note: note[0])
    human_at = [h[0] for h in humans]
    note_at = [n[0] for n in notifications]
    branch_at = [b[0] for b in branches]

    def branch(at: float) -> str:
        index = bisect.bisect_right(branch_at, at) - 1
        return branches[index][1] if index >= 0 else "?"

    totals, detail, per_branch, waits = Counter(), Counter(), defaultdict(Counter), []
    for start, end, label in segments:
        seconds = end - start
        what = ""
        if label == "gap":
            h = bisect.bisect_right(human_at, end + 0.5) - 1
            n = bisect.bisect_right(note_at, end + 0.5) - 1
            human = humans[h] if h >= 0 and humans[h][0] >= start - 0.5 else None
            note = notifications[n] if n >= 0 and notifications[n][0] >= start - 0.5 else None
            if human and (note is None or human[0] >= note[0]):
                bucket, sub = "wait developer", human[1]
            elif note:
                bucket, what = notification_kind(note[1], note[2])
                sub = bucket
            else:
                bucket, sub = "other", "overhead" if seconds < 5 else "unexplained"
        elif label == "question":
            bucket, sub = "wait developer", "question dialog"
        elif label == "click":
            bucket, sub = "wait developer", "permission prompt"
        elif label == "ci-foreground":
            bucket, sub = "wait CI", "wait CI"
        elif label == "tool":
            bucket, sub = "tools", "tools"
        else:
            bucket, sub = label, label
        totals[bucket] += seconds
        detail[f"{bucket}: {sub}" if sub != bucket else bucket] += seconds
        per_branch[branch(start)][bucket] += seconds
        if bucket.startswith("wait") or sub == "unexplained":
            waits.append({"seconds": seconds, "from": start, "to": end, "kind": sub, "what": what})

    # What each step did: its model time plus the union of its tool time, questions and clicks left out.
    step_time, step_count = Counter(), Counter()
    for step in steps.values():
        kinds = {call["kind"] for call in step["tools"]}
        category = next((kind for kind in STEP_ORDER if kind in kinds), "text only" if not kinds else "other tool")
        spans = sorted((call["from"], call["to"]) for call in step["tools"] if call["label"] in ("tool", "ci-foreground"))
        union, low, high = 0.0, None, None
        for start, end in spans:
            if low is None:
                low, high = start, end
            elif start <= high:
                high = max(high, end)
            else:
                union += high - low
                low, high = start, end
        if low is not None:
            union += high - low
        step["category"] = category
        step_time[category] += step["seconds"] + union
        step_count[category] += 1

    turns, previous = [], entries[0][0]
    ordered = sorted(steps.values(), key=lambda step: step["at"])
    for stop in sorted(stops):
        count = sum(1 for step in ordered if previous <= step["at"] < stop)
        if count:
            turns.append((count, previous))
        previous = stop

    return {
        "path": path, "id": os.path.basename(path)[:8], "project": os.path.basename(os.path.dirname(path)),
        "from": entries[0][0], "to": entries[-1][0], "totals": totals, "detail": detail, "per_branch": per_branch,
        "steps": ordered, "calls": calls, "waits": waits, "compactions": compactions, "prompts": prompts, "humans": humans,
        "pr_links": pr_links, "step_time": step_time, "step_count": step_count, "turns": turns, "uses": uses,
    }


def subagents(session_path: str, t0: float, t1: float) -> list:
    folder = os.path.join(session_path[: -len(".jsonl")], "subagents")
    found = []
    if not os.path.isdir(folder):
        return found
    for name in sorted(os.listdir(folder)):
        if not name.endswith(".jsonl") or os.path.getmtime(os.path.join(folder, name)) < t0:
            continue
        entries = load(os.path.join(folder, name), t0, t1, main_only=False)
        if not entries:
            continue
        output, edits, starts = {}, 0, []
        for at, entry in entries:
            if entry.get("type") == "api-request":
                starts.append(at)
            if entry.get("type") == "assistant":
                message = entry.get("message") or {}
                if message.get("usage") and entry.get("requestId"):
                    output[entry["requestId"]] = (message.get("model"), message["usage"].get("output_tokens") or 0)
                edits += sum(1 for part in message.get("content") or [] if isinstance(part, dict) and part.get("type") == "tool_use" and part.get("name") in EDIT_TOOLS)
        found.append({
            "from": entries[0][0], "seconds": entries[-1][0] - entries[0][0], "requests": len(output), "edits": edits,
            "output": sum(tokens for _, tokens in output.values()), "models": Counter(model for model, _ in output.values()), "starts": starts,
        })
    return found


def print_all_sessions(sessions: list, streams: list) -> None:
    print("=== 1. Every session in the window (main thread, h:mm)")
    print(f"{'project':30} {'id':8} {'local span':17} {'span':>6} " + " ".join(f"{b[:11]:>11}" for b in BUCKETS) + "  requests")
    sums = Counter()
    for s in sessions:
        sums.update(s["totals"])
        print(f"{s['project'][-30:]:30} {s['id']:8} {local(s['from'])}-{local(s['to'], '%H:%M'):5} {hm(s['to'] - s['from']):>6} "
              + " ".join(f"{hm(s['totals'].get(b, 0)):>11}" for b in BUCKETS) + f"  {len(s['steps'])}")
    total = sum(sums.values()) or 1
    print(f"{'ALL':30} {'':8} {'':17} {hm(total):>6} " + " ".join(f"{hm(sums.get(b, 0)):>11}" for b in BUCKETS))
    print(f"{'share':30} {'':8} {'':17} {'':>6} " + " ".join(f"{100 * sums.get(b, 0) / total:10.0f}%" for b in BUCKETS))
    hours = defaultdict(set)
    for at, stream in streams:
        hours[local(at, "%d %Hh")].add(stream.split("/")[0])
    print("\n=== 2. Sessions with a model request, per local hour")
    print("  " + "  ".join(f"{hour[3:]}:{len(ids)}" for hour, ids in sorted(hours.items())))
    print()


def print_project(sessions: list, streams: list, t0: float, t1: float, long_wait: int) -> None:
    if not sessions:
        print("=== 3. No session of the detailed project in the window\n")
        return
    sums, detail = Counter(), Counter()
    for s in sessions:
        sums.update(s["totals"])
        detail.update(s["detail"])
    total = sum(sums.values()) or 1
    print(f"=== 3. The detailed project: {len(sessions)} session(s), {hm(total)} of session time")
    for bucket in BUCKETS:
        print(f"  {bucket:16} {hm(sums.get(bucket, 0)):>6} {100 * sums.get(bucket, 0) / total:5.1f}%")
    print("  --- the same, finer")
    for name, seconds in detail.most_common():
        print(f"    {name:36} {hm(seconds):>6}")
    for earlier, later in zip(sessions, sessions[1:]):
        if later["from"] - earlier["to"] > 60:
            print(f"  no session open: {hm(later['from'] - earlier['to'])} ({local(earlier['to'])}..{local(later['from'], '%H:%M')})")

    print("  --- per git branch (h:mm)")
    per_branch = defaultdict(Counter)
    for s in sessions:
        for name, counter in s["per_branch"].items():
            per_branch[name].update(counter)
    print(f"  {'branch':44} " + " ".join(f"{b[:11]:>11}" for b in BUCKETS) + "   total")
    for name, counter in sorted(per_branch.items(), key=lambda item: -sum(item[1].values())):
        print(f"  {name[:44]:44} " + " ".join(f"{hm(counter.get(b, 0)):>11}" for b in BUCKETS) + f"   {hm(sum(counter.values()))}")

    step_time, step_count = Counter(), Counter()
    for s in sessions:
        step_time.update(s["step_time"])
        step_count.update(s["step_count"])
    working = sum(step_time.values()) or 1
    print("  --- what the steps did (model time plus their tools; approximate)")
    for name, seconds in step_time.most_common():
        print(f"    {name:14} {hm(seconds):>6} {100 * seconds / working:5.1f}%  steps={step_count[name]}")

    waits = sorted((w for s in sessions for w in s["waits"]), key=lambda w: w["from"])
    print(f"  --- waits of {long_wait} minutes and more")
    for w in waits:
        if w["seconds"] >= long_wait * 60:
            print(f"    {hm(w['seconds'])} {local(w['from'])}..{local(w['to'], '%H:%M')} {w['kind']:18} {w['what']}")
    calls = sorted((c for s in sessions for c in s["calls"]), key=lambda c: -c["seconds"])
    print("  --- longest tool calls (seconds)")
    for c in calls[:12]:
        print(f"    {c['seconds']:6.0f} {local(c['from'])} {c['label']:14} {c['kind']:12} {c['what']}")
    print(f"  --- tool errors: {sum(1 for c in calls if c['error'])} of {len(calls)}")

    steps = [step for s in sessions for step in s["steps"]]
    print("  --- model requests")
    print("    by model and effort:", dict(Counter((step["model"], step["effort"]) for step in steps)))
    print(f"    in flight {hm(sum(step['seconds'] for step in steps))}, of it thinking {hm(sum(step['thinking'] for step in steps))}; "
          f"output tokens {sum(step['output'] for step in steps):,}; cache read {sum(step['cache_read'] for step in steps):,}; "
          f"cache written {sum(step['cache_created'] for step in steps):,}")
    misses = [step for step in steps if step["context"] > 50_000 and step["cache_read"] < 0.1 * step["context"]]
    print(f"    cache misses on a context above 50k: {len(misses)} ({hm(sum(step['seconds'] for step in misses))})")
    print("    latency by context size: n | median s | p90 s | median output tokens")
    for low, high in ((0, 100), (100, 200), (200, 300), (300, 400), (400, 500), (500, 5000)):
        group = [step for step in steps if low * 1000 <= step["context"] < high * 1000]
        if group:
            print(f"      {low:3}-{high:4}k  {len(group):5} | {median(s['seconds'] for s in group):6.1f} | {p90(s['seconds'] for s in group):6.1f} | {median(s['output'] for s in group):6.0f}")
    stream_at = [at for at, _ in streams]
    groups = defaultdict(list)
    own = {s["id"] for s in sessions}
    for step in steps:
        low, high = bisect.bisect_left(stream_at, step["at"] - 120), bisect.bisect_right(stream_at, step["at"] + 120)
        others = {streams[i][1] for i in range(low, high)} - own
        groups["0" if not others else "1-2" if len(others) <= 2 else "3+"].append(step)
    print("    latency by other streams with a request within two minutes: n | median s")
    for name in ("0", "1-2", "3+"):
        if groups.get(name):
            print(f"      {name:4} {len(groups[name]):5} | {median(s['seconds'] for s in groups[name]):5.1f}")

    turns = [turn for s in sessions for turn in s["turns"]]
    if turns:
        print(f"  --- turns: {len(turns)}, median {median(t[0] for t in turns):.0f} steps, longest "
              + ", ".join(f"{count} steps at {local(at)}" for count, at in sorted(turns, reverse=True)[:4]))
    print("  --- compactions (local time, seconds, tokens before, trigger)")
    for s in sessions:
        for c in s["compactions"]:
            print(f"    {local(c['at'])} {c['seconds']:.0f}s {c['tokens']} {c['trigger']}")
    print("  --- pull request links first seen:", {number: local(at) for s in sessions for number, at in sorted(s["pr_links"].items())})
    print("  --- the developer's prompts (local time)")
    for s in sessions:
        for at, text in s["prompts"]:
            print(f"    {local(at)}  {text[:90]}")
    print("  --- delegations (local time, tool, type, model, description)")
    for s in sessions:
        for use in sorted(s["uses"].values(), key=lambda u: u["at"]):
            if use["name"] in ("Agent", "Task", "Workflow", "advisor"):
                i = use["input"]
                print(f"    {local(use['at'])} {use['name']:8} {str(i.get('subagent_type', '-')):18} {str(i.get('model', '-')):7} {str(i.get('description') or '')[:60]}")
    print("  --- subagents (local start, minutes, requests, output tokens, edits, models)")
    count, seconds, tokens = 0, 0.0, 0
    for s in sessions:
        for sub in subagents(s["path"], t0, t1):
            count, seconds, tokens = count + 1, seconds + sub["seconds"], tokens + sub["output"]
            print(f"    {local(sub['from'])} {sub['seconds'] / 60:6.1f} {sub['requests']:5} {sub['output']:8} {sub['edits']:4} {dict(sub['models'])}")
    print(f"    total: {count} subagents, {hm(seconds)} of their run time, {tokens:,} output tokens\n")


def print_github(project_dir: str, t0: float, t1: float) -> None:
    print("=== 4. GitHub (gh)")
    if not shutil.which("gh"):
        print("  gh is not installed\n")
        return

    def gh(*arguments):
        try:
            done = subprocess.run(["gh", *arguments], cwd=project_dir, capture_output=True, text=True, timeout=180)
        except (OSError, subprocess.TimeoutExpired):
            return None
        return json.loads(done.stdout) if done.returncode == 0 and done.stdout.strip() else None

    pulls = gh("pr", "list", "--state", "merged", "--limit", "100", "--json", "number,createdAt,mergedAt,headRefName") or []
    pulls = sorted((p for p in pulls if p.get("mergedAt") and t0 <= epoch(p["mergedAt"]) <= t1), key=lambda p: p["mergedAt"])
    print("  merged pull requests: number | opened..merged (local) | open h:mm | added lines: total / docs / tests / code | branch")
    sums = Counter()
    for pull in pulls:
        files = (gh("pr", "view", str(pull["number"]), "--json", "files") or {}).get("files") or []
        added = Counter()
        for item in files:
            added[path_kind("/" + item.get("path", ""))] += item.get("additions") or 0
        sums.update(added)
        opened, merged = epoch(pull["createdAt"]), epoch(pull["mergedAt"])
        print(f"    #{pull['number']:<5} {local(opened)}..{local(merged, '%H:%M')} {hm(merged - opened):>6}  {sum(added.values()):6} / {added['docs']:5} / {added['tests']:5} / {added['code']:5}  {pull['headRefName']}")
    everything = sum(sums.values()) or 1
    print(f"    {len(pulls)} merged; added {sum(sums.values())}: docs {100 * sums['docs'] / everything:.0f}%, tests {100 * sums['tests'] / everything:.0f}%, code {100 * sums['code'] / everything:.0f}%")
    runs = gh("run", "list", "--limit", "300", "--json", "workflowName,headBranch,conclusion,createdAt,updatedAt") or []
    runs = [r for r in runs if t0 <= epoch(r["createdAt"]) <= t1 and r.get("conclusion") not in ("cancelled", "skipped", None, "")]
    print("  CI runs, cancelled ones left out: workflow | runs | failures | median minutes | total h:mm")
    by_workflow = defaultdict(list)
    for run in runs:
        by_workflow[run["workflowName"]].append(run)
    for name, group in sorted(by_workflow.items()):
        spent = [epoch(r["updatedAt"]) - epoch(r["createdAt"]) for r in group]
        print(f"    {name:20} {len(group):4} | {sum(1 for r in group if r['conclusion'] == 'failure'):3} | {median(spent) / 60:6.1f} | {hm(sum(spent))}")
    print()


def main() -> int:
    parser = argparse.ArgumentParser(description="Where the wall clock of Claude Code sessions went.")
    parser.add_argument("--hours", type=float, default=24.0, help="length of the window that ends now (default 24)")
    parser.add_argument("--since", help="window start, ISO 8601 (overrides --hours)")
    parser.add_argument("--until", help="window end, ISO 8601 (default: now)")
    parser.add_argument("--project", default=os.getcwd(), help="project directory to detail (default: the current one)")
    parser.add_argument("--long-wait", type=int, default=4, help="list waits of at least this many minutes (default 4)")
    parser.add_argument("--gh", action="store_true", help="add merged pull requests and CI runs of the project (asks GitHub)")
    parser.add_argument("--json", metavar="FILE", help="also write the bucket totals as JSON")
    options = parser.parse_args()

    until = epoch(options.until) if options.until else datetime.now(timezone.utc).timestamp()
    since = epoch(options.since) if options.since else until - options.hours * 3600
    if not os.path.isdir(PROJECTS):
        print(f"no transcripts: {PROJECTS} does not exist", file=sys.stderr)
        return 1
    project = slug(options.project)
    print(f"Window {datetime.fromtimestamp(since, timezone.utc):%Y-%m-%dT%H:%M:%SZ} .. {datetime.fromtimestamp(until, timezone.utc):%Y-%m-%dT%H:%M:%SZ}"
          f" ({hm(until - since)}); times below are local ({datetime.now(LOCAL):%Z}). Detailed project: {os.path.basename(os.path.abspath(options.project))}\n")

    sessions, streams = [], []
    for folder in sorted(os.listdir(PROJECTS)):
        directory = os.path.join(PROJECTS, folder)
        if not os.path.isdir(directory):
            continue
        for name in sorted(os.listdir(directory)):
            path = os.path.join(directory, name)
            if not name.endswith(".jsonl") or os.path.getmtime(path) < since:
                continue
            session = analyse(path, since, until)
            if not session:
                continue
            sessions.append(session)
            streams += [(step["at"], session["id"]) for step in session["steps"]]
            for index, sub in enumerate(subagents(path, since, until)):
                streams += [(at, f"{session['id']}/{index}") for at in sub["starts"]]
    sessions.sort(key=lambda s: s["from"])
    streams.sort()
    own = [s for s in sessions if s["project"] == project]

    print_all_sessions(sessions, streams)
    print_project(own, streams, since, until, options.long_wait)
    if options.gh:
        print_github(os.path.abspath(options.project), since, until)

    if options.json:
        summary = {
            "since": since, "until": until, "project": os.path.basename(os.path.abspath(options.project)),
            "project_totals_seconds": {b: round(sum(s["totals"].get(b, 0) for s in own)) for b in BUCKETS},
            "all_totals_seconds": {b: round(sum(s["totals"].get(b, 0) for s in sessions)) for b in BUCKETS},
            "sessions": [{"id": s["id"], "project": s["project"] if s["project"] == project else "other", "from": s["from"], "to": s["to"],
                          "requests": len(s["steps"]), "totals_seconds": {b: round(s["totals"].get(b, 0)) for b in BUCKETS}} for s in sessions],
        }
        with open(options.json, "w") as handle:
            json.dump(summary, handle, indent=2)
        print(f"JSON summary written to {options.json}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
