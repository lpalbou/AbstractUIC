#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path


def read_utf8(path: Path) -> str:
    return path.read_text(encoding="utf-8").replace("\r\n", "\n").replace("\r", "\n")


_H2_RE = re.compile(r"^\s*##\s+(.+?)\s*$")
_LINK_RE = re.compile(r"\[[^\]]+\]\(([^)]+)\)")


def _is_external_url(url: str) -> bool:
    u = url.strip().lower()
    return u.startswith(("http://", "https://", "mailto:", "data:"))


def parse_llms_txt_links(text: str) -> list[tuple[str, bool]]:
    """
    Extract linked local file targets from an llms.txt file.

    - Keeps order of appearance.
    - Tracks whether a link appears under the `## Optional` section.
    - Skips external URLs.
    """
    section: str | None = None
    in_optional = False
    out: list[tuple[str, bool]] = []

    for raw in text.splitlines():
        line = raw.rstrip("\n")

        m_h2 = _H2_RE.match(line)
        if m_h2:
            section = m_h2.group(1).strip()
            in_optional = section.lower() == "optional"
            continue

        # Only collect links from H2 "file list" sections (per llms.txt format).
        if section is None:
            continue

        if not line.lstrip().startswith("-"):
            continue

        m_link = _LINK_RE.search(line)
        if not m_link:
            continue

        url = m_link.group(1).strip()
        if not url:
            continue

        url = url.split("#", 1)[0].strip()
        if not url or _is_external_url(url):
            continue

        out.append((url, in_optional))

    return out


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    out_path = root / "llms-full.txt"
    llms_path = root / "llms.txt"

    parts: list[str] = []
    parts.append("# AbstractUIC (llms-full)\n")
    parts.append(
        "\n> Generated file. Do not edit by hand; run `python scripts/generate-llms-full.py`.\n"
    )

    if not llms_path.exists():
        raise SystemExit("llms.txt not found at repo root")

    llms_text = read_utf8(llms_path)
    links = parse_llms_txt_links(llms_text)

    parts.append(
        "\nThis file expands `llms.txt` into a single, offline-friendly document by inlining the contents of each linked local file (including links under `## Optional`).\n"
    )

    parts.append("\n## llms.txt\n\n")
    parts.append(llms_text.rstrip())
    parts.append("\n")

    seen: set[str] = set()
    for rel, _is_optional in links:
        if rel in seen:
            continue
        seen.add(rel)

        p = (root / rel).resolve()
        try:
            p.relative_to(root)
        except Exception:
            continue
        if not p.exists() or not p.is_file():
            continue

        parts.append(f"\n## {rel}\n\n")
        parts.append(read_utf8(p).rstrip())
        parts.append("\n")

    out = "".join(parts)
    out_path.write_text(out, encoding="utf-8")


if __name__ == "__main__":
    main()
