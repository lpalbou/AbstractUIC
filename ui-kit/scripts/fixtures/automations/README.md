# Automations — canonical fixtures

These six files are **the shared shape** of the AbstractGateway Automations routes. Every
automations client (the kit, AbstractObserver, AbstractAssistant) tests against the same bytes.
The reader-facing guide is [`docs/automations.md`](../../../../docs/automations.md#fixtures-contract).

**Generated from real Gateway output, curated.** Every field, key order and value format is the
Gateway's: timestamps `2026-09-27T04:00:00.412307+00:00`, wait keys `user:<run_id>:ask` /
`tool_approval:<run_id>:tools:<hash>`, `reason: "user"` on every human wait (`kind` carries the
type), `failure: {reason_code: "occurrence_failed", message, attempts}`, capabilities per status,
the repeat receipt `accepted: false, duplicate: true`. The scenario is curated: three automations
whose ids, texts and times are chosen for readability, plus a captured legacy row.

| File | Route it exemplifies | Content |
| --- | --- | --- |
| `list.json` | `GET /api/gateway/automations` | `Page<AutomationSummary>`: inbox triage (every 30 min, growing, active, two unseen attention items, an `ask_user` and a `tool_approval` wait), AI news monitor (every 8 h, independent, active), weekly journal monitor (every 7 days, paused), a morning briefing (`schedule@2` daily 08:00 in Europe/Paris, round 16), and the captured legacy `scheduled:*` row last; every row carries the served schedule facts (`time_zone`, `schedule_rule_text`, `schedule_text`, `next_run_at`/`next_run_local` while scheduled) computed by the Gateway's `automation_schedule.schedule_fields` for owner zone Europe/Paris (`capabilities: ["legacy"]`, `revision: null`, `binding_id` = its root run id) |
| `occurrences.json` | `GET …/{id}/occurrences` | `Page<OccurrenceRow>` of the inbox triage, newest first: quiet ticks, a `notify` with an artifact, a success after a retry, a manual run, a failure after 3 attempts (with `failure`), a waiting occurrence with an `ask_user` wait (choices) on its own run and a `tool_approval` wait (`details` = the tool calls) on its agent sub-run |
| `attention.json` | `GET …/{id}/attention` | `Page<AttentionItem>` of the inbox triage, oldest unseen first (a notify, and a failure titled "<title> failed" whose body is the failure message) |
| `trigger-sources.json` | `GET /api/gateway/trigger-sources` | verbatim capture: `schedule@1`, `schedule@2` (round 16, the runtime's descriptor) and `manual@1` |
| `commands.json` | revise, `…/commands`, `…/seen`, `…/discuss`, `POST /api/gateway/commands` (wait answers) | exact request (method, path, body) and response per route: revise, every `automation.*` command, a repeat (duplicate), seen, discuss, and the wait answers by kind (`{response}` for `ask_user`, `{approved}` for `tool_approval`) |
| `errors.json` | every automation route | the captured error bodies **verbatim** (request, status, body) for 401 and every 404/409/422, including busy, archived and both resume-payload mismatches; 403 `forbidden` is the only hand-written body (the capture ran with user auth off) |

Not included: `GET …/{id}` (detail) and the `automations` capabilities descriptor — the kit's
client and panel do not read them.

## Checksum rule

`CHECKSUMS.sha256` holds the SHA-256 of each JSON file (`sha256sum` format).
`node scripts/check_automation_fixtures.mjs` fails when a file's bytes no longer
match; after an intended change run it with `--write`, then update every
vendored copy (the Assistant's `tests/basic/fixtures/automations/`) byte for byte.
The AbstractFramework repository's `scripts/check_identity_sync.py` compares the copies against these
canonical files, one group per file. A fixture change is a contract change:
tell the AbstractObserver and AbstractAssistant maintainers.
