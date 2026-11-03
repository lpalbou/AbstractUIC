# Proposed: approval card — a visible cue when its context overflows on short views

## Metadata
- Created: 2026-11-03
- Status: Proposed
- Area: panel-chat (`workflow_interaction.tsx` public approval body; `panel_chat.css` `.pc-public-approval__context` and the Avatar view's `.pc-avatar-conversation__request`)
- Found by: adversarial review of AbstractUIC 0.10.1, finding U1 (`untracked/council-2026-11-02/review-uic-56.md`, "uxreview on the card")

## Summary
Since panel-chat 0.8.1 the Avatar view's open question or approval keeps its heading and its buttons on screen at every
height. On a short view its context (why, targets, scope note) scrolls inside a bounded region. At 400×700 under an
app's bars (230 px) the card shows the heading "May I read these 2 webpages?", the why, the **first** target and the
three buttons. The second target is reachable only by scrolling that region, and nothing on screen says it exists: no
scrollbar is drawn (overlay scrollbars), no fade, no "1 more". A person who reads only what is shown approves two
pages having seen one. The heading carries the count, but the evidence for it is hidden.

Keep the structure: the buttons stay visible, and the evidence comes before the decision. Making the buttons the
scrolling part instead would put the decision before the evidence. Add a visible overflow cue to the bounded context
whenever it overflows, in one of two forms:
- a persistent scroll affordance (an edge fade plus a visible scrollbar or a "Scroll for more" cue) on
  `.pc-public-approval__context` while content remains below; or
- an "N more" line naming the hidden targets (for example "1 more page below"), which reveals them when chosen.

## Evidence
- Review: `untracked/council-2026-11-02/review-uic-56.md`, the 400×700 case of "uxreview on the card" (U1, LOW/MEDIUM UX,
  non-blocking for 0.10.1).
- Screenshot: `untracked/release-2026-11-03/w5-uic-0.10.1/kit-approval-after-400x700.png` (kit harness, 400×700 under
  230 px of host chrome: the second URL is below the context's edge with no cue).
- Today's check: `panel-chat/scripts/check_avatar_requests_browser.mjs`, viewport `{width:400,height:700,chrome:230,tight:true}`.
  It asserts reachability only: the last target becomes visible after `scrollIntoViewIfNeeded`, and the buttons stay
  visible.

## Done when
- At 400×700 (and any size where the context overflows), the card shows a visible, theme-correct cue that more
  content is below, or an "N more" line that counts the hidden targets. Nothing shows when everything fits
  (1440×960, 1000×650 with both targets visible).
- `check_avatar_requests_browser.mjs` asserts **discoverability, not just reachability**: in the tight case, without
  scrolling, the cue (or the "N more" line naming the hidden count) is visible; in the roomy cases it is absent.
  Removing the cue turns the check red.
- The cue is announced to assistive technology, or the hidden targets stay in the accessible name or description, so a
  screen-reader user hears every target.
- Screenshots at 400×700, 1000×650 and 1440×960 (dark and light) in the PR.

## Non-goals
- Changing what is pinned (the heading and buttons stay visible; the card stays capped to the view).
- Truncating or summarizing targets: every target remains readable in full.
