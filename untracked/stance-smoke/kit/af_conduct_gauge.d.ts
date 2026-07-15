import React from "react";
import { type ConductAxis, type ConductBaseline, type ConductFacts, type ConductToolCall } from "./cognition_conduct_core";
export interface AfConductGaugeProps {
    facts: ConductFacts | null | undefined;
    tools?: ConductToolCall[] | null;
    /** Session-relative medians (consumer-owned; see runningMedian). */
    baseline?: ConductBaseline | null;
    /** Canvas square size in CSS px (default 190 — the entity panel spec). */
    size?: number;
    /** Draw the EFF/ACT/ATT/RIG code labels on the canvas (default true).
     * Consumers rendering their own interactive legend (entity's DOM code
     * row) pass false — bloom parity. */
    labels?: boolean;
    /** Note under the gauge (e.g. "think time is client-measured"). */
    note?: string;
    className?: string;
    /** Called whenever axes recompute (tooltips, tests, external legends). */
    onAxes?: (axes: ConductAxis[]) => void;
}
export declare function AfConductGauge(props: AfConductGaugeProps): React.ReactElement;
export default AfConductGauge;
//# sourceMappingURL=af_conduct_gauge.d.ts.map