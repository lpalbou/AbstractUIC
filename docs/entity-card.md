# Entity card

`EntityCard` shows an entity at a glance, the same way in every app (AbstractObserver's Board,
AbstractEntity's home grid). Import it from `@abstractframework/ui-kit`, with
`@abstractframework/ui-kit/theme.css`. It draws the tile AbstractGateway serves at
`GET /api/gateway/entities/{name}/tile` (gateway backlog 1012, `tile_version` 1): about 2 KB
instead of the full identity card.

| Row | What a person reads | From the tile |
|---|---|---|
| Who | Its look (identity design and colour), its name | `look`, `name` |
| Now | "Asleep · for 3 months", "Resting · just now" (awake, nothing running), "In a visit · busy now · for 12 minutes", "On its own time", "Working", "Stopped" | `now.phase`, `now.state`, `now.busy`, `now.since` |
| Warning | "Its own time stopped after repeated failures (Aug 1)" | `now.trouble` |
| Into lately | Its newest interests, in its own words (up to three; one in compact) | `into_lately` |
| On its mind | "A problem: …" or "A question: …", the newest open one | `on_its_mind` |
| Latest lesson | Its newest lesson | `latest_lesson` |
| Last moment | "A visit ended · 1 hour ago", "Moved to its own time", "Was given a mission" | `last_moment` |
| Facts | "3 months old · Thinks with gpt-5.6-sol", "33 lessons learned · 29 open problems · 78 open questions · 261 sleeps" | `age_days`, `mind`, `counts` |
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

The head is a link (`href`) or a button (`onOpen`) whose accessible name is who and what it is doing
(`entityCardSummary`); the body is read after it. The look is drawn as a still portrait (the listening pose
at a mid level, so every design shows its shape). The card is fluid; it is checked at 1440 px and 400 px.

Checks: `node scripts/check_entity_card.mjs` (words and markup, part of `npm test`) and
`npm run test:entity-card:browser` (Chromium: drawn looks, no overflow at 1440 and 400 px, loading
holds the loaded size, plain words; `ENTITY_CARD_SHOTS=<dir>` saves the screenshots). The gallery is
`examples/entity_cards.html` after `node scripts/build_entity_card_gallery.mjs`.
