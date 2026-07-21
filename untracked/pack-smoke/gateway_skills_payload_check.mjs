// Executable answer to gateway c2884 ask 1: run the SHIPPED skills payload
// shape against the kit validator, then show the corrected mapping passing.
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const core = await import(join(here, "..", "..", "ui-kit", "dist", "phase_capability_matrix_core.js"));
const { validateMatrixPayload, resolveCellView } = core;

// --- Shape AS SHIPPED (gateway c2884 ask 1 text, best-faith literal) ------
const shipped = {
  sections: [{ id: "skills", label: "Skills" }],
  items: [
    { id: "entity-self-knowledge", section: "skills", label: "Entity self-knowledge", description: "memory teaching", trust_level: "verified", requires_review: false, blocked: false, tree_hash: "109afbd2", source: "shelf" },
  ],
  cells: {
    "entity-self-knowledge": {
      visit: { availability: "granted", provenance: "operator" },
      work: { availability: "not_selected", provenance: "default" },
      personal: { availability: "trust_gated", provenance: "default", trust_state: "held" },
      sleep: { availability: "blocked", provenance: "structural", reason: "x" },
    },
  },
};
const r1 = validateMatrixPayload(shipped);
console.log("AS-SHIPPED validates:", r1.ok, r1.ok ? "" : `— refusal: ${r1.reason}`);

// --- CORRECTED mapping (same information, kit spellings) -------------------
const corrected = {
  schema_version: 1,
  phases: [{ id: "visit" }, { id: "work" }, { id: "personal" }, { id: "sleep" }],
  sections: [
    {
      id: "skills",
      label: "Skills",
      items: [
        {
          id: "entity-self-knowledge",
          label: "Entity self-knowledge",
          description: "memory teaching",
          // roster extras ride as EXTRA fields (tolerated by pin):
          trust_level: "verified",
          tree_hash: "109afbd2",
          source: "shelf",
          cells: {
            // selected + trust-clean => granted, resolved_value true; operator's stored word => assigned
            visit: { assigned: true, resolved_value: true, provenance: "operator", availability: "granted" },
            // not selected => denied, resolved_value false, no stored word
            work: { assigned: false, resolved_value: false, provenance: "default", availability: "denied" },
            // awaiting operator approval => trust_gated + requires_review
            personal: { assigned: false, resolved_value: false, provenance: "default", availability: "trust_gated", trust_state: "requires_review", reason: "unverified skill: scripts present" },
            // do-not-use advisory => trust_gated + blocked (never interactive)
            sleep: { assigned: false, resolved_value: false, provenance: "structural", availability: "trust_gated", trust_state: "blocked", reason: "do-not-use advisory matched" },
          },
        },
      ],
    },
  ],
};
const r2 = validateMatrixPayload(corrected);
console.log("CORRECTED validates:", r2.ok, r2.ok ? "" : `— refusal: ${r2.reason}`);
if (r2.ok) {
  const p = r2.payload;
  const on = resolveCellView(p, [], "skills", "entity-self-knowledge", "visit");
  const off = resolveCellView(p, [], "skills", "entity-self-knowledge", "work");
  const review = resolveCellView(p, [], "skills", "entity-self-knowledge", "personal");
  const blocked = resolveCellView(p, [], "skills", "entity-self-knowledge", "sleep");
  console.log("visit (selected):", on.control.kind, "effective:", on.effective_value);
  console.log("work (not selected):", off.control.kind, "effective:", off.effective_value);
  console.log("personal (requires_review):", review.control.kind, "approval_required:", review.approval_required);
  console.log("sleep (advisory-blocked):", blocked.control.kind, "/", blocked.control.blocked_kind, "interactive:", blocked.interactive);
}
