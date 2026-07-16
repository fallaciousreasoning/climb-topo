import type { Vec2 } from "./spline.js";

export interface ViewportImage {
  width: number;
  height: number;
}

export interface ViewportOptions {
  /** Smallest allowed scale — 1 means "can't zoom out past the full image". Default 1. */
  minScale?: number;
  /** Largest allowed scale. Default 8. */
  maxScale?: number;
}

/**
 * Owns a pan/zoom "camera" over a topo image, expressed as an SVG viewBox window. Pure
 * state and math — no event listeners of its own; a consumer (the editor's Stage, or a
 * viewer's own gesture wiring) decides *when* to call pan/zoom based on whatever gestures it
 * recognizes (wheel, pinch, drag), then applies `getViewBox()` to the svg.
 *
 * Climb lines and points are positioned in absolute image-pixel space (via toPixel) and are
 * completely unaware of the viewBox window — the browser reprojects existing rendered content
 * automatically when viewBox changes, so panning/zooming never requires re-rendering climbs.
 */
export class Viewport {
  private x = 0;
  private y = 0;
  private scale = 1;
  private readonly minScale: number;
  private readonly maxScale: number;
  /** Rendered box's width/height ratio. Defaults to the image's own aspect ratio, which makes
   *  the "padding" logic below a no-op unless a consumer calls setContainerAspect — existing
   *  consumers whose box is always sized to match the image (the web component, iframe viewer)
   *  get their old exact-image-fit behavior for free without calling it. */
  private containerAspect: number;

  constructor(
    private readonly image: ViewportImage,
    opts: ViewportOptions = {},
  ) {
    this.minScale = opts.minScale ?? 1;
    this.maxScale = opts.maxScale ?? 8;
    this.containerAspect = image.width / image.height;
  }

  getScale(): number {
    return this.scale;
  }

  /**
   * Tells the viewport the actual width/height ratio of the box it's rendered into. When the
   * box is a different shape than the image (e.g. a wide desktop pane showing a portrait
   * photo), the default (scale=1) view expands to the box's own aspect ratio instead of the
   * image's — the box is fully used, with the extra axis showing padding around the image
   * rather than leaving dead space outside the svg entirely. Call whenever the box resizes.
   */
  setContainerAspect(aspect: number): void {
    if (!Number.isFinite(aspect) || aspect <= 0) return;
    this.containerAspect = aspect;
    this.clamp();
  }

  /** The image-space rect a scale=1 view spans — the widest a pan can ever roam, since zooming
   *  in only shrinks this. Used by consumers to size a full-coverage hit-test/background shape
   *  so it still covers the padded area, not just the image bounds. */
  getMaxExtentRect(): { x: number; y: number; width: number; height: number } {
    const { w, h } = this.baseDimensions();
    return { x: (this.image.width - w) / 2, y: (this.image.height - h) / 2, width: w, height: h };
  }

  isAtDefault(): boolean {
    if (this.scale !== 1) return false;
    const { w, h } = this.baseDimensions();
    const defaultX = (this.image.width - w) / 2;
    const defaultY = (this.image.height - h) / 2;
    return Math.abs(this.x - defaultX) < 1e-6 && Math.abs(this.y - defaultY) < 1e-6;
  }

  getViewBox(): string {
    const { w: viewBoxW, h: viewBoxH } = this.currentDimensions();
    return `${this.x} ${this.y} ${viewBoxW} ${viewBoxH}`;
  }

  /** Client pixel -> normalized [0,1] image coordinates, accounting for the current pan/zoom. */
  clientToNormalized(svgRoot: SVGSVGElement, clientX: number, clientY: number): Vec2 {
    const rect = svgRoot.getBoundingClientRect();
    const fracX = rect.width === 0 ? 0 : (clientX - rect.left) / rect.width;
    const fracY = rect.height === 0 ? 0 : (clientY - rect.top) / rect.height;
    const { w: viewBoxW, h: viewBoxH } = this.currentDimensions();
    return {
      x: (this.x + fracX * viewBoxW) / this.image.width,
      y: (this.y + fracY * viewBoxH) / this.image.height,
    };
  }

  /** Inverse of clientToNormalized: normalized [0,1] image coords -> client pixel coords,
   *  given the svg's current rendered box and pan/zoom state. Lets a consumer position a UI
   *  overlay (e.g. a point-editing popup) that needs to track a point's on-screen location. */
  normalizedToClient(svgRoot: SVGSVGElement, pos: Vec2): { x: number; y: number } {
    const rect = svgRoot.getBoundingClientRect();
    const { w: viewBoxW, h: viewBoxH } = this.currentDimensions();
    const fracX = viewBoxW === 0 ? 0 : (pos.x * this.image.width - this.x) / viewBoxW;
    const fracY = viewBoxH === 0 ? 0 : (pos.y * this.image.height - this.y) / viewBoxH;
    return { x: rect.left + fracX * rect.width, y: rect.top + fracY * rect.height };
  }

  /**
   * Pans by a client-pixel delta (e.g. from a pointermove's movementX/Y), converting through
   * the svg's current rendered size and scale so a given drag distance feels 1:1 with the
   * cursor regardless of zoom level or screen size.
   */
  panByClientDelta(svgRoot: SVGSVGElement, dxClient: number, dyClient: number): void {
    const rect = svgRoot.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const { w: viewBoxW, h: viewBoxH } = this.currentDimensions();
    this.x -= (dxClient / rect.width) * viewBoxW;
    this.y -= (dyClient / rect.height) * viewBoxH;
    this.clamp();
  }

  /** Multiplies the current scale by `factor` (>1 zooms in, <1 zooms out), keeping the given
   *  client point visually stationary — the standard "zoom toward the cursor" behavior. */
  zoomAtClientPoint(svgRoot: SVGSVGElement, clientX: number, clientY: number, factor: number): void {
    const before = this.clientToNormalized(svgRoot, clientX, clientY);
    this.scale = Math.min(this.maxScale, Math.max(this.minScale, this.scale * factor));

    const rect = svgRoot.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const fracX = (clientX - rect.left) / rect.width;
    const fracY = (clientY - rect.top) / rect.height;
    const { w: viewBoxW, h: viewBoxH } = this.currentDimensions();
    this.x = before.x * this.image.width - fracX * viewBoxW;
    this.y = before.y * this.image.height - fracY * viewBoxH;
    this.clamp();
  }

  reset(): void {
    this.scale = 1;
    const { w, h } = this.baseDimensions();
    this.x = (this.image.width - w) / 2;
    this.y = (this.image.height - h) / 2;
  }

  /** The scale=1 (fully zoomed out) viewBox size: the image itself in the axis that matches
   *  or is narrower than the container's aspect ratio, expanded to the container's aspect
   *  ratio in the other axis. */
  private baseDimensions(): { w: number; h: number } {
    const imageAspect = this.image.width / this.image.height;
    if (this.containerAspect > imageAspect) {
      return { w: this.image.height * this.containerAspect, h: this.image.height };
    }
    return { w: this.image.width, h: this.image.width / this.containerAspect };
  }

  private currentDimensions(): { w: number; h: number } {
    const { w, h } = this.baseDimensions();
    return { w: w / this.scale, h: h / this.scale };
  }

  private clamp(): void {
    const { w: viewBoxW, h: viewBoxH } = this.currentDimensions();
    this.x = this.clampAxis(this.x, viewBoxW, this.image.width);
    this.y = this.clampAxis(this.y, viewBoxH, this.image.height);
  }

  /** Standard clamp-within-bounds when the view is smaller than the image (the usual zoomed
   *  case). When the view is padded (larger than the image, i.e. still showing the full image
   *  plus letterboxing), there's no image left to pan past, so lock it centered instead. */
  private clampAxis(pos: number, viewBoxSize: number, imageSize: number): number {
    if (viewBoxSize >= imageSize) {
      return (imageSize - viewBoxSize) / 2;
    }
    return Math.min(Math.max(pos, 0), imageSize - viewBoxSize);
  }
}
