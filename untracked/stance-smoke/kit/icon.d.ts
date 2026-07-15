import React from "react";
export type IconName = "chat" | "plus" | "history" | "refresh" | "settings" | "user" | "bot" | "paperclip" | "mic" | "speaker" | "pause" | "terminal" | "edit" | "download" | "loader" | "info" | "warning" | "error" | "copy" | "check" | "x" | "chevronDown" | "chevronRight" | "trash" | "send" | "board" | "inbox" | "server" | "agent" | "playCircle" | "list" | "gear" | "sparkle" | "contrast" | "logout";
export declare function Icon({ name, size, className, title, ...props }: {
    name: IconName;
    size?: number;
    title?: string;
} & Omit<React.SVGProps<SVGSVGElement>, "children">): React.ReactElement;
//# sourceMappingURL=icon.d.ts.map