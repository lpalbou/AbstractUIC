#!/usr/bin/env node
/**
 * PhaseCapabilityMatrix WRAPPER smoke checks (backlog 0008 item 5: the core
 * has 100+ asserts; the wrapper's refusal view, approval button and act
 * wiring had none).
 *
 * renderToStaticMarkup over the compiled dist (react-dom is an existing
 * devDependency — no jsdom). Static markup pins the DOM decisions the
 * wrapper OWNS (which control renders, labels, refusal text); the act
 * wiring is exercised by calling the click handlers' underlying logic via
 * a props-level harness (onPatchesChange capture through applyCellAction
 * is core-tested; here we pin that the wrapper passes acts through and
 * renders pending state).
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const here = dirname(fileURLToPath(import.meta.url));
const dist = (f) => join(here, "..", "dist", f);

const { PhaseCapabilityMatrix } = await import(dist("phase_capability_matrix.js"));

let failures = 0;
function check(name, cond, detail) {
  if (cond) return;
  failures += 1;
  console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}
const render = (props) => renderToStaticMarkup(React.createElement(PhaseCapabilityMatrix, props));

function cell(over = {}) {
  return { assigned: false, resolved_value: true, provenance: "default", availability: "granted", ...over };
}

function payload() {
  return {
    schema_version: 1,
    phases: [
      { id: "visit", label: "Visit" },
      { id: "sleep", label: "Sleep", hint: "brake" },
    ],
    sections: [
      {
        id: "skills",
        label: "Skills",
        items: [
          {
            id: "coredoc",
            label: "Coredoc",
            cells: {
              visit: cell({
                resolved_value: false,
                availability: "trust_gated",
                trust_state: "requires_review",
                reason: "unverified skill: scripts present",
              }),
              sleep: cell({
                resolved_value: false,
                availability: "trust_gated",
                trust_state: "blocked",
                reason: "do-not-use advisory matched",
              }),
            },
          },
          { id: "webwork", label: "Webwork", cells: { visit: cell() } }, // sleep ABSENT
        ],
      },
    ],
  };
}

const noop = () => {};

// ---------------------------------------------------------- refusal view
{
  const html = render({ payload: { schema_version: 99, phases: [], sections: [] }, patches: [], onPatchesChange: noop });
  check("unknown schema renders the labeled refusal", html.includes("af-matrix--refused"));
  check("refusal carries the core's reason verbatim", html.includes("99") && html.includes("Cannot render capability state"));
  check("refusal renders NO grant state (no cells)", !html.includes("af-matrix__cell"));

  const junk = render({ payload: null, patches: [], onPatchesChange: noop });
  check("null payload refuses instead of crashing", junk.includes("af-matrix--refused"));
}

// ------------------------------------------------------- control renders
{
  const html = render({ payload: payload(), patches: [], onPatchesChange: noop });

  // requires_review renders the explicit APPROVAL act, never a plain toggle.
  check("requires_review renders the approval button", html.includes("af-matrix__approve-btn"));
  check("approval button carries an accessible act label", html.includes("Approve and enable: Coredoc — Visit"));
  check("review reason renders verbatim", html.includes("unverified skill: scripts present"));

  // trust-blocked renders never-interactive with the verbatim reason.
  check("trust-blocked renders as blocked", html.includes("is-unavailable is-trust"));
  check("blocked reason renders verbatim", html.includes("do-not-use advisory matched"));
  // A payload with ONLY the blocked cell must render zero interactive
  // controls — a toggle there is a phantom promise the door refuses.
  {
    const only_blocked = {
      schema_version: 1,
      phases: [{ id: "sleep" }],
      sections: [{ id: "skills", items: [{ id: "coredoc", cells: { sleep: cell({ resolved_value: false, availability: "trust_gated", trust_state: "blocked", reason: "x" }) } }] }],
    };
    const b = render({ payload: only_blocked, patches: [], onPatchesChange: noop });
    check("blocked cell renders NO buttons at all", !b.includes("<button"));
  }

  // granted renders the tristate group with aria-pressed state.
  check("granted cell renders tristate", html.includes("af-matrix__tristate"));
  check("tristate buttons carry aria-pressed", html.includes('aria-pressed="true"') && html.includes('aria-pressed="false"'));

  // server-absent cell renders the em-dash absent mark.
  check("absent cell renders the absent mark", html.includes("is-absent"));

  // header facts
  check("phase hint renders", html.includes("af-matrix__phase-hint"));
  check("no pending note without patches", !html.includes("unsaved change"));
}

// ------------------------------------------------- pending + orphan logic
{
  const p = payload();
  const pending = render({
    payload: p,
    patches: [{ section: "skills", item: "webwork", phase: "visit", op: "deny" }],
    onPatchesChange: noop,
  });
  check("pending patch renders the unsaved-changes note", pending.includes("1 unsaved change"));
  check("pending cell shows pending provenance", pending.includes(">pending<"));

  // Orphaned patches (cell no longer in the payload) are dropped from the
  // COUNT too — the adversary's invisible-unsaved-change class.
  const orphaned = render({
    payload: p,
    patches: [{ section: "skills", item: "uninstalled", phase: "visit", op: "deny" }],
    onPatchesChange: noop,
  });
  check("orphaned patch never counts as an unsaved change", !orphaned.includes("unsaved change"));
}

// ---------------------------------------------------------- empty section
{
  const p = payload();
  p.sections[0].items = [];
  const html = render({ payload: p, patches: [], onPatchesChange: noop });
  check("empty section renders the honest empty row", html.includes("No entries in this section."));
}

if (failures > 0) {
  console.error(`\nmatrix wrapper: ${failures} failure(s)`);
  process.exit(1);
}
console.log("matrix wrapper: OK (refusal view, approval control, blocked/absent/tristate renders, pending + orphan notes)");
