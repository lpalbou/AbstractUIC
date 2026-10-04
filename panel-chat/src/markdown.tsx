import React, { useEffect, useRef, useState } from "react";
import { codeLanguage, highlightCode, Icon } from "@abstractframework/ui-kit";
import { copyText } from "./utils.js";

/**
 * A fenced code block: the kit's dependency-free highlighter (ui-kit
 * `highlightCode`, the same tokens as `AfCodeBlock`) and a Copy icon
 * (panel-chat 0.4.0, round 8: every chat renders code the same way).
 */
function MarkdownCodeBlock({ code, lang }: { code: string; lang: string }): React.ReactElement {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<number | null>(null);
  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);
  const tokens = highlightCode(code, codeLanguage(lang));
  return (
    <div className="pc-md_codeblock">
      <button
        type="button"
        className={`pc-md_copy${state !== "idle" ? ` pc-md_copy--${state}` : ""}`}
        aria-label="Copy code"
        title={state === "idle" ? "Copy" : state === "copied" ? "Copied" : "Copy failed"}
        onClick={async () => {
          const ok = await copyText(code);
          setState(ok ? "copied" : "failed");
          if (timer.current !== null) window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => setState("idle"), 900);
        }}
      >
        <Icon name={state === "copied" ? "check" : "copy"} size={14} />
      </button>
      <pre className="pc-md_pre">
        <code className={lang ? `language-${lang}` : undefined}>
          {tokens.map((t, k) => (t.kind === "plain" ? <React.Fragment key={k}>{t.text}</React.Fragment> : <span key={k} className={`af-code__${t.kind}`}>{t.text}</span>))}
        </code>
      </pre>
    </div>
  );
}

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

function safeHref(href: string): string | undefined {
  const value = String(href || "").trim();
  if (!value) return undefined;
  if (/^(https?:|mailto:|tel:|#|\/)/i.test(value)) return value;
  return undefined;
}

/** Resolves relative sources when no page is available (server rendering). */
const SENTINEL_BASE = "http://same-origin.invalid/";

/**
 * A relative reference ("api/gateway/…", "./out/a.png"): one the URL parser
 * resolves onto the base's own origin with http(s). Schemes (`javascript:`,
 * `data:`), protocol-relative `//host` and `/\host` all resolve elsewhere.
 */
function isRelativeReference(value: string): boolean {
  try {
    const resolved = new URL(value, SENTINEL_BASE);
    return resolved.protocol === "http:" && resolved.origin === new URL(SENTINEL_BASE).origin;
  } catch {
    return false;
  }
}

/** An image source the renderer may use: a safe href, or a relative reference (the kit's own "api/gateway/…" routes). */
function safeImageSrc(src: string): string | undefined {
  const value = String(src || "").trim();
  return safeHref(value) ?? (value && isRelativeReference(value) ? value : undefined);
}

/** Which images a `Markdown` render loads; null = every image (`images="inline"`). */
let inlineImagePolicy: ((src: string) => boolean) | null = null;

/**
 * Default rule for `images="link"`: an image loads only from the page's own
 * origin. The source is resolved like the browser resolves it — against
 * `document.baseURI` — so a RELATIVE path (the kit's own "api/gateway/…"
 * workspace content route, which resolves under an app mounted at
 * /apps/<id>/), a root-relative path and an absolute URL with the page's
 * origin all load. Protocol-relative (`//host/…`, `/\host`), another origin,
 * and every non-http(s) scheme (`javascript:`, `data:`, `blob:`, …) become
 * links. Without a document (server rendering), a source that resolves to
 * no other origin — i.e. a relative one — counts as same-origin.
 */
export function sameOriginImage(src: string): boolean {
  const value = String(src || "").trim();
  if (!value) return false;
  const pageBase = typeof document !== "undefined" && document.baseURI ? document.baseURI : null;
  // No document: resolve against a sentinel origin; only a source that stays on it is relative.
  // A value that starts with a scheme is never relative: "http:evil.com/x.png" would
  // resolve as a path on an http: sentinel, yet on the real page it may name another host.
  if (pageBase === null && /^[a-z][a-z0-9+.-]*:/i.test(value)) return false;
  const base = pageBase ?? SENTINEL_BASE;
  let origin: string;
  let resolved: URL;
  try {
    origin = new URL(base).origin;
    resolved = new URL(value, base);
  } catch {
    return false;
  }
  if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return false;
  return resolved.origin === origin;
}

/** An image the policy refuses: a plain link, never a request. */
function imageLink(key: string, src: string, alt: string): React.ReactElement {
  return (
    <a key={key} className="pc-md_link pc-md_image_link" href={src} target="_blank" rel="noopener noreferrer">
      {`image: ${alt || src}`}
    </a>
  );
}

function isWordChar(ch: string | undefined): boolean {
  return Boolean(ch) && /[\p{L}\p{N}]/u.test(ch as string);
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

    if (ch === "!" && s[i + 1] === "[") {
      const labelEnd = s.indexOf("]", i + 2);
      if (labelEnd !== -1 && s[labelEnd + 1] === "(") {
        const hrefEnd = s.indexOf(")", labelEnd + 2);
        if (hrefEnd !== -1) {
          const alt = s.slice(i + 2, labelEnd);
          const src = safeImageSrc(s.slice(labelEnd + 2, hrefEnd));
          if (src && inlineImagePolicy && !inlineImagePolicy(src)) {
            flush();
            out.push(imageLink(`img:${i}`, src, alt));
            i = hrefEnd + 1;
            continue;
          }
          if (src) {
            flush();
            out.push(
              <span key={`img:${i}`} className="pc-md_image_inline">
                <img className="pc-md_img" src={src} alt={alt} loading="lazy" />
                {alt ? <span className="pc-md_img_caption">{highlight ? highlightInline(alt, highlight) : alt}</span> : null}
              </span>
            );
            i = hrefEnd + 1;
            continue;
          }
        }
      }
    }

    if (ch === "[") {
      const labelEnd = s.indexOf("]", i + 1);
      if (labelEnd !== -1 && s[labelEnd + 1] === "(") {
        const hrefEnd = s.indexOf(")", labelEnd + 2);
        if (hrefEnd !== -1) {
          const label = s.slice(i + 1, labelEnd);
          const href = safeHref(s.slice(labelEnd + 2, hrefEnd));
          if (href) {
            flush();
            // "/" links open in a NEW TAB like absolute links (continuum's
            // reload adversary, 2026-07-16): this renderer draws AGENT-authored
            // text, so a root-relative href is not a client-router route — in
            // an SPA consumer a same-tab "/" click unloads the whole app to
            // the SPA fallback (full reload, state gone). Only "#" fragment
            // anchors stay same-tab (hash changes never unload).
            out.push(
              <a key={`link:${i}`} className="pc-md_link" href={href} target={href.startsWith("#") ? undefined : "_blank"} rel="noreferrer">
                {renderInline(label, highlight)}
              </a>
            );
            i = hrefEnd + 1;
            continue;
          }
        }
      }
    }

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

    // Underscore emphasis (`_em_`, `__strong__`), CommonMark's flanking rule
    // in short: it opens after a non-word character and before a non-space,
    // and closes after a non-space and before a non-word character, so
    // snake_case_names and paths stay literal.
    if (ch === "_" && !isWordChar(s[i - 1])) {
      const marker = s[i + 1] === "_" ? "__" : "_";
      const n = marker.length;
      if (s[i + n] && !/\s/.test(s[i + n]) && s[i + n] !== "_") {
        let j = s.indexOf(marker, i + n);
        while (j !== -1 && (/\s/.test(s[j - 1] || " ") || isWordChar(s[j + n]) || (n === 1 && s[j + 1] === "_"))) j = s.indexOf(marker, j + 1);
        if (j !== -1 && j > i + n) {
          flush();
          const inner = s.slice(i + n, j);
          const nodes = renderInline(inner, highlight);
          out.push(n === 2 ? <strong key={`ubold:${i}`}>{nodes}</strong> : <em key={`uem:${i}`}>{nodes}</em>);
          i = j + n;
          continue;
        }
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

/*
 * Nested lists (operator fix 2026-07-13): the old renderer flattened every
 * list region into ONE <ol> or <ul> — a document mixing `1.` items with
 * indented `-` sub-bullets rendered flat, and a marker switch mid-region was
 * swallowed into the wrong list type. Lists are now built as a real tree
 * from indentation (tabs count as 4), with mixed markers handled:
 * deeper indent nests under the previous item; a marker-type switch at the
 * SAME indent closes the current list and starts a sibling of the same
 * parent.
 */
type ListItemLine = { indent: number; ordered: boolean; start: number; content: string };

function parseListItemLine(line: string): ListItemLine | null {
  const s = String(line ?? "");
  // Bullets: -, *, + ; ordered: 1. or 1) (CommonMark's two ordered forms).
  const m = s.match(/^([ \t]*)(?:([-*+])|(\d{1,9})[.)])\s+(.*)$/);
  if (!m) return null;
  const indent = m[1].replace(/\t/g, "    ").length;
  return {
    indent,
    ordered: Boolean(m[3]),
    start: m[3] ? Math.max(1, parseInt(m[3], 10) || 1) : 1,
    content: m[4] ?? "",
  };
}

type ListNode = { ordered: boolean; start: number; items: ListItem[] };
type ListItem = { content: string; children: ListNode[] };

function buildListTree(itemLines: string[]): ListNode[] {
  const entries: ListItemLine[] = [];
  for (const raw of itemLines) {
    const item = parseListItemLine(raw);
    if (item) {
      entries.push(item);
    } else if (entries.length > 0 && raw.trim()) {
      // Indented continuation line: part of the previous item's text.
      entries[entries.length - 1].content += ` ${raw.trim()}`;
    }
  }

  const roots: ListNode[] = [];
  const stack: { indent: number; node: ListNode }[] = [];

  for (const e of entries) {
    while (stack.length > 0 && e.indent < stack[stack.length - 1].indent) stack.pop();

    let top = stack.length > 0 ? stack[stack.length - 1] : null;

    if (top && e.indent > top.indent) {
      // Deeper indent: nest a new list under the previous item.
      const parentItems = top.node.items;
      const parent = parentItems[parentItems.length - 1];
      if (parent) {
        const node: ListNode = { ordered: e.ordered, start: e.start, items: [] };
        parent.children.push(node);
        stack.push({ indent: e.indent, node });
        top = stack[stack.length - 1];
      }
      // No parent item can only happen on a malformed first entry — fall
      // through and treat it as a same-level item of the top list.
    } else if (top && top.node.ordered !== e.ordered) {
      // Marker switch at the same indent: close this list, open a sibling
      // under the same parent (or as a new root).
      stack.pop();
      const up = stack.length > 0 ? stack[stack.length - 1] : null;
      const node: ListNode = { ordered: e.ordered, start: e.start, items: [] };
      if (up) {
        const parentItems = up.node.items;
        const parent = parentItems[parentItems.length - 1];
        if (parent) parent.children.push(node);
        else up.node.items.push({ content: "", children: [node] });
      } else {
        roots.push(node);
      }
      stack.push({ indent: e.indent, node });
      top = stack[stack.length - 1];
    }

    if (!top) {
      const node: ListNode = { ordered: e.ordered, start: e.start, items: [] };
      roots.push(node);
      stack.push({ indent: e.indent, node });
      top = stack[stack.length - 1];
    }

    top.node.items.push({ content: e.content, children: [] });
  }

  return roots;
}

function renderListNode(node: ListNode, highlight: HighlightState | null, key: string): React.ReactElement {
  const children = node.items.map((it, idx) => (
    <li key={`${key}:li:${idx}`}>
      {renderInline(it.content, highlight)}
      {it.children.map((child, cIdx) => renderListNode(child, highlight, `${key}:${idx}:${cIdx}`))}
    </li>
  ));
  return node.ordered ? (
    <ol key={key} className="pc-md_ol" start={node.start !== 1 ? node.start : undefined}>
      {children}
    </ol>
  ) : (
    <ul key={key} className="pc-md_ul">
      {children}
    </ul>
  );
}

function renderListRegion(itemLines: string[], highlight: HighlightState | null, keyBase: string): React.ReactNode[] {
  return buildListTree(itemLines).map((root, idx) => renderListNode(root, highlight, `${keyBase}:${idx}`));
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

// Block starts shared by the block branches and the paragraph loop, so what
// opens a block also interrupts a paragraph (CommonMark: ATX headings, code
// fences and block quotes interrupt a paragraph; no blank line needed).
const HEADING_RE = /^(#{1,5})\s+(.*)$/;
function isFenceLine(line: string): boolean {
  return line.trim().startsWith("```");
}
function isQuoteLine(line: string): boolean {
  return line.trimStart().startsWith(">");
}

export type MarkdownImages = "inline" | "link";

export type MarkdownProps = {
  text: string;
  className?: string;
  highlight?: string;
  highlights?: string[];
  highlightClassName?: string;
  highlightId?: string;
  /**
   * `"inline"` (default for `Markdown`) loads every image. `"link"` loads
   * only images `inlineImage(src)` accepts (default `sameOriginImage`) and
   * shows every other one as a link "image: <alt>", so text written by a
   * model cannot make the browser fetch a remote URL. Chat messages use
   * `"link"` for assistant and system messages.
   */
  images?: MarkdownImages;
  inlineImage?: (src: string) => boolean;
};

export function Markdown(props: MarkdownProps): React.ReactElement {
  const previous = inlineImagePolicy;
  inlineImagePolicy = props.images === "link" ? props.inlineImage || sameOriginImage : null;
  try {
    return renderMarkdown(props);
  } finally {
    inlineImagePolicy = previous;
  }
}

function renderMarkdown({
  text,
  className,
  highlight,
  highlights,
  highlightClassName,
  highlightId,
}: MarkdownProps): React.ReactElement {
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
    // CommonMark thematic breaks tolerate interior spaces ("- - -", "* * *");
    // without this, "- - -" parsed as a bullet list (adversary find).
    if (/^([-_*])(\s*\1){2,}$/.test(hr)) {
      blocks.push(<hr key={`hr:${i}`} className="pc-md_hr" />);
      i += 1;
      continue;
    }

    const imageM = line.match(/^\s*!\[([^\]]*)\]\(([^)]+)\)\s*$/);
    if (imageM) {
      const src = safeImageSrc(imageM[2] || "");
      if (src && inlineImagePolicy && !inlineImagePolicy(src)) {
        blocks.push(<p key={`p:${i}`} className="pc-md_p">{imageLink(`img:${i}`, src, imageM[1] || "")}</p>);
        i += 1;
        continue;
      }
      if (src) {
        const alt = imageM[1] || "";
        blocks.push(
          <figure key={`figure:${i}`} className="pc-md_figure">
            <img className="pc-md_img" src={src} alt={alt} loading="lazy" />
            {alt ? <figcaption>{renderInline(alt, highlightState)}</figcaption> : null}
          </figure>
        );
        i += 1;
        continue;
      }
    }

    if (isFenceLine(line)) {
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
      blocks.push(<MarkdownCodeBlock key={`pre:${i}`} code={code} lang={lang} />);
      continue;
    }

    const headingM = line.match(HEADING_RE);
    if (headingM) {
      const level = headingM[1].length;
      const content = headingM[2] || "";
      const nodes = renderInline(content, highlightState);
      if (level === 1) blocks.push(<h1 key={`h1:${i}`}>{nodes}</h1>);
      else if (level === 2) blocks.push(<h2 key={`h2:${i}`}>{nodes}</h2>);
      else if (level === 3) blocks.push(<h3 key={`h3:${i}`}>{nodes}</h3>);
      else if (level === 4) blocks.push(<h4 key={`h4:${i}`}>{nodes}</h4>);
      else blocks.push(<h5 key={`h5:${i}`}>{nodes}</h5>);
      i += 1;
      continue;
    }

    if (isQuoteLine(line)) {
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

    if (parseListItemLine(line)) {
      const itemLines: string[] = [];
      // A list region is consecutive list-item lines plus indented
      // continuation lines; a blank line still ends the block (unchanged
      // paragraph semantics elsewhere in this renderer). A fence line ends
      // the region too — folding ``` into an item's text garbled code blocks
      // inside lists (adversary find 2026-07-13); breaking lets the fence
      // handler render it, and any following items start a fresh region.
      while (i < lines.length) {
        const cur = String(lines[i] ?? "");
        if (!cur.trim()) break;
        if (cur.trimStart().startsWith("```")) break;
        if (parseListItemLine(cur) || /^\s{2,}\S/.test(cur)) {
          itemLines.push(cur);
          i += 1;
          continue;
        }
        break;
      }
      blocks.push(<React.Fragment key={`list:${i}`}>{renderListRegion(itemLines, highlightState, `list:${i}`)}</React.Fragment>);
      continue;
    }

    const paraLines: string[] = [];
    while (i < lines.length && String(lines[i] ?? "").trim()) {
      // A list interrupts a paragraph (CommonMark): "intro line:\n- a\n- b"
      // with no blank line is one of the most common assistant emissions —
      // swallowing the bullets into the paragraph rendered them as "- a<br/>"
      // prose (adversary find 2026-07-14).
      if (paraLines.length > 0 && parseListItemLine(String(lines[i] ?? ""))) break;
      // A TABLE interrupts a paragraph the same way (GitHub behavior):
      // "intro line:\n| a | b |\n|---|---|" with no blank line is the
      // standard assistant status-table emission — swallowing the header
      // row rendered whole tables as piped prose (operator report
      // 2026-07-17, continuum dm 67; only blank-line-preceded tables ever
      // parsed). Same header+separator test as the block branch, so the
      // break hands the lines to it verbatim.
      const cur_line = String(lines[i] ?? "");
      // An ATX heading, a code fence or a block quote interrupts a paragraph
      // too (CommonMark). The automation trigger turn is exactly
      // "[Trigger …]\n## Task…" and echo answers repeat it; the chat's own
      // "intro:\n```json" and "note\n> quote" emissions had the same defect
      // (rendered as literal "##" / backticks / "&gt;" prose).
      if (paraLines.length > 0 && (HEADING_RE.test(cur_line) || isFenceLine(cur_line) || isQuoteLine(cur_line))) break;
      if (paraLines.length > 0 && cur_line.includes("|") && i + 1 < lines.length && isTableSeparator(String(lines[i + 1] ?? ""))) break;
      paraLines.push(cur_line);
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
