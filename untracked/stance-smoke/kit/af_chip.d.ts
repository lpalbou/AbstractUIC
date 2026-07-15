import React from "react";
export type AfChipTone = "neutral" | "muted" | "accent" | "info" | "success" | "warning" | "error" | "custom";
export declare function afChipHue(tone: AfChipTone | undefined, hue: string | undefined): string;
type ChipCommonProps = {
    tone?: AfChipTone;
    /** Only read when tone="custom"; must be a var(--token) reference. */
    hue?: string;
    size?: "sm" | "md";
    title?: string;
    className?: string;
    children: React.ReactNode;
};
export type AfChipProps = ChipCommonProps & {
    /** Renders a small remove button inside the chip (observer's removable chips). */
    onRemove?: () => void;
    removeLabel?: string;
};
export declare function AfChip(props: AfChipProps): React.ReactElement;
export type AfChipButtonProps = ChipCommonProps & {
    onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
    /** Toggle chips (filter pills): rendered as aria-pressed. */
    pressed?: boolean;
    /** Disclosure chips (flow's family badge): rendered as aria-expanded. */
    expanded?: boolean;
    disabled?: boolean;
    ariaLabel?: string;
    /**
     * Roving-tabindex support (flow's ask, commons c2186): hosts embedding the
     * chip inside a composite widget (DisclosureList rows) must set inner
     * controls to tabIndex=-1. A passthrough beats the display:contents
     * wrapper-ref workaround it replaces.
     */
    tabIndex?: number;
};
export declare function AfChipButton(props: AfChipButtonProps): React.ReactElement;
export default AfChip;
//# sourceMappingURL=af_chip.d.ts.map