#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path


FILES_IN_ORDER: list[str] = [
    "README.md",
    "docs/getting-started.md",
    "docs/architecture.md",
    "docs/development.md",
    "docs/publishing.md",
    "docs/README.md",
    "docs/installation.md",
    "ui-kit/README.md",
    "panel-chat/README.md",
    "monitor-flow/README.md",
    "monitor-active-memory/README.md",
    "monitor-gpu/README.md",
    "LICENSE",
]


def read_utf8(path: Path) -> str:
    return path.read_text(encoding="utf-8").replace("\r\n", "\n").replace("\r", "\n")


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    out_path = root / "llms-full.txt"

    parts: list[str] = []
    parts.append("# AbstractUIC (llms-full)\n")
    parts.append(
        "\n> Generated file. Do not edit by hand; run `python scripts/generate-llms-full.py`.\n"
    )

    for rel in FILES_IN_ORDER:
        p = root / rel
        if not p.exists():
            continue
        parts.append(f"\n## {rel}\n")
        parts.append("\n")
        parts.append(read_utf8(p).rstrip())
        parts.append("\n")

    out = "".join(parts)
    out_path.write_text(out, encoding="utf-8")


if __name__ == "__main__":
    main()

