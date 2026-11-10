/**
 * The badge row under a reply: one badge per served turn notice (chat_notices.ts). A click hands
 * the notice to the host (`onOpen`, e.g. the record's detail panel); without a host, or when the
 * host returns `false`, the badge opens a small panel under the row with the title and the words,
 * whole. Keyboard: badges are buttons; Escape closes the panel and returns focus to its badge.
 */
import React, { useEffect, useId, useMemo, useRef, useState } from "react";

import { Icon } from "@abstractframework/ui-kit";

import { CHAT_NOTICE_WORDS, chatNoticesOf, chatNoticeView, type ChatNotice } from "./chat_notices.js";

/** Scroll an opened panel into view inside its nearest scrolling ancestor only (the thread), never
 * the page or an app shell around it (`scrollIntoView` would move those too). */
function revealInScroller(el: HTMLElement | null): void {
  if (!el || typeof window === "undefined") return;
  for (let p = el.parentElement; p; p = p.parentElement) {
    const overflow = window.getComputedStyle(p).overflowY;
    if ((overflow === "auto" || overflow === "scroll") && p.scrollHeight > p.clientHeight) {
      const box = p.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      if (r.bottom > box.bottom) p.scrollTop += Math.min(r.bottom - box.bottom, r.top - box.top);
      return;
    }
  }
}

/**
 * The notices the row shows, in the served order. A notice served twice shows once, the first: the
 * same `record_id`; without a record id, the same badge (kind, title, else his words, private,
 * forming). A notice that names nothing (no record, no title, no words, neither private nor forming)
 * shows no badge: it would be the kind word alone with nothing to open.
 */
function shownNotices(raw: unknown): ChatNotice[] {
  const seen = new Set<string>();
  const out: ChatNotice[] = [];
  for (const notice of chatNoticesOf(raw)) {
    const view = chatNoticeView(notice);
    if (!notice.record_id && !view.label && !view.staged) continue;
    const same = notice.record_id ? `record:${notice.record_id}` : JSON.stringify([view.kind, view.label, view.private, view.staged]);
    if (seen.has(same)) continue;
    seen.add(same);
    out.push(notice);
  }
  return out;
}

export type ChatNoticeBadgesProps = {
  notices: readonly ChatNotice[] | null | undefined;
  /**
   * The host's opener for a notice (e.g. the record's detail panel by `record_id`). Return
   * `false` when it opened nothing: the badge then opens its own panel (title and words).
   * Without it every badge opens its own panel.
   */
  onOpen?: (notice: ChatNotice) => void | boolean;
  className?: string;
};

/** One row of badges, one per notice, in the served order (a duplicate once, an empty notice none).
 * Nothing when there is no notice to show. */
export function ChatNoticeBadges(props: ChatNoticeBadgesProps): React.ReactElement | null {
  const notices = useMemo(() => shownNotices(props.notices), [props.notices]);
  const views = useMemo(() => notices.map((n, i) => chatNoticeView(n, i)), [notices]);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const refocus = useRef<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const panelId = `pc-notice-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const open = openKey !== null ? views.findIndex((v) => v.key === openKey) : -1;
  // A notice list that changed under an open panel (a new reply, a re-read) closes it.
  useEffect(() => {
    if (openKey !== null && open < 0) setOpenKey(null);
  }, [openKey, open]);
  // An opened panel under the last reply would sit below the fold of the thread: bring it in.
  useEffect(() => {
    if (openKey !== null) revealInScroller(panelRef.current);
  }, [openKey]);
  useEffect(() => {
    if (openKey !== null || refocus.current === null) return;
    buttons.current.get(refocus.current)?.focus();
    refocus.current = null;
  }, [openKey]);
  if (!views.length) return null;
  const close = () => {
    refocus.current = openKey;
    setOpenKey(null);
  };
  const activate = (index: number) => {
    const view = views[index];
    if (openKey === view.key) return close();
    if (props.onOpen && props.onOpen(notices[index]) !== false) return setOpenKey(null);
    setOpenKey(view.key);
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "Escape" || openKey === null) return;
    event.stopPropagation();
    close();
  };
  const shown = open >= 0 ? { view: views[open], notice: notices[open] } : null;
  const text = shown && !shown.view.private ? String(shown.notice.text || "").trim() : "";
  return (
    <div className={["pc-chat-notices", props.className].filter(Boolean).join(" ")} role="group" aria-label={CHAT_NOTICE_WORDS.group}>
      <div className="pc-chat-notices__row">
        {views.map((v, i) => (
          <button
            key={v.key}
            ref={(el) => {
              if (el) buttons.current.set(v.key, el);
              else buttons.current.delete(v.key);
            }}
            type="button"
            className={["pc-chat-notice", `pc-chat-notice--${v.kind.replace(/[^a-z0-9_-]/g, "") || "other"}`, v.staged ? "pc-chat-notice--staged" : "", v.private ? "pc-chat-notice--private" : ""].filter(Boolean).join(" ")}
            data-notice-kind={v.kind}
            {...(v.staged ? { "data-staged": "" } : {})}
            {...(v.private ? { "data-private": "" } : {})}
            aria-label={v.ariaLabel}
            {...(openKey === v.key ? { "aria-expanded": true, "aria-controls": panelId } : props.onOpen ? {} : { "aria-expanded": false })}
            onClick={() => activate(i)}
            onKeyDown={onKeyDown}
          >
            <Icon name={v.icon} size={12} />
            <span className="pc-chat-notice__kind">{v.word}</span>
            {v.label ? (
              <span className="pc-chat-notice__label" {...(v.fromText ? { "data-from-text": "" } : {})}>
                {v.label}
              </span>
            ) : null}
            {v.staged ? <span className="pc-chat-notice__staged">{CHAT_NOTICE_WORDS.staged}</span> : null}
          </button>
        ))}
      </div>
      {shown ? (
        <div ref={panelRef} className="pc-chat-notice-pop" id={panelId} data-notice-kind={shown.view.kind} onKeyDown={onKeyDown}>
          <div className="pc-chat-notice-pop__head">
            <Icon name={shown.view.icon} size={14} />
            <span className="pc-chat-notice__kind">{shown.view.word}</span>
            {shown.view.label && !shown.view.fromText ? <span className="pc-chat-notice-pop__title">{shown.view.label}</span> : null}
            <button type="button" className="pc-chat-notice-pop__close" onClick={close}>
              {CHAT_NOTICE_WORDS.close}
            </button>
          </div>
          {text ? <p className="pc-chat-notice-pop__text">{text}</p> : null}
          {shown.view.private ? <p className="pc-chat-notice-pop__note">{CHAT_NOTICE_WORDS.privateNote}</p> : null}
          {shown.view.staged ? <p className="pc-chat-notice-pop__note">{CHAT_NOTICE_WORDS.stagedNote}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
