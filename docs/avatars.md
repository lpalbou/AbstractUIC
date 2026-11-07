# Activity avatars

`ActivityAvatar`, `AvatarRenderer` and `avatarDesigns` present the procedural
[AbstractAvatar](https://github.com/lpalbou/AbstractAvatar) catalog. Its shared Rust
generator is compiled to WebAssembly for browsers. The catalog contains 44 designs:
the six shaded forms, all 34 Watch picker designs, three additional Watch shape
variants and the iPhone woven orb. Native Apple applications retain their SwiftUI
implementations; the shared library preserves the source design vocabulary without
claiming pixel-identical output from different platform renderers.

Use catalog identifiers such as `halo`, `hover`, `watch-halo`, `watch-rover`,
`watch-shape-kitty` and `iphone-weave`. A shaded style and a similarly named Watch
style are distinct designs. Persist identifiers rather than numeric ABI codes.
`await avatarDesigns()` supplies labels, descriptions, families, reference codes and
`gaze`: `"eyes"` for designs whose eyes may follow the pointer (the shaded `hover`,
`eye` and `rover`, the Watch designs with eyes such as `watch-face`, `watch-eye` and `watch-hover`), `"none"` for every other design.

## React presentation

```tsx
import { ActivityAvatar } from '@abstractframework/ui-kit';
import '@abstractframework/ui-kit/theme.css';

<ActivityAvatar design="watch-halo" pose="listening" level={microphoneLevel}
  size={192} quality="balanced" active={panelVisible} animated={animationsEnabled}
  onError={error => reportVisualFailure(error.message)} />
```

Hosts supply actual activity and audio levels, own preferences and compose accessible
activation controls. The component presents images; it does not capture audio, speak,
run inference or execute tools. It loads its bundled Wasm artifact and produces
straight-alpha RGBA pixels, transparent outside the artwork. A rendering failure
clears the image, labels it unavailable and calls `onError`.

| Input | Default | Meaning |
|---|---|---|
| design | watch-hover | Stable identifier from the canonical catalog |
| pose | ready | ready, thinking, working, listening, speaking, waiting, error |
| level | 0 | Observed audio level in 0–1; zero represents silence |
| bands | absent | Optional eight observed frequency-band levels in 0–1 |
| size | 128 | CSS side in pixels, greater than zero and at most 4096 |
| quality | balanced | Resolution and frame-rate budget: economy, balanced or high |
| active | true | False releases the renderer and hides the canvas |
| animated | true | False renders explicit state changes without an animation clock |
| followCursor | false | For a design with `gaze: "eyes"`, the eyes follow pointer movement and clicks in Ready, easing back to centre after two idle seconds; any other design ignores the pointer |
| palette | CSS tokens | Explicit `AvatarPalette` or semantic kit theme tokens |
| label / className / onError | optional | Accessibility, styling and failure reporting |

| Quality | Maximum raster side | Maximum pixel ratio | Ready fps | Waiting fps | Active / gaze fps |
|---|---|---|---|---|---|
| economy | 256 | 1.5 | 2 | 6 | 12 |
| balanced | 384 | 2 | 24 | 24 | 24 |
| high | 512 | 3 | 30 | 30 | 30 |

Raster size follows the side the canvas is shown at (never more than `size`, so a host
stylesheet that shows it smaller gets a smaller raster) and the display pixel ratio, within
the selected budget; display-size and display-density changes rebuild the renderer. Use economy for multiple previews
and high for a prominent portrait when the CPU budget allows it. Raster work grows
with pixel area, so doubling each side costs roughly four times as many samples.
A balanced or high portrait moves at one rate in every animated pose, so a resting
avatar is as smooth as a speaking one; only economy slows down while idle. Each frame
is drawn on the page's main thread: a 384-pixel frame takes about 6–13 ms on an Apple
M-series Mac, so one animated 320-pixel portrait uses about a fifth of one core.
Animation uses display-aligned deadlines, skips missed frames and never catches
up with bursts. Frame rates are upper targets rather than guaranteed throughput.

The avatar itself never moves toward the pointer: no translation, rotation or tilt of
the canvas or the drawing. Only the eyes of a `gaze: "eyes"` design follow it, and
they ease toward it over about 150 ms. `avatarGazeTarget(design, pointer, bounds)`
is the shared rule: it returns the normalized target for an eyes design and
`undefined` for any other design, touch input or empty bounds.

Error is static. Touch, other poses and reduced motion
ignore gaze. Cursor data is transient and stays local. Offscreen/inactive canvases,
hidden documents, context loss and unmount stop scheduling; a hidden animation's
clock pauses. Reduced motion renders explicit state/audio updates without motion.
Theme changes refresh palette ramps. Bind `active` for application-specific hiding.

A silent settings preview may explicitly supply a sample level. Do not fabricate
levels in a live listening/speaking view. Store preferences in the host; the renderer
holds neither account/session identity nor microphone state.

## Frame descriptors and Canvas

A version-one descriptor is an inert JSON object naming a catalog design and frame
inputs. It is not a program, downloaded scene or executable plugin. AbstractAvatar
owns the generation equations; clients present their raster output. The interchange
pixels are conventional row-major RGBA8 with straight alpha.

```ts
import { AvatarRenderer, avatarPaletteFromCss, parseAvatarFrame } from '@abstractframework/ui-kit';
const renderer = await AvatarRenderer.create(canvas, {
  width: 192, palette: avatarPaletteFromCss(canvas),
});
const frame = parseAvatarFrame({
  schema_version: 1, style: 'watch-halo', state: 'speaking',
  time: 1.25, level: 0.6, gaze: [0, 0],
});
renderer.renderFrame(frame);
renderer.dispose();
```

`parseAvatarFrame` rejects unknown fields, unsupported versions, invalid states,
nonfinite numbers and malformed vectors. Time is seconds in 0–86400, level and
each of eight optional bands are 0–1, and optional gaze is two coordinates in
−1–1. Gaze moves only the eyes of a `gaze: "eyes"` design and changes nothing for
any other design. The renderer also requires the style to exist in its catalog. The imperative
caller owns scheduling, visibility, gaze easing and expiry, and disposal. Its existing
`draw(style, pose, level, time, gaze)` convenience method remains available.

An optional `source: BufferSource` supplies **trusted local AbstractAvatar Wasm**,
for offline embedding or tests. Do not use uploaded or externally supplied code.
An optional `signal: AbortSignal` cancels asynchronous renderer creation before a
native handle is allocated; rejected cancellation has the name `AbortError`.
Frame descriptors never select Wasm bytes or URLs. Modules must have no host imports
and the expected ABI; dimensions are 1–512 pixels, with at most 16 live renderers.
Native callers can use AbstractAvatar's C ABI or Python `Renderer` binding.

Bundlers must retain the asset referenced by
`new URL('./avatars/avatar_core.wasm', import.meta.url)`. Serve it over HTTP and
allow WebAssembly compilation in the application's CSP. No alternative design or
renderer is silently substituted on failure. Normal npm builds need no Rust toolchain.

## Compatibility exports

`AppleActivityAvatar` is a thin `ActivityAvatar` wrapper whose default design is
`watch-halo`. `APPLE_AVATARS` and `isAppleAvatar` retain metadata for the original
seven Apple-derived preview identifiers; use `avatarDesigns()` for the full catalog.
They do not contain a second procedural engine.

`AppleAvatarEngine` remains an imperative Canvas adapter. Await its asynchronous
`draw(context, size, design, pose, level, time, staticFrame)` call and call
`dispose()` when finished. It delegates to `AvatarRenderer`; hosts own its frame clock.

## Gallery

The [gallery](../ui-kit/examples/avatar_gallery.html) provides all designs and seven
activity states with level, motion and theme controls. It pages six previews at a
time and defaults to economy quality. **Focus designs** presents Halo, Wave, Hover,
Rings and Eye together; use Quality to compare sharper output and smoother motion.
The gallery keeps the number of live renderers bounded. The canonical catalog and JSON
schema are documented in [AbstractAvatar](https://github.com/lpalbou/AbstractAvatar).
