#!/usr/bin/env python3
"""Collect the audit identifiers defined in docs/migration/*.md into docs/migration/data/ids.csv.

A line *defines* an ID when the ID is the first thing on it (after list, table, heading or bold markup), e.g.
`- **Q-API-001** — …`, `| BR-APP-001 | … |`, `### SCR-004 — Feed`. Every other occurrence is a reference.
Exit status 1 when an ID is defined twice or referenced without being defined anywhere.

    python3 scripts/migration/collect_ids.py [--check]
"""

from __future__ import annotations

import csv
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs" / "migration"
OUT = DOCS / "data" / "ids.csv"

ID_RE = re.compile(
    r"\b(?:(?:BR|LB|Q|TXT)-[A-Z]+-\d{3}|SEC-REQ-\d{3}|(?:DEC|RK)-\d{2}|(?:API|RES|SCR|TMA|BOT|BTN|LND|URL|ENT|DEV|CF|GAP|SEC)-\d{3}"
    r"|F-[A-Z]+-\d{3}|KV-[A-Z]+-\d{3})\b"
)
_ID = "(" + ID_RE.pattern + ")"
# A definition is a table row whose first cell is the ID, a heading that starts with it, or a list item that starts
# with the bold ID. A wrapped paragraph line that merely begins with an ID is a reference.
HEAD_RE = re.compile(
    r"^\s*(?:\|\s*`?" + _ID + r"`?\s*\||#{2,6}\s+`?" + _ID + r"|(?:[-*]\s+|\d+\.\s+)?\*\*`?" + _ID + r"`?\*\*)"
)
STATUS_RE = re.compile(r"\b(CONFIRMED|RUNTIME_VERIFIED|DOCUMENTED_ONLY|UNVERIFIED|DEPRECATED_CANDIDATE|PROPOSED|APPROVED)\b")
TAG_RE = re.compile(r"`(bug|decision)`")


def kind_of(ident: str) -> str:
    return ident.split("-")[0] if not ident.startswith(("BR-", "LB-", "Q-", "TXT-", "F-", "KV-", "SEC-REQ-")) else "-".join(ident.split("-")[:2])


def block_text(lines: list[str], i: int) -> str:
    """The defining line plus its continuation lines (indented bullet text), without markdown table pipes."""
    first = lines[i]
    parts = [first]
    if not first.lstrip().startswith("|"):
        for nxt in lines[i + 1 : i + 6]:
            if not nxt.strip() or HEAD_RE.match(nxt) or nxt.lstrip().startswith(("|", "#", "- ", "* ")):
                break
            parts.append(nxt)
    text = " ".join(p.strip() for p in parts)
    text = re.sub(r"\s*\|\s*", " | ", text).strip(" |")
    return re.sub(r"\s+", " ", text)


def main() -> int:
    defined: dict[str, list[tuple[str, int, str]]] = defaultdict(list)
    referenced: dict[str, set[str]] = defaultdict(set)
    rows = []
    for doc in sorted(DOCS.rglob("*.md")):
        rel = doc.relative_to(DOCS).as_posix()
        if rel == "README.md":
            continue
        lines = doc.read_text(encoding="utf-8").splitlines()
        in_code = False
        for i, line in enumerate(lines):
            if line.lstrip().startswith("```"):
                in_code = not in_code
                continue
            if in_code:
                continue
            head = HEAD_RE.match(line)
            if head:
                ident = next(g for g in head.groups() if g)
                text = block_text(lines, i)
                status = STATUS_RE.search(text)
                tag = TAG_RE.search(text)
                defined[ident].append((rel, i + 1, text))
                rows.append(
                    {
                        "id": ident,
                        "kind": kind_of(ident),
                        "doc": rel,
                        "line": i + 1,
                        "status": status.group(1) if status else "",
                        "tag": tag.group(1) if tag else "",
                        "text": text[:400],
                    }
                )
            for ref in ID_RE.findall(line):
                if not (head and ref == next(g for g in head.groups() if g)):
                    referenced[ref].add(rel)

    # The same ID in two places of one document is usually an index or summary table; across documents it is a clash.
    duplicates = {k: v for k, v in defined.items() if len({d for d, _, _ in v}) > 1}
    undefined = {k: v for k, v in referenced.items() if k not in defined}

    seen = set()
    unique_rows = []
    for row in rows:
        if row["id"] in seen:
            continue
        seen.add(row["id"])
        unique_rows.append(row)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=["id", "kind", "doc", "line", "status", "tag", "text"])
        writer.writeheader()
        writer.writerows(sorted(unique_rows, key=lambda r: (r["kind"], r["id"])))

    by_kind: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for row in unique_rows:
        by_kind[row["kind"]][row["status"] or "-"] += 1
    print(f"{len(unique_rows)} identifiers defined → {OUT.relative_to(ROOT)}")
    for kind in sorted(by_kind):
        counts = ", ".join(f"{s} {n}" for s, n in sorted(by_kind[kind].items()))
        print(f"  {kind:8} {sum(by_kind[kind].values()):5}  ({counts})")
    if duplicates:
        print(f"\nIDs defined in more than one document: {len(duplicates)}")
        for k, v in sorted(duplicates.items())[:40]:
            print(f"  {k}: " + "; ".join(f"{d}:{n}" for d, n, _ in v))
    if undefined:
        print(f"\nIDs referenced but never defined: {len(undefined)}")
        for k, v in sorted(undefined.items())[:60]:
            print(f"  {k}: referenced in {', '.join(sorted(v))}")
    return 1 if ("--check" in sys.argv and (duplicates or undefined)) else 0


if __name__ == "__main__":
    sys.exit(main())
