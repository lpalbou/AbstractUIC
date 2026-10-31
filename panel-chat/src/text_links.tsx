import React from "react";
export type TextLinkPart = { text: string; href?: string };
/** Detect whole URLs before applying decoration. Never interpret text as HTML. */
export function splitTextLinks(text: string): TextLinkPart[] {
  const out: TextLinkPart[] = [];
  const pattern = /(?:https?:\/\/|www\.)[^\s<>"'`\\]+/gi;
  let end = 0;
  for (const m of text.matchAll(pattern)) {
    const start = m.index!;
    if (start > 0 && /[\w@]/.test(text[start - 1])) continue;
    let label = m[0].replace(/[.,;:!?]+$/, "");
    for (const [open, close] of [
      ["(", ")"],
      ["[", "]"],
      ["{", "}"],
    ])
      while (
        label.endsWith(close) &&
        label.split(close).length > label.split(open).length
      )
        label = label.slice(0, -1);
    const href = /^www\./i.test(label) ? `https://${label}` : label;
    try {
      const url = new URL(href);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        !url.hostname ||
        /[\u0000-\u001f\u007f]/.test(href)
      )
        continue;
    } catch {
      continue;
    }
    if (start > end) out.push({ text: text.slice(end, start) });
    out.push({ text: label, href });
    end = start + label.length;
  }
  if (end < text.length) out.push({ text: text.slice(end) });
  return out;
}
export function textLinks(text: string): React.ReactNode[] {
  return splitTextLinks(text).map((p, i) =>
    p.href ? (
      <a
        key={i}
        className="pc-md_link"
        href={p.href}
        target="_blank"
        rel="noopener noreferrer"
      >
        {p.text}
      </a>
    ) : (
      p.text
    ),
  );
}
export function TextLinks({ text }: { text: string }): React.ReactElement {
  return <>{textLinks(String(text ?? ""))}</>;
}
/** Keep JSON escape notation in text without treating its backslashes as URL bytes. */
export function JsonTextLinks({ text }: { text: string }): React.ReactElement {
  return (
    <>
      "
      {splitTextLinks(text).map((p, i) =>
        p.href ? (
          <a
            key={i}
            className="pc-md_link"
            href={p.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            {p.text}
          </a>
        ) : (
          JSON.stringify(p.text).slice(1, -1)
        ),
      )}
      "
    </>
  );
}
