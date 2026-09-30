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
- weight: the label turns semibold (600, the ceiling of the label type scale) and brighter.

Unavailable switches have a dashed, hatched track and muted text. On touch screens the control is
at least 44 px in both directions, `af-switch--sm` included. Under `prefers-reduced-motion: reduce`
the track and thumb do not animate, and forced-colours mode uses system colours.

## Unavailable reasons

Use these sentences word for word, as `unavailableReason` (web) or after the em dash (terminal):

| Where | Reason |
|---|---|
| Agent email tools, no mailbox yet | Connect a mailbox first. |
| Agent email tools, admin switched mailboxes off | Your admin turned mailboxes off. |
| Agent email tools, admin switched agent email tools off | Your admin turned agent email tools off. |
| Notifications (Job failed, Approval needed), no mailbox yet | Connect a mailbox first. |
| Users table, Active switch on your own row | You can't deactivate your own account. |
| A feature a plain-http page cannot use | This page is loaded over http, so the microphone is unavailable — open it over https or on the gateway's own computer. |

The last sentence swaps the feature ("the camera", "copying to the clipboard");
`insecureContextReason(feature)` returns it when the page is not a secure context and `null`
otherwise.

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

## Type scale guard

Labels, switch labels and field captions sit at body size: 14 to 15 px, weight 500 (600 for an on
switch). `checkLabelScale(root)` runs in the browser and returns every rendered `label`,
`.af-switch__label`, `.af-form__label`, `.af-gateway-signin__label`,
`.af-gateway-signin__checkbox`, `.af-field-caption` or `[data-af-caption]` whose computed
font-size is above 15 px or whose weight is above 600. A Playwright test renders a settings panel,
injects it and expects an empty list:

```js
const hits = await page.evaluate(() => window.checkLabelScale(document).map((h) => h.selector));
expect(hits).toEqual([]);
```

Options: `maxFontSizePx`, `maxWeight`, `selector`, `includeHidden`. Run it with
`findVerbToggleLabels` over the same surface's sources.

## Sign-in card

The `af-gateway-signin` block of `theme.css` (between `af-gateway-signin:begin` and
`af-gateway-signin:end`) styles the gateway console's sign-in page and the apps'
`GatewayConnectModal`. One column, labels above fields, at most 480 px wide and centred.

```html
<section class="af-gateway-signin">
  <div class="af-gateway-signin__hero"><div>
    <div class="af-gateway-signin__kicker">AbstractGateway Console</div>
    <h2>Sign in</h2><p>Use the token your gateway admin gave you.</p>
  </div></div>
  <div class="af-gateway-signin__status-row">
    <span class="af-gateway-signin__status af-gateway-signin__status--neutral">Not signed in</span>
  </div>
  <form class="af-gateway-signin__form">
    <div class="af-gateway-signin__field">
      <label class="af-gateway-signin__label" for="login-user">Gateway user</label>
      <input id="login-user" value="admin">
    </div>
    <div class="af-gateway-signin__field">
      <label class="af-gateway-signin__label" for="login-token">Token</label>
      <div class="af-gateway-signin__token-input">
        <input id="login-token" type="password"><button type="button" aria-label="Show token">Show</button>
      </div>
      <p class="af-gateway-signin__field-error" role="alert" hidden>This token was refused.</p>
    </div>
    <div class="af-gateway-signin__submit-row">
      <label class="af-gateway-signin__checkbox"><input type="checkbox"> Remember this browser</label>
      <button class="af-gateway-signin__primary" type="submit">Sign in</button>
    </div>
  </form>
  <div class="af-gateway-signin__recovery">
    <button type="button" class="af-gateway-signin__link">Forgot your token? Email me a sign-in code</button>
  </div>
  <div class="af-gateway-signin__code" hidden>
    <p class="af-gateway-signin__message af-gateway-signin__message--ok" role="status">A sign-in code is on its way to l•••@•••. It expires in 10 minutes.</p>
    <div class="af-gateway-signin__field">
      <label class="af-gateway-signin__label" for="code">Code from the email</label>
      <input id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="8">
    </div>
    <div class="af-gateway-signin__code-actions">
      <button type="button" class="af-gateway-signin__link" disabled>Send a new code (in 24 s)</button>
      <button type="button" class="af-gateway-signin__primary" disabled>Use code</button>
    </div>
    <button type="button" class="af-gateway-signin__link af-gateway-signin__back">Back to token</button>
  </div>
</section>
```

| Class | Role |
|---|---|
| `__status--neutral` / `--ok` / `--warn` | The one status pill ("Not signed in" / "Signed in as admin" / "Token refused"). `--err` stays for older callers. |
| `__field` | A label and its field (plus an optional `__field-error`). |
| `__token-input > button` | The Show/Hide button, drawn inside the field. |
| `__checkbox` | A plain checkbox row at body size. |
| `__submit-row` | Checkbox on the left, primary button on the right. |
| `__link` | The quiet text link. `aria-busy="true"` shows a spinner beside the host's "Sending…" text; `disabled` is the cooldown look. |
| `__recovery` | Holds the recovery link below the form. |
| `__code`, `__code-actions`, `__back` | The code step: message, code field, "Send a new code" + "Use code", "Back to token". |
| `__message`, `__message--ok`, `__message--error`, `__field-error` | Inline messages at body size; the ok message is plain text, not green. |

`[hidden]` always hides a step inside the card. Below about 360 px of card width the submit and
code rows stack and the primary button spans the row.

## Forms, cards and tabs

| Class | Role |
|---|---|
| `af-form` | A settings form: column of fields, at most 720 px (`--form-max`). |
| `af-form__field`, `af-form__label` | Label above its field, body size, weight 500. |
| `af-form__help`, `af-form__error` | Muted small helper text; inline error at body size. |
| `af-form__grid-2` | Two short fields side by side (port + security, per hour + per day); one column below 768 px. |
| `af-form__inline` | A field with its own action (the Email address row's "Save"). |
| `af-form__actions` | Right-aligned action row. |
| `af-card`, `af-card__header`, `af-card__title`, `af-card__desc` | A grouped card with its heading. |
| `af-tabs`, `af-tabs__list`, `af-tabs__tab`, `af-tabs__panel` | Underlined tabs; 44 px on touch. |

`AfTabs` renders the tabs in React (`tabs`, `value`, `onChange`, `ariaLabel`, `idBase`,
`children` = the selected panel): `role="tablist"` / `tab` / `tabpanel`, one tab in the tab order,
Left/Right (and Up/Down) move and select, Home/End jump, and a tab with `unavailableReason` is
skipped and shows the reason on hover. `afTabsNextIndex(tabs, current, key)` is the same rule for
consoles that render the markup themselves.

## Non-secure contexts

Over plain http from another machine, browsers withhold `crypto.randomUUID`, the microphone, the
camera and clipboard reads. `randomId()` returns a v4 UUID in every context: `crypto.randomUUID`
when it exists, otherwise one built from `crypto.getRandomValues`. The kit's own ids (automation
commands, steering) use it; call it instead of `crypto.randomUUID`. When a feature cannot work,
show `insecureContextReason(feature)` once, as the control's unavailable reason.

## Related

- [Responsive layout](./responsive.md): touch sizes and breakpoints the switch follows.
- [Theming](./theming.md): the tokens the switch reads (`--accent`, `--text-muted`, `--bg-primary`).
- [Console islands](./console-islands.md): how the gateway console receives the kit's CSS.
