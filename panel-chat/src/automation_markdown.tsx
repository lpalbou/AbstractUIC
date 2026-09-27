// Automations v1 — the ui-kit AutomationPanel wired to the SHARED chat
// renderer. ui-kit cannot import panel-chat (panel-chat depends on ui-kit),
// so the panel takes a `renderText` seam; this module is the one pairing
// hosts use, so an automation's turns read exactly like a chat's
// (`ChatMessageContent`: JSON autodetect + Markdown with tables and code;
// remote images shown as links, as for assistant messages).
import React from "react";
import { AutomationPanel, type AutomationPanelProps } from "@abstractframework/ui-kit";
import { ChatMessageContent } from "./message_content.js";

/** The chat's renderer for automation text (turns, prompts, bodies). */
export function renderAutomationText(text: string): React.ReactElement {
  return <ChatMessageContent text={text} images="link" />;
}

/** Spread into `AutomationPanel`: `<AutomationPanel {...automationRenderers} … />`. */
export const automationRenderers: { renderText: (text: string) => React.ReactElement } = { renderText: renderAutomationText };

export type AutomationPanelWithMarkdownProps = Omit<AutomationPanelProps, "renderText">;

/** `AutomationPanel` with the shared chat renderer already wired. */
export function AutomationPanelWithMarkdown(props: AutomationPanelWithMarkdownProps): React.ReactElement {
  return <AutomationPanel {...props} renderText={renderAutomationText} />;
}
