// Automations v1 — the ui-kit AutomationPanel wired to the SHARED chat
// rendering. ui-kit cannot import panel-chat (panel-chat depends on ui-kit),
// so the panel takes two seams; this module is the one pairing hosts use:
// - `renderTurn`: each occurrence turn (the trigger's message, the run's
//   answer) is a `ChatMessageCard`, so an automation's transcript reads
//   exactly like a chat (same card, header, copy button, content renderer);
// - `renderText`: every other text (wait prompts, notify and attention
//   bodies, the definition's task) goes through `ChatMessageContent` (JSON
//   autodetect + Markdown with tables and code).
// Remote images are links everywhere: automation text is model- or
// workflow-written, never the user's own.
import React from "react";
import { AutomationPanel, type AutomationPanelProps, type AutomationTurn } from "@abstractframework/ui-kit";
import { ChatMessageCard } from "./chat_message_card.js";
import { ChatMessageContent } from "./message_content.js";

/** The chat's renderer for automation text (prompts, bodies). */
export function renderAutomationText(text: string): React.ReactElement {
  return <ChatMessageContent text={text} images="link" />;
}

/** Speaker shown on each turn's card: the trigger sent the message; the automation answered. */
export const AUTOMATION_TURN_TITLES: Record<AutomationTurn["kind"], string> = { trigger: "Trigger", answer: "Automation" };

/** One occurrence turn as the shared chat card. */
export function renderAutomationTurn(turn: AutomationTurn): React.ReactElement {
  return (
    <ChatMessageCard
      message={{ id: `${turn.runId}:${turn.kind}`, role: turn.role, content: turn.text, title: AUTOMATION_TURN_TITLES[turn.kind], runId: turn.runId }}
      images="link"
    />
  );
}

/** Spread into `AutomationPanel`: `<AutomationPanel {...automationRenderers} … />`. */
export const automationRenderers: {
  renderText: (text: string) => React.ReactElement;
  renderTurn: (turn: AutomationTurn) => React.ReactElement;
} = { renderText: renderAutomationText, renderTurn: renderAutomationTurn };

export type AutomationPanelWithMarkdownProps = Omit<AutomationPanelProps, "renderText" | "renderTurn">;

/** `AutomationPanel` with the shared chat rendering already wired. */
export function AutomationPanelWithMarkdown(props: AutomationPanelWithMarkdownProps): React.ReactElement {
  return <AutomationPanel {...props} {...automationRenderers} />;
}
