/** Public permission language describes the requested action, never its private reasoning. */
export type PublicApprovalRequest = {
  question: string;
  actions: { kind: "page" | "search" | "read" | "write" | "edit" | "folder" | "unknown"; label: string; target: string }[];
  explanation?: { text: string; updateId: string };
  reviewRequired: boolean;
};

type Call = { name?: unknown; arguments?: unknown; call_id?: unknown; id?: unknown };
const record = (v: unknown): Record<string, unknown> | null => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const text = (v: unknown): string => typeof v === "string" ? v.trim() : "";

/** Built only from concrete requested actions and an explicitly bound public message. */
export function publicApprovalRequest(calls: readonly Call[], value: unknown, runId: string): PublicApprovalRequest {
  const actions: PublicApprovalRequest["actions"] = calls.map((call) => {
    let args = record(call.arguments);
    if (!args && typeof call.arguments === "string") {
      try { args = record(JSON.parse(call.arguments)); } catch { /* An unreadable request needs detailed review. */ }
    }
    const a = args || {};
    const path = text(a.file_path) || text(a.path);
    switch (call.name) {
      case "fetch_url": case "skim_url": {
        const method = a.method === undefined ? "GET" : text(a.method).toUpperCase();
        const displayOptions = new Set(["url", "method", "timeout", "include_binary_preview", "render_js", "keep_links", "include_full_content"]);
        const extraRequestData = Object.keys(a).some((key) => !displayOptions.has(key) && a[key] !== undefined && a[key] !== null);
        if (!["GET", "HEAD"].includes(method) || extraRequestData) return { kind: "unknown", label: "A website request that needs a closer look", target: text(a.url) };
        return { kind: "page", label: "Read a webpage", target: text(a.url) };
      }
      case "web_search": case "skim_websearch": return { kind: "search", label: "Search the web", target: text(a.query) };
      case "read_file": return { kind: "read", label: "Read a file", target: path };
      case "write_file": return { kind: "write", label: "Write to a file — this can replace its contents", target: path };
      case "edit_file": return { kind: "edit", label: "Change a file’s contents", target: path };
      case "list_files": return { kind: "folder", label: "Look through a folder", target: text(a.directory_path) || path || "The current workspace" };
      default: return { kind: "unknown", label: "An action that needs a closer look", target: "" };
    }
  });
  const kind = actions[0]?.kind;
  const same = actions.length > 0 && actions.every((a) => a.kind === kind);
  const questions: Partial<Record<PublicApprovalRequest["actions"][number]["kind"], [string, string]>> = {
    page: ["May I read this webpage?", `May I read these ${actions.length} webpages?`],
    search: ["May I search the web?", "May I make these web searches?"],
    read: ["May I read this file?", `May I read these ${actions.length} files?`],
    write: ["May I write to this file?", `May I write to these ${actions.length} files?`],
    edit: ["May I change this file?", `May I change these ${actions.length} files?`],
    folder: ["May I look through this folder?", "May I look through these folders?"],
  };
  const reviewRequired = !actions.length || actions.some((a) => a.kind === "unknown" || !a.target);
  const question = same && questions[kind!] ? questions[kind!]![actions.length === 1 ? 0 : 1] : "May I do these things?";
  // Source IDs of observations do NOT bind proposed actions. Require the exact pending batch.
  const source = record(value);
  const ids = calls.map((c) => text(c.call_id) || text(c.id));
  const bound = source && Array.isArray(source.call_ids) ? source.call_ids : [];
  const explanation = source && text(runId) && text(source.run_id) === runId && text(source.update_id) &&
    typeof source.iteration === "number" && Number.isInteger(source.iteration) && source.iteration > 0 &&
    ids.length > 0 && ids.every(Boolean) && new Set(ids).size === ids.length &&
    bound.length === ids.length && new Set(bound).size === bound.length && bound.every((id) => typeof id === "string" && ids.includes(id)) &&
    text(source.text) && text(source.text).length <= 600 && !/```\s*diary\b|<\s*diary\b|<\s*think\b/i.test(text(source.text))
      ? { text: text(source.text), updateId: text(source.update_id) } : undefined;
  return { question, actions, reviewRequired, ...(explanation ? { explanation } : {}) };
}
