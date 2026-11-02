import { AvatarRenderer, avatarPaletteFromCss, parseAvatarFrame, type AvatarPalette, type AvatarPose, type AvatarSource } from "./avatar_renderer.js";

/** Compatibility metadata for the first Apple-derived designs. Use avatarDesigns()
 * for AbstractAvatar's complete canonical catalog. */
export const APPLE_AVATARS = [
  { id: "watch-halo", name: "Halo", family: "Apple Watch", watchCode: "A", description: "A turning planet of light; voice becomes a flowing corona." },
  { id: "watch-vortex", name: "Vortex", family: "Apple Watch", watchCode: "B", description: "Points gather into two spiral arms, inward to listen and outward to speak." },
  { id: "watch-nebula", name: "Nebula", family: "Apple Watch", watchCode: "C", description: "A star cloud with a bright core, three coloured lobes and wisps." },
  { id: "watch-rings", name: "Rings", family: "Apple Watch", watchCode: "D", description: "Six turning geodesic rings, with running lights while working." },
  { id: "watch-liquid", name: "Liquid", family: "Apple Watch", watchCode: "E", description: "A planet whose surface rolls in travelling waves." },
  { id: "watch-galaxy", name: "Galaxy", family: "Apple Watch", watchCode: "F", description: "A dense core with two spreading arms of stars." },
  { id: "iphone-weave", name: "Woven orb", family: "iPhone", watchCode: "", description: "Five mint and lavender cords become a geodesic sphere or a raised hand." },
] as const;
export type AppleAvatarDesign = typeof APPLE_AVATARS[number];
export const isAppleAvatar = (id: string): boolean => APPLE_AVATARS.some((d) => d.id === id);

/** Compatibility Canvas adapter. Geometry is generated exclusively by AbstractAvatar.
 * draw() is asynchronous while the shared Wasm module loads; await it to observe errors.
 * Hosts own animation clocks and must dispose the adapter when its canvas is removed. */
export class AppleAvatarEngine {
  private canvas?: HTMLCanvasElement;
  private size = 0;
  private renderer?: AvatarRenderer;
  private pending?: Promise<AvatarRenderer>;
  private generation = 0;
  private request = 0;
  private disposed = false;

  constructor(private readonly options: { source?: AvatarSource; palette?: AvatarPalette } = {}) {}

  async draw(ctx: CanvasRenderingContext2D, size: number, design: string, pose: AvatarPose, level: number, time: number, _still = false): Promise<void> {
    if (this.disposed) throw new Error("Avatar adapter disposed");
    if (!Number.isInteger(size) || size < 1 || size > 512 || !Number.isFinite(level))
      throw new Error("Invalid avatar frame dimensions or level");
    const frame = parseAvatarFrame({ schema_version: 1, style: design, state: pose,
      level: Math.max(0, Math.min(1, level)), time });
    const request = ++this.request;
    if (this.canvas !== ctx.canvas || this.size !== size || !this.pending) {
      const generation = ++this.generation;
      this.renderer?.dispose();
      this.renderer = undefined;
      this.canvas = ctx.canvas;
      this.size = size;
      this.pending = AvatarRenderer.create(ctx.canvas, { width: size, height: size,
        palette: this.options.palette ?? avatarPaletteFromCss(ctx.canvas), source: this.options.source }).then(renderer => {
          if (this.disposed || generation !== this.generation) {
            renderer.dispose();
            throw new Error("Avatar adapter was replaced");
          }
          this.renderer = renderer;
          return renderer;
        }).catch(error => { if (generation === this.generation) this.pending = undefined; throw error; });
    }
    const renderer = await this.pending;
    if (!this.disposed && request === this.request) renderer.renderFrame(frame);
  }

  dispose(): void {
    this.disposed = true;
    this.generation++;
    this.request++;
    this.renderer?.dispose();
    this.renderer = undefined;
    this.pending = undefined;
    this.canvas = undefined;
  }
}
