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
// Card chrome (spec F, `turnChrome="card"`, set by `AutomationPanelWithMarkdown`): each turn IS the
// shared chat message — its stamp in the card (the reader's locale), the speaker when the host has
// a voice output, copy, markdown, the person's files as the card's chips (the trigger's from the
// run's inputs, the answer's from the run's `artifacts`), and a run in progress as the card's own
// working state with the live line in its footer.
import React, { useContext, useEffect, useMemo, useState } from "react";
import {
  AUTOMATION_EDIT_WORDS,
  AutomationLiveLine,
  AutomationPanel,
  automationLiveWords,
  gatewayApiPath,
  type AfGatewayFetch,
  type AutomationPanelProps,
  type AutomationTurn,
  type GatewayResource,
} from "@abstractframework/ui-kit";
import { ChatMessageCard, type ChatMessage, type ChatMessageCardProps } from "./chat_message_card.js";
import { ChatMessageContent } from "./message_content.js";
import { ArtifactFetchContext, boundedArtifactFetch, submittedArtifacts, type MessageArtifact } from "./message_artifacts.js";
import { RunContextDialog, type RunContextReader, type RunContextTarget } from "./run_context.js";
import { gatewayResponseError, openGatewayResource, type GatewayFetch } from "./workspace_browser.js";

/** The chat's renderer for automation text (prompts, bodies). */
export function renderAutomationText(text: string): React.ReactElement {
  return <ChatMessageContent text={text} images="link" />;
}

/** Speaker shown on each turn's card: the trigger sent the message; the automation answered. */
export const AUTOMATION_TURN_TITLES: Record<AutomationTurn["kind"], string> = { trigger: "Trigger", answer: "Automation" };

/** One occurrence turn as the shared chat card. A turn with card chrome (`turn.chrome === "card"`)
 * also carries its time, files and working state into the card (`AutomationTurnCard`). */
export function renderAutomationTurn(turn: AutomationTurn, messageProps?: Omit<ChatMessageCardProps, "message">): React.ReactElement {
  if (turn.chrome === "card") return <AutomationTurnCard turn={turn} messageProps={messageProps} />;
  return (
    <ChatMessageCard
      {...messageProps}
      message={{ id: `${turn.runId}:${turn.kind}`, role: turn.role, content: turn.text, title: AUTOMATION_TURN_TITLES[turn.kind], runId: turn.runId }}
      images="link"
    />
  );
}

// The files a run was handed (its `input_data`, by the chat's own rule `submittedArtifacts`), read
// once per run and per credentialed transport: the trigger's card shows them, the answer's card
// leaves them out (the run's `artifacts` may list them too).
const RUN_INPUT_FILES = new WeakMap<AfGatewayFetch, Map<string, Promise<MessageArtifact[]>>>();

export function runInputFiles(fetchGateway: AfGatewayFetch, runId: string): Promise<MessageArtifact[]> {
  let byRun = RUN_INPUT_FILES.get(fetchGateway);
  if (!byRun) RUN_INPUT_FILES.set(fetchGateway, (byRun = new Map()));
  const known = byRun.get(runId);
  if (known) return known;
  const read = fetchGateway(gatewayApiPath(`runs/${encodeURIComponent(runId)}/input_data`)).then(async (r) => {
    if (!r.ok) throw await gatewayResponseError(r, "The run's attachments could not be checked");
    return submittedArtifacts(await r.json(), runId);
  });
  read.catch(() => byRun!.delete(runId));
  byRun.set(runId, read);
  return read;
}

type InputFiles = { status: "none" | "loading" | "ready" | "failed"; files: MessageArtifact[]; error: string };

function useRunInputFiles(fetchGateway: AfGatewayFetch | undefined, runId: string): InputFiles {
  const [state, setState] = useState<InputFiles>({ status: fetchGateway ? "loading" : "none", files: [], error: "" });
  useEffect(() => {
    if (!fetchGateway) {
      setState({ status: "none", files: [], error: "" });
      return;
    }
    let alive = true;
    setState((s) => (s.status === "ready" ? s : { status: "loading", files: [], error: "" }));
    runInputFiles(fetchGateway, runId).then(
      (files) => alive && setState({ status: "ready", files, error: "" }),
      (e: unknown) => alive && setState({ status: "failed", files: [], error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      alive = false;
    };
  }, [fetchGateway, runId]);
  return state;
}

/** The chat message a card-chrome turn is (pure: the checks map every case). `inputs` = the run's handed files. */
export function automationTurnMessage(turn: AutomationTurn, inputs: InputFiles): ChatMessage {
  const message: ChatMessage = { id: `${turn.runId}:${turn.kind}`, role: turn.role, content: turn.text, title: AUTOMATION_TURN_TITLES[turn.kind], runId: turn.runId };
  if (turn.ts) message.ts = turn.ts;
  if (turn.live) message.live = { callId: `${turn.runId}:live`, reasoning: "", label: AUTOMATION_EDIT_WORDS.run.working };
  let files: MessageArtifact[] = [];
  if (turn.kind === "trigger") files = inputs.status === "ready" ? inputs.files : [];
  else if (inputs.status !== "loading") {
    const handed = new Set(inputs.status === "ready" ? inputs.files.map((f) => f.id) : []);
    // An older gateway names a file it cannot name by its storage id: no name then (the chip reads
    // the artifact's own name from its metadata, and hides storage offloads).
    files = (turn.artifacts ?? [])
      .filter((a) => !handed.has(a.artifact_id))
      .map((a) => ({ id: a.artifact_id, runId: turn.runId, ...(a.name && a.name !== a.artifact_id ? { name: a.name } : {}) }));
  }
  if (files.length) message.artifactRefs = files;
  return message;
}

/** A card-chrome turn: the shared card with its stamp, files, and (a run in progress) its working state + live line. */
export function AutomationTurnCard(props: { turn: AutomationTurn; messageProps?: Omit<ChatMessageCardProps, "message"> }): React.ReactElement {
  const { turn, messageProps } = props;
  const fetchGateway = useContext(ArtifactFetchContext);
  const inputs = useRunInputFiles(fetchGateway, turn.runId);
  const message = useMemo(() => automationTurnMessage(turn, inputs), [turn, inputs]);
  const hostFooter = messageProps?.renderFooter;
  const live = turn.live;
  const renderFooter = (m: ChatMessage): React.ReactNode => {
    const own = hostFooter ? hostFooter(m) : null;
    const line = live && automationLiveWords(live.current) ? <AutomationLiveLine current={live.current} {...(live.nowMs !== undefined ? { nowMs: live.nowMs } : {})} /> : null;
    const failed = turn.kind === "trigger" && inputs.status === "failed" ? (
      <p role="status" className="pc-message-artifact__error">
        {inputs.error}
      </p>
    ) : null;
    return line || failed || own ? (
      <>
        {line}
        {failed}
        {own}
      </>
    ) : null;
  };
  return <ChatMessageCard {...messageProps} message={message} renderFooter={renderFooter} images="link" />;
}

/** Spread into `AutomationPanel`: `<AutomationPanel {...automationRenderers} … />`. */
export const automationRenderers: {
  renderText: (text: string) => React.ReactElement;
  renderTurn: (turn: AutomationTurn) => React.ReactElement;
} = { renderText: renderAutomationText, renderTurn: renderAutomationTurn };

export type AutomationPanelWithMarkdownProps = Omit<AutomationPanelProps, "renderText" | "renderTurn" | "turnChrome"> & {
  /**
   * The host's credentialed gateway request. When given (and `onOpenResource`
   * is not), the ledger JSON and artifact links open through it
   * (`openGatewayResource`), and the cards' file chips read the files through
   * it (`ArtifactFetchContext`); without it the chips show names only.
   */
  fetchGateway?: GatewayFetch;
  /**
   * Shared chat affordances on every turn's card — the host's voice output
   * (`onSpeakToggle` + `getSpeakState`: the speaker on each answer), the same
   * props the host passes to its chat.
   */
  messageProps?: Omit<ChatMessageCardProps, "message">;
  /** Drawn under a run's answer card, in the run's frame (Observer: "After the run"). */
  answerFooter?: (turn: AutomationTurn) => React.ReactNode;
  /**
   * What a run was given (`GET runs/{id}/input_data` and `GET runs/{id}`): each run line gains the
   * Context button, opening `RunContextDialog` (the panel's `onOpenContext` wins when both are given).
   */
  readRunContext?: RunContextReader;
};

/**
 * `AutomationPanel` with the shared chat rendering wired, in card chrome (`turnChrome="card"`): every
 * turn is the shared chat card with its stamp, the host's voice props, copy, files and working state.
 * Hosts mount THIS, not the bare panel.
 */
export function AutomationPanelWithMarkdown(props: AutomationPanelWithMarkdownProps): React.ReactElement {
  const { fetchGateway, messageProps, answerFooter, readRunContext, ...rest } = props;
  const onOpenResource =
    rest.onOpenResource ?? (fetchGateway ? (r: GatewayResource) => openGatewayResource(fetchGateway, r.url, { name: r.name }) : undefined);
  // One bounded transport per connection: the chips and the inputs reads queue behind it.
  const artifactFetch = useMemo(() => (fetchGateway ? boundedArtifactFetch(fetchGateway) : undefined), [fetchGateway]);
  const [contextOf, setContextOf] = useState<RunContextTarget | null>(null);
  const occurrences = rest.occurrences;
  const onOpenContext =
    rest.onOpenContext ??
    (readRunContext
      ? (run: { runId: string; index: number }) => {
          const row = occurrences.find((o) => o.run_id === run.runId);
          if (!row) throw new Error(`Context: run ${run.runId} is not among this automation's runs`);
          setContextOf({ run_id: run.runId, index: run.index, user_turn: row.user_turn });
        }
      : undefined);
  const renderTurn = (turn: AutomationTurn): React.ReactNode =>
    turn.kind === "answer" && answerFooter ? (
      <>
        {renderAutomationTurn(turn, messageProps)}
        {answerFooter(turn)}
      </>
    ) : (
      renderAutomationTurn(turn, messageProps)
    );
  return (
    <ArtifactFetchContext.Provider value={artifactFetch}>
      <AutomationPanel
        {...rest}
        onOpenResource={onOpenResource}
        renderText={renderAutomationText}
        renderTurn={renderTurn}
        turnChrome="card"
        {...(onOpenContext ? { onOpenContext } : {})}
      />
      {readRunContext && !rest.onOpenContext ? (
        <RunContextDialog target={contextOf} read={readRunContext} onClose={() => setContextOf(null)} runIndex={(id) => occurrences.find((o) => o.run_id === id)?.index} />
      ) : null}
    </ArtifactFetchContext.Provider>
  );
}
