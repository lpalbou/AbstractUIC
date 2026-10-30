/** Canvas adapter for the same Rust geometry used by AbstractTUI. No audio or network inference. */
export type AvatarPose = "ready" | "thinking" | "working" | "listening" | "speaking" | "waiting" | "error";
export type AvatarColor = readonly [
    number,
    number,
    number,
    number
];
export interface AvatarPalette {
    background: AvatarColor;
    warm: AvatarColor;
    eye: AvatarColor;
    shadow: AvatarColor;
    highlight: AvatarColor;
    muted: AvatarColor;
}
export interface AvatarDesign {
    id: string;
    name: string;
    description: string;
    watchCode: string;
    family: string;
}
interface Core extends WebAssembly.Exports {
    memory: WebAssembly.Memory;
    avatar_abi_version(): number;
    avatar_style_count(): number;
    avatar_style_field_ptr(style: number, field: number): number;
    avatar_style_field_len(style: number, field: number): number;
    avatar_create(w: number, h: number): number;
    avatar_destroy(h: number): number;
    avatar_set_shade(h: number, material: number, index: number, rgba: number): number;
    avatar_set_gaze(h: number, x: number, y: number): number;
    avatar_render(h: number, style: number, pose: number, level: number, time: number, transparent: number): number;
    avatar_pixels(h: number): number;
    avatar_pixels_len(h: number): number;
}
export type AvatarSource = BufferSource;
const poses: readonly AvatarPose[] = ["ready", "thinking", "working", "listening", "speaking", "waiting", "error"];
let shared: Promise<Core> | undefined;
async function instantiate(source?: AvatarSource): Promise<Core> {
    let bytes: BufferSource;
    if (source !== undefined)
        bytes = source;
    else {
        const response = await fetch(new URL("./avatars/avatar_core.wasm", import.meta.url));
        if (!response.ok)
            throw new Error(`Avatar renderer unavailable (${response.status})`);
        bytes = await response.arrayBuffer();
    }
    const instance = (await WebAssembly.instantiate(bytes)).instance;
    const core = instance.exports as Core;
    if (core.avatar_abi_version() !== 1)
        throw new Error("Unsupported avatar renderer version");
    return core;
}
async function load(source?: AvatarSource): Promise<Core> {
    if (source)
        return instantiate(source);
    if (!shared)
        shared = instantiate().catch(e => { shared = undefined; throw e; });
    return shared;
}
function catalog(core: Core): AvatarDesign[] {
    const decoder = new TextDecoder();
    const field = (s: number, f: number) => decoder.decode(new Uint8Array(core.memory.buffer, core.avatar_style_field_ptr(s, f) >>> 0, core.avatar_style_field_len(s, f)));
    return Array.from({ length: core.avatar_style_count() }, (_, i) => ({ id: field(i, 0), name: field(i, 1), description: field(i, 2), watchCode: field(i, 3), family: field(i, 4) }));
}
export async function avatarDesigns(source?: AvatarSource): Promise<readonly AvatarDesign[]> { return catalog(await load(source)); }
function pack(c: AvatarColor): number {
    if (c.length !== 4 || c.some(v => !Number.isInteger(v) || v < 0 || v > 255))
        throw new Error("Avatar colors require four bytes");
    return ((c[0] << 24) | (c[1] << 16) | (c[2] << 8) | c[3]) >>> 0;
}
const mix = (a: AvatarColor, b: AvatarColor, t: number): AvatarColor => a.map((v, i) => Math.round(v + (b[i] - v) * t)) as unknown as AvatarColor;
export class AvatarRenderer {
    private handle: number;
    private readonly context: CanvasRenderingContext2D;
    private readonly image: ImageData;
    readonly designs: readonly AvatarDesign[];
    private constructor(private readonly core: Core, canvas: HTMLCanvasElement, width: number, height: number) {
        const context = canvas.getContext("2d");
        if (!context)
            throw new Error("Avatar requires a Canvas 2D context");
        const image = context.createImageData(width, height);
        const h = core.avatar_create(width, height);
        if (!h)
            throw new Error("Avatar size or live renderer limit exceeded");
        this.handle = h;
        this.context = context;
        this.designs = catalog(core);
        canvas.width = width;
        canvas.height = height;
        this.image = image;
    }
    static async create(canvas: HTMLCanvasElement, options: {
        width?: number;
        height?: number;
        palette: AvatarPalette;
        source?: AvatarSource;
    }): Promise<AvatarRenderer> {
        const width = options.width ?? 128, height = options.height ?? width;
        if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 512 || height > 512)
            throw new Error("Avatar dimensions must be 1–512 pixels");
        const renderer = new AvatarRenderer(await load(options.source), canvas, width, height);
        try {
            renderer.setPalette(options.palette);
            return renderer;
        }
        catch (e) {
            renderer.dispose();
            throw e;
        }
    }
    setPalette(p: AvatarPalette): void {
        if (!this.handle)
            throw new Error("Avatar renderer disposed");
        [p.background, p.warm, p.eye, p.shadow, p.highlight, p.muted].forEach(pack);
        for (const [material, mid, hi] of [[0, p.warm, p.highlight], [1, p.eye, p.highlight], [2, p.shadow, p.muted]] as const) {
            for (let i = 0; i < 256; i++) {
                const t = i / 255;
                const ink = t < 0.65 ? mix(p.background, mid, t / 0.65) : mix(mid, hi, (t - 0.65) / 0.35);
                if (this.core.avatar_set_shade(this.handle, material, i, pack(ink)) !== 0)
                    throw new Error("Avatar palette update failed");
            }
        }
    }
    draw(style: string, pose: AvatarPose, level: number, time: number, gaze?: readonly [
        number,
        number
    ]): void {
        if (!this.handle)
            throw new Error("Avatar renderer disposed");
        const index = this.designs.findIndex(d => d.id === style), phase = poses.indexOf(pose);
        if (index < 0 || phase < 0 || !Number.isFinite(level) || !Number.isFinite(time))
            throw new Error("Invalid avatar style, pose, level or time");
        if (gaze && gaze.some(v => !Number.isFinite(v)))
            throw new Error("Invalid avatar gaze");
        if (this.core.avatar_set_gaze(this.handle, gaze?.[0] ?? 0, gaze?.[1] ?? 0) !== 0)
            throw new Error("Avatar gaze update failed");
        const result = this.core.avatar_render(this.handle, index, phase, level, time, 1);
        if (result !== 0)
            throw new Error(`Avatar rendering failed (${result})`);
        const ptr = this.core.avatar_pixels(this.handle) >>> 0, len = this.core.avatar_pixels_len(this.handle);
        this.image.data.set(new Uint8Array(this.core.memory.buffer, ptr, len));
        this.context.putImageData(this.image, 0, 0);
    }
    dispose(): void {
        if (this.handle) {
            this.core.avatar_destroy(this.handle);
            this.handle = 0;
        }
    }
}
/** Resolve existing semantic CSS tokens; caller may supply an explicit palette instead. */
export function avatarPaletteFromCss(canvas: HTMLCanvasElement): AvatarPalette {
    const style = getComputedStyle(canvas), probe = canvas.ownerDocument.createElement("canvas");
    probe.width = probe.height = 1;
    const ctx = probe.getContext("2d");
    if (!ctx)
        throw new Error("Avatar theme color conversion unavailable");
    const color = (token: string): AvatarColor => {
        const value = style.getPropertyValue(token).trim();
        if (!value)
            throw new Error(`Avatar theme token missing: ${token}`);
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = value;
        ctx.fillRect(0, 0, 1, 1);
        return Array.from(ctx.getImageData(0, 0, 1, 1).data) as unknown as AvatarColor;
    };
    const background = color("--bg-primary"), border = color("--ui-border-2"), a = border[3] / 255;
    const shadow: AvatarColor = [Math.round(border[0] * a + background[0] * (1 - a)), Math.round(border[1] * a + background[1] * (1 - a)), Math.round(border[2] * a + background[2] * (1 - a)), 255];
    return { background, warm: color("--warning"), eye: color("--error"), shadow, highlight: color("--text-primary"), muted: color("--text-secondary") };
}
