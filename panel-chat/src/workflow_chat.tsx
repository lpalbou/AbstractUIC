import React, { useEffect, useRef, useState } from "react";

import { Icon, useAfTooltips } from "@abstractframework/ui-kit";

import { unattachedSendBlock, type ComposerAttachment } from "./attachment_uploads.js";
import { ChatComposer } from "./chat_composer.js";
import type { ChatMessage, ChatMessageCardProps } from "./chat_message_card.js";
import { ChatThread } from "./chat_thread.js";
import { ComposerAttachmentChips } from "./composer_attachments.js";
import { chatToMarkdown, copyText, downloadTextFile } from "./utils.js";
import { DragPresence, dragCarriesFiles, draggedFileCount, dropZoneLabel, droppedFiles, folderRefusal, pastedFiles } from "./file_drop.js";
import { WorkflowInteractionPanel, type WorkflowInteraction } from "./workflow_interaction.js";
import type { StreamRepliesMode } from "./llm_delta.js";

/** What the host's steer door answered (`POST commands {type:"inject_guidance"}`
 * answers `{accepted, duplicate, seq}`; ui-kit `SteerSubmitResult` fits). */
export type ChatSteerResult = { accepted: boolean; seq?: number; duplicate?: boolean };
/** "guide": steer the live run (inject_guidance). "queue": hold the message for the next turn. */
export type ChatSteerMode = "guide" | "queue";
export type ChatSteer = {
  /**
   * Called instead of `onSend` while `busy`. The host posts it (ui-kit
   * `submitSteer` posts `inject_guidance` through the app-origin proxy) or
   * queues it for the next turn. The chat never fetches.
   */
  onSteer: (text: string, mode: ChatSteerMode) => Promise<ChatSteerResult>;
  /** Default `["guide"]`. With both, the busy composer offers a mode switch. */
  modes?: ChatSteerMode[];
  /** The run is parked on a wait: guidance delivers at its next wake (steers do not wake runs). */
  parked?: boolean;
};
export type ChatToolbar = {
  onNewSession?: () => void | Promise<unknown>;
  onClear?: () => void | Promise<unknown>;
  /** Download the transcript as Markdown (`chatToMarkdown`). */
  exportTranscript?: { filename: string; heading?: string } | false;
  /** Copy the transcript as Markdown. */
  copyTranscript?: boolean;
};

export type WorkflowChatProps = {
  /** Fully controlled transcript. The host owns message persistence and identity. */
  messages: ChatMessage[];
  /** Fully controlled composer value. It is intentionally retained on failed sends. */
  draft: string;
  onDraftChange: (draft: string) => void;
  /**
   * Submit a chat message. Async failures are surfaced locally and keep the
   * draft. `signal` is aborted when the user presses Stop during this send
   * (or the chat unmounts): a request/response host ties its fetch to it.
   */
  onSend: (draft: string, ctx: { signal: AbortSignal }) => void | Promise<unknown>;
  busy?: boolean;
  /** Keep the composer active while busy, for hosts that queue/steer messages. */
  sendWhileBusy?: boolean;
  sendLabel?: string;
  /** Optional host-specific explanation while the composer is busy. */
  busyLabel?: string;
  /**
   * Cancels current host work. Only rendered while busy. Stop first aborts
   * the in-flight send's signal (the one `onSend` received), then calls this
   * with that signal; when no send is in flight here (a ledger host whose run
   * outlives `onSend`) the signal is a fresh one, aborted at the same moment.
   */
  onCancel?: (signal: AbortSignal) => void | Promise<unknown>;
  /**
   * Ledger-derived Stop state (`WorkflowSessionSnapshot.stop`). While busy the
   * Stop button reads "Stopping…" for `stopping`; once the host is no longer
   * busy the state stays visible in the button's place ("Stopped", or the
   * gateway's forced-stop text) until the next run.
   */
  stopState?: { phase: "stopping" | "stopped" | "forced"; label: string } | null;
  /** Read-only/observer mode. It disables all actions without hiding context. */
  disabled?: boolean;
  blockedNotice?: React.ReactNode;
  emptyState?: React.ReactNode;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  composerExtras?: React.ReactNode;
  /** Optional host-owned attachment picker/action. */
  onAttach?: () => void | Promise<unknown>;
  /**
   * Receives files dropped on the chat (transcript or composer) or pasted into
   * the message field. Setting it turns on the drop zone and paste-to-attach;
   * size policy, upload and chips stay with the host. Folders are refused
   * here with a visible message and never reach the host.
   */
  onFiles?: (files: File[]) => void | Promise<unknown>;
  /** Host-rendered attachment chips, shown inside the composer above the
   * message field. Escape hatch: prefer `attachmentItems`. */
  attachments?: React.ReactNode;
  /**
   * Typed attachment chips (`useAttachmentUploads().items`). While one is
   * queued/uploading/refused/failed, Send refuses with the reason in words
   * (a visible chip is never left behind silently by a send).
   */
  attachmentItems?: ComposerAttachment[];
  /** Required with `attachmentItems`: a refused/failed chip blocks Send until it is removed. */
  onRemoveAttachment?: (id: string) => void;
  onRetryAttachment?: (id: string) => void;
  /** Steer/queue while busy: the send button becomes "Steer"/"Queue". */
  steer?: ChatSteer;
  /** Standard transcript actions in the header row; each only when injected. */
  toolbar?: ChatToolbar;
  /** A pending workflow wait rendered after the transcript. */
  interaction?: WorkflowInteraction | null;
  /** Optional host sanitizer/renderer for every transcript message. */
  renderMarkdown?: (markdown: string) => React.ReactElement;
  placeholder?: string;
  className?: string;
  messageProps?: Omit<ChatMessageCardProps, "message">;
  /**
   * The host's "Stream replies" choice. The widget does not start runs: the
   * host maps it into the start-run input with `streamRepliesRuntime(mode)`
   * — `"on"` → `_runtime.stream: true`, `"off"` → `_runtime.stream: false`,
   * `"gateway_default"` (or omitted) → `_runtime.stream` left unset so the
   * gateway's `agents.streaming_default` decides. Live replies arrive through
   * the transport's `onDelta`; messages carrying `live` render as a streaming
   * bubble whatever this value is. Exposed on the root as `data-stream-replies`.
   */
  streamReplies?: StreamRepliesMode;
};

function messageFor(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "Unknown error");
  return message.trim() || "Unknown error";
}

/**
 * Controlled chat presentation for workflow hosts. It does not fetch, poll,
 * mutate transcript state, or resume workflows: all gateway semantics stay in
 * the embedding controller.
 */
export function WorkflowChat(props: WorkflowChatProps): React.ReactElement {
  useAfTooltips();
  const [sendPending, setSendPending] = useState(false);
  const [cancelPending, setCancelPending] = useState(false);
  const [attachPending, setAttachPending] = useState(false);
  const [error, setError] = useState<{ action: "send" | "cancel" | "attach" | "steer" | "toolbar"; message: string } | null>(null);
  const [steerMode, setSteerMode] = useState<ChatSteerMode>(() => props.steer?.modes?.[0] || "guide");
  const [steerStatus, setSteerStatus] = useState<{ mode: ChatSteerMode; seq?: number; duplicate: boolean } | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const sendAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const sendInFlightRef = useRef(false);
  const cancelInFlightRef = useRef(false);
  const attachInFlightRef = useRef(false);
  const sendSequenceRef = useRef(0);
  const cancelSequenceRef = useRef(0);
  const attachSequenceRef = useRef(0);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      sendSequenceRef.current += 1;
      cancelSequenceRef.current += 1;
      attachSequenceRef.current += 1;
      sendInFlightRef.current = false;
      cancelInFlightRef.current = false;
      attachInFlightRef.current = false;
      sendAbortRef.current?.abort();
      sendAbortRef.current = null;
    };
  }, []);
  const blocked = Boolean(props.blockedNotice);
  const disabled = Boolean(props.disabled) || blocked;
  const sending = Boolean(props.busy) || sendPending;
  const composerBusy = sendPending || (Boolean(props.busy) && !props.sendWhileBusy);
  const stopState = props.stopState || null;
  const stopping = stopState?.phase === "stopping";
  const steer = props.steer && typeof props.steer.onSteer === "function" ? props.steer : null;
  const steerModes: ChatSteerMode[] = steer ? (steer.modes?.length ? steer.modes : ["guide"]) : [];
  const activeSteerMode: ChatSteerMode = steerModes.includes(steerMode) ? steerMode : steerModes[0] || "guide";
  const steering = Boolean(steer) && Boolean(props.busy);
  const attachmentItems = Array.isArray(props.attachmentItems) ? props.attachmentItems : [];
  // A "Queued (seq N)" note belongs to the run it was sent to: a new turn
  // (busy flips) clears it.
  useEffect(() => {
    setSteerStatus(null);
  }, [Boolean(props.busy)]);

  // ---- Drag-and-drop / paste to attach ---------------------------------
  const acceptsFiles = typeof props.onFiles === "function";
  const sectionRef = useRef<HTMLElement>(null);
  const [drag, setDrag] = useState<{ count: number | null; over: boolean } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const onFilesRef = useRef(props.onFiles);
  onFilesRef.current = props.onFiles;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  const deliverFiles = async (files: File[], folders: string[]) => {
    const handler = onFilesRef.current;
    if (!handler) return;
    if (disabledRef.current) {
      setError({ action: "attach", message: "attachments are unavailable right now." });
      return;
    }
    if (folders.length) setError({ action: "attach", message: folderRefusal(folders) });
    else if (!files.length) {
      setError({ action: "attach", message: "the drop contained no files." });
      return;
    } else setError(null);
    if (!files.length) return;
    setAnnouncement(`Attaching ${files.length} ${files.length === 1 ? "file" : "files"}…`);
    try {
      await handler(files);
    } catch (reason) {
      if (mountedRef.current) setError({ action: "attach", message: messageFor(reason) });
    }
  };
  const deliverRef = useRef(deliverFiles);
  deliverRef.current = deliverFiles;

  useEffect(() => {
    if (!acceptsFiles || typeof window === "undefined") return;
    const presence = new DragPresence();
    let watchdog = 0;
    const inside = (target: EventTarget | null) =>
      Boolean(sectionRef.current && target instanceof Node && sectionRef.current.contains(target));
    const hide = () => {
      presence.reset();
      if (watchdog) window.clearInterval(watchdog);
      watchdog = 0;
      setDrag(null);
    };
    const arm = () => {
      if (watchdog) return;
      watchdog = window.setInterval(() => {
        if (!presence.active(Date.now())) hide();
      }, 250);
    };
    const onEnter = (event: DragEvent) => {
      if (!dragCarriesFiles(event.dataTransfer?.types)) return;
      presence.enter(Date.now());
      const over = inside(event.target);
      const count = draggedFileCount(event.dataTransfer);
      setDrag((previous) =>
        previous && previous.over === over && previous.count === (count ?? previous.count) ? previous : { count: count ?? previous?.count ?? null, over },
      );
      arm();
    };
    const onOver = (event: DragEvent) => {
      if (!dragCarriesFiles(event.dataTransfer?.types)) return;
      // Claiming the drag everywhere stops the browser from navigating away
      // to the dropped file when it lands outside the chat.
      event.preventDefault();
      presence.over(Date.now());
      const over = inside(event.target);
      if (event.dataTransfer) event.dataTransfer.dropEffect = over && !disabledRef.current ? "copy" : "none";
      setDrag((previous) => (previous && previous.over === over ? previous : { count: previous?.count ?? draggedFileCount(event.dataTransfer), over }));
      arm();
    };
    const onLeave = (event: DragEvent) => {
      if (!dragCarriesFiles(event.dataTransfer?.types)) return;
      if (!presence.leave(Date.now())) hide();
    };
    const onDrop = (event: DragEvent) => {
      if (!dragCarriesFiles(event.dataTransfer?.types)) return;
      const over = inside(event.target);
      const handledElsewhere = event.defaultPrevented && !over;
      event.preventDefault();
      hide();
      if (handledElsewhere) return;
      if (!over) {
        setError({ action: "attach", message: "drop files on the conversation to attach them." });
        return;
      }
      const { files, folders } = droppedFiles(event.dataTransfer);
      void deliverRef.current(files, folders);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && presence.depth > 0) hide();
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    window.addEventListener("dragend", hide);
    window.addEventListener("blur", hide);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("dragend", hide);
      window.removeEventListener("blur", hide);
      window.removeEventListener("keydown", onKey);
      if (watchdog) window.clearInterval(watchdog);
    };
  }, [acceptsFiles]);

  const onPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!acceptsFiles || disabled) return;
    const files = pastedFiles(event.clipboardData);
    if (!files.length) return; // plain text paste proceeds untouched
    event.preventDefault();
    void deliverFiles(files, []);
  };

  const dropZone = drag ? (
    <div
      className={["pc-workflow-chat__dropzone", drag.over ? "is-over" : "", disabled ? "is-disabled" : ""].filter(Boolean).join(" ")}
      aria-hidden="true"
    >
      <span className="pc-workflow-chat__dropzone-icon">
        <Icon name="paperclip" size={18} />
      </span>
      <span className="pc-workflow-chat__dropzone-text">
        <strong>{disabled ? "Attachments are unavailable right now" : dropZoneLabel(drag.count)}</strong>
        {disabled ? null : <span>{drag.over ? "Release to upload to this conversation" : "Drop anywhere on the conversation"}</span>}
      </span>
    </div>
  ) : null;
  const liveMessage = drag ? (disabled ? "Attachments are unavailable right now" : dropZoneLabel(drag.count)) : announcement;

  const submitSteer = async (draft: string) => {
    if (!steer) return;
    const mode = activeSteerMode;
    const sequence = ++sendSequenceRef.current;
    sendInFlightRef.current = true;
    setError(null);
    setSteerStatus(null);
    setSendPending(true);
    try {
      const result = await steer.onSteer(draft, mode);
      if (!mountedRef.current || sendSequenceRef.current !== sequence) return;
      // A 200 with accepted:false is a REFUSAL, not a queue: saying "Queued"
      // over it would lie (SteerComposer's rule).
      if (!result?.accepted && !result?.duplicate) {
        setError({ action: "steer", message: "the gateway did not accept this message (accepted=false)." });
        return;
      }
      setSteerStatus({ mode, ...(typeof result.seq === "number" ? { seq: result.seq } : {}), duplicate: Boolean(result.duplicate) });
      props.onDraftChange("");
    } catch (reason) {
      if (mountedRef.current && sendSequenceRef.current === sequence) setError({ action: "steer", message: messageFor(reason) });
    } finally {
      if (mountedRef.current && sendSequenceRef.current === sequence) {
        sendInFlightRef.current = false;
        setSendPending(false);
      }
    }
  };

  const submit = async () => {
    const draft = String(props.draft || "");
    if (disabled || sendInFlightRef.current || !draft.trim()) return;
    if (steering) return void submitSteer(draft);
    if (!props.sendWhileBusy && props.busy) return;
    const block = attachmentItems.length ? unattachedSendBlock(attachmentItems) : null;
    if (block) {
      setError({ action: "send", message: block });
      return;
    }
    const sequence = ++sendSequenceRef.current;
    const abort = new AbortController();
    sendAbortRef.current = abort;
    sendInFlightRef.current = true;
    setError(null);
    setSteerStatus(null);
    setSendPending(true);
    try {
      await props.onSend(draft, { signal: abort.signal });
    } catch (reason) {
      // Draft stays controlled by the host and is deliberately not cleared.
      // A send the user stopped is not a failure to report.
      if (mountedRef.current && sendSequenceRef.current === sequence && !abort.signal.aborted) setError({ action: "send", message: messageFor(reason) });
    } finally {
      if (sendAbortRef.current === abort) sendAbortRef.current = null;
      if (mountedRef.current && sendSequenceRef.current === sequence) {
        sendInFlightRef.current = false;
        setSendPending(false);
      }
    }
  };

  const cancel = async () => {
    if (disabled || cancelInFlightRef.current || !props.onCancel) return;
    const sequence = ++cancelSequenceRef.current;
    cancelInFlightRef.current = true;
    setError(null);
    setCancelPending(true);
    const inFlight = sendAbortRef.current;
    const signalOwner = inFlight || new AbortController();
    signalOwner.abort(new DOMException("Stopped by the user", "AbortError"));
    try {
      await props.onCancel(signalOwner.signal);
    } catch (reason) {
      if (mountedRef.current && cancelSequenceRef.current === sequence) setError({ action: "cancel", message: messageFor(reason) });
    } finally {
      if (mountedRef.current && cancelSequenceRef.current === sequence) {
        cancelInFlightRef.current = false;
        setCancelPending(false);
      }
    }
  };

  const attach = async () => {
    if (disabled || attachInFlightRef.current || !props.onAttach) return;
    const sequence = ++attachSequenceRef.current;
    attachInFlightRef.current = true;
    setError(null);
    setAttachPending(true);
    try {
      await props.onAttach();
    } catch (reason) {
      if (mountedRef.current && attachSequenceRef.current === sequence) setError({ action: "attach", message: messageFor(reason) });
    } finally {
      if (mountedRef.current && attachSequenceRef.current === sequence) {
        attachInFlightRef.current = false;
        setAttachPending(false);
      }
    }
  };

  const retry = () => {
    if (!error) return;
    if (error.action === "send" || error.action === "steer") void submit();
    if (error.action === "cancel") void cancel();
    if (error.action === "attach") void attach();
  };

  const toolbar = props.toolbar || null;
  const transcriptMarkdown = (heading?: string) =>
    chatToMarkdown(
      (Array.isArray(props.messages) ? props.messages : []).filter((m) => !m.toolActivity && !m.live && String(m.content || "").trim()),
      heading ? { heading } : undefined,
    );
  const runToolbar = async (action: () => void | Promise<unknown>) => {
    if (disabled) return;
    setError(null);
    try {
      await action();
    } catch (reason) {
      if (mountedRef.current) setError({ action: "toolbar", message: messageFor(reason) });
    }
  };
  const copyTranscript = async () => {
    const ok = await copyText(transcriptMarkdown());
    if (!mountedRef.current) return;
    setCopyState(ok ? "copied" : "failed");
    if (typeof window !== "undefined") window.setTimeout(() => mountedRef.current && setCopyState("idle"), 1200);
  };
  const toolbarRow = toolbar ? (
    <div className="pc-workflow-chat__toolbar" role="toolbar" aria-label="Conversation actions">
      {toolbar.onNewSession ? (
        <button type="button" className="pc-workflow-chat__icon-button" data-toolbar="new" disabled={disabled} onClick={() => void runToolbar(toolbar.onNewSession!)}>
          <Icon name="plus" size={14} />
          <span>New chat</span>
        </button>
      ) : null}
      {toolbar.onClear ? (
        <button type="button" className="pc-workflow-chat__icon-button" data-toolbar="clear" disabled={disabled} onClick={() => void runToolbar(toolbar.onClear!)}>
          <Icon name="trash" size={14} />
          <span>Clear</span>
        </button>
      ) : null}
      {toolbar.copyTranscript ? (
        <button type="button" className="pc-workflow-chat__icon-button" data-toolbar="copy" onClick={() => void copyTranscript()}>
          <Icon name={copyState === "copied" ? "check" : "copy"} size={14} />
          <span>{copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy"}</span>
        </button>
      ) : null}
      {toolbar.exportTranscript ? (
        <button
          type="button"
          className="pc-workflow-chat__icon-button"
          data-toolbar="export"
          onClick={() => {
            const spec = toolbar.exportTranscript as { filename: string; heading?: string };
            downloadTextFile({ filename: spec.filename, text: transcriptMarkdown(spec.heading), mime: "text/markdown;charset=utf-8" });
          }}
        >
          <Icon name="download" size={14} />
          <span>Export</span>
        </button>
      ) : null}
    </div>
  ) : null;

  const steerLabel = activeSteerMode === "queue" ? "Queue" : "Steer";
  const steerNote = steerStatus
    ? steerStatus.mode === "queue"
      ? `Queued for the next turn${typeof steerStatus.seq === "number" ? ` (seq ${steerStatus.seq})` : ""}.`
      : `${steerStatus.duplicate ? "Already queued" : "Queued"}${typeof steerStatus.seq === "number" ? ` (seq ${steerStatus.seq})` : ""}. ${
          steer?.parked ? "The run is waiting: your guidance delivers at its next wake (steers do not wake runs)." : "Delivers at the run's next loop boundary."
        }`
    : "";

  return (
    <section
      ref={sectionRef}
      className={["pc-workflow-chat", drag ? "pc-workflow-chat--dragging" : "", drag?.over ? "pc-workflow-chat--drag-over" : "", props.className].filter(Boolean).join(" ")}
      aria-label="Workflow chat"
      data-stream-replies={props.streamReplies || "gateway_default"}
    >
      {props.header || toolbarRow ? (
        <header className={["pc-workflow-chat__header", toolbarRow ? "pc-workflow-chat__header--toolbar" : ""].filter(Boolean).join(" ")}>
          {props.header ? <div className="pc-workflow-chat__header-main">{props.header}</div> : null}
          {toolbarRow}
        </header>
      ) : null}
      <div className="pc-workflow-chat__transcript">
        <ChatThread
          messages={Array.isArray(props.messages) ? props.messages : []}
          empty={props.emptyState}
          autoScroll
          messageProps={{ ...props.messageProps, ...(props.renderMarkdown ? { renderMarkdown: props.renderMarkdown } : {}) }}
          after={
            <>
              {props.interaction ? <WorkflowInteractionPanel interaction={props.interaction} disabled={disabled} /> : null}
              {blocked ? <div className="pc-workflow-chat__blocked" role="status">{props.blockedNotice}</div> : null}
            </>
          }
          afterKey={`${props.interaction ? `${props.interaction.kind}:${props.interaction.id}` : ""}:${blocked ? "blocked" : ""}`}
        />
      </div>
      {error ? (
        <div className="pc-workflow-chat__error" role="alert">
          <span>
            Could not{" "}
            {error.action === "send"
              ? "send this message"
              : error.action === "steer"
                ? activeSteerMode === "queue"
                  ? "queue this message"
                  : "steer the run"
                : error.action === "attach"
                  ? "attach a file"
                  : error.action === "toolbar"
                    ? "complete that action"
                    : "stop the run"}
            : {error.message}
          </span>
          {error.action !== "toolbar" ? (
            <button type="button" onClick={retry} disabled={disabled}>
              Try again
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="pc-workflow-chat__composer">
        <ChatComposer
          value={props.draft}
          onChange={props.onDraftChange}
          onSubmit={() => void submit()}
          placeholder={props.placeholder || "Send a message"}
          ariaLabel="Message"
          disabled={disabled}
          busy={steering ? sendPending : composerBusy}
          sendLabel={steering ? steerLabel : props.sendLabel}
          busyLabel={steering ? (activeSteerMode === "queue" ? "Queueing…" : "Steering…") : props.busyLabel}
          rows={2}
          leading={
            props.attachments || attachmentItems.length ? (
              <div className="pc-workflow-chat__attachments">
                {attachmentItems.length ? (
                  <ComposerAttachmentChips items={attachmentItems} onRemove={props.onRemoveAttachment} onRetry={props.onRetryAttachment} disabled={disabled} />
                ) : null}
                {props.attachments}
              </div>
            ) : null
          }
          overlay={dropZone}
          onPaste={acceptsFiles ? onPaste : undefined}
          actions={
            <>
              {props.onAttach ? (
                <button type="button" className="pc-workflow-chat__icon-button" aria-label="Attach file" data-af-tip="Attach a file" disabled={disabled || attachPending} onClick={() => void attach()}>
                  <Icon name="paperclip" size={16} />
                  <span>{attachPending ? "Attaching…" : "Attach"}</span>
                </button>
              ) : null}
              {props.composerExtras}
              {steering && steerModes.length > 1 ? (
                <span className="pc-workflow-chat__steer-modes" role="group" aria-label="While the run is busy">
                  {steerModes.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className="pc-workflow-chat__steer-mode"
                      data-steer-mode={mode}
                      aria-pressed={activeSteerMode === mode}
                      disabled={disabled || sendPending}
                      onClick={() => setSteerMode(mode)}
                    >
                      {mode === "queue" ? "Queue next turn" : "Guide this run"}
                    </button>
                  ))}
                </span>
              ) : null}
              {sending && props.onCancel ? (
                <button type="button" className="pc-workflow-chat__stop" disabled={disabled || cancelPending || stopping} onClick={() => void cancel()}>
                  <Icon name="x" size={14} />
                  <span>{cancelPending || stopping ? "Stopping…" : "Stop"}</span>
                </button>
              ) : stopState ? (
                <span className={`pc-workflow-chat__stop-state pc-workflow-chat__stop-state--${stopState.phase}`} role="status" aria-live="polite">
                  {stopState.label}
                </span>
              ) : null}
            </>
          }
        />
        {steer ? (
          <div className="pc-workflow-chat__steer-status" role="status" aria-live="polite">
            {steerNote}
          </div>
        ) : null}
        {acceptsFiles ? (
          <div className="pc-sr-only" role="status" aria-live="polite">
            {liveMessage}
          </div>
        ) : null}
      </div>
      {props.footer ? <footer className="pc-workflow-chat__footer">{props.footer}</footer> : null}
    </section>
  );
}

export default WorkflowChat;
