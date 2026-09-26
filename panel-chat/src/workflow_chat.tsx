import React, { useEffect, useRef, useState } from "react";

import { Icon } from "@abstractframework/ui-kit";

import { ChatComposer } from "./chat_composer.js";
import type { ChatMessage, ChatMessageCardProps } from "./chat_message_card.js";
import { ChatThread } from "./chat_thread.js";
import { DragPresence, dragCarriesFiles, draggedFileCount, dropZoneLabel, droppedFiles, folderRefusal, pastedFiles } from "./file_drop.js";
import { WorkflowInteractionPanel, type WorkflowInteraction } from "./workflow_interaction.js";
import type { StreamRepliesMode } from "./llm_delta.js";

export type WorkflowChatProps = {
  /** Fully controlled transcript. The host owns message persistence and identity. */
  messages: ChatMessage[];
  /** Fully controlled composer value. It is intentionally retained on failed sends. */
  draft: string;
  onDraftChange: (draft: string) => void;
  /** Submit a chat message. Async failures are surfaced locally and keep the draft. */
  onSend: (draft: string) => void | Promise<unknown>;
  busy?: boolean;
  /** Keep the composer active while busy, for hosts that queue/steer messages. */
  sendWhileBusy?: boolean;
  sendLabel?: string;
  /** Optional host-specific explanation while the composer is busy. */
  busyLabel?: string;
  /** Cancels current host work. Only rendered while busy. */
  onCancel?: () => void | Promise<unknown>;
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
  /** Host-rendered attachment chips, shown inside the composer above the message field. */
  attachments?: React.ReactNode;
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
  const [sendPending, setSendPending] = useState(false);
  const [cancelPending, setCancelPending] = useState(false);
  const [attachPending, setAttachPending] = useState(false);
  const [error, setError] = useState<{ action: "send" | "cancel" | "attach"; message: string } | null>(null);
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
    };
  }, []);
  const blocked = Boolean(props.blockedNotice);
  const disabled = Boolean(props.disabled) || blocked;
  const sending = Boolean(props.busy) || sendPending;
  const composerBusy = sendPending || (Boolean(props.busy) && !props.sendWhileBusy);
  const stopState = props.stopState || null;
  const stopping = stopState?.phase === "stopping";

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

  const submit = async () => {
    const draft = String(props.draft || "");
    if (disabled || sendInFlightRef.current || (!props.sendWhileBusy && props.busy) || !draft.trim()) return;
    const sequence = ++sendSequenceRef.current;
    sendInFlightRef.current = true;
    setError(null);
    setSendPending(true);
    try {
      await props.onSend(draft);
    } catch (reason) {
      // Draft stays controlled by the host and is deliberately not cleared.
      if (mountedRef.current && sendSequenceRef.current === sequence) setError({ action: "send", message: messageFor(reason) });
    } finally {
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
    try {
      await props.onCancel();
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
    if (error.action === "send") void submit();
    if (error.action === "cancel") void cancel();
    if (error.action === "attach") void attach();
  };

  return (
    <section
      ref={sectionRef}
      className={["pc-workflow-chat", drag ? "pc-workflow-chat--dragging" : "", drag?.over ? "pc-workflow-chat--drag-over" : "", props.className].filter(Boolean).join(" ")}
      aria-label="Workflow chat"
      data-stream-replies={props.streamReplies || "gateway_default"}
    >
      {props.header ? <header className="pc-workflow-chat__header">{props.header}</header> : null}
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
          <span>Could not {error.action === "send" ? "send this message" : error.action === "attach" ? "attach a file" : "stop the run"}: {error.message}</span>
          <button type="button" onClick={retry} disabled={disabled}>Try again</button>
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
          busy={composerBusy}
          sendLabel={props.sendLabel}
          busyLabel={props.busyLabel}
          rows={2}
          leading={props.attachments ? <div className="pc-workflow-chat__attachments">{props.attachments}</div> : null}
          overlay={dropZone}
          onPaste={acceptsFiles ? onPaste : undefined}
          actions={
            <>
              {props.onAttach ? (
                <button type="button" className="pc-workflow-chat__icon-button" aria-label="Attach file" title="Attach file" disabled={disabled || attachPending} onClick={() => void attach()}>
                  <Icon name="paperclip" size={16} />
                  <span>{attachPending ? "Attaching…" : "Attach"}</span>
                </button>
              ) : null}
              {props.composerExtras}
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
