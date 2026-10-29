// Console islands — the kit's REAL React components for hosts that are not
// React apps (the AbstractGateway console is HTML served from Python).
//
// Operator order (2026-09-24, gateway mission L): "reuse the widgets from
// abstractuic for the theme selector and connect/disconnect". The console
// must not re-draw the top-right cluster or the appearance dialog by hand:
// it mounts THESE components as islands. `scripts/build_islands.mjs` bundles
// this entry (React included) into ONE self-contained IIFE that defines
// `window.AfConsoleIslands`; the gateway vendors that file through its
// generated `console_islands.py` and drift-pins it against this source.
//
// The API is deliberately tiny and prop-driven: the host owns all state and
// re-calls `update(props)` whenever it changes (no React knowledge needed).
import React, { useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AfTopBarActions, type AfTopBarActionsProps } from "../src/af_top_bar_actions.js";
import { AfDrawerSystem, type AfDrawerPanel, type AfDrawerSystemProps } from "../src/af_drawer_system.js";
import type { GatewayConnectionState } from "../src/gateway_connect_modal.js";
import { AfAppearanceDialog, type AppearanceSettings } from "../src/appearance.js";
import { AfAboutDialog, aboutVersionsFromGateway, type AfAboutVersions } from "../src/about.js";
import { appIdentity, type AppIdentity } from "../src/identity.js";
import { Icon, type IconName } from "../src/icon.js";
import { bindAfModal } from "../src/af_modal_core.js";
import { bindAfMenu } from "../src/af_menu_core.js";
import { acquireAfTooltips, bindAfTooltips } from "../src/af_tooltip_core.js";
import { THEME_SPECS, applyTheme } from "../src/theme.js";
import { FONT_SCALES, HEADER_DENSITIES, applyTypography } from "../src/typography.js";
import type { GatewayConnectionPhase } from "../src/use_gateway_connection.js";
import { useGatewayVoice } from "../src/use_gateway_voice.js";
import { ProviderModelPicker, type ProviderModelPickerProps } from "../src/provider_model_picker.js";
import { ToolModeEditorForPayload, type ToolModeEditorForPayloadProps } from "../src/tool_mode_editor.js";
import { VoiceSettings } from "../src/voice_settings.js";
import { AfVoiceSection, type AfVoiceSectionProps } from "../src/af_voice_section.js";
import { WorkspaceChooser, type WorkspaceChooserProps } from "../src/workspace_chooser.js";
import { WORKSPACE_CHOOSER_TEXT, workspaceAsState } from "../src/workspace_chooser_core.js";
import { AfTimeZonePicker, type AfTimeZonePickerProps } from "../src/time_zone_picker.js";
import { CloudProviderCards, type CloudProviderCardsProps } from "../src/cloud_provider_cards.js";
import { CLOUD_PROVIDER_TEXT, cloudProvidersClient, keyCheckResult, freshConnectionId } from "../src/cloud_providers_core.js";
import { BRAND_CARD_IDS, brandMarkHtml, brandMarkInfo } from "../src/brand_icons.js";
// panel-chat's REAL chat (the one AbstractCode's workspace renders): ChatThread +
// ChatComposer with the standard Attach control, drop zone and paste-to-attach.
import { WorkflowChat } from "../../panel-chat/src/workflow_chat.js";
import type { ChatMessage } from "../../panel-chat/src/chat_message_card.js";
// The shared docs assistant (round 8): the SAME drawer every app mounts.
import { DocsAssistantDrawer, type DocsAssistantDrawerProps } from "../../panel-chat/src/docs_assistant.js";

declare const __KIT_VERSION__: string;

// Changes only when the island API changes INCOMPATIBLY (docs/console-islands.md
// "Versioning"). Additive members (mountAbout, appIdentity: kit 0.1.12) keep the
// version; "2" (kit 0.7.0): the About props take `versions` (framework +
// gateway) instead of `extraRows` — a host still passing rows would silently
// lose them, so this is incompatible.
export const ISLANDS_API_VERSION = "2";

export type IslandExtraAction = {
  id: string;
  label: string;
  icon?: IconName;
  /** Plain text shown instead of an icon button (e.g. the signed-in identity). */
  text?: string;
  hidden?: boolean;
  pressed?: boolean;
  onClick?: () => void;
};

export type TopBarIslandProps = {
  /** The Docs assistant button (book icon; additive, kit 0.8.0 round 8). */
  docs?: { open: boolean; onToggle: () => void; label?: string } | null;
  assistant?: { open: boolean; onToggle: () => void; label?: string } | null;
  appearance?: { onOpen: () => void; label?: string } | null;
  /**
   * The About button + dialog, owned by the cluster (omit/null hides it). `extra` = a page-owned
   * element shown in the kit dialog under its links (e.g. the console's update controls): moved in
   * while the dialog is open, put back where it was when it closes (see `hostElementInto`).
   * Additive (top-bar set, 2026-10-29): apiVersion stays "2".
   */
  about?: { identity: AppIdentity; versions?: AfAboutVersions; onOpen?: () => void; label?: string; extra?: HTMLElement | null } | null;
  extras?: IslandExtraAction[];
  /**
   * Who is signed in, left of the pill (kit identity: "badge" or "menu" with
   * Copy user id / Sign out). Replaces the `extras: [{text: "<tenant>/<user>"}]`
   * convention (which keeps working). Reads `connection.status` or
   * `connection.me`. Additive (shell, backlog 0036): apiVersion stays "2".
   */
  identity?: "badge" | "menu" | null;
  connection: {
    phase: GatewayConnectionPhase;
    signingOut?: boolean;
    onConnect: () => void;
    onDisconnect: () => void;
    /** The app server's connection status (apps behind app-server). */
    status?: GatewayConnectionState | null;
    /** The last disconnect's failure, rendered beside the pill. */
    signOutError?: string | null;
    /**
     * The gateway's own `GET /api/gateway/me` body (routes/gateway.py:351-365),
     * for a host on the gateway's origin (the console): read as a signed-in
     * status on `location.origin`. Ignored when `status` is given.
     */
    me?: GatewayConnectionState["gateway"] | null;
  };
};

/** The connection status an island renders: `status`, else the console's `/me` body on this origin. */
export function islandConnectionStatus(c: TopBarIslandProps["connection"]): GatewayConnectionState | null {
  // Never a connected identity beside a pill that is not connected (a stale `me` after sign-out).
  if (c.phase !== "connected") return null;
  if (c.status !== undefined) return c.status;
  const me = c.me;
  if (!me || me.ok === false) return null;
  const origin = typeof location !== "undefined" ? location.origin : "";
  return { ok: true, has_session: true, gateway_url: origin, gateway: me };
}

export type AppearanceIslandProps = {
  open: boolean;
  value: AppearanceSettings;
  onChange: (next: AppearanceSettings) => void;
  onClose: () => void;
  title?: string;
  note?: string;
};

export type AboutIslandProps = {
  open: boolean;
  onClose: () => void;
  /** From `AfConsoleIslands.appIdentity("abstractgateway", version)`. */
  identity: AppIdentity;
  /** Framework + gateway versions (kit 0.7.0 compact About; no package list). */
  versions?: AfAboutVersions;
  /** A page-owned element shown under the links while open (moved in, put back on close). */
  extra?: HTMLElement | null;
};

/** A composer attachment chip (the host uploads; the island only shows state). */
export type SandboxChatAttachment = {
  id: string;
  name: string;
  /** Default "attached". "failed" shows `message` (the gateway's reason). */
  status?: "uploading" | "attached" | "failed";
  message?: string;
};

/**
 * The console Sandbox's chat (round 3, DESIGN-v3 §8): panel-chat's thread +
 * composer, fully controlled by the host. The console keeps the output-mode
 * buttons, system prompt, reasoning and MTP controls around it and sends
 * every mode through its existing gateway endpoints; results come back as
 * `messages` (generated media in `message.media`, reasoning in
 * `message.reasoning`, pending replies as `message.live`).
 */
export type SandboxChatIslandProps = {
  messages: ChatMessage[];
  draft: string;
  onDraftChange: (draft: string) => void;
  /** Send the draft. A rejection is shown above the composer and keeps the draft. */
  onSend: (draft: string) => void | Promise<unknown>;
  busy?: boolean;
  busyLabel?: string;
  sendLabel?: string;
  placeholder?: string;
  /** Why sending is not possible right now (e.g. the mode is not configured): shown, composer disabled. */
  blockedNotice?: string | null;
  attachments?: SandboxChatAttachment[];
  /** Opens the host's file picker (the standard Attach control). */
  onAttach?: () => void | Promise<unknown>;
  /** Files dropped on the chat or pasted into the message field. */
  onFiles?: (files: File[]) => void | Promise<unknown>;
  onRemoveAttachment?: (id: string) => void;
  /** Rendered as "Clear" once the thread has messages. */
  onClear?: () => void;
  emptyText?: string;
  /**
   * Voice in/out through the kit's useGatewayVoice, as in the apps. `tts`
   * puts a speaker on assistant replies; `transcribe` adds hold-to-dictate.
   * Pass STABLE functions (their identity decides support); omit = hidden.
   */
  voice?: {
    tts?: (text: string) => Promise<ArrayBuffer>;
    /** The voice `tts` speaks with (useGatewayVoice `tts_voice`); absent = the gateway's default,
     * and a paused reply is then spoken again rather than resumed (it may be another voice now). */
    tts_voice?: Record<string, unknown> | string | null;
    transcribe?: (blob: Blob, mime: string) => Promise<string>;
  } | null;
};

export type IslandHandle<P> = { update: (props: P) => void; unmount: () => void };

function extrasNode(extras: IslandExtraAction[] | undefined): React.ReactNode {
  const visible = (extras || []).filter((x) => x && !x.hidden);
  if (!visible.length) return null;
  return (
    <>
      {visible.map((x) =>
        x.text !== undefined ? (
          <span key={x.id} id={x.id} className="af-topbar__identity" title={x.label}>
            {x.text}
          </span>
        ) : (
          <button
            key={x.id}
            id={x.id}
            type="button"
            className={`af-topbar__btn${x.pressed ? " is-active" : ""}`}
            aria-label={x.label}
            data-af-tip={x.label}
            aria-pressed={x.pressed === undefined ? undefined : x.pressed}
            onClick={x.onClick}
          >
            <Icon name={x.icon || "settings"} size={16} />
          </button>
        ),
      )}
    </>
  );
}

/** The kit About's `extra` for a page-owned element: hosted (moved in, put back on close), never cloned. */
function aboutExtra(element: HTMLElement | null | undefined): React.ReactNode {
  return element ? <HostElement element={element} className="af-island-host af-about-host" restore /> : undefined;
}

/** The island's About props as the kit's (`extra`: a page element, hosted). */
export function islandAbout(about: TopBarIslandProps["about"]): AfTopBarActionsProps["about"] {
  if (!about) return undefined;
  const { extra, ...rest } = about;
  return extra ? { ...rest, extra: aboutExtra(extra) } : rest;
}

export function TopBarIsland(props: TopBarIslandProps): React.ReactElement {
  const { me: _me, ...connection } = props.connection;
  return (
    <AfTopBarActions
      docs={props.docs || undefined}
      assistant={props.assistant || undefined}
      appearance={props.appearance || undefined}
      about={islandAbout(props.about)}
      extraActions={extrasNode(props.extras)}
      identity={props.identity || false}
      connection={{ ...connection, status: islandConnectionStatus(props.connection) }}
    />
  );
}

/** A drawer-system panel whose content is a host-owned DOM element (moved into the panel). */
export type IslandDrawerPanel = Omit<AfDrawerPanel, "content" | "headerActions"> & { element: HTMLElement };

export type DrawerSystemIslandProps = Omit<AfDrawerSystemProps, "panels" | "children"> & {
  panels: IslandDrawerPanel[];
  /** The host content between the sides (required with LEFT panels). */
  main?: HTMLElement | null;
};

/** The DOM members `hostElementInto` uses (a structural type, so the check can pass plain objects). */
export type HostedNode = { parentNode: HostedParent | null; nextSibling: HostedNode | null };
export type HostedParent = { appendChild(n: HostedNode): unknown; insertBefore(n: HostedNode, ref: HostedNode | null): unknown };

/**
 * Move `element` into `box` (never cloned) and return the function that puts it back where it was
 * (its former parent, before its former next sibling when that is still there), or null when it had
 * no parent or is already in `box`. Put back only while it is still in `box`. The About dialog
 * unmounts on close: without the put-back the page's element left the document with it, and the
 * page's `getElementById` for it answered null until the next open.
 */
export function hostElementInto(box: HostedParent, element: HostedNode): (() => void) | null {
  if (element.parentNode === box) return null;
  const home = element.parentNode;
  const before = element.nextSibling;
  box.appendChild(element);
  if (!home) return null;
  return () => {
    if (element.parentNode !== box) return;
    if (before && before.parentNode === home) home.insertBefore(element, before);
    else home.appendChild(element);
  };
}

/**
 * Hosts an element the page owns inside a React tree (moved in on mount, never cloned). `restore`:
 * put it back where it was on unmount (a dialog's content); without it the element stays in the
 * box (keep-alive panels never unmount).
 */
/** HostElement's effect: host `element` in `box`; the cleanup puts it back only with `restore`. */
export function hostElementEffect(box: HostedParent | null, element: HostedNode, restore: boolean): (() => void) | undefined {
  if (!box) return undefined;
  const putBack = hostElementInto(box, element);
  return restore && putBack ? putBack : undefined;
}

function HostElement(props: { element: HTMLElement; className?: string; restore?: boolean }): React.ReactElement {
  const ref = useRef<HTMLDivElement | null>(null);
  const restore = props.restore === true;
  useEffect(
    () => hostElementEffect(ref.current as unknown as HostedParent | null, props.element as unknown as HostedNode, restore),
    [props.element, restore],
  );
  return <div ref={ref} className={props.className || "af-island-host"} />;
}

function DrawerSystemIsland(props: DrawerSystemIslandProps): React.ReactElement {
  const { panels, main, ...rest } = props;
  return (
    <AfDrawerSystem {...rest} panels={panels.map(({ element, ...p }) => ({ ...p, content: <HostElement element={element} /> }))}>
      {main ? <HostElement element={main} className="af-island-host af-island-host--main" /> : undefined}
    </AfDrawerSystem>
  );
}

function mount<P>(el: Element, render: (props: P) => React.ReactElement, props: P): IslandHandle<P> {
  if (!el) throw new Error("AfConsoleIslands: mount target missing");
  const root: Root = createRoot(el);
  root.render(render(props));
  return {
    update(next: P) {
      root.render(render(next));
    },
    unmount() {
      root.unmount();
    },
  };
}

function SandboxAttachmentChips(props: { items: SandboxChatAttachment[]; onRemove?: (id: string) => void }): React.ReactElement {
  return (
    <div className="pc-chat-attachments af-sandbox-chat__attachments" role="list" aria-label="Attached files">
      {props.items.map((item) => {
        const status = item.status || "attached";
        const note = status === "uploading" ? "Uploading…" : status === "failed" ? item.message || "Not attached" : "";
        return (
          <span key={item.id} role="listitem" className={`pc-chat-attachment-chip af-sandbox-chat__chip is-${status}`} title={note ? `${item.name} — ${note}` : item.name}>
            <Icon name={status === "uploading" ? "loader" : status === "failed" ? "warning" : "paperclip"} size={14} />
            <span className="pc-chat-attachment-name">{item.name}</span>
            {note ? <span className="af-sandbox-chat__chip-note">{note}</span> : null}
            {props.onRemove && status !== "uploading" ? (
              <button type="button" className="af-sandbox-chat__chip-remove" aria-label={`Remove ${item.name}`} data-af-tip={`Remove ${item.name}`} onClick={() => props.onRemove?.(item.id)}>
                <Icon name="x" size={14} />
              </button>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

export function SandboxChatIsland(props: SandboxChatIslandProps): React.ReactElement {
  const [voiceError, setVoiceError] = useState("");
  // The transcript lands in the CURRENT draft (the recorder finishes renders later).
  const draftRef = useRef(props);
  draftRef.current = props;
  const voice = useGatewayVoice({
    tts: props.voice?.tts,
    tts_voice: props.voice?.tts_voice,
    transcribe: props.voice?.transcribe,
    on_transcript: (text) => {
      const words = String(text || "").trim();
      if (!words) return;
      setVoiceError("");
      const current = String(draftRef.current.draft || "");
      draftRef.current.onDraftChange(current.trim() ? `${current.replace(/\s+$/, "")} ${words}` : words);
    },
    on_error: (message) => setVoiceError(String(message || "Voice failed.")),
  });
  // Hold-to-dictate, as in AbstractCode's composer: press starts, release
  // (anywhere) transcribes; a permission prompt that outlives the press never
  // leaves the microphone open.
  const held = useRef(false);
  useEffect(() => {
    const stop = () => {
      if (!held.current) return;
      held.current = false;
      voice.stop_voice_ptt_recording();
    };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("blur", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("blur", stop);
    };
  }, [voice.stop_voice_ptt_recording]);
  useEffect(() => () => { voice.stop_tts(); voice.cancel_voice_ptt_recording?.(); }, [voice.stop_tts, voice.cancel_voice_ptt_recording]);
  const begin = () => {
    held.current = true;
    setVoiceError("");
    void voice.start_voice_ptt_recording().then(() => {
      if (!held.current) voice.stop_voice_ptt_recording();
    });
  };
  const end = () => {
    if (!held.current) return;
    held.current = false;
    voice.stop_voice_ptt_recording();
  };
  const blocked = Boolean(props.blockedNotice);
  const items = Array.isArray(props.attachments) ? props.attachments : [];
  const messages = Array.isArray(props.messages) ? props.messages : [];
  const mic = voice.voice_ptt_supported && !blocked ? (
    <button
      type="button"
      className={`pc-workflow-chat__icon-button af-sandbox-chat__mic${voice.voice_ptt_recording ? " is-recording" : ""}`}
      aria-label={voice.voice_ptt_recording ? "Recording — release to transcribe" : "Hold to dictate"}
      data-af-tip="Hold to dictate (Space or Enter on the keyboard)"
      aria-pressed={voice.voice_ptt_recording}
      disabled={voice.voice_ptt_busy}
      onPointerDown={(event) => { if (event.button === 0) begin(); }}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={(event) => { if ((event.key === " " || event.key === "Enter") && !event.repeat) { event.preventDefault(); begin(); } }}
      onKeyUp={(event) => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); end(); } }}
      onBlur={end}
    >
      <Icon name={voice.voice_ptt_busy ? "loader" : "mic"} size={16} />
      <span>{voice.voice_ptt_recording ? "Listening…" : voice.voice_ptt_busy ? "Transcribing…" : "Dictate"}</span>
    </button>
  ) : null;
  const clear = props.onClear && messages.length ? (
    <button type="button" className="pc-workflow-chat__icon-button af-sandbox-chat__clear" aria-label="Clear chat" data-af-tip="Clear the chat" onClick={() => { voice.stop_tts(); props.onClear?.(); }}>
      <Icon name="trash" size={16} />
      <span>Clear</span>
    </button>
  ) : null;
  return (
    <WorkflowChat
      className="af-sandbox-chat"
      messages={messages}
      draft={props.draft}
      onDraftChange={props.onDraftChange}
      onSend={props.onSend}
      busy={props.busy}
      busyLabel={props.busyLabel}
      sendLabel={props.sendLabel}
      placeholder={props.placeholder}
      blockedNotice={blocked ? props.blockedNotice : null}
      emptyState={<div className="af-sandbox-chat__empty">{props.emptyText || "No messages yet."}</div>}
      onAttach={props.onAttach}
      onFiles={props.onFiles}
      attachments={items.length ? <SandboxAttachmentChips items={items} onRemove={props.onRemoveAttachment} /> : null}
      composerExtras={<>{mic}{clear}</>}
      footer={voiceError ? <div className="pc-workflow-chat__error af-sandbox-chat__voice-error" role="alert">Voice: {voiceError}</div> : null}
      messageProps={{
        ...(voice.tts_supported ? { onSpeakToggle: (message: ChatMessage) => { void voice.toggle_tts(String(message.id || message.content), String(message.content || "")); } } : {}),
        getSpeakState: (message: ChatMessage) => (voice.tts_playback.key === String(message.id || message.content) ? voice.tts_playback.status : "idle"),
      }}
    />
  );
}

export function mountTopBar(el: Element, props: TopBarIslandProps): IslandHandle<TopBarIslandProps> {
  return mount(el, (p) => <TopBarIsland {...p} />, props);
}

export function mountAppearance(el: Element, props: AppearanceIslandProps): IslandHandle<AppearanceIslandProps> {
  return mount(el, (p) => <AfAppearanceDialog {...p} />, props);
}

/** The About island: the kit AfAboutDialog; `extra` (a page element) is hosted under the links while open. */
export function AboutIsland(props: AboutIslandProps): React.ReactElement | null {
  const { extra, ...rest } = props;
  return <AfAboutDialog {...rest} extra={aboutExtra(extra)} />;
}

export function mountAbout(el: Element, props: AboutIslandProps): IslandHandle<AboutIslandProps> {
  return mount(el, (p) => <AboutIsland {...p} />, props);
}

/**
 * The Sandbox chat (panel-chat thread + composer, voice via useGatewayVoice).
 * Additive member (kit 0.4.0, round 3): apiVersion stays "1".
 */
export function mountSandboxChat(el: Element, props: SandboxChatIslandProps): IslandHandle<SandboxChatIslandProps> {
  return mount(el, (p) => <SandboxChatIsland {...p} />, props);
}

/**
 * The shared provider + model picker ("Gateway default" | Custom, reasoning,
 * MTP) the React apps render, for the console. Props are the component's
 * own (transport injected: fetchProviders / fetchModels /
 * fetchModelCapabilities). Additive member (round 3): apiVersion stays "1".
 */
export function mountProviderModelPicker(el: Element, props: ProviderModelPickerProps): IslandHandle<ProviderModelPickerProps> {
  return mount(el, (p) => <ProviderModelPicker {...p} />, props);
}

// ui-primitives (tools-models, backlog 0033): the tool editor for the console (e.g. a page for the
// gateway's /tool-grants default, audit gateway gap 6). Host-driven like every island: the console
// passes the catalog — the served GET discovery/tools answer as is (normalized here with the kit's
// normalizeToolCatalog, so the console keeps no copy of it; its `catalog_warnings` are shown) or
// already normalized items — the layer value and onChange. A broken answer renders a labeled
// error in place (never a throw after the root is attached).
export type ToolModeEditorIslandProps = ToolModeEditorForPayloadProps;
export function mountToolModeEditor(el: Element, props: ToolModeEditorIslandProps): IslandHandle<ToolModeEditorIslandProps> {
  return mount(el, (p) => <ToolModeEditorForPayload {...p} />, props);
}

export type VoiceSettingsIslandProps = React.ComponentProps<typeof VoiceSettings>;

/**
 * The shared voice picker (provider + model + voice, "Gateway default"),
 * transport injected (fetchCatalog). Additive member (round 3). Its props
 * carry `voiceLibrary` (ui-primitives 0035): creation plus list / rename /
 * remove / share over the gateway's voice library (`voice/clones`), and
 * `previewVoice` (choosing a voice plays it; a play/stop toggle replays or stops).
 */
export function mountVoiceSettings(el: Element, props: VoiceSettingsIslandProps): IslandHandle<VoiceSettingsIslandProps> {
  return mount(el, (p) => <VoiceSettings {...p} />, props);
}

export type VoiceSectionIslandProps = AfVoiceSectionProps;

/**
 * The whole voice section (`AfVoiceSection`: Engines, Output, Microphone,
 * Replies) for plain-HTML hosts, the same component the apps render. Props are
 * the component's own (transport injected: fetchCatalog, fetchDefaults,
 * voiceLibrary, fetchLanguages, previewVoice). Additive member
 * (ui-primitives 0035): apiVersion stays "2".
 */
export function mountVoiceSection(el: Element, props: VoiceSectionIslandProps): IslandHandle<VoiceSectionIslandProps> {
  return mount(el, (p) => <AfVoiceSection {...p} />, props);
}

/**
 * Make a plain-HTML `.af-modal-backdrop` behave as a modal (focus in + trap +
 * return, Escape / backdrop click -> onClose, page scroll lock) until the
 * returned release() is called. Markup contract: docs/modal.md. Additive
 * member (kit 0.4.0): apiVersion stays "1".
 */
export function bindModal(backdrop: HTMLElement, options: { onClose: () => void; closeOnEscape?: boolean; closeOnBackdrop?: boolean; initialFocus?: HTMLElement | null }): () => void {
  return bindAfModal(backdrop, options);
}

/**
 * Make a plain-HTML button open an `.af-menu__list` (menu button semantics:
 * aria-haspopup / aria-expanded, role=menuitem items, arrow keys, Escape and
 * outside press close, focus return, flips upward / leftward at the viewport
 * edge) until the returned release() is called. Markup contract: docs/modal.md
 * ("Menu"). Additive member (kit 0.4.0, round 3): apiVersion stays "1".
 */
export function bindMenu(button: HTMLElement, menu: HTMLElement, options?: { onOpen?: () => void; onClose?: () => void }): () => void {
  return bindAfMenu(button, menu, options || {});
}

/**
 * The kit tooltip for plain-HTML hosts: every `[data-af-tip]` element under
 * `root` (default: the whole document) gets the themed tooltip (150 ms delay,
 * shown on keyboard focus, hoverable, Escape hides it, kept inside the
 * viewport). Bind ONCE per page; re-rendered markup needs no re-binding
 * (delegated). Icon buttons keep their aria-label and carry no `title`.
 * Markup contract: docs/modal.md ("Tooltip"). Additive member (kit 0.8.x,
 * round 9): apiVersion stays "2".
 */
export function bindTooltips(root?: Document | Element, options?: { delayMs?: number }): () => void {
  // The document-wide binding is shared (ref-counted) with the kit's own React
  // components (AfTopBarActions calls useAfTooltips): one tooltip, never two.
  if ((!root || root === document) && !(options && typeof options.delayMs === "number")) return acquireAfTooltips(document);
  return bindAfTooltips(root || document, options || {});
}

/**
 * The kit WorkspaceChooser (round 11): the console's Accounts modals mount the
 * SAME component the apps use (identical rows and words) — "Eligible
 * workspaces" at level "gateway", one account's default at level "account".
 * Prop-driven: the host GETs the level's route, turns the answer into
 * `state` with `workspaceAsState(answer, level)`, performs each PUT in
 * `save` (resolving with the new state) and re-calls update() when it wants.
 * Additive member: apiVersion stays "2".
 */
export function mountWorkspaceChooser(el: Element, props: WorkspaceChooserProps): IslandHandle<WorkspaceChooserProps> {
  return mount(el, (p) => <WorkspaceChooser {...p} />, props);
}

/**
 * The kit AfTimeZonePicker (round 16, R16.1 A2): the console's Accounts →
 * Preferences modal mounts it over the gateway's `time_zone` block and PUTs
 * `{time_zone}` on change (additive member: the API version is unchanged).
 */
export function mountTimeZonePicker(el: Element, props: AfTimeZonePickerProps): IslandHandle<AfTimeZonePickerProps> {
  return mount(el, (p) => <AfTimeZonePicker {...p} />, props);
}

export type DocsAssistantIslandProps = DocsAssistantDrawerProps;

/**
 * The console's Docs assistant: panel-chat's DocsAssistantDrawer (the same
 * component the apps mount) with source {app: "gateway"}. The host passes
 * its own `fetchGateway` (cookie session + CSRF). Keep it mounted while
 * closed (`open: false`) so the conversation survives. Additive member
 * (kit 0.8.0, round 8): apiVersion stays "2".
 */
export function mountDocsAssistant(el: Element, props: DocsAssistantIslandProps): IslandHandle<DocsAssistantIslandProps> {
  return mount(el, (p) => <DocsAssistantDrawer {...p} />, props);
}

/**
 * The kit drawer system (shell, backlog 0036): side panels with a rail,
 * docked or overlay, resizable, persisted under `storageKey`. Each panel's
 * content is a host element (`element`) the island moves into the panel and
 * keeps alive. The host owns `active` and re-calls update() from
 * `onActiveChange`. Additive member: apiVersion stays "2".
 */
export function mountDrawerSystem(el: Element, props: DrawerSystemIslandProps): IslandHandle<DrawerSystemIslandProps> {
  return mount(el, (p) => <DrawerSystemIsland {...p} />, props);
}

/**
 * The kit CloudProviderCards (operator finding 2026-10-29): one card per cloud provider AbstractCore
 * lists, an API-key field, "Check the key" ("Key works · 48 models" or why not) and "Save the key"
 * (a NEW connection, create_only: never an overwrite). The setup guide's Local engines step and the
 * Providers tab mount the same island. The host passes its JSON `request` (cookie + CSRF) and
 * its API prefix as `base`. Additive member: apiVersion stays "2".
 */
export function mountCloudProviderCards(el: Element, props: CloudProviderCardsProps): IslandHandle<CloudProviderCardsProps> {
  return mount(el, (p) => <CloudProviderCards {...p} />, props);
}

/**
 * The cards' logic for a host's own key flow (the console's Default models → "Or use an API key"):
 * the same check, sentence and create-only save. Additive.
 */
export const cloudProviders = { text: CLOUD_PROVIDER_TEXT, client: cloudProvidersClient, keyCheckResult, freshConnectionId };

/** Engines' and providers' marks as HTML (the console's string-built engine cards). Additive. */
export const brandMarks = { html: brandMarkHtml, info: brandMarkInfo, cardIds: BRAND_CARD_IDS };

export function applyAppearance(settings: Partial<AppearanceSettings>): void {
  applyTheme(String(settings.theme || "dark"));
  applyTypography({ font_scale: settings.font_scale, header_density: settings.header_density });
}

const api = {
  apiVersion: ISLANDS_API_VERSION,
  kitVersion: typeof __KIT_VERSION__ === "string" ? __KIT_VERSION__ : "unknown",
  themes: THEME_SPECS,
  fontScales: FONT_SCALES,
  headerDensities: HEADER_DENSITIES,
  mountTopBar,
  mountAppearance,
  mountAbout,
  mountSandboxChat,
  mountProviderModelPicker,
  mountToolModeEditor,
  mountVoiceSettings,
  mountVoiceSection,
  mountDocsAssistant,
  mountDrawerSystem,
  // The identity source the top bar island reads (shell, 0036): exposed so hosts and checks see the rule.
  islandConnectionStatus,
  mountWorkspaceChooser,
  mountTimeZonePicker,
  mountCloudProviderCards,
  cloudProviders,
  brandMarks,
  // The chooser's ONE wording table and its answer parser (round 11): the console builds the
  // chooser state from GET /workspace/policy[/{account}] with workspaceAsState(answer, level).
  workspaceChooserText: WORKSPACE_CHOOSER_TEXT,
  workspaceAsState,
  bindModal,
  bindMenu,
  bindTooltips,
  appIdentity,
  aboutVersionsFromGateway,
  applyAppearance,
};

(globalThis as unknown as { AfConsoleIslands: typeof api }).AfConsoleIslands = api;

export default api;
