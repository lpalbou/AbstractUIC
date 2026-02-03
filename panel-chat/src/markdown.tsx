import React from "react";

import "./panel_chat.css";

type InlineNode = React.ReactNode;

type HighlightState = {
  needles: string[];
  needlesLower: string[];
  className: string;
  id?: string;
  hits: number;
};

function highlightInline(text: string, state: HighlightState | null): InlineNode[] {
  const s = String(text ?? "");
  if (!state || !state.needles.length) return [s];

  const out: InlineNode[] = [];
  const hayLower = s.toLowerCase();
  let pos = 0;
  while (pos < s.length) {
    let bestStart = -1;
    let bestNeedle = "";
    for (let i = 0; i < state.needlesLower.length; i++) {
      const needleLower = state.needlesLower[i];
      if (!needleLower) continue;
      const idx = hayLower.indexOf(needleLower, pos);
      if (idx === -1) continue;
      const needle = state.needles[i] || "";
      if (!needle) continue;
      if (bestStart === -1 || idx < bestStart || (idx === bestStart && needle.length > bestNeedle.length)) {
        bestStart = idx;
        bestNeedle = needle;
      }
    }

    if (bestStart === -1 || !bestNeedle) {
      out.push(s.slice(pos));
      break;
    }

    if (bestStart > pos) out.push(s.slice(pos, bestStart));
    const id = state.hits === 0 && state.id ? state.id : undefined;
    const matchedText = s.slice(bestStart, bestStart + bestNeedle.length);
    out.push(
      <span key={`hl:${state.hits}`} id={id} className={state.className}>
        {matchedText}
      </span>
    );
    state.hits += 1;
    pos = bestStart + bestNeedle.length;
  }
  return out;
}

function renderInline(text: string, highlight: HighlightState | null): InlineNode[] {
  const out: InlineNode[] = [];
  const s = String(text ?? "");
  let i = 0;
  let buf = "";

  const flush = () => {
    if (!buf) return;
    for (const node of highlightInline(buf, highlight)) out.push(node);
    buf = "";
  };

  while (i < s.length) {
    const ch = s[i];

    if (ch === "`") {
      const j = s.indexOf("`", i + 1);
      if (j !== -1) {
        flush();
        const inner = s.slice(i + 1, j);
        out.push(<code key={`code:${i}`}>{highlight ? highlightInline(inner, highlight) : inner}</code>);
        i = j + 1;
        continue;
      }
    }

    if (ch === "*" && s[i + 1] === "*") {
      const j = s.indexOf("**", i + 2);
      if (j !== -1) {
        flush();
        const inner = s.slice(i + 2, j);
        out.push(<strong key={`bold:${i}`}>{highlight ? highlightInline(inner, highlight) : inner}</strong>);
        i = j + 2;
        continue;
      }
    }

    if (ch === "*" && s[i + 1] !== "*") {
      const j = s.indexOf("*", i + 1);
      if (j !== -1) {
        flush();
        const inner = s.slice(i + 1, j);
        out.push(<em key={`em:${i}`}>{highlight ? highlightInline(inner, highlight) : inner}</em>);
        i = j + 1;
        continue;
      }
    }

    buf += ch;
    i += 1;
  }

  flush();
  return out;
}

function normalizeLines(text: string): string[] {
  const s = String(text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return s.split("\n");
}

function splitTableRow(line: string): string[] {
  let s = String(line ?? "").trim();
  if (!s) return [];
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => String(c ?? "").trim());
}

function isTableSeparator(line: string): boolean {
  let s = String(line ?? "").trim();
  if (!s) return false;
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  const cells = s.split("|").map((c) => String(c ?? "").trim());
  if (cells.length < 2) return false;
  return cells.every((c) => /^:?-{3,}:?$/.test(c));
}

export function Markdown({
  text,
  className,
  highlight,
  highlights,
  highlightClassName,
  highlightId,
}: {
  text: string;
  className?: string;
  highlight?: string;
  highlights?: string[];
  highlightClassName?: string;
  highlightId?: string;
}): React.ReactElement {
  const lines = normalizeLines(text);
  const blocks: React.ReactNode[] = [];
  const needlesRaw: string[] = [];
  if (Array.isArray(highlights)) needlesRaw.push(...highlights);
  if (typeof highlight === "string" && highlight.trim()) needlesRaw.push(highlight);
  const needles = Array.from(new Set(needlesRaw.map((s) => String(s ?? "").trim()).filter(Boolean))).filter((n) => n.length >= 4);
  const highlightState: HighlightState | null = needles.length
    ? {
        needles,
        needlesLower: needles.map((n) => n.toLowerCase()),
        className: highlightClassName || "pc-md_hl",
        id: highlightId,
        hits: 0,
      }
    : null;

  let i = 0;
  while (i < lines.length) {
    const line = String(lines[i] ?? "");

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const hr = line.trim();
    if (hr === "---" || hr === "___" || hr === "***" || /^(-{3,}|_{3,}|\*{3,})$/.test(hr)) {
      blocks.push(<hr key={`hr:${i}`} className="pc-md_hr" />);
      i += 1;
      continue;
    }

    if (line.trim().startsWith("```")) {
      const fence = line.trim();
      const lang = fence.replace(/```/g, "").trim();
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !String(lines[i] ?? "").trim().startsWith("```")) {
        codeLines.push(String(lines[i] ?? ""));
        i += 1;
      }
      if (i < lines.length) i += 1;
      const code = codeLines.join("\n");
      blocks.push(
        <pre key={`pre:${i}`} className="pc-md_pre">
          <code className={lang ? `language-${lang}` : undefined}>{code}</code>
        </pre>
      );
      continue;
    }

    const headingM = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingM) {
      const level = headingM[1].length;
      const content = headingM[2] || "";
      const nodes = renderInline(content, highlightState);
      if (level === 1) blocks.push(<h1 key={`h1:${i}`}>{nodes}</h1>);
      else if (level === 2) blocks.push(<h2 key={`h2:${i}`}>{nodes}</h2>);
      else blocks.push(<h3 key={`h3:${i}`}>{nodes}</h3>);
      i += 1;
      continue;
    }

    if (line.trimStart().startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && String(lines[i] ?? "").trimStart().startsWith(">")) {
        const raw = String(lines[i] ?? "");
        const t = raw.trimStart();
        quoteLines.push(t.replace(/^>\s?/, ""));
        i += 1;
      }
      blocks.push(
        <blockquote key={`quote:${i}`} className="pc-md_quote">
          {quoteLines.map((q, idx) => (
            <React.Fragment key={`q:${i}:${idx}`}>
              {renderInline(q, highlightState)}
              {idx < quoteLines.length - 1 ? <br /> : null}
            </React.Fragment>
          ))}
        </blockquote>
      );
      continue;
    }

    if (line.includes("|") && i + 1 < lines.length && isTableSeparator(String(lines[i + 1] ?? ""))) {
      const headers = splitTableRow(line);
      const colCount = Math.max(1, headers.length);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length) {
        const rowLine = String(lines[i] ?? "");
        if (!rowLine.trim()) break;
        if (!rowLine.includes("|")) break;
        const cells = splitTableRow(rowLine);
        const normalized: string[] = [];
        for (let c = 0; c < colCount; c++) normalized.push(cells[c] ?? "");
        rows.push(normalized);
        i += 1;
      }
      blocks.push(
        <div key={`table:${i}`} className="pc-md_table_wrap">
          <table className="pc-md_table">
            <thead>
              <tr>
                {headers.slice(0, colCount).map((h, idx) => (
                  <th key={`th:${i}:${idx}`}>{renderInline(h, highlightState)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, rIdx) => (
                <tr key={`tr:${i}:${rIdx}`}>
                  {r.map((cell, cIdx) => (
                    <td key={`td:${i}:${rIdx}:${cIdx}`}>{renderInline(cell, highlightState)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    const isOrdered = (s: string) => /^\s*\d+\.\s+/.test(s);
    if (isOrdered(line)) {
      const items: string[] = [];
      while (i < lines.length && isOrdered(String(lines[i] ?? ""))) {
        const t = String(lines[i] ?? "");
        items.push(t.replace(/^\s*\d+\.\s+/, ""));
        i += 1;
      }
      blocks.push(
        <ol key={`ol:${i}`} className="pc-md_ol">
          {items.map((it, idx) => (
            <li key={`oli:${i}:${idx}`}>{renderInline(it, highlightState)}</li>
          ))}
        </ol>
      );
      continue;
    }

    const isBullet = (s: string) => {
      const t = s.trimStart();
      return t.startsWith("- ") || t.startsWith("* ");
    };
    if (isBullet(line)) {
      const items: string[] = [];
      while (i < lines.length && isBullet(String(lines[i] ?? ""))) {
        const t = String(lines[i] ?? "").trimStart();
        items.push(t.slice(2));
        i += 1;
      }
      blocks.push(
        <ul key={`ul:${i}`} className="pc-md_ul">
          {items.map((it, idx) => (
            <li key={`li:${i}:${idx}`}>{renderInline(it, highlightState)}</li>
          ))}
        </ul>
      );
      continue;
    }

    const paraLines: string[] = [];
    while (i < lines.length && String(lines[i] ?? "").trim()) {
      paraLines.push(String(lines[i] ?? ""));
      i += 1;
    }
    blocks.push(
      <p key={`p:${i}`} className="pc-md_p">
        {paraLines.map((pl, idx) => (
          <React.Fragment key={`pl:${i}:${idx}`}>
            {renderInline(pl, highlightState)}
            {idx < paraLines.length - 1 ? <br /> : null}
          </React.Fragment>
        ))}
      </p>
    );
  }

  const cls = ["pc-md", className].filter(Boolean).join(" ");
  return <div className={cls}>{blocks}</div>;
}
