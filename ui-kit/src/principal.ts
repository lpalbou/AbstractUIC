// The signed-in principal, as the top-right identity shows it (ADR 0001 §1,
// backlog 0036; ui-primitives "shell").
//
// Source of truth: the app server's connection probe
// (`GET api/connection/gateway`, app-server/src/gateway_session_proxy.js:412-435)
// relays the gateway's `GET /api/gateway/me` body as `status.gateway`
// (abstractgateway routes/gateway.py:351-365), whose `principal` is
// `GatewayPrincipal.public_dict()` (security/principal.py:27-37):
// {user_id, tenant_id, roles, scopes, token_fingerprint, runtime_id, source, admin}.
// The gateway serves NO display name, e-mail or avatar: `displayName`, `email`
// and `avatarUrl` are typed optional for a host (or a future gateway) that has
// them, and are never read from the wire here (no invented fields).
import type { GatewayConnectionState } from "./gateway_connect_modal.js";
import { isGatewayConnected } from "./use_gateway_connection.js";

export type AfPrincipal = {
  userId: string;
  tenantId?: string;
  runtimeId?: string;
  roles?: string[];
  scopes?: string[];
  /** How the gateway authenticated the principal ("session", "legacy-token", ...). */
  source?: string;
  admin?: boolean;
  /** Not served by the gateway today (gateway gap); a host may set it. */
  displayName?: string;
  /** Not served by the gateway today (gateway gap); a host may set it. */
  email?: string;
  /** Not served by the gateway today (gateway gap); a host may set it. */
  avatarUrl?: string;
};

/** The gateway's default tenant (security/principal.py:17): not worth showing. */
export const AF_DEFAULT_TENANT = "default";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function strings(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : undefined;
}

/**
 * The principal of a CONNECTED status (`useGatewayConnection().status`), or
 * null: no session, a rejected session, a probe that has not resolved, or a
 * principal without a user id. Same "connected" rule as the hook
 * (`isGatewayConnected`), so the identity never outlives the session.
 */
export function principalFromConnection(state: GatewayConnectionState | null | undefined): AfPrincipal | null {
  if (!state || !isGatewayConnected(state)) return null;
  const raw = state.gateway?.principal;
  if (!raw || typeof raw !== "object") return null;
  const userId = text(raw.user_id);
  if (!userId) return null;
  const out: AfPrincipal = { userId };
  const tenantId = text(raw.tenant_id);
  if (tenantId) out.tenantId = tenantId;
  const runtimeId = text(raw.runtime_id);
  if (runtimeId) out.runtimeId = runtimeId;
  const roles = strings(raw.roles);
  if (roles) out.roles = roles;
  const scopes = strings(raw.scopes);
  if (scopes) out.scopes = scopes;
  const source = text(raw.source);
  if (source) out.source = source;
  if (typeof raw.admin === "boolean") out.admin = raw.admin;
  return out;
}

/**
 * The ONE wording of who is signed in: the display name when known, else the
 * user id; the tenant prefixes it ("acme/alice") only when it is not the
 * gateway's default tenant.
 */
export function principalLabel(p: AfPrincipal): string {
  const name = text(p.displayName) || text(p.userId);
  const tenant = text(p.tenantId);
  return tenant && tenant !== AF_DEFAULT_TENANT ? `${tenant}/${name}` : name;
}

/** The host[:port] of a gateway URL (the connection status's `gateway_url`); the raw text when it is not a URL. */
export function gatewayHostLabel(gatewayUrl: string | null | undefined): string {
  const raw = text(gatewayUrl);
  if (!raw) return "";
  try {
    return new URL(raw).host || raw;
  } catch {
    return raw;
  }
}
