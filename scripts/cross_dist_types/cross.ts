// Release gate: the session tool-policy client shape must be IDENTICAL in the built ui-kit and
// the built panel-chat (panel-chat declares a structural twin so it can be released independently;
// its in-repo twin check compares a hand-copied literal and cannot see kit drift — this file can).
// Run by scripts/check_cross_dist_types.mjs against ../../ui-kit/dist and ../../panel-chat/dist.
import type * as Kit from "../../ui-kit/dist/session_tool_policy.js";
import { createSessionToolPolicyClient, sessionToolPolicyCapability } from "../../ui-kit/dist/session_tool_policy.js";
import type * as Chat from "../../panel-chat/dist/index.js";
import { WorkflowSessionController } from "../../panel-chat/dist/index.js";

type Eq<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

export const scope: Eq<Kit.SessionToolPolicyScope, Chat.SessionToolPolicyScope> = true;
export const body: Eq<Kit.SessionToolPolicyBody, Chat.SessionToolPolicyBody> = true;
export const policy: Eq<Kit.SessionToolPolicy, Chat.SessionToolPolicy> = true;
export const client: Eq<Kit.SessionToolPolicyClient, Chat.SessionToolPolicyClient> = true;

declare const request: Kit.SessionToolPolicyRequest;
const c = createSessionToolPolicyClient(request, "s1", sessionToolPolicyCapability({}), { client: "x" });
declare const transport: ConstructorParameters<typeof WorkflowSessionController>[0];
const ctl = new WorkflowSessionController(transport, { sessionToolPolicy: c });
ctl.setSessionToolPolicyClient(c);
const back: Kit.SessionToolPolicyClient = {} as Chat.SessionToolPolicyClient;
void back;
