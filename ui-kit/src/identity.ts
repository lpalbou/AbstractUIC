// Framework and application identity for "About" screens.
//
// One canonical descriptor (`identity/abstractframework.json` in the
// AbstractFramework repository) is vendored here BYTE-IDENTICAL as
// `abstractframework_identity.json` (root `scripts/check_identity_sync.py`
// fails on drift). Every AbstractFramework app renders the same facts, in the
// same order, as the Python `abstractcore.utils.identity.about_fields` — the
// rows below mirror that function exactly.
//
// Versions are deliberately NOT looked up here: the app passes its own
// version, and gateway/package versions arrive as `extra` rows (for example
// from `GET /api/gateway/about`).
import descriptor from "./abstractframework_identity.json" with { type: "json" };

export type FrameworkIdentity = {
  name: string;
  website: string;
  github_org: string;
  author: string;
  years: string;
  license: string;
  copyright: string;
  contact_email: string;
};

export type AppIdentity = {
  /** Distribution name in lower case, e.g. "abstractflow". */
  id: string;
  name: string;
  version: string;
  website: string;
  repo: string;
  docs: string;
  issues: string;
  feedback: string;
};

/** One About row: `[label, value]`. */
export type AboutRow = [label: string, value: string];

type AppEntry = Omit<AppIdentity, "id" | "version">;
type Descriptor = { schema: string; framework: FrameworkIdentity; apps: Record<string, AppEntry> };

const DESCRIPTOR = descriptor as Descriptor;

/** The framework-wide facts (name, website, author, licence, contact). */
export function frameworkIdentity(): FrameworkIdentity {
  return { ...DESCRIPTOR.framework };
}

/** Every application id the descriptor knows, sorted. */
export function knownAppIds(): string[] {
  return Object.keys(DESCRIPTOR.apps).sort();
}

/**
 * Identity of one application. `id` is the distribution name in lower case
 * ("abstractflow"); `version` is the app's own version string.
 * Throws for an id the descriptor does not know: callers must not invent
 * identity facts.
 */
export function appIdentity(id: string, version: string): AppIdentity {
  const raw = Object.prototype.hasOwnProperty.call(DESCRIPTOR.apps, id) ? DESCRIPTOR.apps[id] : undefined;
  if (!raw) {
    throw new Error(`appIdentity: unknown application id "${id}" (known: ${knownAppIds().join(", ")})`);
  }
  return {
    id,
    name: raw.name,
    version,
    website: raw.website,
    repo: raw.repo,
    docs: raw.docs,
    issues: raw.issues,
    feedback: raw.feedback,
  };
}

/**
 * The ordered rows every About screen shows, then `extra` app-specific rows
 * (for example gateway package versions). Same rows, same order, as the
 * Python `about_fields`.
 */
export function aboutRows(identity: AppIdentity, extra?: ReadonlyArray<readonly [string, string]>): AboutRow[] {
  const fw = DESCRIPTOR.framework;
  const rows: AboutRow[] = [
    ["Application", `${identity.name} ${identity.version}`],
    ["Part of", `${fw.name} — ${fw.website}`],
    ["Author", `${fw.author} (${fw.years})`],
    ["Copyright", fw.copyright],
    ["Website", identity.website],
    ["Source", identity.repo],
    ["Documentation", identity.docs],
    ["Report an issue", identity.issues],
    ["Give feedback", identity.feedback],
    ["Contact", fw.contact_email],
  ];
  for (const [label, value] of extra || []) rows.push([String(label), String(value)]);
  return rows;
}

/** Body of the gateway's `GET /api/gateway/about` (no secrets, no paths). */
export type GatewayAboutPayload = {
  abstractframework?: string | null;
  abstractgateway: string;
  packages?: Record<string, string | null>;
};

/** Only a non-empty string is a version; numbers, booleans and null are "not reported". */
function versionText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * About rows describing the connected gateway, formatted the same way in
 * every app (append them to `aboutRows` / pass them as `extraRows`):
 *
 *   ["Gateway", "AbstractGateway <v>"]
 *   ["Gateway framework", "AbstractFramework <v>" | "not installed on the gateway host"]
 *   ["Gateway package <name>", "<v>"]   // every other package, sorted by name;
 *                                        // entries without a string version are skipped
 *
 * `payload` is the parsed body of `GET /api/gateway/about`. When the request
 * failed, pass `null` and the reason as `error`: the result is exactly one
 * row, ["Gateway", "unavailable (<error>)"]. A payload without a string
 * `abstractgateway` version gives the same single row. The error is a
 * separate argument so a gateway body that happens to carry an `error` field
 * is never mistaken for a failure. The kit does not fetch. Same rows as the
 * Python `abstractcore.utils.identity.gateway_version_rows(payload, error)`.
 */
export function gatewayVersionRows(payload: GatewayAboutPayload | null, error?: string): AboutRow[] {
  if (error !== undefined && error !== null) {
    const reason = String(error).trim() || "unknown error";
    return [["Gateway", `unavailable (${reason})`]];
  }
  const raw = (payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {}) as Record<string, unknown>;
  const gateway = versionText(raw.abstractgateway);
  if (!gateway) return [["Gateway", "unavailable (the gateway did not report its version)"]];
  const framework = versionText(raw.abstractframework);
  const rows: AboutRow[] = [
    ["Gateway", `AbstractGateway ${gateway}`],
    ["Gateway framework", framework ? `AbstractFramework ${framework}` : "not installed on the gateway host"],
  ];
  const packages =
    raw.packages && typeof raw.packages === "object" && !Array.isArray(raw.packages) ? (raw.packages as Record<string, unknown>) : {};
  const names = Object.keys(packages)
    .filter((name) => name !== "abstractgateway" && name !== "abstractframework")
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (const name of names) {
    const v = versionText(packages[name]);
    if (v) rows.push([`Gateway package ${name}`, v]);
  }
  return rows;
}
