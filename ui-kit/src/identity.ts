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
