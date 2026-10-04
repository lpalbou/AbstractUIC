#!/usr/bin/env node
/**
 * About / identity checks (contract B, mission U 2026-09-25).
 *
 * - The vendored descriptor parses and has the documented shape.
 * - `aboutRows(appIdentity(id, v))` equals the rows computed HERE, straight
 *   from the descriptor, for EVERY app id — the same rows, labels and order
 *   as the Python `abstractcore.utils.identity.about_fields`.
 * - An unknown id throws (callers must not invent identity facts).
 * - AfAbout / AfAboutDialog (0.7.0 compact card): name + version, framework
 *   and gateway versions, six links (new tab + noopener; contact = mailto),
 *   one author/licence line, and NO package list (red on removal).
 * - AfTopBarActions renders the About button only when `about` is given.
 *
 * renderToStaticMarkup over the compiled dist (no jsdom), like
 * check_matrix_wrapper.mjs.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const here = dirname(fileURLToPath(import.meta.url));
const dist = (f) => join(here, "..", "dist", f);
const descriptor = JSON.parse(readFileSync(join(here, "..", "src", "abstractframework_identity.json"), "utf8"));

const kit = await import(dist("index.js"));
const { appIdentity, frameworkIdentity, knownAppIds, aboutRows, gatewayVersionRows, AfAboutDialog, AfTopBarActions } = kit;
const { trapTabKey, aboutValueParts } = await import(dist("about.js"));

let failures = 0;
let checks = 0;
function check(name, cond, detail) {
  checks += 1;
  if (cond) return;
  failures += 1;
  console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// --- exports exist (a missing export must fail, not skip) -------------------
for (const [name, fn] of Object.entries({ appIdentity, frameworkIdentity, knownAppIds, aboutRows, gatewayVersionRows, AfAboutDialog, AfTopBarActions, trapTabKey, aboutValueParts })) {
  check(`export ${name}`, typeof fn === "function", typeof fn);
}

// --- descriptor + framework identity ----------------------------------------
check("descriptor schema", descriptor.schema === "abstractframework.identity.v1", descriptor.schema);
check("frameworkIdentity() == descriptor.framework", eq(frameworkIdentity(), descriptor.framework));
const fw = descriptor.framework;
const appIds = Object.keys(descriptor.apps).sort();
check("knownAppIds() == descriptor apps", eq(knownAppIds(), appIds), JSON.stringify(knownAppIds()));
check("descriptor has apps", appIds.length >= 10, String(appIds.length));

// --- rows for every app id ---------------------------------------------------
for (const id of appIds) {
  const app = descriptor.apps[id];
  const ident = appIdentity(id, "9.8.7");
  check(`${id}: identity`, eq(ident, { id, name: app.name, version: "9.8.7", website: app.website, repo: app.repo, docs: app.docs, issues: app.issues, feedback: app.feedback }), JSON.stringify(ident));
  const expected = [
    ["Application", `${app.name} 9.8.7`],
    ["Part of", `${fw.name} — ${fw.website}`],
    ["Author", `${fw.author} (${fw.years})`],
    ["Copyright", fw.copyright],
    ["Website", app.website],
    ["Source", app.repo],
    ["Documentation", app.docs],
    ["Report an issue", app.issues],
    ["Give feedback", app.feedback],
    ["Contact", fw.contact_email],
  ];
  check(`${id}: aboutRows`, eq(aboutRows(ident), expected), JSON.stringify(aboutRows(ident)));
  check(`${id}: aboutRows + extra`, eq(aboutRows(ident, [["Gateway", "0.4.3"], ["AbstractCore", "2.15.2"]]), [...expected, ["Gateway", "0.4.3"], ["AbstractCore", "2.15.2"]]));
}

// The literal facts the operator specified (not only descriptor-derived).
const flowRows = aboutRows(appIdentity("abstractflow", "1.0.0"));
check("literal Part of", flowRows[1][1] === "AbstractFramework — https://abstractframework.ai", flowRows[1][1]);
check("literal Author", flowRows[2][1] === "Laurent-Philippe Albou, PhD (2023-2026)", flowRows[2][1]);
check("literal Copyright", flowRows[3][1] === "© 2023-2026 Laurent-Philippe Albou, PhD. Released under the MIT License.", flowRows[3][1]);

// --- unknown id throws -------------------------------------------------------
for (const bad of ["abstractnope", "", "toString", "__proto__", "AbstractFlow"]) {
  let threw = false;
  try {
    appIdentity(bad, "1.0.0");
  } catch (e) {
    threw = /unknown application id/.test(String(e && e.message));
  }
  check(`unknown id ${JSON.stringify(bad)} throws`, threw);
}

// --- gatewayVersionRows(payload, error?) (A-9; parity with the Python twin) ---
{
  // Shared fixture: the same 13 cases the Python
  // abstractcore.utils.identity.gateway_version_rows must satisfy (expected
  // rows were produced by the Python twin).
  const fixture = JSON.parse(readFileSync(join(here, "fixtures", "gateway_version_rows.json"), "utf8"));
  check("parity fixture has the 13 shared cases", Array.isArray(fixture.cases) && fixture.cases.length === 13, String(fixture.cases?.length));
  for (const c of fixture.cases) {
    const got = "error" in c ? gatewayVersionRows(c.payload, c.error) : gatewayVersionRows(c.payload);
    check(`parity: ${c.name}`, eq(got, c.expected), JSON.stringify(got));
  }

  const full = gatewayVersionRows({
    abstractgateway: "0.4.3",
    abstractframework: "0.3.3",
    packages: { abstractruntime: "0.4.33", abstractcore: "2.15.2", abstractgateway: "0.4.3", abstractframework: "0.3.3", abstractvoice: null, abstractmemory: "", abstractagent: "0.2.0" },
  });
  check("gateway rows: never print null/undefined", !JSON.stringify(full).includes("null") && !JSON.stringify(full).includes("undefined"));
  check("gateway rows: error argument wins over a payload", eq(gatewayVersionRows({ abstractgateway: "0.4.3" }, "HTTP 503"), [["Gateway", "unavailable (HTTP 503)"]]));
  check("gateway rows: error field inside a payload is ignored", gatewayVersionRows({ abstractgateway: "0.4.3", error: "boom" })[0][1] === "AbstractGateway 0.4.3");
  check("gateway rows: undefined error = no error", gatewayVersionRows({ abstractgateway: "1" }, undefined)[0][1] === "AbstractGateway 1");
  check("gateway rows: boolean gateway version not reported", eq(gatewayVersionRows({ abstractgateway: true }), [["Gateway", "unavailable (the gateway did not report its version)"]]));
  check("gateway rows: sorted by code point", eq(gatewayVersionRows({ abstractgateway: "1", packages: { b: "1", a: "2", B: "3" } }).slice(2).map(([l]) => l), ["Gateway package B", "Gateway package a", "Gateway package b"]));
  check("gateway rows compose with aboutRows", aboutRows(appIdentity("abstractflow", "1"), full).length === 15);
}

// --- AfAboutDialog focus trap (Tab / Shift+Tab stay inside) -------------------
{
  const focused = [];
  const el = (name) => ({ name, focus() { focused.push(name); } });
  const first = el("first"), mid = el("mid"), last = el("last"), outside = el("outside");
  const card = { querySelectorAll: () => [first, mid, last], contains: (x) => x === first || x === mid || x === last };
  const key = (k, shift = false) => { const e = { key: k, shiftKey: shift, prevented: false, preventDefault() { this.prevented = true; } }; return e; };
  let e = key("Tab"); trapTabKey(e, card, last);
  check("trap: Tab on last wraps to first", e.prevented && focused.at(-1) === "first");
  e = key("Tab", true); trapTabKey(e, card, first);
  check("trap: Shift+Tab on first wraps to last", e.prevented && focused.at(-1) === "last");
  const n = focused.length; e = key("Tab"); trapTabKey(e, card, mid);
  check("trap: Tab in the middle is native", !e.prevented && focused.length === n);
  e = key("Tab"); trapTabKey(e, card, outside);
  check("trap: focus outside is pulled back in", e.prevented && focused.at(-1) === "first");
  e = key("Tab"); trapTabKey(e, { querySelectorAll: () => [], contains: () => false }, outside);
  check("trap: no focusables still blocks Tab", e.prevented);
  e = key("Enter"); trapTabKey(e, card, last);
  check("trap: other keys ignored", !e.prevented);
}

// --- AfAbout / AfAboutDialog (0.7.0 compact card; content rule) ----------------
// Rule (operator, round 5): app name + version, framework version, gateway
// version, links website/source/docs/issues/feedback/contact, ONE
// author/licence line, and NEVER a package list.
const noop = () => {};
const { AfAbout, aboutLinks, aboutVersionFacts, aboutVersionsFromGateway } = kit;
for (const [name, fn] of Object.entries({ AfAbout, aboutLinks, aboutVersionFacts, aboutVersionsFromGateway })) check(`export ${name}`, typeof fn === "function", typeof fn);
const dialog = (props) => renderToStaticMarkup(React.createElement(AfAboutDialog, { open: true, onClose: noop, ...props }));
const fullPayload = {
  abstractgateway: "0.12.0",
  abstractframework: "0.9.6",
  packages: { abstractruntime: "0.8.4", abstractcore: "2.23.1", abstractvoice: "0.9.0", abstractgateway: "0.12.0" },
};
for (const id of appIds) {
  const ident = appIdentity(id, "1.2.3");
  const app = descriptor.apps[id];
  const html = dialog({ identity: ident, versions: aboutVersionsFromGateway(fullPayload) });
  check(`${id}: dialog role`, html.includes('role="dialog"') && html.includes('aria-modal="true"'));
  const labelledBy = (html.match(/aria-labelledby="([^"]+)"/) || [])[1];
  check(`${id}: aria-labelledby = the name heading`, !!labelledBy && html.includes(`id="${labelledBy}">${esc(ident.name)} <span class="af-about-card__version">1.2.3</span></h2>`), labelledBy);
  check(`${id}: framework version`, html.includes("<dt>AbstractFramework</dt><dd>0.9.6</dd>"));
  check(`${id}: gateway version`, html.includes("<dt>AbstractGateway</dt><dd>0.12.0</dd>"));
  for (const [linkId, label, href] of [["website", "Website", app.website], ["source", "Source", app.repo], ["docs", "Docs", app.docs], ["issues", "Issues", app.issues], ["feedback", "Feedback", app.feedback]]) {
    check(`${id}: link ${label}`, html.includes(`data-link="${linkId}" href="${esc(href)}" title="${esc(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`), href);
  }
  check(`${id}: contact mailto`, html.includes(`data-link="contact" href="mailto:${esc(fw.contact_email)}" title="${esc(fw.contact_email)}">Contact</a>`));
  check(`${id}: exactly one mailto`, (html.match(/href="mailto:/g) || []).length === 1);
  check(`${id}: link order`, eq([...html.matchAll(/data-link="([a-z]+)"/g)].map((m) => m[1]), ["website", "source", "docs", "issues", "feedback", "contact"]));
  check(`${id}: author/licence line`, html.includes(`<p class="af-about-card__legal">${esc(fw.copyright)}</p>`));
  // NO package list: none of the payload's other packages, no version rows table.
  for (const pkg of ["abstractruntime", "abstractvoice", "0.8.4", "2.23.1", "0.9.0"]) check(`${id}: no package list (${pkg})`, !html.includes(pkg), pkg);
  check(`${id}: no rows table`, !html.includes("af-about__rows") && !html.includes("Gateway package"));
  check(`${id}: close button in the heading row`, html.includes('data-action="close-about"') && html.includes('aria-label="Close"'));
}
// Compactness: the card is a fixed small set of elements (≤ half the old
// 10-row dialog): one heading, two facts, one link row, one legal line.
{
  const html = renderToStaticMarkup(React.createElement(AfAbout, { identity: appIdentity("abstractflow", "1"), versions: { framework: "0.9.6", gateway: "0.12.0" } }));
  check("card: two facts only", (html.match(/<dt>/g) || []).length === 2, html);
  check("card: one link row", (html.match(/class="af-about-card__links"/g) || []).length === 1);
  check("card: one legal line", (html.match(/class="af-about-card__legal"/g) || []).length === 1);
  check("card: no extraRows prop honoured", !renderToStaticMarkup(React.createElement(AfAbout, { identity: appIdentity("abstractflow", "1"), extraRows: [["Gateway package x", "9"]] })).includes("Gateway package"));
}
// Versions: missing / failed gateway is said, never empty.
{
  check("versions: full payload", eq(aboutVersionsFromGateway(fullPayload), { framework: "0.9.6", gateway: "0.12.0" }));
  check("versions: error wins", eq(aboutVersionsFromGateway(fullPayload, "HTTP 503"), { framework: null, gateway: null, gatewayNote: "unavailable (HTTP 503)" }));
  check("versions: empty error text", aboutVersionsFromGateway(null, " ").gatewayNote === "unavailable (unknown error)");
  check("versions: framework not installed on the gateway host", eq(aboutVersionsFromGateway({ abstractgateway: "0.12.0", abstractframework: null }), { framework: null, gateway: "0.12.0", frameworkNote: "not installed on the gateway host" }));
  check("facts: framework note", eq(aboutVersionFacts({ gateway: "1", frameworkNote: "not installed on the gateway host" })[0], ["AbstractFramework", "not installed on the gateway host"]));
  check("versions: no gateway version", eq(aboutVersionsFromGateway({ abstractframework: "0.9.6" }), { framework: "0.9.6", gateway: null, gatewayNote: "unavailable (the gateway did not report its version)" }));
  check("versions: non-string ignored", eq(aboutVersionsFromGateway({ abstractgateway: 3, abstractframework: true }), { framework: null, gateway: null, gatewayNote: "unavailable (the gateway did not report its version)" }));
  check("facts: defaults", eq(aboutVersionFacts(undefined), [["AbstractFramework", "not reported"], ["AbstractGateway", "not connected"]]));
  check("facts: note", eq(aboutVersionFacts({ gatewayNote: "unavailable (HTTP 503)" })[1], ["AbstractGateway", "unavailable (HTTP 503)"]));
  const html = dialog({ identity: appIdentity("abstractobserver", "1"), versions: aboutVersionsFromGateway(null, "HTTP 401") });
  check("dialog: failed gateway shown", html.includes("<dd>unavailable (HTTP 401)</dd>") && html.includes("<dd>not reported</dd>"));
  check("links: contact last", aboutLinks(appIdentity("abstractflow", "1")).at(-1).href === `mailto:${fw.contact_email}`);
}
// aboutValueParts stays (pure helper; the Python about_html twin).
{
  const ref = "basic-agent@0.1.0:main";
  check("parts: plain", eq(aboutValueParts("X", ref), [{ text: ref }]));
  check("parts: empty value", eq(aboutValueParts("X", ""), [{ text: "" }]));
  check("parts: Contact", eq(aboutValueParts("Contact", "contact@abstractframework.ai"), [{ text: "contact@abstractframework.ai", href: "mailto:contact@abstractframework.ai" }]));
  check("parts: URL stops at quote/angle", eq(aboutValueParts("X", 'a https://x.y/"b'), [{ text: "a " }, { text: "https://x.y/", href: "https://x.y/" }, { text: '"b' }]));
}
check("dialog closed renders nothing", renderToStaticMarkup(React.createElement(AfAboutDialog, { open: false, onClose: noop, identity: appIdentity("abstractflow", "1") })) === "");

// --- AfTopBarActions about slot -------------------------------------------------
const connection = { phase: "connected", onConnect: noop, onDisconnect: noop };
const bar = (extra) => renderToStaticMarkup(React.createElement(AfTopBarActions, { connection, ...extra }));
const withAbout = bar({ appearance: { onOpen: noop }, about: { identity: appIdentity("abstractflow", "1.0.0") }, extraActions: React.createElement("span", { id: "x-extra" }) });
check("top bar: About button", withAbout.includes('aria-label="About AbstractFlow"') && withAbout.includes('title="About"') && withAbout.includes("af-topbar__btn--about"));
check("top bar: dialog closed initially", !withAbout.includes('role="dialog"'));
const order = ["Appearance (theme and typography)", "About AbstractFlow", 'id="x-extra"', "Disconnect from gateway"].map((s) => withAbout.indexOf(s));
check("top bar: order appearance → about → extras → pill", order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1])), JSON.stringify(order));
check("top bar: custom label", bar({ about: { identity: appIdentity("abstractflow", "1"), label: "About Flow" } }).includes('aria-label="About Flow"'));
check("top bar: no about without prop", !bar({}).includes("af-topbar__btn--about"));
// The Docs assistant slot (round 8): a book icon button, first in the cluster, pressed state shown.
const withDocs = bar({ docs: { open: true, onToggle: noop }, assistant: { open: false, onToggle: noop, label: "Authoring assistant" }, about: { identity: appIdentity("abstractflow", "1") } });
check("top bar: docs button", withDocs.includes('aria-label="Docs assistant"') && withDocs.includes("af-topbar__btn--docs") && withDocs.includes('aria-pressed="true"'));
check("top bar: docs first, then the app's own assistant", withDocs.indexOf("af-topbar__btn--docs") >= 0 && withDocs.indexOf("af-topbar__btn--docs") < withDocs.indexOf('aria-label="Authoring assistant"'));
check("top bar: no docs button without prop", !bar({}).includes("af-topbar__btn--docs"));

// --- CSS for the dialog ships in theme.css ------------------------------------
const css = readFileSync(join(here, "..", "src", "theme.css"), "utf8");
for (const cls of [".af-about-card", ".af-about-card__head", ".af-about-card__versions", ".af-about-card__links", ".af-about-card__link", ".af-about-card__legal", ".af-about-card__close"]) check(`css ${cls}`, css.includes(`${cls} {`) || css.includes(`${cls},`));
check("css: about block markers (vendored by the AbstractCore console)", css.includes("/* af-about:begin") && css.includes("/* af-about:end */"));

if (failures) {
  console.error(`check_about: ${failures}/${checks} FAILED`);
  process.exit(1);
}
console.log(`check_about: OK (${checks} checks, ${appIds.length} apps)`);
