export function tryParseJson(text) {
    const trimmed = String(text ?? "").trim();
    if (!trimmed)
        return null;
    if (!((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))))
        return null;
    try {
        return JSON.parse(trimmed);
    }
    catch {
        return null;
    }
}
function safeJson(value) {
    if (value == null)
        return "";
    if (typeof value === "string")
        return value;
    try {
        return JSON.stringify(value, null, 2);
    }
    catch {
        return String(value);
    }
}
function formatMessageHeader(m) {
    const role = String(m.role || "message").trim() || "message";
    const title = String(m.title || "").trim();
    const ts = String(m.ts || "").trim();
    const parts = [role];
    if (title)
        parts.push(title);
    if (ts)
        parts.push(ts);
    return parts.join(" · ");
}
function ensureTrailingNewline(s) {
    return s.endsWith("\n") ? s : `${s}\n`;
}
function isAlreadyFenced(content) {
    return String(content || "").trimStart().startsWith("```");
}
export function chatToMarkdown(messages, opts) {
    const heading = String(opts?.heading || "Chat").trim() || "Chat";
    const lines = [`# ${heading}`, ""];
    for (const m of messages) {
        const header = formatMessageHeader(m);
        lines.push(`## ${header}`, "");
        const content = String(m.content || "");
        const parsed = tryParseJson(content);
        if (parsed !== null && !isAlreadyFenced(content)) {
            lines.push("```json", safeJson(parsed).trimEnd(), "```", "");
        }
        else {
            lines.push(ensureTrailingNewline(content).trimEnd(), "");
        }
        lines.push("---", "");
    }
    // Drop trailing divider/newlines.
    while (lines.length && !lines[lines.length - 1].trim())
        lines.pop();
    if (lines.length && lines[lines.length - 1] === "---")
        lines.pop();
    return `${lines.join("\n").trimEnd()}\n`;
}
export async function copyText(text) {
    const value = String(text || "");
    if (!value)
        return false;
    try {
        await navigator.clipboard.writeText(value);
        return true;
    }
    catch {
        try {
            const el = document.createElement("textarea");
            el.value = value;
            el.style.position = "fixed";
            el.style.left = "-9999px";
            document.body.appendChild(el);
            el.select();
            document.execCommand("copy");
            document.body.removeChild(el);
            return true;
        }
        catch {
            return false;
        }
    }
}
export function downloadTextFile(opts) {
    const filename = String(opts.filename || "").trim() || "export.txt";
    const text = String(opts.text || "");
    const mime = String(opts.mime || "text/plain;charset=utf-8");
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
