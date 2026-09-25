#!/usr/bin/env node
/**
 * About / identity checks (contract B, mission U 2026-09-25).
 *
 * - The vendored descriptor parses and has the documented shape.
 * - `aboutRows(appIdentity(id, v))` equals the rows computed HERE, straight
 *   from the descriptor, for EVERY app id — the same rows, labels and order
 *   as the Python `abstractcore.utils.identity.about_fields`.
 * - An unknown id throws (callers must not invent identity facts).
 * - AfAboutDialog renders every row; URLs are links opening in a new tab with
 *   rel=noopener; the e-mail is a mailto link; extra rows follow in order.
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
const { appIdentity, frameworkIdentity, knownAppIds, aboutRows, AfAboutDialog, AfTopBarActions } = kit;

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
for (const [name, fn] of Object.entries({ appIdentity, frameworkIdentity, knownAppIds, aboutRows, AfAboutDialog, AfTopBarActions })) {
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

// --- AfAboutDialog -------------------------------------------------------------
const noop = () => {};
const dialog = (props) => renderToStaticMarkup(React.createElement(AfAboutDialog, { open: true, onClose: noop, ...props }));
for (const id of appIds) {
  const ident = appIdentity(id, "1.2.3");
  const html = dialog({ identity: ident, extraRows: [["Gateway", "0.4.3"]] });
  check(`${id}: dialog role`, html.includes('role="dialog"') && html.includes('aria-modal="true"'));
  check(`${id}: dialog title`, html.includes(`About ${esc(ident.name)}`));
  for (const [label, value] of aboutRows(ident, [["Gateway", "0.4.3"]])) {
    check(`${id}: row label ${label}`, html.includes(`>${esc(label)}</dt>`), label);
    if (value.startsWith("https://")) {
      check(`${id}: link ${label}`, html.includes(`href="${esc(value)}" target="_blank" rel="noopener noreferrer">${esc(value)}</a>`), value);
    } else if (label === "Contact") {
      check(`${id}: mailto`, html.includes(`href="mailto:${esc(value)}">${esc(value)}</a>`), value);
    } else {
      check(`${id}: text ${label}`, html.includes(`<span>${esc(value)}</span>`), value);
    }
  }
  const labels = [...html.matchAll(/<dt class="af-about__label">([^<]*)<\/dt>/g)].map((m) => m[1]);
  check(`${id}: row order`, eq(labels, aboutRows(ident, [["Gateway", "0.4.3"]]).map(([l]) => esc(l))), JSON.stringify(labels));
}
check("dialog closed renders nothing", renderToStaticMarkup(React.createElement(AfAboutDialog, { open: false, onClose: noop, identity: appIdentity("abstractflow", "1") })) === "");
check("dialog custom title", dialog({ identity: appIdentity("abstractflow", "1"), title: "About this app" }).includes("About this app"));

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

// --- CSS for the dialog ships in theme.css ------------------------------------
const css = readFileSync(join(here, "..", "src", "theme.css"), "utf8");
for (const cls of [".af-about__rows", ".af-about__label", ".af-about__value", ".af-about__link"]) check(`css ${cls}`, css.includes(`${cls} {`) || css.includes(`${cls},`));

if (failures) {
  console.error(`check_about: ${failures}/${checks} FAILED`);
  process.exit(1);
}
console.log(`check_about: OK (${checks} checks, ${appIds.length} apps)`);
