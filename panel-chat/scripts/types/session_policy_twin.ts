// The panel-chat structural twin of ui-kit's session tool policy client (PR #9, 12e2a36,
// ui-kit/src/session_tool_policy.ts) must be EXACTLY the kit's shape. The kit types are written
// out below as literals (no import: panel-chat must not depend on an unreleased kit build), and
// an exact-equality assertion fails `tsc` when either side drifts.
// Run: tsc -p scripts/types/tsconfig.json (after `npm run build`).
import type { SessionToolPolicy, SessionToolPolicyBody, SessionToolPolicyClient, SessionToolPolicyScope } from "../../dist/index.js";

type KitScope = { approve?: string; deny?: string };
type KitBody = {
  approve?: { tools?: string[]; kinds?: string[]; all?: boolean; max_risk_rank?: number };
  deny?: { tools?: string[]; kinds?: string[] };
  ask?: string[];
  client?: string;
  if_revision?: number;
};
type KitPolicy = {
  version: number;
  session_id: string;
  revision: number;
  approve: Record<string, string>;
  deny: Record<string, string>;
  ask: string[];
  request?: unknown;
  clamped?: { selector: string; name: string; reason: string }[];
  set_by?: { tenant_id?: string; user_id?: string; client?: string };
  set_at?: string;
  scope?: KitScope;
};
type KitClient = {
  supported: boolean;
  sessionId: string;
  get(): Promise<KitPolicy | null>;
  replace(body: KitBody): Promise<KitPolicy>;
  merge(body: KitBody): Promise<KitPolicy>;
  reset(ifRevision?: number): Promise<{ revision?: number; scope?: KitScope }>;
};
type KitRevisionedClient = KitClient & { readonly revision: number | undefined; readonly scope: KitScope | undefined };

type Eq<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
export const scopeEq: Eq<KitScope, SessionToolPolicyScope> = true;
export const bodyEq: Eq<KitBody, SessionToolPolicyBody> = true;
export const policyEq: Eq<KitPolicy, SessionToolPolicy> = true;
export const clientEq: Eq<KitClient, SessionToolPolicyClient> = true;
// A revisioned kit client is accepted where the controller takes a client.
declare const revisioned: KitRevisionedClient;
export const accepted: SessionToolPolicyClient = revisioned;
