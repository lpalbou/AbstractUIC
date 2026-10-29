/**
 * Tool calls in words (operator QA 2026-10-29): an approval card listed each call as its name and a
 * raw JSON blob (`fetch_url {"include_full_content": false, "keep_links": false, "url": …}`). This
 * module turns one call into a sentence built from the tool's definition: a verb (the coloured chip),
 * the key argument (highlighted: the page, the search, the file), and the secondary options as short
 * muted words. A tool without a template falls back to "Readable key: value" lines, never braces.
 *
 * Pure (no React): the web clients render it with `ToolCallWords`; the Assistant and the Apple
 * apps say the same words (the cases in `tool_call_words.cases.json` are the shared contract).
 */

export type ToolCallInput = { name: string; arguments?: Record<string, unknown> | null };

export type ToolCallWords = {
  /** The tool's verb, shown as its chip: "Fetch", "Search", "Read", "Run". */
  verb: string;
  /** The words before the key argument: "the page", "the web for". */
  lead: string;
  /** The key argument, highlighted (the page, the query, the file), or "" when the tool has none. */
  key: string;
  /** Secondary options in words, shown small and muted: ["summary only", "without links"]. */
  details: string[];
  /** The whole sentence: verb, lead, key, then the details in parentheses. */
  sentence: string;
  /** No template: readable "Key: value" lines instead (never JSON). */
  fallback: Array<{ label: string; value: string }> | null;
  /** The group noun for counting: "page fetch" / "page fetches". */
  noun: [string, string];
};

const REGIONS: Record<string, string> = {
  "us-en": "US English",
  "uk-en": "UK English",
  "wt-wt": "any region",
  "fr-fr": "French (France)",
  "de-de": "German (Germany)",
  "es-es": "Spanish (Spain)",
  "it-it": "Italian (Italy)",
  "ca-en": "Canadian English",
  "au-en": "Australian English",
  "in-en": "Indian English",
};

const TIME_RANGES: Record<string, string> = { d: "past day", w: "past week", m: "past month", y: "past year" };

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : typeof v === "number" || typeof v === "boolean" ? String(v) : "";
}

/** `"Oct. 28, 2026" pharmaceutical` → `“Oct. 28, 2026” pharmaceutical` (typographic quotes, paired). */
export function prettyQuotes(text: string): string {
  let open = true;
  return text.replace(/"/g, () => {
    const q = open ? "“" : "”";
    open = !open;
    return q;
  });
}

/** A URL as a person reads it: host without `www.`, the path's first and last segments with "…"
 * between them when it is long, no scheme, no query. */
export function shortUrl(raw: string): string {
  const text = str(raw);
  let host = "";
  let path = "";
  try {
    const u = new URL(text);
    host = u.host.replace(/^www\./, "");
    path = u.pathname.replace(/\/+$/, "");
  } catch {
    return text;
  }
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 2) return parts.length ? `${host}/${parts.join("/")}` : host;
  return `${host}/${parts[0]}/…/${parts[parts.length - 1]}`;
}

/** `include_full_content` → "Include full content". */
export function readableKey(key: string): string {
  const words = key.replace(/[_-]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : key;
}

function readableValue(v: unknown): string {
  if (v === true) return "yes";
  if (v === false) return "no";
  if (v === null || v === undefined) return "none";
  if (Array.isArray(v)) return v.map(readableValue).join(", ");
  if (typeof v === "object") {
    return Object.entries(v as Record<string, unknown>).map(([k, x]) => `${readableKey(k).toLowerCase()} ${readableValue(x)}`).join(", ");
  }
  return String(v);
}

function searchDetails(a: Record<string, unknown>): string[] {
  const out: string[] = [];
  const n = a.num_results ?? a.max_results ?? a.limit;
  if (typeof n === "number") out.push(`${n} ${n === 1 ? "result" : "results"}`);
  const region = str(a.region).toLowerCase();
  if (region) out.push(REGIONS[region] ?? region);
  const range = str(a.time_range).toLowerCase();
  if (range) out.push(TIME_RANGES[range] ?? range);
  const safe = str(a.safe_search).toLowerCase();
  if (safe) out.push(safe === "off" ? "safe search off" : `${safe} safe search`);
  return out;
}

function pageDetails(a: Record<string, unknown>): string[] {
  const out: string[] = [];
  if (a.include_full_content === false) out.push("summary only");
  if (a.include_full_content === true) out.push("full content");
  if (a.keep_links === false) out.push("without links");
  if (a.keep_links === true) out.push("with links");
  return out;
}

type Template = { verb: string; lead: string; key: (a: Record<string, unknown>) => string; details: (a: Record<string, unknown>) => string[]; noun: [string, string] };

const TEMPLATES: Record<string, Template> = {
  fetch_url: { verb: "Fetch", lead: "the page", key: (a) => shortUrl(str(a.url)), details: pageDetails, noun: ["page fetch", "page fetches"] },
  skim_url: { verb: "Skim", lead: "the page", key: (a) => shortUrl(str(a.url)), details: pageDetails, noun: ["page skim", "page skims"] },
  web_search: { verb: "Search", lead: "the web for", key: (a) => prettyQuotes(str(a.query)), details: searchDetails, noun: ["web search", "web searches"] },
  skim_websearch: { verb: "Search", lead: "the web for", key: (a) => prettyQuotes(str(a.query)), details: searchDetails, noun: ["web search", "web searches"] },
  read_file: { verb: "Read", lead: "the file", key: (a) => str(a.file_path ?? a.path), details: () => [], noun: ["file read", "file reads"] },
  write_file: { verb: "Write", lead: "the file", key: (a) => str(a.file_path ?? a.path), details: () => [], noun: ["file write", "file writes"] },
  edit_file: { verb: "Edit", lead: "the file", key: (a) => str(a.file_path ?? a.path), details: () => [], noun: ["file edit", "file edits"] },
  list_files: { verb: "List", lead: "the folder", key: (a) => str(a.directory_path ?? a.path) || "the workspace", details: () => [], noun: ["folder listing", "folder listings"] },
  execute_command: { verb: "Run", lead: "the command", key: (a) => str(a.command), details: () => [], noun: ["command", "commands"] },
  send_email: { verb: "Email", lead: "", key: (a) => readableValue(a.to), details: (a) => (str(a.subject) ? [`subject “${str(a.subject)}”`] : []), noun: ["email", "emails"] },
  browser_probe: { verb: "Check", lead: "the page renders", key: (a) => shortUrl(str(a.target)) || str(a.target), details: () => [], noun: ["page check", "page checks"] },
};

/** One call in words. */
export function describeToolCall(call: ToolCallInput): ToolCallWords {
  const name = str(call.name) || "tool";
  const args = call.arguments && typeof call.arguments === "object" ? (call.arguments as Record<string, unknown>) : {};
  const t = TEMPLATES[name];
  if (!t) {
    const fallback = Object.entries(args).map(([k, v]) => ({ label: readableKey(k), value: readableValue(v) }));
    // An MCP tool (`mcp::<server>::<tool>`) reads by its own tool name.
    const verb = readableKey(name.includes("::") ? name.split("::").pop() || name : name);
    return { verb, lead: "", key: "", details: [], sentence: verb, fallback, noun: [verb.toLowerCase(), `${verb.toLowerCase()} calls`] };
  }
  const key = t.key(args);
  const details = t.details(args);
  const head = [t.verb, t.lead, key].filter(Boolean).join(" ");
  return { verb: t.verb, lead: t.lead, key, details, sentence: details.length ? `${head} (${details.join(", ")})` : head, fallback: null, noun: t.noun };
}

/** "2 web searches, 2 page fetches" (in the calls' order; one tool named once). */
export function groupToolCalls(calls: readonly ToolCallInput[]): string {
  const counts = new Map<string, { n: number; noun: [string, string] }>();
  for (const c of calls) {
    const w = describeToolCall(c);
    const key = w.noun[1];
    const prev = counts.get(key);
    if (prev) prev.n += 1;
    else counts.set(key, { n: 1, noun: w.noun });
  }
  return [...counts.values()].map(({ n, noun }) => `${n} ${n === 1 ? noun[0] : noun[1]}`).join(", ");
}
