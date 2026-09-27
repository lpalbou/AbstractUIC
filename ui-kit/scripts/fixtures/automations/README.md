# Automations v1 — canonical fixtures

These six files are **the shared shape** of the gateway's Automations v1 façade
(contract F of `automations-CONTRACTS.md` rev 2, resolution C13). Every v1
client tests against the same bytes:

| File | Route it exemplifies | Content |
| --- | --- | --- |
| `list.json` | `GET /api/gateway/automations` | `Page<AutomationSummary>`: an AI news monitor (every 8 h, independent, active), an inbox triage (every 30 min, growing, active, a pending human wait, two unseen attention items) and a weekly journal monitor (every 7 days, paused) |
| `occurrences.json` | `GET /api/gateway/automations/{id}/occurrences` | `Page<OccurrenceRow>` of the inbox triage, newest first: quiet ticks, a `notify` with an artifact, a success after a retry, a manual run, a failure after 3 attempts, a waiting occurrence with choices |
| `attention.json` | `GET /api/gateway/automations/{id}/attention` | `Page<AttentionItem>` of the inbox triage, oldest unseen first (a notify and a failure) |
| `trigger-sources.json` | `GET /api/gateway/trigger-sources` | `schedule@1` and `manual@1` with their config and event schemas |
| `commands.json` | `PATCH /api/gateway/automations/{id}`, `POST …/{id}/commands` | exact request (method, path, body) and `CommandReceipt` for revise and every `automation.*` command, plus a duplicate |
| `errors.json` | every automation route | one `{"detail": {"reason_code", "message", …}}` body per contract error code, with its HTTP status |

All paths are full (`/api/gateway/…`). Timestamps are UTC. The fixtures are
hand-authored from the contract until the gateway ships the routes; then they
are regenerated from observed gateway output, and any difference is raised to
the gateway seat rather than papered over.

Field choices the contract leaves open (confirm with the gateway seat):
`capabilities` lists the command suffixes the principal may issue plus
`discuss`; `OccurrenceRow.trigger.summary` is the fixed-interval label
(`every 30 minutes (UTC)`, `manual run`); schedule event payloads are
`{tick, scheduled_at, coalesced?}`.

## Checksum rule

`CHECKSUMS.sha256` holds the SHA-256 of each JSON file (`sha256sum` format).
`node scripts/check_automation_fixtures.mjs` fails when a file's bytes no longer
match; after an intended change run it with `--write`, then update every
vendored copy (the Assistant's `tests/fixtures/automations/`) byte for byte.
The root `scripts/check_identity_sync.py` compares the copies against these
canonical files, one group per file. A fixture change is a contract change:
announce it to the Observer and Assistant seats.
