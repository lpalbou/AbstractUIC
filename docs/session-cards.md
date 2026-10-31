# Compact session cards

`SessionCard` is the shared React presenter used by AbstractCode web and AbstractAssistant
web. Import it from `@abstractframework/ui-kit`, with `@abstractframework/ui-kit/theme.css`.
Titles use regular weight at a compact size (13 px minimum, respecting larger font scaling).
It follows the Watch layout: a two-line title, small turn/tool/time facts, and an independent
archive button. Hosts own navigation, archive confirmation and transport.

| Fact | Presentation | Source |
|---|---|---|
| Unread | Cyan border and dot | Content revision absent from the viewer's read receipts |
| Needs attention | Orange border, diamond and “Needs you” | An actual human question or approval |
| Working | Animated ring; static with reduced motion | Running or queued work |
| Selected | Separate selection treatment | Host navigation |

Orange takes priority over cyan without changing the underlying unread fact. Unknown counts
are hidden, zero tools are omitted, and partial totals use `≥`. Buttons remain separate and
keyboard accessible; archive does not open the session. `nowMs` is supplied by the host so
rendering and relative-time tests remain deterministic.

```tsx
<SessionCard sessionId={session.id} title={session.title}
  selected={selected} unread={unread} needsAttention={humanWait} working={running}
  turnCount={session.turns} toolCount={session.tools} countsPartial={partial}
  updatedAt={session.updatedAt} nowMs={Date.now()}
  onOpen={openSession} onArchive={askToArchive} />
```

## Read receipts and consumption

`sessionActivityFromRuns` groups root runs and exposes a `content` receipt per run.
`sessionContentRevision` distinguishes the request from its completed, failed or cancelled
outcome. Changes to title, tools or other metadata do not create another message revision.
Checking every content receipt preserves late answers from older concurrent turns.
`sessionNeedsAttention` recognizes only `waiting.reason=user`; timers, paused runs and
subworkflow waits are not requests for a person. Hosts must also merge authoritative child-run
attention; failed or partial refreshes must not clear known pending questions.

`useSessionReads(sessionReadScope(connection), observedReceipts)` stores browser-local
receipts. Code and Assistant share them when served on the same origin for the same Gateway,
tenant, user and runtime. Credentials are never included in the key. Other devices and browser
origins keep independent unread state, matching the Watch's current per-device behavior.
Old history is baselined on first use; new content thereafter can be unread. Storage failures
are reported and the current page keeps an in-memory receipt. Retention is bounded to 4,096
revision receipts per scope; very old evicted revisions with recently changed metadata may
reappear as unread. Server-backed cross-device receipts are a separate follow-up.

Mount `SessionReadMarker` after successfully loaded content, normally in the message footer.
It acknowledges only after 250 ms in the focused, visible document with the marker fully in
view and unobscured. Selecting a session, loading in the background, failed history requests,
and offscreen answers do not acknowledge content. `ownerKey` must be the account scope;
reset host history on scope changes. Reading never resolves or authorizes a wait.

`sessionReadTarget(messages, runId, status)` chooses the loaded message footer. For failed
or cancelled runs, render its explicit `outcome` before the marker: seeing only the question
is not seeing its failure. This applies to historical turns as well as the current turn.
Hosts must disable markers while content cannot be consumed and must never mount them on
an unloaded placeholder.

## Compatibility snapshots and validation

Clients pinned to older published UI kit versions use generated `abstractsessions` snapshots.
`ui-kit/scripts/export_session_cards.mjs --out <directory>` emits the canonical bundled code,
CSS, declarations and SHA256 provenance. Both clients' `sync:sessions` scripts refresh that
snapshot; their builds verify its integrity. There is one implementation owner, not two forks.

Run `npm run build` and `node scripts/check_session_cards.mjs` in `ui-kit`. Optional browser QA:
`SESSION_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/check_session_cards_browser.mjs`.
The browser check exercises offscreen and occluded content, background visibility events,
account-switch dwell cancellation, and shared versus isolated receipts.

AbstractTUI provides a controlled native `widgets::SessionCard` presenter with equivalent
unread/attention/working/selection facts. It does not own networking or read receipts; adopting
receipt tracking in a native application remains host integration work.

On desktop the archive icon is 28 px, hidden until card hover or keyboard focus.
Touch/no-hover devices retain a visible 44 px target. Opening and archive remain sibling controls. Cards use a darker theme-derived surface than section headers in every theme; unread and attention colors tint that surface without raising it above the header.

## Automation cards

`AutomationCard` uses the same visual shell, regular two-line title, metadata typography and
hover/focus archive control as `SessionCard`. It is exported from the UI kit and included in the
compatibility snapshot. Like the Watch, its metadata shows the served run count, compact cadence
(`2h`, `Daily`, `Email`), and the time until the gateway's next run. Paused/ended automations say so
instead of showing a countdown. The full served schedule remains in the tooltip and accessible
name; clients never calculate a fire time. Hosts refresh `nowMs` once per minute while visible.

Unseen automation results have an amber outline and count badge. Human waits add “Needs you” and
an amber diamond; a wait never looks like running. A current occurrence has a spinner, and a failed
last run has a red dot. Counts and attention come from the automation summary; rendering or opening
the card does not acknowledge unseen results. Pause/resume stays in the automation's editor/header.
Hosts own archive confirmation, capability checks and commands, just as with conversation cards.

Automation attention uses a gateway-owned, per-user monotone cursor. The shared panel advances
only through the oldest-first prefix whose notice or answer footer passed the same focused,
unobscured visibility check as a conversation. Loading a panel, skipping older notices, or
replaying its ledger does not mark them seen. These server receipts are shared across devices;
other clients may use broader acknowledgment policies.

Hosts may pass `relatedReceipts` to the latest turn's `SessionReadMarker`: once that loaded
answer is visible, the existing session revisions clear together. This matches opening a
conversation rather than requiring a scroll through every older turn. The visibility marker
captures that receipt batch when mounted; arrivals after it was consumed stay unread. Receipt
keys remain immutable per run/outcome, so marking an earlier request cannot clear its later
answer. Failures, failed loads, background/covered content and other account scopes retain the
same visibility and isolation rules.
