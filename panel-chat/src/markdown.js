import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
function highlightInline(text, state) {
    const s = String(text ?? "");
    if (!state || !state.needles.length)
        return [s];
    const out = [];
    const hayLower = s.toLowerCase();
    let pos = 0;
    while (pos < s.length) {
        let bestStart = -1;
        let bestNeedle = "";
        for (let i = 0; i < state.needlesLower.length; i++) {
            const needleLower = state.needlesLower[i];
            if (!needleLower)
                continue;
            const idx = hayLower.indexOf(needleLower, pos);
            if (idx === -1)
                continue;
            const needle = state.needles[i] || "";
            if (!needle)
                continue;
            if (bestStart === -1 || idx < bestStart || (idx === bestStart && needle.length > bestNeedle.length)) {
                bestStart = idx;
                bestNeedle = needle;
            }
        }
        if (bestStart === -1 || !bestNeedle) {
            out.push(s.slice(pos));
            break;
        }
        if (bestStart > pos)
            out.push(s.slice(pos, bestStart));
        const id = state.hits === 0 && state.id ? state.id : undefined;
        const matchedText = s.slice(bestStart, bestStart + bestNeedle.length);
        out.push(_jsx("span", { id: id, className: state.className, children: matchedText }, `hl:${state.hits}`));
        state.hits += 1;
        pos = bestStart + bestNeedle.length;
    }
    return out;
}
function safeHref(href) {
    const value = String(href || "").trim();
    if (!value)
        return undefined;
    if (/^(https?:|mailto:|tel:|#|\/)/i.test(value))
        return value;
    return undefined;
}
function renderInline(text, highlight) {
    const out = [];
    const s = String(text ?? "");
    let i = 0;
    let buf = "";
    const flush = () => {
        if (!buf)
            return;
        for (const node of highlightInline(buf, highlight))
            out.push(node);
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
                    const src = safeHref(s.slice(labelEnd + 2, hrefEnd));
                    if (src) {
                        flush();
                        out.push(_jsxs("span", { className: "pc-md_image_inline", children: [_jsx("img", { className: "pc-md_img", src: src, alt: alt, loading: "lazy" }), alt ? _jsx("span", { className: "pc-md_img_caption", children: highlight ? highlightInline(alt, highlight) : alt }) : null] }, `img:${i}`));
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
                        out.push(_jsx("a", { className: "pc-md_link", href: href, target: href.startsWith("#") || href.startsWith("/") ? undefined : "_blank", rel: "noreferrer", children: renderInline(label, highlight) }, `link:${i}`));
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
                out.push(_jsx("code", { children: highlight ? highlightInline(inner, highlight) : inner }, `code:${i}`));
                i = j + 1;
                continue;
            }
        }
        if (ch === "*" && s[i + 1] === "*") {
            const j = s.indexOf("**", i + 2);
            if (j !== -1) {
                flush();
                const inner = s.slice(i + 2, j);
                out.push(_jsx("strong", { children: highlight ? highlightInline(inner, highlight) : inner }, `bold:${i}`));
                i = j + 2;
                continue;
            }
        }
        if (ch === "*" && s[i + 1] !== "*") {
            const j = s.indexOf("*", i + 1);
            if (j !== -1) {
                flush();
                const inner = s.slice(i + 1, j);
                out.push(_jsx("em", { children: highlight ? highlightInline(inner, highlight) : inner }, `em:${i}`));
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
function normalizeLines(text) {
    const s = String(text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    return s.split("\n");
}
function parseListItemLine(line) {
    const s = String(line ?? "");
    // Bullets: -, *, + ; ordered: 1. or 1) (CommonMark's two ordered forms).
    const m = s.match(/^([ \t]*)(?:([-*+])|(\d{1,9})[.)])\s+(.*)$/);
    if (!m)
        return null;
    const indent = m[1].replace(/\t/g, "    ").length;
    return {
        indent,
        ordered: Boolean(m[3]),
        start: m[3] ? Math.max(1, parseInt(m[3], 10) || 1) : 1,
        content: m[4] ?? "",
    };
}
function buildListTree(itemLines) {
    const entries = [];
    for (const raw of itemLines) {
        const item = parseListItemLine(raw);
        if (item) {
            entries.push(item);
        }
        else if (entries.length > 0 && raw.trim()) {
            // Indented continuation line: part of the previous item's text.
            entries[entries.length - 1].content += ` ${raw.trim()}`;
        }
    }
    const roots = [];
    const stack = [];
    for (const e of entries) {
        while (stack.length > 0 && e.indent < stack[stack.length - 1].indent)
            stack.pop();
        let top = stack.length > 0 ? stack[stack.length - 1] : null;
        if (top && e.indent > top.indent) {
            // Deeper indent: nest a new list under the previous item.
            const parentItems = top.node.items;
            const parent = parentItems[parentItems.length - 1];
            if (parent) {
                const node = { ordered: e.ordered, start: e.start, items: [] };
                parent.children.push(node);
                stack.push({ indent: e.indent, node });
                top = stack[stack.length - 1];
            }
            // No parent item can only happen on a malformed first entry — fall
            // through and treat it as a same-level item of the top list.
        }
        else if (top && top.node.ordered !== e.ordered) {
            // Marker switch at the same indent: close this list, open a sibling
            // under the same parent (or as a new root).
            stack.pop();
            const up = stack.length > 0 ? stack[stack.length - 1] : null;
            const node = { ordered: e.ordered, start: e.start, items: [] };
            if (up) {
                const parentItems = up.node.items;
                const parent = parentItems[parentItems.length - 1];
                if (parent)
                    parent.children.push(node);
                else
                    up.node.items.push({ content: "", children: [node] });
            }
            else {
                roots.push(node);
            }
            stack.push({ indent: e.indent, node });
            top = stack[stack.length - 1];
        }
        if (!top) {
            const node = { ordered: e.ordered, start: e.start, items: [] };
            roots.push(node);
            stack.push({ indent: e.indent, node });
            top = stack[stack.length - 1];
        }
        top.node.items.push({ content: e.content, children: [] });
    }
    return roots;
}
function renderListNode(node, highlight, key) {
    const children = node.items.map((it, idx) => (_jsxs("li", { children: [renderInline(it.content, highlight), it.children.map((child, cIdx) => renderListNode(child, highlight, `${key}:${idx}:${cIdx}`))] }, `${key}:li:${idx}`)));
    return node.ordered ? (_jsx("ol", { className: "pc-md_ol", start: node.start !== 1 ? node.start : undefined, children: children }, key)) : (_jsx("ul", { className: "pc-md_ul", children: children }, key));
}
function renderListRegion(itemLines, highlight, keyBase) {
    return buildListTree(itemLines).map((root, idx) => renderListNode(root, highlight, `${keyBase}:${idx}`));
}
function splitTableRow(line) {
    let s = String(line ?? "").trim();
    if (!s)
        return [];
    if (s.startsWith("|"))
        s = s.slice(1);
    if (s.endsWith("|"))
        s = s.slice(0, -1);
    return s.split("|").map((c) => String(c ?? "").trim());
}
function isTableSeparator(line) {
    let s = String(line ?? "").trim();
    if (!s)
        return false;
    if (s.startsWith("|"))
        s = s.slice(1);
    if (s.endsWith("|"))
        s = s.slice(0, -1);
    const cells = s.split("|").map((c) => String(c ?? "").trim());
    if (cells.length < 2)
        return false;
    return cells.every((c) => /^:?-{3,}:?$/.test(c));
}
export function Markdown({ text, className, highlight, highlights, highlightClassName, highlightId, }) {
    const lines = normalizeLines(text);
    const blocks = [];
    const needlesRaw = [];
    if (Array.isArray(highlights))
        needlesRaw.push(...highlights);
    if (typeof highlight === "string" && highlight.trim())
        needlesRaw.push(highlight);
    const needles = Array.from(new Set(needlesRaw.map((s) => String(s ?? "").trim()).filter(Boolean))).filter((n) => n.length >= 4);
    const highlightState = needles.length
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
            blocks.push(_jsx("hr", { className: "pc-md_hr" }, `hr:${i}`));
            i += 1;
            continue;
        }
        const imageM = line.match(/^\s*!\[([^\]]*)\]\(([^)]+)\)\s*$/);
        if (imageM) {
            const src = safeHref(imageM[2] || "");
            if (src) {
                const alt = imageM[1] || "";
                blocks.push(_jsxs("figure", { className: "pc-md_figure", children: [_jsx("img", { className: "pc-md_img", src: src, alt: alt, loading: "lazy" }), alt ? _jsx("figcaption", { children: renderInline(alt, highlightState) }) : null] }, `figure:${i}`));
                i += 1;
                continue;
            }
        }
        if (line.trim().startsWith("```")) {
            const fence = line.trim();
            const lang = fence.replace(/```/g, "").trim();
            const codeLines = [];
            i += 1;
            while (i < lines.length && !String(lines[i] ?? "").trim().startsWith("```")) {
                codeLines.push(String(lines[i] ?? ""));
                i += 1;
            }
            if (i < lines.length)
                i += 1;
            const code = codeLines.join("\n");
            blocks.push(_jsx("pre", { className: "pc-md_pre", children: _jsx("code", { className: lang ? `language-${lang}` : undefined, children: code }) }, `pre:${i}`));
            continue;
        }
        const headingM = line.match(/^(#{1,5})\s+(.*)$/);
        if (headingM) {
            const level = headingM[1].length;
            const content = headingM[2] || "";
            const nodes = renderInline(content, highlightState);
            if (level === 1)
                blocks.push(_jsx("h1", { children: nodes }, `h1:${i}`));
            else if (level === 2)
                blocks.push(_jsx("h2", { children: nodes }, `h2:${i}`));
            else if (level === 3)
                blocks.push(_jsx("h3", { children: nodes }, `h3:${i}`));
            else if (level === 4)
                blocks.push(_jsx("h4", { children: nodes }, `h4:${i}`));
            else
                blocks.push(_jsx("h5", { children: nodes }, `h5:${i}`));
            i += 1;
            continue;
        }
        if (line.trimStart().startsWith(">")) {
            const quoteLines = [];
            while (i < lines.length && String(lines[i] ?? "").trimStart().startsWith(">")) {
                const raw = String(lines[i] ?? "");
                const t = raw.trimStart();
                quoteLines.push(t.replace(/^>\s?/, ""));
                i += 1;
            }
            blocks.push(_jsx("blockquote", { className: "pc-md_quote", children: quoteLines.map((q, idx) => (_jsxs(React.Fragment, { children: [renderInline(q, highlightState), idx < quoteLines.length - 1 ? _jsx("br", {}) : null] }, `q:${i}:${idx}`))) }, `quote:${i}`));
            continue;
        }
        if (line.includes("|") && i + 1 < lines.length && isTableSeparator(String(lines[i + 1] ?? ""))) {
            const headers = splitTableRow(line);
            const colCount = Math.max(1, headers.length);
            const rows = [];
            i += 2;
            while (i < lines.length) {
                const rowLine = String(lines[i] ?? "");
                if (!rowLine.trim())
                    break;
                if (!rowLine.includes("|"))
                    break;
                const cells = splitTableRow(rowLine);
                const normalized = [];
                for (let c = 0; c < colCount; c++)
                    normalized.push(cells[c] ?? "");
                rows.push(normalized);
                i += 1;
            }
            blocks.push(_jsx("div", { className: "pc-md_table_wrap", children: _jsxs("table", { className: "pc-md_table", children: [_jsx("thead", { children: _jsx("tr", { children: headers.slice(0, colCount).map((h, idx) => (_jsx("th", { children: renderInline(h, highlightState) }, `th:${i}:${idx}`))) }) }), _jsx("tbody", { children: rows.map((r, rIdx) => (_jsx("tr", { children: r.map((cell, cIdx) => (_jsx("td", { children: renderInline(cell, highlightState) }, `td:${i}:${rIdx}:${cIdx}`))) }, `tr:${i}:${rIdx}`))) })] }) }, `table:${i}`));
            continue;
        }
        if (parseListItemLine(line)) {
            const itemLines = [];
            // A list region is consecutive list-item lines plus indented
            // continuation lines; a blank line still ends the block (unchanged
            // paragraph semantics elsewhere in this renderer). A fence line ends
            // the region too — folding ``` into an item's text garbled code blocks
            // inside lists (adversary find 2026-07-13); breaking lets the fence
            // handler render it, and any following items start a fresh region.
            while (i < lines.length) {
                const cur = String(lines[i] ?? "");
                if (!cur.trim())
                    break;
                if (cur.trimStart().startsWith("```"))
                    break;
                if (parseListItemLine(cur) || /^\s{2,}\S/.test(cur)) {
                    itemLines.push(cur);
                    i += 1;
                    continue;
                }
                break;
            }
            blocks.push(_jsx(React.Fragment, { children: renderListRegion(itemLines, highlightState, `list:${i}`) }, `list:${i}`));
            continue;
        }
        const paraLines = [];
        while (i < lines.length && String(lines[i] ?? "").trim()) {
            // A list interrupts a paragraph (CommonMark): "intro line:\n- a\n- b"
            // with no blank line is one of the most common assistant emissions —
            // swallowing the bullets into the paragraph rendered them as "- a<br/>"
            // prose (adversary find 2026-07-14).
            if (paraLines.length > 0 && parseListItemLine(String(lines[i] ?? "")))
                break;
            paraLines.push(String(lines[i] ?? ""));
            i += 1;
        }
        blocks.push(_jsx("p", { className: "pc-md_p", children: paraLines.map((pl, idx) => (_jsxs(React.Fragment, { children: [renderInline(pl, highlightState), idx < paraLines.length - 1 ? _jsx("br", {}) : null] }, `pl:${i}:${idx}`))) }, `p:${i}`));
    }
    const cls = ["pc-md", className].filter(Boolean).join(" ");
    return _jsx("div", { className: cls, children: blocks });
}
