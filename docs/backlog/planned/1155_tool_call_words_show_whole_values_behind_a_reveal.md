# 1155 — Tool-call descriptions show whole URLs and arguments behind a reveal, never a silent cut

> Package: AbstractUIC panel-chat (`src/tool_call_words.js:53,195,200,207` and the components that render tool-call lines), ui-kit if the reveal control is shared
> Type: defect (root ADR 0053 §2: nothing truncated without an explicit "…" reveal; ADR 0054 for stored text)
> Status: planned
> Created: 2026-11-08 (found by the adversarial review of the Observer Board redesign, untracked/observer-board/REVIEW-1.md)
> Priority: P1
> Labels: panel-chat, tool-calls, truncation

## Summary

`tool_call_words.js` shortens URLs and arguments when it builds the one-line description of a tool call
("Fetch the page fda.gov/news-events/…/fda-grants-…"), and nothing offers the whole value: the record holds the full
466-character arguments, the line shows a cut, Observer's "Read the whole request" inherited the cut. The operator's
rule: a screen may fold, but only with an explicit "…" control that reveals the rest; what is recorded is what the
reader can reach.

## Scope

- The description line may stay short, but the whole URL/arguments are reachable in place: the kit's reveal control
  ("…" → full text, or hover/expand), with the full value also available to consumers (`fullText` beside `text` in
  the words object, so Observer/Code/Assistant can show it in their own detail views).
- No regex "smartening" of the model's text beyond the existing URL shortening rule; the shortening itself becomes a
  display choice the consumer can turn off (`shorten: false`).
- Tests: a 466-char argument renders a short line AND exposes the whole text; removing the reveal turns the test red.
- Consumers: Observer (board request line), Code (Activity tool lines), Assistant web (tool cards) take `fullText`
  at their next kit bump.

## Release

Next release (operator 2026-11-08 14:00: credits; the stored halves are done, this is the display reveal).
