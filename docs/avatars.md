# Activity avatars

`ActivityAvatar`, `AvatarRenderer` and `avatarDesigns` are exported by
`@abstractframework/ui-kit`. Halo, Hover, Vortex, Eclipse, Eye and Rover adapt the
Apple Watch design vocabulary. Geometry, motion and catalog metadata have one
source: the dependency-free Rust `abstract-avatar` crate in AbstractTUI. The kit
ships its Wasm build; native Qt can load the same core's optional C ABI. Existing
watch scenes remain native SwiftUI. Client adoption is separate from this component.

```tsx
import { ActivityAvatar } from '@abstractframework/ui-kit';
import '@abstractframework/ui-kit/theme.css';

<ActivityAvatar design="hover" pose="ready" level={0} size={160}
  active={drawerVisible} animated={!reducedMotion} followCursor
  onError={error => reportVisualFailure(error.message)} />
```

This is presentation only. Hosts supply pose/audio level and actual visibility,
compose their own accessible activation button, and own agent identity and voice
preferences. The component never listens, speaks, calls inference or executes tools.
It fetches only its bundled Wasm asset; canvas pixels are transparent outside the
shape. Failure clears the image, labels it unavailable and calls `onError`.

## Inputs and lifecycle

| Input | Default | Meaning |
|---|---|---|
| design | halo | Stable catalog key; enumerate with `await avatarDesigns()` |
| pose | ready | ready, thinking, working, listening, speaking, waiting, error |
| level | 0 | Finite audio level, clamped0–1 by core |
| size | 128 | CSS side in pixels; raster scales with device ratio, capped256 |
| active | true | False releases the renderer and hides the canvas; bind host visibility |
| animated | true | False renders a static pose and creates no animation clock |
| followCursor | false | Ready eye tracking; returns to center after2s without pointer motion |
| palette | CSS tokens | Explicit `AvatarPalette`, or semantic kit tokens |
| label / className / onError | optional | Accessibility, host styling and failure reporting |

Ready breathes at2fps, Waiting pulses at6fps, active phases and Ready tracking use
about12fps. Error remains static: Hover/Rover have red X eyes; Eye has a central X.
Eye-based styles move their gaze; abstract styles turn subtly. Gaze ignores touch,
other poses and reduced motion. Pointer events update a sampled target and one
cancellable idle timer; they cannot accelerate or starve the draw clock. No cursor
position is persisted or sent anywhere. `prefers-reduced-motion`, offscreen canvas,
document hiding, context loss and unmount stop clocks and clear tracking. Context
restore resumes drawing. Audio updates sample on the animation clock. CSS theme
changes refresh material ramps. Callers must bind `active` for app-specific hiding.

## Canvas without React

```ts
import { AvatarRenderer, avatarPaletteFromCss } from '@abstractframework/ui-kit';
const renderer = await AvatarRenderer.create(canvas, {
  width: 192, palette: avatarPaletteFromCss(canvas),
});
renderer.draw('rover', 'ready', 0, elapsedSeconds, [cursorX, cursorY]);
renderer.dispose();
```

The imperative caller owns scheduling, the2s gaze reset and disposal. An optional
`source: BufferSource` injects Wasm bytes (otherwise shared loading is cached).
Use the installed asset beside `dist/avatar_renderer.js`; bundlers must preserve
its `new URL('./avatars/avatar_core.wasm', import.meta.url)` asset. Do not import
`src` files from a published package. Serve under HTTP; restrictive CSP must allow
WebAssembly compilation. No alternate renderer is silently substituted on failure.

The ABI bounds dimensions1–512, live handles16, and validates numbers, style/phase
codes, palettes and disposed handles. It has no imported host functions. Core
sampling allocates no per-pixel objects; pixel buffers and palettes are reused.
Store style keys, not numeric ABI indices. Native pointer ownership is described
in `abstracttui/crates/abstract-avatar/avatar.h` and its README; a Qt example is there.

## Development and checks

From the multi-repository workspace after changing Rust geometry:

```
python3 abstracttui/scripts/build_avatar_artifacts.py
python3 abstracttui/scripts/build_avatar_artifacts.py --check
npm --prefix abstractuic/ui-kit run test:avatars
npm --prefix abstractuic/ui-kit run demo:avatars:build
```

Serve `abstractuic/ui-kit` over HTTP and open `examples/avatar_gallery.html` to try
all designs, phases, levels, motion and themes. `npm run test:avatars:browser` runs
optional real-browser lifecycle tests with Playwright installed by the host. Set
`AVATAR_PLAYWRIGHT_MODULE` to an installed module path and `AVATAR_BROWSER_CHANNEL`
to `chrome` to use an existing Chrome installation. `AVATAR_CAPTURE_DIR` optionally
saves phase screenshots. It checks2s idle return, Error ignoring pointer input,
reduced motion, context recovery and repeated mount/disposal.

For native/Wasm pixel parity, build the core with `--release --features ffi`, run
its `examples/native_frames.py LIBRARY OUTPUT_DIR`, then pass that directory to
`node ui-kit/scripts/check_avatar.mjs OUTPUT_DIR`. The54 fixtures include every
style/phase and left/right gaze. Generated provenance records source and binary
hashes; normal npm builds verify/copy the artifact and require no Rust installation.
Demo bundles stay outside the published package.
