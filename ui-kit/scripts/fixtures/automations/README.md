# Automations v1 — canonical fixtures

These six files are **the shared shape** of the gateway's Automations v1 façade
(contract F of `automations-CONTRACTS.md` rev 2, resolution C13, decision D1).
Every v1 client tests against the same bytes.

**Generated from real gateway output at abstractgateway 5161785 / abstractruntime
b000036, curated** (the Observer's end-to-end captures,
`untracked/missions-2026-09-27/E2E/observer-captures/`, 2026-09-27). Every field,
key order and value format is the gateway's: timestamps `2026-09-27T04:00:00.412307+00:00`,
wait keys `user:<run_id>:ask` / `tool_approval:<run_id>:tools:<hash>`, `reason: "user"` on
every human wait (`kind` carries the type), `failure: {reason_code: "occurrence_failed", message,
attempts}`, capabilities per status, the repeat receipt `accepted: false, duplicate: true`.
The scenario is curated: the three automations of the brief (their ids, texts and times are
chosen, not captured) plus the real legacy row.

| File | Route it exemplifies | Content |
| --- | --- | --- |
| `list.json` | `GET /api/gateway/automations` | `Page<AutomationSummary>`: inbox triage (every 30 min, growing, active, two unseen attention items, an `ask_user` and a `tool_approval` wait), AI news monitor (every 8 h, independent, active), weekly journal monitor (every 7 days, paused), and the captured legacy `scheduled:*` row last (`capabilities: ["legacy"]`, `revision: null`, `binding_id` = its root run id) |
| `occurrences.json` | `GET …/{id}/occurrences` | `Page<OccurrenceRow>` of the inbox triage, newest first: quiet ticks, a `notify` with an artifact, a success after a retry, a manual run, a failure after 3 attempts (with `failure`), a waiting occurrence with an `ask_user` wait (choices) on its own run and a `tool_approval` wait (`details` = the tool calls) on its agent sub-run |
| `attention.json` | `GET …/{id}/attention` | `Page<AttentionItem>` of the inbox triage, oldest unseen first (a notify, and a failure titled "<title> failed" whose body is the failure message) |
| `trigger-sources.json` | `GET /api/gateway/trigger-sources` | verbatim capture: `schedule@1` and `manual@1` |
| `commands.json` | revise, `…/commands`, `…/seen`, `…/discuss`, `POST /api/gateway/commands` (wait answers) | exact request (method, path, body) and response per route: revise, every `automation.*` command, a repeat (duplicate), seen, discuss, and the wait answers by kind (`{response}` for `ask_user`, `{approved}` for `tool_approval`) |
| `errors.json` | every automation route | the captured error bodies **verbatim** (request, status, body) for 401 and every 404/409/422, including busy, archived and both resume-payload mismatches; 403 `forbidden` is the only hand-written body (the capture ran with user auth off) |

Not included: `GET …/{id}` (detail) and the `automations` capabilities descriptor — the kit's
client and panel do not read them.

## Checksum rule

`CHECKSUMS.sha256` holds the SHA-256 of each JSON file (`sha256sum` format).
`node scripts/check_automation_fixtures.mjs` fails when a file's bytes no longer
match; after an intended change run it with `--write`, then update every
vendored copy (the Assistant's `tests/fixtures/automations/`) byte for byte.
The root `scripts/check_identity_sync.py` compares the copies against these
canonical files, one group per file. A fixture change is a contract change:
announce it to the Observer and Assistant seats.
