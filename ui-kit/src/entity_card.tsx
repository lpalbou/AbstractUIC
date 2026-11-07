import React from "react";
import { ActivityAvatar } from "./activity_avatar.js";
import { formatExactTime } from "./relative_time.js";
import {
  entityAgeWords,
  entityCardSummary,
  entityCountsWords,
  entityMomentWords,
  entityNowWords,
  entityTroubleWords,
  entityWhenWords,
  type EntityTile,
} from "./entity_card_words.js";

export type EntityCardStatus = "loading" | "ready" | "stale" | "unavailable";
export type EntityCardDensity = "full" | "compact";

export interface EntityCardProps {
  /** The tile payload (`GET /entities/{name}/tile`), or null while it is not read. */
  tile: EntityTile | null;
  /** "loading": nothing read yet (placeholders at the final size); "ready"; "stale": the tile shown
   * is older than the last read attempt (say since when with `asOfMs`); "unavailable": it could not
   * be read and nothing is known. Default: "ready" when a tile is given, else "loading". */
  status?: EntityCardStatus;
  /** What the host already knows from its roster, drawn before the tile arrives. */
  name?: string;
  look?: { style?: string | null; color?: string | null } | null;
  /** When the facts shown were read (stale cards say "as of …"). */
  asOfMs?: number | null;
  /** Why the tile could not be read (tooltip of the unavailable note; never shown as text). */
  reason?: string;
  nowMs: number;
  /** "full" (a grid card, every fact) or "compact" (a strip tile: who, now, trouble, one interest,
   * the last moment). Default "full". */
  density?: EntityCardDensity;
  /** The card's head opens the entity: a link (`href`) or a handler (`onOpen`). */
  href?: string;
  target?: string;
  onOpen?: () => void;
  /** Host actions (phase radio, buttons), drawn at the bottom of the card. */
  actions?: React.ReactNode;
  className?: string;
}

function EntityOrb({ name, look, size }: { name: string; look?: { style?: string | null; color?: string | null } | null; size: number }): React.ReactElement {
  const color = look?.color || undefined;
  const style = { width: size, height: size, ...(color ? { "--warning": color, "--af-entity-color": color } : {}) } as React.CSSProperties;
  if (look?.style) {
    return (
      <span className="af-entity-card__orb" style={style} aria-hidden="true">
        <ActivityAvatar design={look.style} pose="ready" size={size} animated={false} quality="balanced" />
      </span>
    );
  }
  // No identity design: a quiet disc in its colour (or the theme's) with its initial.
  return (
    <span className="af-entity-card__orb is-plain" style={style} aria-hidden="true">
      {(name || "?").trim().charAt(0).toUpperCase()}
    </span>
  );
}

function Line({ className, text, title, lines = 1 }: { className?: string; text: string; title?: string; lines?: number }): React.ReactElement {
  return (
    <span className={`af-entity-card__line${className ? ` ${className}` : ""}`} data-lines={lines} title={title || text}>
      {text}
    </span>
  );
}

function Skeleton({ width, lines = 1 }: { width: string; lines?: number }): React.ReactElement {
  return <span className="af-entity-card__sk" data-lines={lines} style={{ width }} aria-hidden="true" />;
}

/** An entity at a glance (gateway backlog 1012): who it is, what it is doing now and for how long,
 * what it is into lately, what is on its mind, its last moment, its age and mind, and the counts a
 * person reads — in plain words (entity_card_words.ts). Presentation only: the host reads the tile,
 * owns navigation and passes its actions, drawn at the bottom. */
export function EntityCard(p: EntityCardProps): React.ReactElement {
  const density = p.density ?? "full";
  const compact = density === "compact";
  const tile = p.tile;
  const status: EntityCardStatus = p.status ?? (tile ? "ready" : "loading");
  const name = tile?.name || p.name || "";
  const look = tile?.look ?? p.look ?? null;
  const orbSize = compact ? 36 : 48;
  const now = entityNowWords(tile?.now, p.nowMs);
  const trouble = entityTroubleWords(tile?.now?.trouble, p.nowMs);
  const interests = (tile?.into_lately ?? []).filter((i) => i && i.text).slice(0, compact ? 1 : 3);
  const moment = entityMomentWords(tile?.last_moment);
  const momentWhen = moment ? entityWhenWords(tile?.last_moment?.at, p.nowMs) : "";
  const mind = tile?.on_its_mind && tile.on_its_mind.text ? tile.on_its_mind : null;
  const lesson = tile?.latest_lesson && tile.latest_lesson.text ? tile.latest_lesson : null;
  const age = entityAgeWords(tile?.age_days);
  const model = tile?.mind?.model || "";
  const counts = entityCountsWords(tile?.counts);
  const loading = !tile && status === "loading";
  const unavailable = !tile && status !== "loading";

  const head = (
    <>
      <EntityOrb name={name} look={look} size={orbSize} />
      <span className="af-entity-card__who">
        {name ? <span className="af-entity-card__name">{name}</span> : <Skeleton width="45%" />}
        {tile ? (
          <span className="af-entity-card__now" title={now.exact || undefined}>
            <span>{now.label}</span>
            {now.busy ? <span className="af-entity-card__busy">busy now</span> : null}
            {now.since ? <span className="af-entity-card__since">{now.since}</span> : null}
          </span>
        ) : loading ? (
          <Skeleton width="62%" />
        ) : (
          <span className="af-entity-card__now af-entity-card__note" title={p.reason || undefined}>
            Details unavailable right now
          </span>
        )}
      </span>
    </>
  );
  const headLabel = tile ? entityCardSummary(tile, p.nowMs) : name;
  const headEl = p.href ? (
    <a className="af-entity-card__head" href={p.href} target={p.target} rel={p.target === "_blank" ? "noreferrer" : undefined} aria-label={headLabel || undefined}>
      {head}
    </a>
  ) : p.onOpen ? (
    <button type="button" className="af-entity-card__head" onClick={p.onOpen} aria-label={headLabel || undefined}>
      {head}
    </button>
  ) : (
    <div className="af-entity-card__head">{head}</div>
  );

  return (
    <article
      className={`af-entity-card${p.className ? ` ${p.className}` : ""}`}
      data-density={density}
      data-status={status}
      data-phase={tile?.now?.phase || undefined}
      data-trouble={trouble ? "true" : undefined}
      aria-busy={loading || undefined}
      aria-label={name || "Entity"}
    >
      {headEl}
      {trouble ? (
        <p className="af-entity-card__trouble" role="note">
          {trouble}
        </p>
      ) : null}

      <div className="af-entity-card__body">
        <section className="af-entity-card__section" data-field="into" data-reserve={compact ? 1 : 3}>
          <span className="af-entity-card__label">Into lately</span>
          {loading ? (
            <Skeleton width="92%" lines={compact ? 1 : 3} />
          ) : interests.length ? (
            <ul className="af-entity-card__list">
              {interests.map((i, n) => (
                <li key={n}>
                  <Line text={i.text} lines={1} />
                </li>
              ))}
            </ul>
          ) : (
            <Line className="af-entity-card__empty" text={unavailable ? "—" : "Nothing yet"} />
          )}
        </section>

        {!compact ? (
          <section className="af-entity-card__section" data-field="mind">
            <span className="af-entity-card__label">On its mind</span>
            {loading ? (
              <Skeleton width="85%" lines={2} />
            ) : mind ? (
              <Line text={`${mind.kind === "problem" ? "A problem: " : "A question: "}${mind.text}`} lines={2} />
            ) : (
              <Line className="af-entity-card__empty" text={unavailable ? "—" : "Nothing open"} lines={2} />
            )}
          </section>
        ) : null}

        {!compact ? (
          <section className="af-entity-card__section" data-field="lesson">
            <span className="af-entity-card__label">Latest lesson</span>
            {loading ? (
              <Skeleton width="78%" />
            ) : lesson ? (
              <Line text={lesson.text} lines={1} />
            ) : (
              <Line className="af-entity-card__empty" text={unavailable ? "—" : "None yet"} />
            )}
          </section>
        ) : null}

        <section className="af-entity-card__section" data-field="moment">
          <span className="af-entity-card__label">Last moment</span>
          {loading ? (
            <Skeleton width="55%" />
          ) : moment ? (
            <Line text={`${moment}${momentWhen ? ` · ${momentWhen}` : ""}`} title={formatExactTime(tile?.last_moment?.at) || undefined} />
          ) : (
            <Line className="af-entity-card__empty" text="—" />
          )}
        </section>
      </div>

      {!compact ? (
        <div className="af-entity-card__facts" data-field="facts">
          {loading ? (
            <>
              <Skeleton width="70%" />
              <Skeleton width="85%" lines={2} />
            </>
          ) : (
            <>
              <span className="af-entity-card__fact-row">
                {age ? <span>{age}</span> : null}
                {model ? (
                  <span title="The model it thinks with">
                    <span className="af-entity-card__fact-key">mind</span> {model}
                  </span>
                ) : null}
              </span>
              <Line className="af-entity-card__counts" text={counts.join(" · ")} lines={2} />
            </>
          )}
        </div>
      ) : null}

      {status === "stale" && tile ? (
        <p className="af-entity-card__stale" role="note">
          {p.asOfMs ? `As of ${entityWhenWords(new Date(p.asOfMs).toISOString(), p.nowMs)}` : "Not the latest"} — newer details could not be read
        </p>
      ) : null}

      {p.actions ? <div className="af-entity-card__actions">{p.actions}</div> : null}
    </article>
  );
}
