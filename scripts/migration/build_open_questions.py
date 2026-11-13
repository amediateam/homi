#!/usr/bin/env python3
"""Regenerate the question register in docs/migration/20-open-questions.md from docs/migration/data/ids.csv.

Only the block between the `generated:start` and `generated:end` markers is rewritten; the hand-written part above
it stays. Run `python3 scripts/migration/collect_ids.py` first so ids.csv is current.

    python3 scripts/migration/build_open_questions.py
"""

from __future__ import annotations

import csv
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs" / "migration"
IDS = DOCS / "data" / "ids.csv"
TARGET = DOCS / "20-open-questions.md"
START, END = "<!-- generated:start -->", "<!-- generated:end -->"

AREA_TITLES = {
    "SYS": "System and scope (01)",
    "API": "API and server behaviour (02, 08)",
    "APP": "Mini App (03)",
    "LND": "Landing (03b)",
    "SEO": "SEO pages (03b)",
    "BOT": "Telegram bot (04)",
    "DATA": "Data model and migration (06, 14)",
    "SEC": "Security and personal data (16)",
}


def clean(text: str, ident: str) -> str:
    """Drop the ID, markdown emphasis and table pipes from the defining line."""
    text = re.sub(r"^\W*" + re.escape(ident) + r"\W*", "", text)
    text = text.replace("**", "").replace(" | ", " — ")
    return text.replace("|", "/").strip()[:300]


def main() -> int:
    rows = [r for r in csv.DictReader(IDS.open(encoding="utf-8")) if r["kind"].startswith("Q-")]
    by_area: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        by_area[row["kind"].split("-", 1)[1]].append(row)

    out = [START, "", f"{len(rows)} questions, generated from `data/ids.csv`.", ""]
    out.append("| Area | Questions |")
    out.append("| ---- | --------: |")
    for area in sorted(by_area, key=lambda a: list(AREA_TITLES).index(a) if a in AREA_TITLES else 99):
        out.append(f"| {AREA_TITLES.get(area, area)} | {len(by_area[area])} |")
    for area in sorted(by_area, key=lambda a: list(AREA_TITLES).index(a) if a in AREA_TITLES else 99):
        out += ["", f"### {AREA_TITLES.get(area, area)}", "", "| Source | Question | Text (first line; details at the source) |", "| ------ | -------- | ---- |"]
        for row in sorted(by_area[area], key=lambda r: r["id"]):
            # The source comes first: a row whose first cell is an ID would count as a second definition.
            out.append(f"| `{row['doc']}:{row['line']}` | {row['id']} | {clean(row['text'], row['id'])} |")
    out += ["", END]

    current = TARGET.read_text(encoding="utf-8")
    if START not in current or END not in current:
        raise SystemExit(f"{TARGET} lacks the generated markers")
    head, rest = current.split(START, 1)
    tail = rest.split(END, 1)[1]
    TARGET.write_text(head + "\n".join(out) + tail, encoding="utf-8")
    print(f"{len(rows)} questions written to {TARGET.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
