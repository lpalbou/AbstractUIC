import React from "react";
import { type CriticalActionFacts } from "./critical_action_core.js";
export type CriticalActionDialogProps = {
    open: boolean;
    title: string;
    /** Verb-first label for the confirm button, e.g. "Reembed 3 homes". */
    actionLabel: string;
    /** Server-supplied blast-radius facts; omit/null when the gateway did not provide them. */
    facts?: CriticalActionFacts | null;
    /** Explicit opt-in to allow proceeding without server facts (labeled degraded). */
    allowDegradedProceed?: boolean;
    /** Typed-confirm phrase; strictly opt-in. */
    confirmPhrase?: string;
    busy?: boolean;
    error?: string;
    onConfirm: () => void;
    onCancel: () => void;
    /** Optional extra consumer content (rendered between facts and actions). */
    children?: React.ReactNode;
    className?: string;
};
export declare function CriticalActionDialog(props: CriticalActionDialogProps): React.ReactElement | null;
export default CriticalActionDialog;
//# sourceMappingURL=critical_action_dialog.d.ts.map