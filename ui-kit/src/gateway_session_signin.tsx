import React from "react";

export type GatewaySessionStatusTone = "ok" | "warn" | "err";

export type GatewaySessionSignInCardProps = {
  kicker?: string;
  title?: string;
  description?: React.ReactNode;
  statusLabel?: string;
  statusTone?: GatewaySessionStatusTone;
  tokenSourceLabel?: string;

  showGatewayUrl?: boolean;
  gatewayUrl?: string;
  gatewayUrlPlaceholder?: string;
  onGatewayUrlChange?: (value: string) => void;

  userId: string;
  userPlaceholder?: string;
  onUserIdChange: (value: string) => void;

  token: string;
  tokenPlaceholder?: string;
  showToken?: boolean;
  onTokenChange: (value: string) => void;
  onShowTokenChange?: (value: boolean) => void;

  remember?: boolean;
  rememberLabel?: string;
  onRememberChange?: (value: boolean) => void;

  loading?: boolean;
  submitting?: boolean;
  submitDisabled?: boolean;
  submitLabel?: string;
  submittingLabel?: string;
  closeLabel?: string;
  signOutLabel?: string;
  showClose?: boolean;
  showSignOut?: boolean;
  error?: string;
  className?: string;
  onSubmit: () => void | Promise<void>;
  onClose?: () => void;
  onSignOut?: () => void | Promise<void>;
};

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function GatewaySessionSignInCard({
  kicker = "AbstractGateway connection",
  title = "Connect to AbstractGateway",
  description = "Sign in with the Gateway user token assigned by the Gateway admin.",
  statusLabel = "Gateway token missing",
  statusTone = "warn",
  tokenSourceLabel = "token: missing",
  showGatewayUrl = false,
  gatewayUrl = "",
  gatewayUrlPlaceholder = "http://127.0.0.1:8080",
  onGatewayUrlChange,
  userId,
  userPlaceholder = "admin",
  onUserIdChange,
  token,
  tokenPlaceholder = "Paste Gateway user token",
  showToken = false,
  onTokenChange,
  onShowTokenChange,
  remember = false,
  rememberLabel = "Remember this browser",
  onRememberChange,
  loading = false,
  submitting = false,
  submitDisabled = false,
  submitLabel = "Sign in",
  submittingLabel = "Signing in...",
  closeLabel = "Close",
  signOutLabel = "Sign out",
  showClose = false,
  showSignOut = false,
  error,
  className,
  onSubmit,
  onClose,
  onSignOut,
}: GatewaySessionSignInCardProps): React.ReactElement {
  const busy = loading || submitting;
  const disabled = busy || submitDisabled || !String(userId || "").trim() || !String(token || "").trim();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (disabled) return;
    void onSubmit();
  };

  return (
    <form className={cx("af-gateway-signin", className)} onSubmit={handleSubmit}>
      <div className="af-gateway-signin__hero">
        <div>
          <div className="af-gateway-signin__kicker">{kicker}</div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        <div className="af-gateway-signin__mark" aria-hidden="true">
          ↔
        </div>
      </div>

      <div className="af-gateway-signin__status-row">
        <span className={cx("af-gateway-signin__status", `af-gateway-signin__status--${statusTone}`)}>{statusLabel}</span>
        {tokenSourceLabel ? <span className="af-gateway-signin__source">{tokenSourceLabel}</span> : null}
      </div>

      <div className="af-gateway-signin__form">
        {showGatewayUrl ? (
          <>
            <label className="af-gateway-signin__label" htmlFor="gateway-session-url">
              Gateway URL
            </label>
            <input
              id="gateway-session-url"
              value={gatewayUrl}
              onChange={(event) => onGatewayUrlChange?.(event.target.value)}
              placeholder={gatewayUrlPlaceholder}
              autoComplete="url"
              disabled={busy}
            />
          </>
        ) : null}

        <label className="af-gateway-signin__label" htmlFor="gateway-session-user">
          Gateway user
        </label>
        <input
          id="gateway-session-user"
          value={userId}
          onChange={(event) => onUserIdChange(event.target.value)}
          placeholder={userPlaceholder}
          autoComplete="username"
          disabled={busy}
        />

        <label className="af-gateway-signin__label" htmlFor="gateway-session-token">
          Gateway token
        </label>
        <div className="af-gateway-signin__token-input">
          <input
            id="gateway-session-token"
            type={showToken ? "text" : "password"}
            value={token}
            onChange={(event) => onTokenChange(event.target.value)}
            placeholder={tokenPlaceholder}
            autoComplete="current-password"
            disabled={busy}
          />
          <button
            className="af-gateway-signin__secondary"
            type="button"
            onClick={() => onShowTokenChange?.(!showToken)}
            disabled={busy}
          >
            {showToken ? "Hide" : "Show"}
          </button>
        </div>

        <label className="af-gateway-signin__label">Browser session</label>
        <label className="af-gateway-signin__checkbox">
          <input
            type="checkbox"
            checked={Boolean(remember)}
            onChange={(event) => onRememberChange?.(event.target.checked)}
            disabled={busy}
          />
          {rememberLabel}
        </label>
      </div>

      {error ? <div className="af-gateway-signin__message af-gateway-signin__message--error">{error}</div> : null}

      <div className="af-gateway-signin__actions">
        {showClose ? (
          <button className="af-gateway-signin__secondary" type="button" onClick={onClose} disabled={busy}>
            {closeLabel}
          </button>
        ) : null}
        {showSignOut ? (
          <button className="af-gateway-signin__secondary" type="button" onClick={() => void onSignOut?.()} disabled={busy}>
            {signOutLabel}
          </button>
        ) : null}
        <button className="af-gateway-signin__primary" type="submit" disabled={disabled}>
          {submitting ? submittingLabel : submitLabel}
        </button>
      </div>
    </form>
  );
}
