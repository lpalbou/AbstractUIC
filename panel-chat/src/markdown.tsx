import React from "react";

import "./panel_chat.css";

type InlineNode = React.ReactNode;

function renderInline(text: string): InlineNode[] {
  const out: InlineNode[] = [];
  const s = String(text ?? "");
  let i = 0;
  let buf = "";

  const flush = () => {
    if (!buf) return;
    out.push(buf);
    buf = "";
  };

  while (i < s.length) {
    const ch = s[i];

    if (ch === "`") {
      const j = s.indexOf("`", i + 1);
      if (j !== -1) {
        flush();
        out.push(<code key={`code:${i}`}>{s.slice(i + 1, j)}</code>);
        i = j + 1;
        continue;
      }
    }

    if (ch === "*" && s[i + 1] === "*") {
      const j = s.indexOf("**", i + 2);
      if (j !== -1) {
        flush();
        out.push(<strong key={`bold:${i}`}>{s.slice(i + 2, j)}</strong>);
        i = j + 2;
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

export function Markdown({ text, className }: { text: string; className?: string }): React.ReactElement {
  const lines = normalizeLines(text);
  const blocks: React.ReactNode[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = String(lines[i] ?? "");

    if (!line.trim()) {
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
      const nodes = renderInline(content);
      if (level === 1) blocks.push(<h1 key={`h1:${i}`}>{nodes}</h1>);
      else if (level === 2) blocks.push(<h2 key={`h2:${i}`}>{nodes}</h2>);
      else blocks.push(<h3 key={`h3:${i}`}>{nodes}</h3>);
      i += 1;
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
            <li key={`li:${i}:${idx}`}>{renderInline(it)}</li>
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
            {renderInline(pl)}
            {idx < paraLines.length - 1 ? <br /> : null}
          </React.Fragment>
        ))}
      </p>
    );
  }

  const cls = ["pc-md", className].filter(Boolean).join(" ");
  return <div className={cls}>{blocks}</div>;
}

