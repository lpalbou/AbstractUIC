import React, { useCallback, useEffect, useRef } from "react";
import { Icon } from "@abstractframework/ui-kit";

export type ChatComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** Compact rounded multiline box; the existing layout is the default. */
  variant?: "default" | "compact";
  placeholder?: string;
  /** Accessible name for the message field. Falls back to its placeholder. */
  ariaLabel?: string;
  disabled?: boolean;
  busy?: boolean;
  rows?: number;
  autoFocus?: boolean;
  className?: string;
  textareaClassName?: string;
  sendButtonClassName?: string;
  sendLabel?: string;
  busyLabel?: string;
  actions?: React.ReactNode;
  /** Rendered inside the composer box above the textarea (e.g. attachment chips). */
  leading?: React.ReactNode;
  /** Absolutely positioned layer over the composer box (e.g. a drop zone). */
  overlay?: React.ReactNode;
  onPaste?: React.ClipboardEventHandler<HTMLTextAreaElement>;
};

export const ChatComposer = React.forwardRef<HTMLTextAreaElement, ChatComposerProps>(function ChatComposer(
  props: ChatComposerProps,
  ref
): React.ReactElement {
  const compact = props.variant === "compact";
  const rows = typeof props.rows === "number" && Number.isFinite(props.rows) ? Math.max(1, Math.trunc(props.rows)) : compact ? 2 : 3;
  const disabled = Boolean(props.disabled);
  const busy = Boolean(props.busy);
  const can_submit = !disabled && !busy && Boolean(String(props.value || "").trim());
  const sendLabel = busy ? props.busyLabel || "Thinking…" : props.sendLabel || "Send";
  const textarea = useRef<HTMLTextAreaElement | null>(null);
  const setTextarea = useCallback((element: HTMLTextAreaElement | null) => {
    textarea.current = element;
    if (typeof ref === "function") ref(element);
    else if (ref) ref.current = element;
  }, [ref]);

  // Field sizing is native where available. Compact retains multiline growth
  // on other engines, including after its containing pane is resized.
  useEffect(() => {
    const element = textarea.current;
    if (!compact || !element || (typeof CSS !== "undefined" && CSS.supports?.("field-sizing", "content"))) return;
    const resize = () => {
      element.style.height = "0px";
      const cap = parseFloat(getComputedStyle(element).maxHeight);
      element.style.height = `${Math.min(element.scrollHeight, Number.isFinite(cap) ? cap : Infinity)}px`;
    };
    resize();
    window.addEventListener("resize", resize);
    let width = element.clientWidth;
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => {
      if (element.clientWidth !== width) { width = element.clientWidth; resize(); }
    });
    observer?.observe(element);
    return () => { observer?.disconnect(); window.removeEventListener("resize", resize); element.style.removeProperty("height"); };
  }, [compact, props.value, rows]);

  return (
    <div className={["pc-composer", compact ? "pc-composer--compact" : "", props.className].filter(Boolean).join(" ")}>
      {props.leading}
      <textarea
        ref={setTextarea}
        className={["pc-composer__textarea", props.textareaClassName].filter(Boolean).join(" ")}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        rows={rows}
        // The textarea auto-grows (CSS field-sizing) from `rows` lines up to a
        // viewport-relative cap; the row count reaches the CSS as a variable.
        style={{ ["--pc-composer-rows" as string]: String(rows) } as React.CSSProperties}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        autoComplete="off"
        placeholder={props.placeholder || ""}
        aria-label={props.ariaLabel || props.placeholder || "Message"}
        disabled={disabled}
        autoFocus={Boolean(props.autoFocus)}
        onPaste={props.onPaste}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || e.shiftKey) return;
          // Committing an IME composition with Enter must never send the
          // message (CJK input); nativeEvent.isComposing covers the commit
          // keystroke itself, keyCode 229 covers older engines.
          if (e.nativeEvent.isComposing || e.keyCode === 229) return;
          e.preventDefault();
          // Enter honors the same gate as the Send button — the busy/empty
          // contract is the component's, not something every consumer must
          // re-implement around a keyboard side door.
          if (!can_submit) return;
          props.onSubmit();
        }}
      />

      <div className="pc-composer__row">
        <div className="pc-composer__actions">{props.actions}</div>
        <button
          type="button"
          className={[props.sendButtonClassName || "pc-btn", compact ? "pc-composer__send--compact" : ""].filter(Boolean).join(" ")}
          aria-label={compact ? sendLabel : undefined}
          title={compact ? sendLabel : undefined}
          aria-busy={compact ? busy : undefined}
          disabled={!can_submit}
          onClick={() => props.onSubmit()}
        >
          {compact ? <Icon name={busy ? "loader" : "send"} size={17} /> : sendLabel}
        </button>
      </div>
      {props.overlay}
    </div>
  );
});
