import React from "react";

export type ChatComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
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
};

export const ChatComposer = React.forwardRef<HTMLTextAreaElement, ChatComposerProps>(function ChatComposer(
  props: ChatComposerProps,
  ref
): React.ReactElement {
  const rows = typeof props.rows === "number" && Number.isFinite(props.rows) ? Math.max(1, Math.trunc(props.rows)) : 3;
  const disabled = Boolean(props.disabled);
  const busy = Boolean(props.busy);
  const can_submit = !disabled && !busy && Boolean(String(props.value || "").trim());

  return (
    <div className={["pc-composer", props.className].filter(Boolean).join(" ")}>
      <textarea
        ref={ref}
        className={["pc-composer__textarea", props.textareaClassName].filter(Boolean).join(" ")}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        rows={rows}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        autoComplete="off"
        placeholder={props.placeholder || ""}
        disabled={disabled}
        autoFocus={Boolean(props.autoFocus)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            props.onSubmit();
          }
        }}
      />

      <div className="pc-composer__row">
        <div className="pc-composer__actions">{props.actions}</div>
        <button
          type="button"
          className={props.sendButtonClassName || "pc-btn"}
          disabled={!can_submit}
          onClick={() => props.onSubmit()}
        >
          {busy ? props.busyLabel || "Thinking…" : props.sendLabel || "Send"}
        </button>
      </div>
    </div>
  );
});
