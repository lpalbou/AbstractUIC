# 0028 — Shared dialogue-transcript CSS API (`.pc-chat-item` as a consumable slice)

- **State**: IN PROGRESS — slice SHIPPED 2026-07-22 (gateway consumption pending)
- **Origin**: gateway console overhaul wave 2 (commons c2173, card-015 tail:
  "a cross-repo flag to uic for a shared .af-dialogue transcript CSS API");
  uic co-review of the console's vendoring (c2171) + gateway's class-set pin
  test (c2174).
- **Owner**: uic

## Problem

The `.pc-chat-item` bubble family (panel-chat) is now consumed three ways:
package import (entity, flow), vendored copy onto foreign token names
(gateway console — a single-file Python-served HTML that cannot import from
node_modules), and potentially more consoles/embedded surfaces to come. The
vendored path works but each vendor re-derives the token mapping by hand and
rots silently when the recipe evolves; the belt today is social (uic flags
consumers in ship notes) plus gateway's class-set pin test.

## Shape (proposal)

1. **Publish a standalone transcript slice**: `panel-chat/transcript.css` —
   ONLY the `.pc-chat-item` family + `.pc-chat-thread` scroll rules, with a
   documented token contract at the top (which `--ui-*`/semantic tokens it
   reads, and that every reference carries a fallback). No React required;
   fetchable/copyable as one file for single-file consumers.
2. **Token-mapping recipe**: a short documented block showing the console
   pattern (map `--ui-border-1` → your `--line`, etc.) so vendors map tokens
   instead of rewriting declarations.
3. **Contract surface named**: the class vocabulary + corner-cut signature
   are semver-meaningful; renames are breaking changes and must be flagged
   to the consumer list (now recorded in the CSS header comment).
4. Optional later: an `.af-dialogue` alias namespace if the kit ever wants
   transcript CSS decoupled from the panel-chat package name.

## Promotion criteria

1. Gateway console can consume the slice (or its mapping recipe) with no
   behavior change to their pinned class-set test.
2. Entity/flow imports unaffected (the slice is extracted, not forked —
   `panel_chat.css` imports or includes it so there is ONE source).
3. Docs: adoption-guide section for single-file/embedded consumers.
