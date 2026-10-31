import React, { useEffect, useRef, useState } from "react";
import { AvatarRenderer, avatarPaletteFromCss, type AvatarPalette, type AvatarPose } from "./avatar_renderer.js";
import { avatarFrameInterval, avatarResolution, type AvatarQuality } from "./avatar_quality.js";
export type { AvatarQuality } from "./avatar_quality.js";
export interface ActivityAvatarProps {
    design?: string;
    pose?: AvatarPose;
    level?: number;
    bands?: readonly number[];
    size?: number;
    quality?: AvatarQuality;
    animated?: boolean;
    active?: boolean;
    followCursor?: boolean;
    palette?: AvatarPalette;
    className?: string;
    label?: string;
    onError?: (error: Error) => void;
}
/** Presentation only; a host can wrap this in its own accessible activation control. */
export function ActivityAvatar({ design = "halo", pose = "ready", level = 0, bands, size = 128, quality = "balanced", animated = true, active = true, followCursor = false, palette, className, label, onError }: ActivityAvatarProps): React.ReactElement {
    const canvas = useRef<HTMLCanvasElement>(null), latest = useRef({ design, pose, level, bands });
    latest.current = { design, pose, level, bands };
    const [error, setError] = useState(false), errorHandler = useRef(onError);
    const animationClock = useRef({ elapsed: 0, previous: undefined as number | undefined });
    errorHandler.current = onError;
    const [pixelRatio, setPixelRatio] = useState(1);
    useEffect(() => {
        let query: MediaQueryList;
        const refresh = () => {
            query?.removeEventListener("change", refresh);
            const ratio = window.devicePixelRatio || 1;
            setPixelRatio(ratio);
            query = matchMedia(`(resolution: ${ratio}dppx)`);
            query.addEventListener("change", refresh);
        };
        refresh();
        window.addEventListener("resize", refresh, { passive: true });
        return () => { window.removeEventListener("resize", refresh); query?.removeEventListener("change", refresh); };
    }, []);
    // Equal palette contents must not recreate a renderer on parent/audio updates.
    const paletteKey = palette ? JSON.stringify(palette) : "theme";
    useEffect(() => {
        const el = canvas.current;
        if (!el || !active)
            return;
        const abort = new AbortController();
        let disposed = false, renderer: AvatarRenderer | undefined, visible = true, lost = false;
        let timer: ReturnType<typeof setTimeout> | undefined, idle: ReturnType<typeof setTimeout> | undefined;
        let animationFrame: number | undefined, deadline: number | undefined;
        let gaze: readonly [
            number,
            number
        ] = [0, 0], tracking = false;
        const motion = matchMedia("(prefers-reduced-motion: reduce)");
        const clock = animationClock.current;
        let renderedPose: AvatarPose | undefined;
        const clear = () => { if (timer !== undefined) {
            clearTimeout(timer);
            timer = undefined;
        } if (animationFrame !== undefined) { cancelAnimationFrame(animationFrame); animationFrame = undefined; } };
        const resetGaze = () => { if (idle !== undefined) {
            clearTimeout(idle);
            idle = undefined;
        } tracking = false; gaze = [0, 0]; };
        const fail = (reason: unknown) => {
            if (disposed)
                return;
            clear();
            resetGaze();
            el.getContext("2d")?.clearRect(0, 0, el.width, el.height);
            setError(true);
            errorHandler.current?.(reason instanceof Error ? reason : new Error(String(reason)));
        };
        const draw = () => {
            clear();
            const s = latest.current;
            if (renderedPose !== s.pose) { deadline = undefined; renderedPose = s.pose; }
            if (!animated || motion.matches || !visible || lost || document.hidden || s.pose !== "ready")
                resetGaze();
            if (disposed || !renderer || !visible || lost || document.hidden) {
                clock.previous = undefined;
                deadline = undefined;
                return;
            }
            try {
                const moving = animated && !motion.matches, now = performance.now();
                if (moving && clock.previous !== undefined)
                    clock.elapsed = (clock.elapsed + Math.min(1, (now - clock.previous) / 1000)) % 86400;
                clock.previous = moving ? now : undefined;
                renderer.renderFrame({ schema_version: 1, style: s.design, state: s.pose, level: s.level,
                    time: moving ? clock.elapsed : 0,
                    gaze, ...(s.bands === undefined ? {} : { bands: s.bands }) });
                setError(false);
                if (animated && !motion.matches && s.pose !== "error") {
                    const period = avatarFrameInterval(quality, s.pose, tracking);
                    const finished = performance.now();
                    deadline = deadline === undefined ? now + period : deadline + period;
                    // Skip missed deadlines instead of catching up with bursts.
                    if (deadline < finished)
                        deadline = finished + period;
                    timer = setTimeout(() => {
                        timer = undefined;
                        animationFrame = requestAnimationFrame(() => { animationFrame = undefined; draw(); });
                    }, Math.max(0, deadline - finished));
                }
                else deadline = undefined;
            }
            catch (e) {
                fail(e);
            }
        };
        const move = (event: PointerEvent) => {
            if (!renderer || !visible || lost || document.hidden || !animated || motion.matches || latest.current.pose !== "ready" || event.pointerType === "touch")
                return;
            const bounds = el.getBoundingClientRect();
            if (!bounds.width || !bounds.height)
                return;
            const clamp = (v: number) => Math.max(-1, Math.min(1, v));
            gaze = [clamp((event.clientX - bounds.x - bounds.width / 2) / (bounds.width / 2)), clamp((event.clientY - bounds.y - bounds.height / 2) / (bounds.height / 2))];
            const wasTracking = tracking;
            tracking = true;
            if (idle !== undefined)
                clearTimeout(idle);
            idle = setTimeout(() => { resetGaze(); draw(); }, 2000);
            // Later movements only change the sampled target, never reset the draw clock.
            if (!wasTracking)
                deadline = undefined;
            if (!wasTracking)
                draw();
        };
        const down = (event: PointerEvent) => {
            // Observe the click; the host keeps focus, selection and activation.
            move(event);
        };
        const observer = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? false; draw(); });
        observer.observe(el);
        motion.addEventListener("change", draw);
        document.addEventListener("visibilitychange", draw);
        el.addEventListener("avatar-update", draw);
        if (followCursor) {
            window.addEventListener("pointermove", move, { passive: true });
            window.addEventListener("pointerdown", down, { passive: true });
        }
        const contextLost = (event: Event) => { event.preventDefault(); lost = true; clear(); resetGaze(); setError(true); };
        const contextRestored = () => { lost = false; draw(); };
        el.addEventListener("contextlost", contextLost);
        el.addEventListener("contextrestored", contextRestored);
        const theme = new MutationObserver(() => {
            if (renderer && !palette) {
                try {
                    renderer.setPalette(avatarPaletteFromCss(el));
                    draw();
                }
                catch (e) {
                    fail(e);
                }
            }
        });
        if (!palette) {
            const options = { attributes: true, attributeFilter: ["data-theme", "data-af-theme", "class", "style"] };
            theme.observe(document.documentElement, options);
            if (document.body)
                theme.observe(document.body, options);
        }
        Promise.resolve().then(() => {
            if (disposed) return;
            const resolution = avatarResolution(size, pixelRatio, quality);
            return AvatarRenderer.create(el, { width: resolution, height: resolution, palette: palette ?? avatarPaletteFromCss(el), signal: abort.signal });
        }).then(r => {
            if (!r) return;
            if (disposed) {
                r.dispose();
                return;
            }
            renderer = r;
            setError(false);
            draw();
        }).catch(fail);
        return () => {
            disposed = true;
            abort.abort();
            clock.previous = undefined;
            clear();
            resetGaze();
            observer.disconnect();
            theme.disconnect();
            motion.removeEventListener("change", draw);
            document.removeEventListener("visibilitychange", draw);
            el.removeEventListener("avatar-update", draw);
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerdown", down);
            el.removeEventListener("contextlost", contextLost);
            el.removeEventListener("contextrestored", contextRestored);
            renderer?.dispose();
        };
    }, [size, pixelRatio, quality, paletteKey, animated, active, followCursor]);
    useEffect(() => { canvas.current?.dispatchEvent(new Event("avatar-update")); }, [design, pose]);
    // Audio producers cannot reset or outrun the clock; reduced motion allows explicit data updates.
    useEffect(() => { if (!animated || matchMedia("(prefers-reduced-motion: reduce)").matches)
        canvas.current?.dispatchEvent(new Event("avatar-update")); }, [level, bands, animated]);
    return <canvas ref={canvas} className={className} style={{ width: size, height: size, visibility: active ? "visible" : "hidden" }} aria-hidden={!active} role="img" aria-label={error ? "Avatar unavailable" : label ?? `${design} · ${pose}`}/>;
}
