# Icons

`@abstractframework/ui-kit` ships one monochrome icon set for every AbstractFramework client: the
`Icon` component draws a named glyph in the current text colour (`currentColor`), so it follows
the active theme with no extra CSS.

```tsx
import { Icon, ICON_NAMES, type IconName } from "@abstractframework/ui-kit";

<Icon name="database" size={16} />          // decorative: aria-hidden
<Icon name="lock" size={16} title="Locked" /> // meaningful: role="img" with a <title>
```

- `name: IconName`: one of the names below. `size` (default 16) sets width and height in px.
  `title` makes the icon an image with an accessible name; without it the icon is hidden from
  assistive technology (put the name on the button instead, `aria-label`).
- `ICON_NAMES`: every name, in declaration order. Use it in a test to prove your own mapping only
  names icons that exist (AbstractFlow checks every node type this way).

## Contact sheet

Generated from the compiled package by `ui-kit/scripts/generate_icon_sheet.mjs`; the kit test
fails when a sheet is stale.

![Every kit icon, light theme](assets/icons-light.svg)

![Every kit icon, dark theme](assets/icons-dark.svg)

## Style

- **24-grid family** (most icons): `viewBox="0 0 24 24"`, stroke 2, round caps and joins, no
  fill. A solid part (a pupil, a dot, a filled twin) is a per-path `fill="currentColor"
  stroke="none"`.
- **16-grid family** (`board`, `inbox`, `server`, `agent`, `playCircle`, `list`, `gear`):
  `viewBox="0 0 16 16"`, stroke 1.4, kept verbatim from AbstractContinuum's navigation.
- Names are camelCase (`zoomOut`, `fitView`, `chevronDown`).

## Names

| Name | Grid | Typical use |
| --- | --- | --- |
| `chat` | 24 | Conversation, ask the user |
| `plus` | 24 | Add, new |
| `history` | 24 | Past runs, recall |
| `refresh` | 24 | Reload |
| `settings` | 24 | Settings (sliders) |
| `user` | 24 | Person, account |
| `bot` | 24 | Assistant |
| `paperclip` | 24 | Attach, artifact |
| `mic` | 24 | Record, transcribe |
| `speaker` | 24 | Read aloud, voice |
| `pause` | 24 | Pause (solid) |
| `terminal` | 24 | Command, code, tool call |
| `edit` | 24 | Edit |
| `download` | 24 | Download, import |
| `loader` | 24 | Busy (spin it with CSS) |
| `info` | 24 | Information |
| `warning` | 24 | Warning |
| `error` | 24 | Error |
| `copy` | 24 | Copy |
| `check` | 24 | Done, confirm |
| `x` | 24 | Close, remove |
| `chevronDown` | 24 | Expanded section |
| `chevronRight` | 24 | Collapsed section |
| `trash` | 24 | Delete |
| `send` | 24 | Send |
| `thumbsUp` | 24 | Vouch |
| `thumbsDown` | 24 | Flag |
| `thumbsUpFilled` | 24 | Vouch, pressed |
| `thumbsDownFilled` | 24 | Flag, pressed |
| `board` | 16 | Board, subflow |
| `inbox` | 16 | Inbox, incoming event |
| `server` | 16 | Server, provider |
| `agent` | 16 | Agent |
| `playCircle` | 16 | Start |
| `list` | 16 | List |
| `gear` | 16 | Settings (small) |
| `sparkle` | 24 | Generate, model call |
| `contrast` | 24 | Appearance |
| `logout` | 24 | Sign out |
| `play` | 24 | Run, active (solid) |
| `stop` | 24 | Stop, end (solid) |
| `folder` | 24 | Folder, workspace |
| `file` | 24 | File |
| `archive` | 24 | Archive |
| `unarchive` | 24 | Unarchive |
| `wrench` | 24 | Tool calls |
| `clock` | 24 | Time, schedule |
| `cog` | 24 | Settings (cog) |
| `activity` | 24 | Activity |
| `book` | 24 | Docs |
| `compose` | 24 | New conversation, write |
| `image` | 24 | Image (generate, edit, upscale) |
| `video` | 24 | Video |
| `camera` | 24 | Camera |
| `music` | 24 | Music |
| `database` | 24 | Stored memory, data store |
| `branch` | 24 | If / switch (one path in, several out) |
| `loop` | 24 | Loop, for, while |
| `variable` | 24 | Variable |
| `minus` | 24 | Subtract, zoom-out button without a magnifier |
| `divide` | 24 | Divide |
| `function` | 24 | Function, math operation |
| `zoomIn` | 24 | Zoom in |
| `zoomOut` | 24 | Zoom out |
| `fitView` | 24 | Fit everything in view |
| `lock` | 24 | Lock |
| `about` | 24 | About this app (the top bar's About button; a typographic "i" whose dot is wider than the stroke, in the same r 9 ring as `contrast`) |

## Adding an icon

1. Add the name to the `IconName` union and to `ICON_NAMES` in `ui-kit/src/icon.tsx` (the build
   fails when a union name is missing from `ICON_NAMES`), and draw it in `paths()` on the 24-grid.
2. Add its row to the table above.
3. `npm run build -w @abstractframework/ui-kit && node ui-kit/scripts/generate_icon_sheet.mjs`
   to regenerate the contact sheets.
4. `npm test -w @abstractframework/ui-kit`: `check_icons.mjs` renders every name and compares
   the union, `ICON_NAMES` and this table.

## Brand marks

The engines and cloud providers that the provider cards name are shown with the brand's own mark (`BrandMark`, or
`brandMarkHtml(id)` for hosts that build HTML as strings), inlined in `ui-kit/src/brand_icons.tsx`: no page fetches
a logo from anywhere. Each mark is drawn in its own colours on a light tile in every theme, because several brands
forbid recolouring. The source rules, in order: the brand's own official artwork to identify the configured product; else the [Simple Icons](https://simpleicons.org) SVG (CC0 path data); else a readable text
badge. Trademarks belong to their owners; a mark identifies the product a card configures and implies no
endorsement, and the marks are not covered by the kit's MIT licence (OpenAI's is used under OpenAI's own Marks usage terms). `ui-kit/scripts/check_brand_icons.mjs` fails when a card id has neither a mark nor a documented fallback,
when a mark lacks its source, licence or date, or when a mark could reach outside itself.

| Id | Brand | Shown as | Origin | Source file | Licence or terms | Retrieved |
| --- | --- | --- | --- | --- | --- | --- |
| `ollama` | Ollama | name badge "Ollama" (backlog 1100) | brand | <https://raw.githubusercontent.com/ollama/ollama/main/docs/ollama-logo.svg> | File is in the MIT-licensed ollama/ollama repo (Copyright (c) Ollama); MIT covers copyright only. Trademark of Ollama. [Terms](https://ollama.com/terms). Ollama ToS: "These Terms do not grant you any rights to use our branding without permission." No published brand guidelines; no recolour rule. | 2026-10-29 |
| `lmstudio` | LM Studio | logo | Simple Icons | <https://cdn.jsdelivr.net/npm/simple-icons@16.35.0/icons/lmstudio.svg> | CC0-1.0 (Simple Icons path data); icon contributed to Simple Icons by the LM Studio team (PRs simple-icons#14717, #14905); byte-identical to https://files.lmstudio.ai/lmstudio_icon2.svg. Trademark of Element Labs, Inc. [Terms](https://lmstudio.ai/brand). Brand page: "Do not recolor the logo or create unapproved color combinations." and "The permission we grant to you is non-exclusive and non-transferable." Identification is allowed: "Use LM Studio logo when referring to LM Studio". Simple Icons draws the path without a colour; it is filled with Simple Icons' recorded brand hex #000000 (black), the logo's own colour. | 2026-10-29 |
| `vllm` | vLLM | logo | Simple Icons | <https://cdn.jsdelivr.net/npm/simple-icons@16.35.0/icons/vllm.svg> | CC0-1.0 (Simple Icons path data); traced from vllm-project/media-kit vLLM-Logo.svg @79b2ea5. Trademark of the vLLM project. [Terms](https://github.com/vllm-project/media-kit). media-kit README: "Don't modify or distort the logo proportions"; "Use the appropriate version for your background (light/dark)". No explicit recolour ban. Simple Icons draws the path without a colour; it is filled with Simple Icons' recorded brand hex #30A2FF (vLLM blue). | 2026-10-29 |
| `huggingface` | Hugging Face | logo | brand | <https://huggingface.co/datasets/huggingface/brand-assets/resolve/main/hf-logo-monochrome.svg?download=true> | Official brand asset; the page says "Download the official Hugging Face brand assets to use in your projects." No licence or usage rules published (dataset has no card/licence). Trademark of Hugging Face, Inc. [Terms](https://huggingface.co/brand).  | 2026-10-29 |
| `mlx` | MLX | logo | brand | <https://raw.githubusercontent.com/ml-explore/mlx/main/docs/logo/mlx_logo.svg> | File is in the MIT-licensed ml-explore/mlx repo (docs/logo, added in #3308). MIT covers copyright only; marks belong to Apple. [Terms](https://github.com/ml-explore/mlx). No logo usage guidelines published in the repo. | 2026-10-29 |
| `llamacpp` | llama.cpp | logo | brand | <https://raw.githubusercontent.com/ggml-org/llama.cpp/master/media/llama1-icon-transparent.svg> | File is in the MIT-licensed ggml-org/llama.cpp repo (media/, added in #15891). MIT covers copyright; trademark of the ggml-org/llama.cpp project. [Terms](https://github.com/ggml-org/llama.cpp/blob/master/LICENSE). No logo usage guidelines published. | 2026-10-29 |
| `openai` | OpenAI | logo | brand | <https://cdn.openai.com/brand/openai-logos.zip> | OpenAI logo (the black Blossom, OpenAI-logos/SVGs/OAI_OpenAI-Blossom_Black.svg in the zip, unmodified; sha256 75c1e9fffa5e8c437bec1d67197a73992bca45d166c6ff23215185dea8fae92a), a trademark of OpenAI, used under OpenAI's Marks usage terms (non-exclusive, non-transferable, revocable); NOT covered by this kit's MIT licence. Terms read: "By using our logos, you agree to our Marks usage terms." (https://openai.com/brand/) "Use the logo only when it directly relates to OpenAI services." (https://openai.com/brand/) "Use the logo exactly as provided and acknowledge that it belongs to OpenAI." (https://openai.com/brand/) "Permission to use our Marks is limited in the following ways: Only use our Marks if they adhere to these brand guidelines." (https://openai.com/brand/) "If you are an active OpenAI developer, you may truthfully identify the OpenAI technology you use." (https://openai.com/brand/) [Terms](https://openai.com/brand/). Shown exactly as provided, black, never recoloured or altered, only on the card that connects OpenAI's API (it "directly relates to OpenAI services"), never more prominent than the host's own name, with no partnership claim. Terms page read through the Wayback snapshot of 2026-10-21 (the live page answers 403 to non-browser clients). Counter-reading noted: "However, everything about your app, product or company (including name, logo, description, slogan, tagline and screenshots) should be your own and should be free of OpenAI's brands (including products, services or model names; logos; or trademarks)." (https://openai.com/brand/), read as being about the host's own branding. | 2026-10-29 |
| `openrouter` | OpenRouter | logo | brand | <https://openrouter.ai/brand/logos/transparent/glyph/svg/glyph-ink.svg> | Official brand asset offered "ready to use"; no permission step or licence stated. Trademark of OpenRouter, Inc. [Terms](https://openrouter.ai/brand). "Please don't stretch, recolor, or remix the marks." Approved colourways only: Ink #03080A (light backgrounds) and Cloud #FCFCFE (dark backgrounds), plus Grape/Volt. | 2026-10-29 |
| `anthropic` | Anthropic | name badge "Anthropic" (backlog 1100) | brand | <https://www.anthropic.com/press-kit> | Anthropic symbol - Slate.svg from the official press-kit archive; original geometry and Slate colour. Trademark belongs to its owner; not relicensed under MIT. [Terms](https://www.anthropic.com/legal/trademark-guidelines). | 2026-10-30 |
| `portkey` | Portkey | name badge "Portkey" (backlog 1100) | brand | <https://framerusercontent.com/images/jdaaBnPaidwn24qlm9oMGXntXP0.png> | Official Portkey website header logo, PNG embedded unchanged; sha256 06fe1d765a67fce602fd024dc236a15d80fd500a4ee977f93a8ee4774acff0c1. Trademark belongs to its owner; not relicensed under MIT. [Terms](https://portkey.ai/terms). | 2026-10-30 |
| `ovh` | OVH AI Endpoints | name badge "OVHcloud" (backlog 1100) | brand | <https://www.ovhcloud.com/7af16cdb/contrib/ovh_theme_patternlab/images/logos/OVHcloud_logo.svg> | Official OVHcloud website sprite, ocmscloud_logo symbol; original paths and transforms, currentColor resolved to brand blue #000E9C. Trademark belongs to its owner; not relicensed under MIT. [Terms](https://www.ovhcloud.com/sites/default/files/external_files/trademark-usage-policy-en-30december-24.pdf). | 2026-10-30 |
| `typesafe` | TypeSafe | logo | brand | <https://framerusercontent.com/images/kcuF2BEp5XaVfkmFB634IPRKQH0.png> | The apple-touch-icon that typesafe.ai's own home page declares, PNG embedded unchanged; sha256 40fe116f8438653bf6bad9b198f23371627f52b52b8654d6852e8345a014e585. TypeSafe publishes no brand or press page (typesafe.ai/brand, /press and /media-kit answer 404). Trademark belongs to TypeSafe AI, Inc.; not relicensed under MIT. [Terms](https://typesafe.ai/legal/terms): "Except as expressly authorized by TypeSafe, you may not use the Materials." Shown only on the TypeSafe (Jev) card, original colours, no endorsement claim. | 2026-11-01 |

Text badges or kit glyphs (no logo), each with the reason:

| Id | Brand | Badge | Why there is no logo | Retrieved |
| --- | --- | --- | --- | --- |
| `openai-compatible` | OpenAI-compatible server | API | A protocol, not a brand: any server that speaks the OpenAI API (vLLM, llama.cpp, LocalAI, a private gateway). No logo applies. | 2026-10-29 |
| `systemone` | System One-compatible endpoint | kit `server` glyph | A protocol, not a brand: any host that serves the System One decision API (POST /v1/systemone), such as a kev.serve / lev serve process or another AbstractCore server. No logo applies, so the kit's neutral server glyph is shown (`glyph: "server"`). | 2026-11-01 |

Adding a brand: add its id to `BRAND_CARD_IDS`, then either a `BRAND_ICONS` entry (the SVG's geometry and colours
unchanged; editor metadata, titles and classes dropped; ids namespaced `af-brand-<id>-`) with its source, terms,
licence, restrictions and date plus its `BRAND_LOGO_PERMITTED` row, or a `BRAND_FALLBACKS` entry saying why there is
none; then a row above.

2026-10-30 operator correction (Gateway backlog 0985): official Anthropic, Portkey and OVH artwork replaces the text badges. Portkey's official PNG is embedded byte-for-byte inside an SVG viewport; no logo makes a network request. Marks retain their owners' rights.

2026-11-02 operator ruling (AbstractFramework backlog 1100): a logo is shown only where the brand's terms allow
it or its owner has approved it in writing. Anthropic, OVHcloud, Portkey, Ollama, DeepSeek, NVIDIA, Google, Meta
and Microsoft have no approval on record, so their cards show the brand's name as a text badge in the same slot
("Shown as" above); their artwork stays recorded. One table decides: `BRAND_LOGO_PERMITTED` in
`ui-kit/src/brand_icons.tsx`. When an approval arrives, record its date, scope and sender in the entry's
`retrieved`/`restrictions` and its row here, set `logoPermitted: true`, and change "Shown as" to `logo`;
`check_brand_icons.mjs` fails until the table, the rows and its list of brands awaiting permission agree.

## Model manufacturer marks

The model catalog uses `BrandMark size="sm"` / `brandMarkHtml(id, name, "sm")`
for a 24px title mark. These are unchanged avatars from manufacturers’ official
model-publishing organizations, embedded as data images (no remote card requests).
Original bytes, MIME, dimensions and SHA-256 are checked. Other vendors retain a
readable neutral text badge, not another manufacturer’s logo. Artwork/trademarks
belong to their owners; no copyright licence is inferred from model/code licences.

| ID | Shown as | Manufacturer profile | Artwork source |
| --- | --- | --- | --- |
| `qwen` | logo | https://huggingface.co/Qwen | https://cdn-avatars.huggingface.co/v1/production/uploads/6215ca5692c0ecfba9186921/hrRM50-6XcdWgg2AKpENG.jpeg |
| `deepseek` | name badge "DeepSeek" (backlog 1100) | https://huggingface.co/deepseek-ai | https://cdn-avatars.huggingface.co/v1/production/uploads/6538815d1bdb3c40db94fbfa/xMBly9PUMphrFVMxLX4kq.png |
| `google` | name badge "Google" (backlog 1100) | https://huggingface.co/google | https://cdn-avatars.huggingface.co/v1/production/uploads/5dd96eb166059660ed1ee413/WtA3YYitedOr9n02eHfJe.png |
| `meta` | name badge "Meta" (backlog 1100) | https://huggingface.co/meta-llama | https://cdn-avatars.huggingface.co/v1/production/uploads/646cf8084eefb026fb8fd8bc/oCTqufkdTkjyGodsx1vo1.png |
| `mistral` | logo | https://huggingface.co/mistralai | https://cdn-avatars.huggingface.co/v1/production/uploads/634c17653d11eaedd88b314d/9OgyfKstSZtbmsmuG8MbU.png |
| `microsoft` | name badge "Microsoft" (backlog 1100) | https://huggingface.co/microsoft | https://cdn-avatars.huggingface.co/v1/production/uploads/1583646260758-5e64858c87403103f9f1055d.png |
| `nvidia` | name badge "NVIDIA" (backlog 1100) | https://huggingface.co/nvidia | https://cdn-avatars.huggingface.co/v1/production/uploads/65df9200dc3292a8983e5017/Vs5FPVCH-VZBipV3qKTuy.png |
