// CloudProviderCards — ONE card per cloud provider AbstractCore supports (the gateway's setup guide
// and its Providers tab mount the same component; islands `mountCloudProviderCards`). Logic in
// cloud_providers_core.ts; marks in brand_icons.ts. The host passes its JSON `request` (cookie
// session + CSRF); the component loads the providers and connections itself and re-loads them after
// a save (`onSaved` tells the host, which refreshes its own tables).
//
// A card: the provider's mark and name, its connection state (fingerprint only), a password field,
// "Check the key" → "Key works · 48 models" or one sentence why not, then "Save the key" (only for
// the key that was checked OK; editing the field drops the check). The key is never rendered and is
// forgotten once saved.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { BrandMark } from "./brand_icons.js";
import {
  CLOUD_PROVIDER_TEXT as T,
  cloudProvidersClient,
  connectionStatus,
  connectionsFor,
  savedSentence,
  type CheckedKey,
  type CloudConnection,
  type CloudProvider,
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
  /** Opens the host's full connection editor (base URL, allowed models) for a provider. */
  onConfigure?: (providerId: string) => void;
  onSaved?: (saved: SavedConnection) => void;
  /** Bump to re-load the connections (the host saved or deleted one elsewhere). */
  refreshKey?: number;
  /** Show the section heading and lede (default true; a host with its own heading passes false). */
  heading?: boolean;
  disabled?: boolean;
};

type CardState = {
  draft: string;
  busy: "" | "checking" | "saving";
  checked: CheckedKey | null;
  line: string;
  tone: "" | "ok" | "error";
};

const EMPTY: CardState = { draft: "", busy: "", checked: null, line: "", tone: "" };

export function CloudProviderCards(props: CloudProviderCardsProps): React.ReactElement {
  const { request, base, scope = "gateway", onConfigure, onSaved, refreshKey = 0, heading = true, disabled = false } = props;
  const client = useRef(cloudProvidersClient(request, base));
  client.current = cloudProvidersClient(request, base);
  const [providers, setProviders] = useState<CloudProvider[] | null>(null);
  const [connections, setConnections] = useState<CloudConnection[]>([]);
  const [loadError, setLoadError] = useState("");
  const [cards, setCards] = useState<Record<string, CardState>>({});
  const card = (id: string): CardState => cards[id] || EMPTY;
  const patch = (id: string, next: Partial<CardState>) => setCards((all) => ({ ...all, [id]: { ...(all[id] || EMPTY), ...next } }));

  const loadConnections = useCallback(async () => {
    try {
      setConnections(await client.current.listConnections());
    } catch (err) {
      setLoadError(`The connections could not be loaded: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  useEffect(() => {
    let live = true;
    client.current.listProviders().then(
      (rows) => { if (live) setProviders(rows); },
      (err) => { if (live) { setProviders([]); setLoadError(`The cloud providers could not be loaded: ${err instanceof Error ? err.message : String(err)}`); } },
    );
    return () => { live = false; };
  }, []);
  useEffect(() => { void loadConnections(); }, [loadConnections, refreshKey]);

  const check = async (p: CloudProvider) => {
    const s = card(p.id);
    if (!s.draft.trim()) return patch(p.id, { line: T.pasteFirst, tone: "error", checked: null });
    patch(p.id, { busy: "checking", line: T.checking, tone: "", checked: null });
    const checked = await client.current.checkKey(p, s.draft);
    patch(p.id, { busy: "", checked: checked.result.ok ? checked : null, line: checked.result.sentence, tone: checked.result.ok ? "ok" : "error" });
  };
  const save = async (p: CloudProvider) => {
    const s = card(p.id);
    if (!s.checked || s.checked.apiKey !== s.draft.trim()) return patch(p.id, { checked: null, line: T.editedAfterCheck, tone: "error" });
    patch(p.id, { busy: "saving", line: T.saving, tone: "" });
    try {
      const saved = await client.current.saveCheckedKey(p, s.checked, scope);
      // The key is forgotten: the field is emptied and the check dropped.
      patch(p.id, { draft: "", busy: "", checked: null, line: savedSentence(saved), tone: "ok" });
      await loadConnections();
      onSaved?.(saved);
    } catch (err) {
      patch(p.id, { busy: "", line: `Not saved: ${err instanceof Error ? err.message : String(err)}`, tone: "error" });
    }
  };

  const list = providers || [];
  return (
    <section className="af-cloud-providers" aria-label={T.title}>
      {heading ? (
        <div className="af-cloud-providers__head">
          <h3 className="af-cloud-providers__title">{T.title}</h3>
          <p className="af-cloud-providers__lede">{T.lede}</p>
        </div>
      ) : null}
      {providers === null ? <p className="af-cloud-providers__note" role="status">{T.loading}</p> : null}
      {loadError ? <p className="af-cloud-providers__note is-error" role="alert">{loadError}</p> : null}
      {providers !== null && !list.length && !loadError ? <p className="af-cloud-providers__note">{T.none}</p> : null}
      <div className="af-cloud-providers__grid">
        {list.map((p) => {
          const s = card(p.id);
          const mine = connectionsFor(p.id, connections);
          const status = connectionStatus(p.id, connections);
          const fieldId = `af-cloud-key-${p.id}`;
          const lineId = `af-cloud-line-${p.id}`;
          const ready = !!s.checked && s.checked.apiKey === s.draft.trim();
          return (
            <article key={p.id} className="af-card af-cloud-card" data-cloud-provider={p.id}>
              <div className="af-cloud-card__head">
                <BrandMark id={p.id} name={p.name} />
                <div className="af-cloud-card__titles">
                  <h4 className="af-cloud-card__name">{p.name}</h4>
                  <span className={`af-cloud-card__status${mine.length ? " is-on" : ""}`} data-cloud-status>{status}</span>
                </div>
              </div>
              <div className="af-form af-cloud-card__form">
                <div className="af-form__field">
                  <label className="af-form__label" htmlFor={fieldId}>{T.keyLabel}</label>
                  <input
                    id={fieldId}
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    value={s.draft}
                    disabled={disabled || !!s.busy}
                    aria-describedby={lineId}
                    onChange={(e) => patch(p.id, { draft: e.target.value, checked: null, line: "", tone: "" })}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void (ready ? save(p) : check(p)); } }}
                  />
                </div>
              </div>
              <p id={lineId} className={`af-cloud-card__line${s.tone ? ` is-${s.tone}` : ""}`} role="status" aria-live="polite" data-cloud-line>{s.line}</p>
              <div className="af-cloud-card__actions">
                {ready ? (
                  <button type="button" className="af-setting-btn af-cloud-card__primary" data-action="save" disabled={disabled || !!s.busy} onClick={() => void save(p)}>
                    {s.busy === "saving" ? T.saving : mine.length ? T.saveAnother : T.save}
                  </button>
                ) : (
                  <button type="button" className="af-setting-btn" data-action="check" disabled={disabled || !!s.busy} onClick={() => void check(p)}>
                    {s.busy === "checking" ? T.checking : T.check}
                  </button>
                )}
                {onConfigure ? (
                  <button type="button" className="af-setting-btn af-setting-btn--quiet" data-action="configure" disabled={disabled} onClick={() => onConfigure(p.id)}>{T.more}</button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
