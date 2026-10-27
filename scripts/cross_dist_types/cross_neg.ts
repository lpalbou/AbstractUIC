// Negative control for the cross-dist gate: a deliberately different shape must FAIL to type-check,
// otherwise the positive file proves nothing. check_cross_dist_types.mjs expects tsc to reject this file.
import type * as Kit from "../../ui-kit/dist/session_tool_policy.js";

type Eq<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Drifted = Omit<Kit.SessionToolPolicyClient, "reset"> & { reset(): Promise<void> };

export const client: Eq<Kit.SessionToolPolicyClient, Drifted> = true;
