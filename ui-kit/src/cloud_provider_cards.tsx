// CloudProviderCards — ONE card per cloud provider AbstractCore supports natively, then (when its
// registry has `openai-compatible`) a card per preset OpenAI-compatible service (OVH AI Endpoints)
// and the generic "Other OpenAI-compatible endpoint" card. The gateway's setup guide and its
// Providers tab mount the same component (islands `mountCloudProviderCards`). Logic in
// cloud_providers_core.ts; marks in brand_icons.tsx. The host passes its JSON `request` (cookie
// session + CSRF); the component loads the cards and connections itself and re-loads them after a
// save or a disconnect (`onSaved` tells the host, which refreshes its own tables).
//
// Simpler cards (operator 2026-11-01): a card shows its mark, its name, ONE status line ("Not
// connected", or a clear green "Connected · 48 models"; the key's fingerprint only in the Edit
// modal) and ONE button: Connect when
// nothing is stored, Edit when a connection exists. Both open the kit's AfModal with the fields of
// that provider (Name first on the generic card, Base URL on the OpenAI-compatible cards, the API
// key always, masked) and Test connection / Save / Cancel; Edit adds Disconnect. Save never stores
// an untested key: it tests first when the current fields were not tested OK. The key field is
// UNCONTROLLED: the key lives in a ref (read at Test/Save, cleared on close), never in state and
// never in a DOM attribute. While a save or a disconnect is in flight the modal cannot be closed.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { AfModal } from "./af_modal.js";
import { BrandMark } from "./brand_icons.js";
import {
  CLOUD_PROVIDER_TEXT as T,
  cardConnections,
  cardEditTarget,
  cardStatus,
  cloudProvidersClient,
  connectedSentence,
  type CheckedKey,
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

/** The open modal: which card, which connection ("" = a new one), the fields and the last test. */
type Draft = {
  cardId: string;
  connId: string;
  name: string;
  baseUrl: string;
  /** Bumped when the key field changes (the key itself is in keyRef, never in state). */
  keyRev: number;
  busy: "" | "test" | "save" | "remove";
  line: string;
  tone: "" | "ok" | "error";
  /** The fields the last successful test covered (key, URL, connection) and what it found. */
  tested: { sig: string; checked: CheckedKey } | null;
  confirmRemove: boolean;
};

const NEW = "";
const sigOf = (d: Pick<Draft, "baseUrl" | "connId">, key: string) => JSON.stringify([key.trim(), d.baseUrl.trim(), d.connId]);

export function CloudProviderCards(props: CloudProviderCardsProps): React.ReactElement {
  const { request, base, scope = "gateway", onSaved, refreshKey = 0, heading = true, disabled = false } = props;
  const client = useRef(cloudProvidersClient(request, base));
  client.current = cloudProvidersClient(request, base);
  const [cards, setCards] = useState<CloudCard[] | null>(null);
  const [connections, setConnections] = useState<CloudConnection[]>([]);
  const [loadError, setLoadError] = useState("");
  // Models a test found this session, per connection id (the gateway lists no count for a saved one).
  const [counts, setCounts] = useState<Record<string, number>>({});
  // The card's own one-line receipt after the modal closed ("Disconnected.").
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Draft | null>(null);
  // Each open modal has a token: an answer that arrives after it closed (or another opened) is dropped.
  const token = useRef(0);
  // The typed key: a ref, read at Test/Save and cleared on close (never state, never an attribute).
  const keyRef = useRef("");
  // A save or a disconnect in flight: Cancel, ×, Escape and the backdrop do not close the modal.
  const inflight = useRef(false);

  const loadConnections = useCallback(async () => {
    try {
      setConnections(await client.current.listConnections());
      setLoadError((e) => (e.startsWith("The connections could not be loaded") ? "" : e));
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

  const list = cards || [];
  const card = draft ? list.find((c) => c.id === draft.cardId) || null : null;
  const mine = card ? cardConnections(card, connections) : [];
  const conn = draft && draft.connId ? mine.find((c) => c.id === draft.connId) || null : null;

  const fieldsFor = (c: CloudCard, target: CloudConnection | null) => ({
    connId: target ? target.id : NEW,
    name: c.kind === "generic" && target ? target.name : "",
    baseUrl: c.baseUrlField === "preset" ? c.baseUrl : c.baseUrlField === "required" && target ? target.baseUrl : "",
  });

  const open = (c: CloudCard) => {
    token.current += 1;
    setNotes((all) => ({ ...all, [c.id]: "" }));
    keyRef.current = "";
    setDraft({ cardId: c.id, ...fieldsFor(c, cardEditTarget(c, connections)), keyRev: 0, busy: "", line: "", tone: "", tested: null, confirmRemove: false });
  };
  const close = () => {
    if (inflight.current) return;
    token.current += 1;
    keyRef.current = "";
    setDraft(null);
  };
  const patch = (next: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...next } : d));
  // A field changed: the last test no longer covers it, and its sentence goes.
  const edit = (next: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...next, line: "", tone: "", confirmRemove: false } : d));
  const pickConnection = (id: string) => {
    if (!card) return;
    keyRef.current = "";
    edit({ ...fieldsFor(card, mine.find((c) => c.id === id) || null), keyRev: (draft ? draft.keyRev : 0) + 1, tested: null });
  };

  const runTest = async (d: Draft, c: CloudCard, target: CloudConnection | null): Promise<CheckedKey | null> => {
    const t = token.current;
    patch({ busy: "test", line: T.testing, tone: "" });
    const key = keyRef.current;
    const checked = await client.current.checkConnection(c, { apiKey: key, baseUrl: d.baseUrl, connection: target });
    if (t !== token.current) return null;
    if (!checked.result.ok) {
      patch({ busy: "", line: checked.result.sentence, tone: "error", tested: null });
      return null;
    }
    // Only a test of the STORED key describes the card; a typed, unsaved key does not.
    if (target && checked.connectionId === target.id && !checked.apiKey) setCounts((all) => ({ ...all, [target.id]: checked.result.modelCount }));
    patch({ busy: "", line: checked.result.sentence, tone: "ok", tested: { sig: sigOf(d, key), checked } });
    return checked;
  };

  const test = () => { if (draft && card && !draft.busy) void runTest(draft, card, conn); };

  const save = async () => {
    if (!draft || !card || draft.busy) return;
    const d = draft;
    const t = token.current;
    const key = keyRef.current;
    // A connection from AbstractCore's config is not updated here: only a typed key adds a gateway one.
    if (conn && conn.configured && !key.trim()) return patch({ line: T.pasteFirst, tone: "error" });
    if (conn && card.kind === "generic" && !d.name.trim()) return patch({ line: T.nameRequired, tone: "error" });
    const nameOnly = !!conn && !conn.configured && !key.trim() && d.baseUrl.trim() === (card.baseUrlField === "required" ? conn.baseUrl : d.baseUrl.trim());
    // Today's rule: nothing is stored untested. A name change alone stores no key and needs no test.
    let checked: CheckedKey | null = null;
    if (!nameOnly) {
      checked = d.tested && d.tested.sig === sigOf(d, key) ? d.tested.checked : await runTest(d, card, conn);
      if (!checked || t !== token.current) return;
    }
    patch({ busy: "save", line: T.saving, tone: "" });
    inflight.current = true;
    try {
      const saved = conn && !conn.configured
        ? await client.current.updateConnection(card, conn, checked, { name: card.kind === "generic" ? d.name : undefined })
        : await client.current.saveCheckedKey(card, checked, scope, d.name);
      inflight.current = false;
      // A stale answer (another modal since): the store changed anyway, so the cards catch up.
      if (t !== token.current) return void loadConnections();
      // Saved: the tested key IS now the stored key, so its count describes the card.
      if (checked) setCounts((all) => ({ ...all, [saved.id]: checked!.result.modelCount }));
      setNotes((all) => ({ ...all, [card.id]: checked ? connectedSentence(checked.result.modelCount) : T.saved }));
      close();
      await loadConnections();
      onSaved?.(saved);
    } catch (err) {
      inflight.current = false;
      if (t !== token.current) return void loadConnections();
      const why = err instanceof Error ? err.message : String(err);
      patch({ busy: "", line: why === T.nothingChanged ? why : `Not saved: ${why}`, tone: "error" });
    }
  };

  const remove = async () => {
    if (!draft || !card || !conn || draft.busy) return;
    if (!draft.confirmRemove) return patch({ confirmRemove: true, line: "", tone: "" });
    const t = token.current;
    patch({ busy: "remove", line: T.disconnecting, tone: "" });
    inflight.current = true;
    try {
      await client.current.removeConnection(conn);
      inflight.current = false;
      if (t !== token.current) return void loadConnections();
      setNotes((all) => ({ ...all, [card.id]: T.disconnected }));
      close();
      await loadConnections();
      onSaved?.({ id: conn.id, provider: conn.family, name: conn.name, virtualProvider: `endpoint:${conn.id}` });
    } catch (err) {
      inflight.current = false;
      if (t !== token.current) return void loadConnections();
      patch({ busy: "", confirmRemove: false, line: `Not disconnected: ${err instanceof Error ? err.message : String(err)}`, tone: "error" });
    }
  };

  const onEnter = (e: React.KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); void save(); } };
  const editing = !!conn;
  const busy = !!draft?.busy;
  const fid = (f: string) => `af-cloud-${f}-${draft ? draft.cardId : ""}`;
  // Connection choice: several connections, or the generic card (which can always add an endpoint).
  const choices = card && (mine.length > 1 || (card.kind === "generic" && mine.length > 0));

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
        {list.map((c) => {
          const connected = cardConnections(c, connections).length > 0;
          const status = cardStatus(c, connections, counts);
          return (
            <article key={c.id} className={`af-card af-cloud-card af-cloud-card--${c.kind}${connected ? " is-connected" : ""}`} data-cloud-provider={c.id} data-cloud-kind={c.kind}>
              <div className="af-cloud-card__head">
                <BrandMark id={c.id} name={c.name} />
                <div className="af-cloud-card__titles">
                  <h4 className="af-cloud-card__name">{c.name}</h4>
                  <span className={`af-cloud-card__badge${connected ? " is-on" : ""}`}>
                    {connected ? <span className="af-cloud-card__dot" aria-hidden="true" /> : null}
                    <span className="af-cloud-card__status" data-cloud-status>{status}</span>
                  </span>
                </div>
              </div>
              <p className="af-cloud-card__line" role="status" aria-live="polite" data-cloud-line>{notes[c.id] || ""}</p>
              <div className="af-cloud-card__actions">
                <button type="button" className="af-setting-btn af-cloud-card__primary" data-action={connected ? "edit" : "connect"} disabled={disabled}
                  aria-label={`${connected ? T.edit : T.connect} ${c.name}`} onClick={() => open(c)}>
                  {connected ? T.edit : T.connect}
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {draft && card ? (
        <AfModal
          open
          size="narrow"
          className="af-cloud-modal"
          onClose={close}
          title={`${editing ? T.editTitle : T.connectTitle} ${card.name}`}
          footer={
            <div className="af-cloud-modal__actions">
              {editing && !conn!.configured ? (
                draft.confirmRemove ? (
                  <span className="af-cloud-modal__confirm" data-cloud-confirm>
                    <span className="af-cloud-modal__confirm-text">Remove {conn!.name}? Models that use it stop working.</span>
                    <button type="button" className="af-setting-btn" data-action="keep" disabled={busy} onClick={() => patch({ confirmRemove: false })}>{T.keep}</button>
                    <button type="button" className="af-setting-btn af-cloud-modal__danger" data-action="disconnect-confirm" disabled={busy || disabled} onClick={() => void remove()}>
                      {draft.busy === "remove" ? T.disconnecting : T.disconnect}
                    </button>
                  </span>
                ) : (
                  <button type="button" className="af-setting-btn af-cloud-modal__danger af-cloud-modal__disconnect" data-action="disconnect" disabled={busy || disabled} onClick={() => void remove()}>
                    {T.disconnect}
                  </button>
                )
              ) : null}
              {!draft.confirmRemove ? (
                <span className="af-cloud-modal__main">
                  <button type="button" className="af-setting-btn" data-action="cancel" disabled={draft.busy === "save" || draft.busy === "remove"} onClick={close}>{T.cancel}</button>
                  <button type="button" className="af-setting-btn" data-action="test" disabled={busy || disabled} onClick={test}>
                    {draft.busy === "test" ? T.testing : T.test}
                  </button>
                  <button type="button" className="af-setting-btn af-cloud-card__primary" data-action="save" disabled={busy || disabled} onClick={() => void save()}>
                    {draft.busy === "save" ? T.saving : T.saveModal}
                  </button>
                </span>
              ) : null}
            </div>
          }
        >
          <div className="af-form af-cloud-modal__form" data-cloud-modal={card.id}>
            {choices ? (
              <div className="af-form__field">
                <label className="af-form__label" htmlFor={fid("conn")}>{T.connectionLabel}</label>
                <select id={fid("conn")} value={draft.connId} disabled={busy} onChange={(e) => pickConnection(e.target.value)}>
                  {mine.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.keySet ? ` · key ${c.fingerprint || "set"}` : ""}</option>
                  ))}
                  {card.kind === "generic" ? <option value={NEW}>{T.newEndpoint}</option> : null}
                </select>
              </div>
            ) : null}
            {card.kind === "generic" ? (
              <div className="af-form__field">
                <label className="af-form__label" htmlFor={fid("name")}>{T.nameLabel}</label>
                <input id={fid("name")} type="text" autoComplete="off" spellCheck={false} placeholder="Mistral" value={draft.name} disabled={busy}
                  data-af-autofocus={editing ? undefined : true} onChange={(e) => edit({ name: e.target.value })} onKeyDown={onEnter} />
                {!editing ? <p className="af-form__help">{T.genericHint}</p> : null}
              </div>
            ) : null}
            {card.baseUrlField !== "none" ? (
              <div className="af-form__field">
                <label className="af-form__label" htmlFor={fid("url")}>{T.baseUrlLabel}</label>
                <input id={fid("url")} type="url" autoComplete="off" spellCheck={false} placeholder={card.baseUrlPlaceholder} value={draft.baseUrl}
                  readOnly={card.baseUrlField === "preset"} required={card.baseUrlField === "required"} aria-required={card.baseUrlField === "required" ? true : undefined}
                  data-af-autofocus={card.baseUrlField === "required" && card.kind !== "generic" && !editing ? true : undefined}
                  disabled={busy} onChange={(e) => edit({ baseUrl: e.target.value })} onKeyDown={onEnter} />
                {card.baseUrlField === "preset" && card.docs ? (
                  <p className="af-form__help">Fixed for {card.name} (<a href={card.docs} target="_blank" rel="noreferrer">its documentation</a>).</p>
                ) : null}
              </div>
            ) : null}
            <div className="af-form__field">
              <label className="af-form__label" htmlFor={fid("key")}>{card.apiKey === "optional" ? T.keyOptionalLabel : T.keyLabel}</label>
              {/* Uncontrolled: no value prop, so the key never becomes a DOM attribute; remounted per connection. */}
              <input key={`key-${draft.connId}`} id={fid("key")} type="password" autoComplete="off" spellCheck={false} disabled={busy}
                placeholder={editing && conn!.keySet ? `Stored key ${conn!.fingerprint || ""}`.trim() : ""}
                data-af-autofocus={card.baseUrlField === "required" && !editing ? undefined : true}
                aria-describedby={`${fid("keyhelp")} ${fid("line")}`} onChange={(e) => { keyRef.current = e.target.value; edit({ keyRev: draft.keyRev + 1 }); }} onKeyDown={onEnter} />
              <p id={fid("keyhelp")} className="af-form__help">{editing ? (conn!.configured ? T.keyConfiguredHint : T.keyKeepHint) : card.apiKey === "optional" ? T.keyOptionalHint : ""}</p>
            </div>
            {editing && conn!.configured ? <p className="af-form__help" data-cloud-configured>{T.configuredNoRemove}</p> : null}
            <p id={fid("line")} className={`af-cloud-card__line af-cloud-modal__line${draft.tone ? ` is-${draft.tone}` : ""}`} role="status" aria-live="polite" data-cloud-modal-line>{draft.line}</p>
          </div>
        </AfModal>
      ) : null}
    </div>
  );
}
