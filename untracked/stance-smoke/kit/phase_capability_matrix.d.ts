import React from "react";
import { type MatrixCellPatch } from "./phase_capability_matrix_core.js";
export type PhaseCapabilityMatrixProps = {
    /** Raw payload from the gateway (validated here; refusals render labeled). */
    payload: unknown;
    /** Pending (unsaved) cell patches — owned by the consumer. */
    patches: MatrixCellPatch[];
    /** Emits the full pending patch list after each operator act. */
    onPatchesChange: (next: MatrixCellPatch[]) => void;
    disabled?: boolean;
    title?: string;
    subtitle?: string;
    className?: string;
};
export declare function PhaseCapabilityMatrix(props: PhaseCapabilityMatrixProps): React.ReactElement;
export default PhaseCapabilityMatrix;
//# sourceMappingURL=phase_capability_matrix.d.ts.map