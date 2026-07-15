import React from "react";
import { type BloomReading, type BloomRenderOptions, type EffortFacts } from "./cognition_bloom_core";
export interface AfCognitionBloomProps {
    /** Register scores in [0,1] keyed by register id (missing key = target
     * unchanged; explicit 0 lowers the petal — absent is not zero). */
    scores: Record<string, number>;
    /** Mechanical conduct facts; absent fields render no row. */
    effort?: EffortFacts | null;
    /** Note rendered under the effort column when think_ms is client-measured
     * wall time (entity c2237: label the measurement, never imply precision). */
    effortNote?: string;
    options?: BloomRenderOptions;
    /** Called each frame with the current reading (interpretation lines,
     * external vignettes, tests). */
    onReading?: (reading: BloomReading) => void;
    /** Canvas square size in CSS px (default 260). */
    size?: number;
    className?: string;
}
export declare function AfCognitionBloom(props: AfCognitionBloomProps): React.ReactElement;
export default AfCognitionBloom;
//# sourceMappingURL=af_cognition_bloom.d.ts.map