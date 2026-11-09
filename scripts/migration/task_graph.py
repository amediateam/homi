#!/usr/bin/env python3
"""Build the task graph of the migration plan from docs/migration/tasks/**/KV-*.md.

Writes docs/migration/data/tasks.csv and regenerates the block between the `generated:start` / `generated:end`
markers in docs/migration/13-dependency-graph.md: counts, broken references, cycles, start points, the weighted
critical path, and feature ↔ task coverage against docs/migration/data/features.csv.

    python3 scripts/migration/task_graph.py [--check]   # --check: exit 1 on broken refs, cycles or uncovered P0/P1 features
"""

from __future__ import annotations

import csv
import re
import sys
from collections import Counter, defaultdict
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs" / "migration"
TASKS = DOCS / "tasks"
OUT_CSV = DOCS / "data" / "tasks.csv"
FEATURES = DOCS / "data" / "features.csv"
TARGET = DOCS / "13-dependency-graph.md"
START, END = "<!-- generated:start -->", "<!-- generated:end -->"

TASK_RE = re.compile(r"\bKV-(?:BE|FE|TG|DB|INF|QA)-\d{3}\b")
FEATURE_RE = re.compile(r"\bF-[A-Z]+-\d{3}\b")
BLOCKER_RE = re.compile(r"\b(?:DEC-\d{2}|CF-\d{3}|Q-[A-Z]+-\d{3})\b")
WEIGHT = {"S": 1, "M": 2, "L": 4, "XL": 8}


def field(text: str, name: str) -> str:
    match = re.search(r"^\|\s*" + re.escape(name) + r"\s*\|(.*)\|\s*$", text, re.MULTILINE)
    return match.group(1).strip() if match else ""


NOT_A_PREREQUISITE = re.compile(
    r"\b(used by|consumed by|shared with|later by|followed by|follow-up|unblocks|feeds|finished in|completed in|see also|related)\b",
    re.IGNORECASE,
)


# Segments that list dependants or soft couplings as a whole ("consumers: KV-…", "KV-A and KV-B are injected, not
# imported, so this task can land first").
DROP_SEGMENT = re.compile(r"\b(consumers?|injected|can land first|through a callback|bot side|shares)\b", re.IGNORECASE)


def prerequisites(cell: str) -> str:
    """The parts of a Dependencies cell that name prerequisites: drop `;` segments about dependants or shared code."""
    keep = []
    for part in re.split(r";", cell):
        if DROP_SEGMENT.search(part):
            continue
        if NOT_A_PREREQUISITE.search(part):
            # Keep what comes before the marker inside the segment (e.g. "KV-A (x) — used by KV-B").
            head = NOT_A_PREREQUISITE.split(part, maxsplit=1)[0]
            keep.append(head)
        else:
            keep.append(part)
    return ";".join(keep)


def load_tasks() -> dict[str, dict]:
    tasks: dict[str, dict] = {}
    for path in sorted(TASKS.rglob("KV-*.md")):
        text = path.read_text(encoding="utf-8")
        head = re.match(r"#\s+(KV-[A-Z]+-\d{3})\s+[—-]\s+(.*)", text)
        if not head:
            continue
        ident, title = head.group(1), head.group(2).strip()
        deps_cell = field(text, "Dependencies")
        complexity = (re.match(r"\s*(XL|S|M|L)\b", field(text, "Complexity")) or [None, "M"])[1]
        tasks[ident] = {
            "id": ident,
            "track": path.parent.name,
            "title": title,
            "status": field(text, "Status").split()[0] if field(text, "Status") else "",
            "complexity": complexity,
            "features": sorted(set(FEATURE_RE.findall(field(text, "Feature IDs")))),
            "technical": "technical" in field(text, "Feature IDs").lower(),
            "deps": sorted(set(TASK_RE.findall(prerequisites(deps_cell))) - {ident}),
            "blockers": sorted(set(BLOCKER_RE.findall(deps_cell))),
            "path": path.relative_to(DOCS).as_posix(),
        }
    return tasks


def main() -> int:
    tasks = load_tasks()
    broken = {t: [d for d in v["deps"] if d not in tasks] for t, v in tasks.items()}
    broken = {t: d for t, d in broken.items() if d}

    # Cycle detection (DFS with colours) over existing edges.
    colour: dict[str, int] = {}
    cycles: list[list[str]] = []

    def visit(node: str, stack: list[str]) -> None:
        colour[node] = 1
        for dep in tasks[node]["deps"]:
            if dep not in tasks:
                continue
            if colour.get(dep) == 1:
                cycles.append(stack[stack.index(dep):] + [dep] if dep in stack else [node, dep])
            elif colour.get(dep) is None:
                visit(dep, stack + [dep])
        colour[node] = 2

    sys.setrecursionlimit(10000)
    for node in tasks:
        if node not in colour:
            visit(node, [node])

    @lru_cache(maxsize=None)
    def longest(node: str) -> tuple[int, tuple[str, ...]]:
        """Weighted longest chain ending at node (node's own weight included)."""
        best: tuple[int, tuple[str, ...]] = (0, ())
        for dep in tasks[node]["deps"]:
            if dep in tasks and not cycles:
                cand = longest(dep)
                if cand[0] > best[0]:
                    best = cand
        return best[0] + WEIGHT.get(tasks[node]["complexity"], 2), best[1] + (node,)

    critical = max((longest(t) for t in tasks), default=(0, ())) if not cycles else (0, ())
    depth = {t: len(longest(t)[1]) for t in tasks} if not cycles else {}

    features = list(csv.DictReader(FEATURES.open(encoding="utf-8"))) if FEATURES.exists() else []
    covered = defaultdict(list)
    for t, v in tasks.items():
        for f in v["features"]:
            covered[f].append(t)
    uncovered = [f for f in features if f["feature_id"] not in covered]
    unknown_features = sorted({f for v in tasks.values() for f in v["features"]} - {f["feature_id"] for f in features})
    no_feature = sorted(t for t, v in tasks.items() if not v["features"] and not v["technical"])

    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with OUT_CSV.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(["id", "track", "title", "status", "complexity", "depth", "features", "deps", "blockers", "path"])
        for t in sorted(tasks):
            v = tasks[t]
            writer.writerow([t, v["track"], v["title"], v["status"], v["complexity"], depth.get(t, ""),
                             " ".join(v["features"]), " ".join(v["deps"]), " ".join(v["blockers"]), v["path"]])

    by_track = Counter(v["track"] for v in tasks.values())
    by_cx = Counter(v["complexity"] for v in tasks.values())
    starts = sorted(t for t, v in tasks.items() if not v["deps"])
    lines = [START, "", f"Generated by `python3 scripts/migration/task_graph.py` from {len(tasks)} task files "
             f"(register: `data/tasks.csv`). Weights for the critical path: S = 1, M = 2, L = 4, XL = 8.", ""]
    lines += ["| Track | Tasks |", "| ----- | ----: |"] + [f"| {k} | {n} |" for k, n in sorted(by_track.items())]
    lines += ["", "Complexity: " + ", ".join(f"{k} {by_cx[k]}" for k in ("S", "M", "L", "XL") if by_cx[k]) + "."]
    lines += ["", f"**Broken task references:** {len(broken)}" + ("" if not broken else " — " + "; ".join(f"{t} → {', '.join(d)}" for t, d in sorted(broken.items())))]
    lines += [f"**Cycles:** {len(cycles)}" + ("" if not cycles else " — " + "; ".join(" → ".join(c) for c in cycles[:10]))]
    if critical[1]:
        lines += ["", f"**Critical path by task dependencies** (weight {critical[0]}, {len(critical[1])} tasks):", "",
                  " → ".join(critical[1])]
    lines += ["", f"**Start points** (no task dependencies; many still wait for a DEC/Q): {len(starts)} tasks.", "",
              ", ".join(starts)]
    pri = Counter(f["priority"] for f in uncovered)
    lines += ["", "**Feature ↔ task coverage**", "",
              f"- Features in 09: {len(features)}; covered by at least one task: {len(features) - len(uncovered)}; "
              f"without a task: {len(uncovered)}" + (f" (by priority: {', '.join(f'{k} {v}' for k, v in sorted(pri.items()))})" if uncovered else "") + "."]
    if uncovered:
        lines += ["- Features without a task: " + ", ".join(f"{f['feature_id']} ({f['priority']}, {f['migration_decision']})" for f in uncovered) + "."]
    lines += [f"- Tasks citing a feature id that 09 does not define: {len(unknown_features)}" + (" — " + ", ".join(unknown_features) if unknown_features else "") + ".",
              f"- Tasks with neither a feature nor the `Technical migration task` marker: {len(no_feature)}" + (" — " + ", ".join(no_feature) if no_feature else "") + ".",
              "", END]

    current = TARGET.read_text(encoding="utf-8")
    if START in current and END in current:
        head, rest = current.split(START, 1)
        TARGET.write_text(head + "\n".join(lines) + rest.split(END, 1)[1], encoding="utf-8")
    print("\n".join(l for l in lines if l not in (START, END)))
    blocking_uncovered = [f for f in uncovered if f["priority"] in ("P0", "P1") and f["migration_decision"] not in ("DROP_CANDIDATE", "DEFER")]
    return 1 if ("--check" in sys.argv and (broken or cycles or blocking_uncovered)) else 0


if __name__ == "__main__":
    sys.exit(main())
