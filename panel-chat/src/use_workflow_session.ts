import { useEffect, useMemo, useSyncExternalStore } from "react";
import { WorkflowSessionController, type WorkflowSessionSnapshot, type WorkflowTransport, type WorkflowToolApprovalPolicy } from "./workflow_runtime.js";

export type UseWorkflowSessionOptions = {
  transport: WorkflowTransport;
  runId?: string | null;
  enabled?: boolean;
  onAuthError?: (error: unknown) => void;
  clientId?: string;
  /** Stable, non-secret principal/session generation. Change it after sign
   * in/out or account switching; never pass a bearer token here. */
  authScopeKey?: string | number | null;
  toolApprovalPolicy?: WorkflowToolApprovalPolicy | null;
};

/** React lifecycle wrapper.  The controller remains independently testable. */
export type WorkflowSessionHook = { controller: WorkflowSessionController; snapshot: WorkflowSessionSnapshot };

export function useWorkflowSession(options: UseWorkflowSessionOptions): WorkflowSessionHook {
  const controller = useMemo(
    () => new WorkflowSessionController(options.transport, { onAuthError: options.onAuthError, clientId: options.clientId }),
    [options.transport, options.onAuthError, options.clientId, options.authScopeKey],
  );
  const snapshot = useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.getSnapshot(),
    () => controller.getSnapshot(),
  );
  const runId = String(options.runId || "").trim();
  useEffect(() => {
    controller.setToolApprovalPolicy(options.enabled === false ? { enabledTools: [], autoApproveTools: [] } : options.toolApprovalPolicy ?? null);
  }, [controller, options.toolApprovalPolicy, options.enabled]);
  useEffect(() => {
    if (options.enabled === false || !runId) { controller.reset(); return; }
    void controller.load(runId);
    return () => controller.reset();
  }, [controller, runId, options.enabled]);
  return { controller, snapshot };
}
