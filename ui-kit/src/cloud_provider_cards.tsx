// CloudProviderCards — ONE card per cloud provider AbstractCore supports natively, then (when its
// registry has `openai-compatible`) a card per preset OpenAI-compatible service (OVH AI Endpoints)
// and the generic "Other OpenAI-compatible endpoint" card. The gateway's setup guide and its
// Providers tab mount the same component (islands `mountCloudProviderCards`). Logic in
// cloud_providers_core.ts; marks in brand_icons.tsx. The host passes its JSON `request` (cookie
// session + CSRF); the component loads the cards and connections itself and re-loads them after a
// connect (`onSaved` tells the host, which refreshes its own tables).
//
// ONE action per card (operator 2026-10-29): Connect (Reconnect when the card already has a
// connection) checks the key and, only when it works, saves it as a NEW connection: the line reads
// "Connected · 48 models", or the reason, with nothing stored. The key is never rendered and is
// forgotten once connected.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { BrandMark } from "./brand_icons.js";
import {
  CLOUD_PROVIDER_TEXT as T,
  cardConnections,
  cardStatus,
  cloudProvidersClient,
  type CloudCard,
  type CloudConnection,
  type CloudRequest,
  type SaveScope,
  type SavedConnection,
} from "./cloud_providers_core.js";

export type CloudProviderCardsProps = {
  request: CloudRequest;
  /** API base (default "api/gateway", relative); a host whose API lives elsewhere passes its own prefix. */
  base?: string;
  /** "gateway" (an admin: everyone on this gateway) or "user" (only me). Default "gateway". */
  scope?: SaveScope;
  onSaved?: (saved: SavedConnection) => void;
  /** Bump to re-load the connections (the host saved or deleted one elsewhere). */
  refreshKey?: number;
  /** Show the section heading and lede (default true; a host with its own heading passes false). */
  heading?: boolean;
  disabled?: boolean;
};

type CardState = {
  key: string;
  name: string;
  baseUrl: string;
  busy: boolean;
  line: string;
  tone: "" | "ok" | "error";
};

const EMPTY: CardState = { key: "", name: "", baseUrl: "", busy: false, line: "", tone: "" };

export function CloudProviderCards(props: CloudProviderCardsProps): React.ReactElement {
  const { request, base, scope = "gateway", onSaved, refreshKey = 0, heading = true, disabled = false } = props;
  const client = useRef(cloudProvidersClient(request, base));
  client.current = cloudProvidersClient(request, base);
  const [cards, setCards] = useState<CloudCard[] | null>(null);
  const [connections, setConnections] = useState<CloudConnection[]>([]);
  const [loadError, setLoadError] = useState("");
  const [states, setStates] = useState<Record<string, CardState>>({});
  const st = (id: string): CardState => states[id] || EMPTY;
  const patch = (id: string, next: Partial<CardState>) => setStates((all) => ({ ...all, [id]: { ...(all[id] || EMPTY), ...next } }));

  const loadConnections = useCallback(async () => {
    try {
      setConnections(await client.current.listConnections());
    } catch (err) {
      setLoadError(`The connections could not be loaded: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  useEffect(() => {
    let live = true;
    client.current.listCards().then(
      (rows) => { if (live) setCards(rows); },
      (err) => { if (live) { setCards([]); setLoadError(`The cloud providers could not be loaded: ${err instanceof Error ? err.message : String(err)}`); } },
    );
    return () => { live = false; };
  }, []);
  useEffect(() => { void loadConnections(); }, [loadConnections, refreshKey]);

  const connect = async (card: CloudCard) => {
    const s = st(card.id);
    patch(card.id, { busy: true, line: T.connecting, tone: "" });
    const res = await client.current.connect(card, { apiKey: s.key, baseUrl: s.baseUrl, name: s.name }, scope);
    if (!res.ok) return patch(card.id, { busy: false, line: res.sentence, tone: "error" });
    // Connected: the key is forgotten (the field emptied), the line says so.
    patch(card.id, { key: "", name: "", baseUrl: "", busy: false, line: res.sentence, tone: "ok" });
    await loadConnections();
    if (res.saved) onSaved?.(res.saved);
  };

  const list = cards || [];
  return (
    // A div, not a <section>: hosts style bare sections as boxed panels (the console does), and the
    // cards are already boxed.
    <div className="af-cloud-providers" role="group" aria-label={T.title}>
      {heading ? (
        <div className="af-cloud-providers__head">
          <h3 className="af-cloud-providers__title">{T.title}</h3>
          <p className="af-cloud-providers__lede">{T.lede}</p>
        </div>
      ) : null}
      {cards === null ? <p className="af-cloud-providers__note" role="status">{T.loading}</p> : null}
      {loadError ? <p className="af-cloud-providers__note is-error" role="alert">{loadError}</p> : null}
      {cards !== null && !list.length && !loadError ? <p className="af-cloud-providers__note">{T.none}</p> : null}
      <div className="af-cloud-providers__grid">
        {list.map((card) => {
          const s = st(card.id);
          const mine = cardConnections(card, connections);
          const status = cardStatus(card, connections);
          const fid = (f: string) => `af-cloud-${f}-${card.id}`;
          const lineId = fid("line");
          const submit = () => { if (!s.busy) void connect(card); };
          const onEnter = (e: React.KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); submit(); } };
          return (
            <article key={card.id} className={`af-card af-cloud-card af-cloud-card--${card.kind}`} data-cloud-provider={card.id} data-cloud-kind={card.kind}>
              <div className="af-cloud-card__head">
                <BrandMark id={card.id} name={card.name} />
                <div className="af-cloud-card__titles">
                  <h4 className="af-cloud-card__name">{card.name}</h4>
                  <span className={`af-cloud-card__status${mine.length ? " is-on" : ""}`} data-cloud-status>{status}</span>
                </div>
              </div>
              {card.kind === "generic" ? <p className="af-cloud-card__hint">{T.genericHint}</p> : null}
              {card.kind === "preset" ? <p className="af-cloud-card__hint" data-cloud-preset-url><code>{card.baseUrl}</code></p> : null}
              <div className="af-form af-cloud-card__form">
                {card.kind === "generic" ? (
                  <>
                    <div className="af-form__field">
                      <label className="af-form__label" htmlFor={fid("name")}>{T.nameLabel}</label>
                      <input id={fid("name")} type="text" autoComplete="off" spellCheck={false} placeholder="Mistral" value={s.name} disabled={disabled || s.busy}
                        onChange={(e) => patch(card.id, { name: e.target.value, line: "", tone: "" })} onKeyDown={onEnter} />
                    </div>
                    <div className="af-form__field">
                      <label className="af-form__label" htmlFor={fid("url")}>{T.baseUrlLabel}</label>
                      <input id={fid("url")} type="url" autoComplete="off" spellCheck={false} placeholder="https://api.mistral.ai/v1" value={s.baseUrl} disabled={disabled || s.busy}
                        onChange={(e) => patch(card.id, { baseUrl: e.target.value, line: "", tone: "" })} onKeyDown={onEnter} />
                    </div>
                  </>
                ) : null}
                <div className="af-form__field">
                  <label className="af-form__label" htmlFor={fid("key")}>{T.keyLabel}</label>
                  <input id={fid("key")} type="password" autoComplete="off" spellCheck={false} value={s.key} disabled={disabled || s.busy} aria-describedby={lineId}
                    onChange={(e) => patch(card.id, { key: e.target.value, line: "", tone: "" })} onKeyDown={onEnter} />
                </div>
              </div>
              <p id={lineId} className={`af-cloud-card__line${s.tone ? ` is-${s.tone}` : ""}`} role="status" aria-live="polite" data-cloud-line>{s.line}</p>
              <div className="af-cloud-card__actions">
                <button type="button" className="af-setting-btn af-cloud-card__primary" data-action="connect" disabled={disabled || s.busy} onClick={submit}>
                  {s.busy ? T.connecting : mine.length && card.kind !== "generic" ? T.reconnect : T.connect}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
