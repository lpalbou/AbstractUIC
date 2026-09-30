# On/Off Settings (AfSwitch)

This page explains how every AbstractFramework surface shows a setting that is either on or off:
one switch, labelled by the feature, highlighted when on. It covers the React component, the markup
the Python-served consoles copy, the terminal convention and the check that keeps verb toggles out.

## The rule

- A persistent on/off setting is a **switch labelled by the feature**: "Email", "Agent email
  tools", "Start at login", "Job failed". Its position shows the state.
- The label never names an action. "Turn on", "Email off", "Agent tools on", "Enable X" and
  "Pause" / "Resume" swaps are not used for a setting: a label that says what a click would do reads
  as the current state half the time.
- A setting that cannot change right now (agent email tools while no mailbox is connected, a
  capability the administrator has not made available) is shown **unavailable**: still visible,
  still focusable, with the reason as text and on hover.
- One-shot actions (Rotate, Delete, Disconnect, Restart, Check for updates, Run now) stay ordinary
  buttons.
- A confirmation message describes the new state: "Email is on for admin."

## React: `AfSwitch`

```tsx
import { AfSwitch } from "@abstractframework/ui-kit";

<AfSwitch
  label="Agent email tools"
  description="Let your agents list, read and send mail. Off by default."
  variant="row"
  checked={status.agent_tools}
  unavailableReason={status.connected ? null : "Connect a mailbox first."}
  busy={saving}
  onChange={(next) => save({ agent_tools: next })}
/>
```

| Prop | Meaning |
|---|---|
| `label` | The feature name. Never a verb phrase. |
| `checked` | The current state. |
| `onChange(next)` | Called with the requested state; not called while unavailable or busy. |
| `description` | One line under the label (settings rows). |
| `hint` | Tooltip and `aria-description` when there is no visible description. |
| `unavailableReason` | A non-empty reason makes the switch unavailable (`aria-disabled`, reason via `aria-describedby`). |
| `reasonVisible` | `false` keeps the reason for hover and assistive technology only. |
| `describedBy` | The id of a reason the page already shows (a table cell, a shared line); the switch renders none of its own. |
| `busy` | A save is in flight: the state stays as it is and clicks are ignored. |
| `variant` | `inline` (default), `row` (text left, switch right, full width) or `sm` (table rows). |
| `action` | `data-action` on the button. |

`afSwitchNextState(props)` returns the state a click requests, or `null` when it must be ignored.

## Markup for the consoles

The AbstractGateway and AbstractCore consoles are HTML served from Python. They render the same
markup and receive the CSS verbatim from `ui-kit/src/theme.css` (the block between
`af-switch:begin` and `af-switch:end`):

```html
<button type="button" role="switch" class="af-switch" aria-checked="true">
  <span class="af-switch__track" aria-hidden="true"><span class="af-switch__thumb"></span></span>
  <span class="af-switch__text"><span class="af-switch__label">Email</span></span>
</button>
```

Unavailable: add `aria-disabled="true"` and `aria-describedby="<id>"` pointing at a
`<span class="af-switch__reason" id="<id>">` with the reason, and ignore the click. Do not use the
`disabled` attribute: a disabled button cannot take focus, so the reason would be unreachable from
the keyboard.

## How "on" is shown

The state reads without colour and in every theme:

- position and shape: the thumb slides right and shows a check mark;
- colour and light: the track fills with the accent and glows;
- weight: the label turns bold.

Unavailable switches have a dashed, hatched track and muted text. On touch screens the control is
at least 44 px tall. Motion follows `prefers-reduced-motion`, and forced-colours mode uses system
colours.

## Terminal clients

The terminal consoles use one marker, followed by the feature name:

| State | Marker |
|---|---|
| On | `[x] Email`, highlighted (accent, bold) |
| Off | `[ ] Email`, plain |
| Unavailable | `[-] Agent email tools — connect a mailbox first`, dimmed |

The key hint says what the key does to the selected row ("space: switch"), never "turn on/off".

## The guard

`findVerbToggleLabels(source)` (exported by the kit) finds conditional labels that swap only an
on/off verb: `mailOn ? "Email off" : "Email on"`, `enabled ? "Disable" : "Enable"`,
`paused ? "Resume" : "Pause"`. State sentences ("Email is on for admin.") and single state words
pass. `ui-kit/scripts/check_state_toggles.mjs` runs it over the kit's sources and checks the
component's markup and CSS; apps run it over their own `src` in their test gate. A genuine one-shot
action that flips (pausing a running run) opts out on the same line with
`// state-toggle-lint: allow <reason>`.

## Related

- [Responsive layout](./responsive.md): touch sizes and breakpoints the switch follows.
- [Theming](./theming.md): the tokens the switch reads (`--accent`, `--text-muted`, `--bg-primary`).
- [Console islands](./console-islands.md): how the gateway console receives the kit's CSS.
