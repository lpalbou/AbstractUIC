# Entity card

`EntityCard` shows an entity at a glance, the same way in every app (AbstractObserver's Board,
AbstractEntity's home grid). Import it from `@abstractframework/ui-kit`, with
`@abstractframework/ui-kit/theme.css`. It draws the tile AbstractGateway serves at
`GET /api/gateway/entities/{name}/tile` (gateway backlog 1012, `tile_version` 1): about 2 KB
instead of the full identity card.

| Row | What a person reads | From the tile |
|---|---|---|
| Who | Its look (identity design and colour), its name | `look`, `name` |
| Now | "Asleep · for 3 months", "Resting · just now" (awake, nothing running), "Awake · for 5 minutes" (`now.phase` idle: awake and reachable, nothing of its own running), "In a visit · busy now · for 12 minutes", "On its own time", "Working", "Stopped" | `now.phase`, `now.state`, `now.busy`, `now.since` |
| Warning | "Its own time stopped after repeated failures (Aug 1)" | `now.trouble` |
| Into lately | Its newest interests, in its own words (up to three; one in compact) | `into_lately` |
| On its mind | "A problem: …" or "A question: …", the newest open one | `on_its_mind` |
| Latest lesson | Its newest lesson | `latest_lesson` |
| Last moment | "A visit ended · 1 hour ago", "Moved to its own time", "Was given a mission" | `last_moment` |
| Facts | "3 months old · Thinks with gpt-5.6-sol", "33 lessons learned · 29 open problems · 78 open questions · 261 sleeps" | `age_days`, `mind`, `counts` |
| Watch | A primary "Watch" button in the head band, while the entity is not stopped | `onWatch` prop, `life.stopped` |
| Box | The served sentence and its act: "Stopped. Nothing runs until you resume him." with Resume; "His own time stopped unexpectedly. Retry to start it again." with the reason and Retry | `life` (served `life_state`), `loop` (served `/loop`) |
| Actions | The host's controls (phase radio, buttons), at the bottom | `actions` prop |

Layout: the head (portrait, name, the now line with a small dot in the phase's colour) sits on a faint
wash of the entity's own colour and is separated from the body by a hairline; the body's sections have
sentence-case labels; the facts and the actions are quiet footers. The card always uses the proportional
UI font (`--font-sans`), even inside a host that sets a monospace font, and so does the phase radio.

Words are decided once, in `entity_card_words.ts` (`entityNowWords`, `entityMomentWords`,
`entityTroubleWords`, `entityAgeWords`, `entityCountsWords`, `entityDurationWords`, `entityWhenWords`): no event
names, no ids, no abbreviated units ("12 minutes ago", never "12 min"). A moment or trouble kind the kit does not know is not shown. Counts
show only when they are not zero.

`density="compact"` (a strip tile) keeps who, now, the warning, one interest and the last moment.
`density="full"` (a grid card, the default) shows every row.
`attention="marker"` (0.9.25) draws the warning as a small ring on the "now" line instead of the boxed note —
the sentence whole in its tooltip and in the head's accessible name — so a strip of compact cards keeps one height;
the default `attention="note"` draws the box.

States: `status="loading"` (nothing read yet; the roster's `name` and `look` show at once and every
row holds its final size, so the card does not move when the tile arrives; only the warning row is
added when there is one), `"ready"`, `"stale"` (the last tile, with "Details from 12 minutes ago; newer
ones could not be read" from `asOfMs`), `"unavailable"` (the head and "Details unavailable right now",
nothing else; the reason is the tooltip only).

```tsx
<EntityCard tile={tile} status={status} name={row.name} look={row.identity?.avatar}
  asOfMs={tileReadAt} nowMs={Date.now()} density="compact"
  href={`${entityAppHref}?entity=${encodeURIComponent(row.name)}`} target="_blank" />
```

## Acts: Watch, Retry, Resume

The card is how a person starts the discussion with an entity, and a failure never leaves them
hanging (operator, 2026-11-10). The host passes what the gateway serves and one callback per act;
the card decides nothing the gateway did not serve:

- `life`: the served life state (`GET /api/gateway/entities/{name}/life_state`, the phase bar
  contract): `{phase, stopped, sentence, blocked: {code, sentence, action} | null}`, as served.
- `loop`: the served own-time loop (`GET /api/gateway/entities/{name}/loop`): `{stopped_by, note,
  updated_at}`.
- `onWatch`: "Watch", a primary button in the head band (beside the head, never inside its link),
  shown while the entity is not stopped (and when no `life` is given). The host opens the entity:
  its page, its conversation.
- `onRetry`: "Retry" (`POST /api/gateway/entities/{name}/lifecycle {action: "retry"}`), in a warning
  box under the head when the served `blocked.action` is `"retry"`. The box says `blocked.sentence`,
  then, for `blocked.code == "loop_crashed"`, the reason: the loop's served `note` when it has one,
  else "Stopped after repeated failures (Aug 1); memory intact." when the loop stopped
  itself (`stopped_by: "failures"`, or the tile's `own_time_failed` trouble when no `loop` is
  given). A blocked state without an act shows its sentence only.
- `onResume`: "Resume" (`POST /api/gateway/entities/{name}/lifecycle {action: "resume"}`), in a
  quiet box with the served sentence while `life.stopped`.
- `pending`: the act in flight (`"watch" | "retry" | "resume"`): its button reads "Retrying…" /
  "Resuming…" / "Opening…", and every act waits (`aria-disabled`, clicks ignored; never `disabled`,
  so keyboard focus stays on the button that was pressed).
- `notice`: `{text, refused?}`, the last act's answer in one sentence under the box: the gateway's
  refusal (`refused: true`, announced as an alert), or what happens next.

Given a `life`, its box replaces the tile's warning (note or marker): the served state is the newer
truth and carries the act. The served sentence is the only one with a pronoun: the kit's reason and
tooltips have none ("Start own time again.", "Open the page: watch and talk.").
Each button's accessible name names the entity ("Watch Castor", "Retry
Castor's own time", "Resume Castor"); `entityCardActs` (the pure view), `entityCardActName`,
`entityFailuresWords` and `ENTITY_CARD_ACT_WORDS` are exported.

```tsx
<EntityCard tile={tile} name={row.name} nowMs={Date.now()} onOpen={open}
  life={servedLifeState} loop={servedLoop}
  onWatch={open} onRetry={() => lifecycle("retry")} onResume={() => lifecycle("resume")}
  pending={inFlight} notice={answer} actions={<PhaseBar />} />
```

The head is a link (`href`) or a button (`onOpen`) whose accessible name is who and what it is doing
(`entityCardSummary`); the body is read after it. The look is drawn as a still portrait (the listening pose
at a mid level, so every design shows its shape). The card is fluid; it is checked at 1440 px and 400 px.

Checks: `node scripts/check_entity_card.mjs` (words and markup, part of `npm test`) and
`npm run test:entity-card:browser` (Chromium: drawn looks, no overflow at 1440 and 400 px, loading
holds the loaded size, plain words, and the acts on `examples/entity_cards.html?acts`: Watch in the head
band, Retry beside the reason, Resume, in flight, refused; `ENTITY_CARD_SHOTS=<dir>` saves the screenshots).
The gallery is `examples/entity_cards.html` after `node scripts/build_entity_card_gallery.mjs`.
