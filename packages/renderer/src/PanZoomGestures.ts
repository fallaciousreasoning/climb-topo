import type { Viewport } from "./Viewport.js";

const PAN_START_THRESHOLD_PX = 8;

export interface PanZoomGesturesOptions {
  svgRoot: SVGSVGElement;
  viewport: Viewport;
  /** If true (default), plain wheel scroll is ignored and left to scroll the page — an
   *  embedded widget shouldn't hijack page scrolling by default. Zoom then requires
   *  ctrl+wheel (also how browsers report trackpad pinch-zoom) or pinch/reset-zoom controls.
   *  Set false for a surface that owns its own scroll region (e.g. the standalone editor). */
  wheelZoomRequiresCtrl?: boolean;
}

/**
 * Read-only pan/zoom gesture recognizer: single-pointer drag pans, two-pointer pinch zooms,
 * wheel/trackpad zooms. Deliberately has no notion of "clicking a climb" — that's handled
 * independently by TopoRenderer's own hitPath listeners, which keep working unchanged since
 * they're native DOM events on separate elements this class doesn't intercept.
 */
export class PanZoomGestures {
  private readonly svgRoot: SVGSVGElement;
  private readonly viewport: Viewport;
  private readonly wheelZoomRequiresCtrl: boolean;

  private pointerDownClientPos: { x: number; y: number } | null = null;
  private isPanning = false;
  private panLastClientPos: { x: number; y: number } | null = null;
  private readonly activePointers = new Map<number, { x: number; y: number }>();
  private pinchLastDistance: number | null = null;

  constructor(opts: PanZoomGesturesOptions) {
    this.svgRoot = opts.svgRoot;
    this.viewport = opts.viewport;
    this.wheelZoomRequiresCtrl = opts.wheelZoomRequiresCtrl ?? true;

    // We own touch gestures ourselves (pan/pinch) — otherwise the browser's default
    // scroll/pinch-zoom handling competes with our own pointer-driven gestures.
    this.svgRoot.style.touchAction = "none";

    this.svgRoot.addEventListener("pointerdown", this.handlePointerDown);
    this.svgRoot.addEventListener("pointermove", this.handlePointerMove);
    window.addEventListener("pointerup", this.handlePointerUp);
    this.svgRoot.addEventListener("wheel", this.handleWheel, { passive: false });
  }

  destroy(): void {
    this.svgRoot.removeEventListener("pointerdown", this.handlePointerDown);
    this.svgRoot.removeEventListener("pointermove", this.handlePointerMove);
    window.removeEventListener("pointerup", this.handlePointerUp);
    this.svgRoot.removeEventListener("wheel", this.handleWheel);
  }

  /** Re-applies the viewport's current viewBox to the svg. Exposed for a consumer that changes
   *  the Viewport's state itself (e.g. `setContainerAspect` in response to a resize) and needs
   *  the svg to reflect it immediately, rather than waiting for the next pan/zoom gesture. */
  syncViewport(): void {
    this.applyViewport();
  }

  private applyViewport(): void {
    this.svgRoot.setAttribute("viewBox", this.viewport.getViewBox());
  }

  private handleWheel = (e: WheelEvent): void => {
    if (this.wheelZoomRequiresCtrl && !e.ctrlKey) return; // let the page scroll normally
    e.preventDefault();
    const factor = Math.pow(1.002, -e.deltaY);
    this.viewport.zoomAtClientPoint(this.svgRoot, e.clientX, e.clientY, factor);
    this.applyViewport();
  };

  private tryCapture(pointerId: number): void {
    try {
      this.svgRoot.setPointerCapture(pointerId);
    } catch {
      // Gesture tracking still works without capture; just less robust if the pointer
      // travels outside the svg's bounds mid-gesture.
    }
  }

  private handlePointerDown = (e: PointerEvent): void => {
    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // Deliberately do NOT capture yet for a lone first pointer: capturing retargets
    // subsequent events — including the native "click" compatibility event — to this
    // element, which would stop TopoRenderer's own per-climb hitPath click listener from
    // ever firing for what might just be a simple tap. We only capture once a gesture is
    // confirmed to be a pan (movement past the threshold, in handlePointerMove) or a pinch
    // (a second pointer joining, right below) — by then, losing native click retargeting
    // doesn't matter, since a real drag/pinch was never going to be a click anyway.

    if (this.activePointers.size >= 2) {
      this.isPanning = false;
      this.pointerDownClientPos = null;
      this.panLastClientPos = null;
      const [p1, p2] = [...this.activePointers.values()];
      this.pinchLastDistance = Math.hypot(p2!.x - p1!.x, p2!.y - p1!.y);
      for (const pointerId of this.activePointers.keys()) this.tryCapture(pointerId);
      return;
    }
    this.pointerDownClientPos = { x: e.clientX, y: e.clientY };
  };

  private handlePointerMove = (e: PointerEvent): void => {
    if (this.activePointers.has(e.pointerId)) {
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (this.activePointers.size >= 2 && this.pinchLastDistance !== null) {
      const [p1, p2] = [...this.activePointers.values()];
      const distance = Math.hypot(p2!.x - p1!.x, p2!.y - p1!.y);
      const midpoint = { x: (p1!.x + p2!.x) / 2, y: (p1!.y + p2!.y) / 2 };
      const factor = this.pinchLastDistance > 0 ? distance / this.pinchLastDistance : 1;
      this.viewport.zoomAtClientPoint(this.svgRoot, midpoint.x, midpoint.y, factor);
      this.applyViewport();
      this.pinchLastDistance = distance;
      return;
    }

    if (!this.pointerDownClientPos) return;

    if (!this.isPanning) {
      const moved = Math.hypot(
        e.clientX - this.pointerDownClientPos.x,
        e.clientY - this.pointerDownClientPos.y,
      );
      if (moved > PAN_START_THRESHOLD_PX) {
        this.isPanning = true;
        this.panLastClientPos = { x: e.clientX, y: e.clientY };
        this.tryCapture(e.pointerId); // now confirmed a pan — capture for robust tracking
      }
    }
    if (this.isPanning && this.panLastClientPos) {
      const dx = e.clientX - this.panLastClientPos.x;
      const dy = e.clientY - this.panLastClientPos.y;
      this.viewport.panByClientDelta(this.svgRoot, dx, dy);
      this.applyViewport();
      this.panLastClientPos = { x: e.clientX, y: e.clientY };
    }
  };

  private handlePointerUp = (e: PointerEvent): void => {
    this.activePointers.delete(e.pointerId);
    try {
      this.svgRoot.releasePointerCapture(e.pointerId);
    } catch {
      // Already released or never captured; nothing to do.
    }

    if (this.pinchLastDistance !== null) {
      this.pinchLastDistance = null;
      const remaining = [...this.activePointers.values()][0];
      if (remaining) {
        // One finger of a pinch lifted, one remains down: keep panning with it.
        this.isPanning = true;
        this.panLastClientPos = { ...remaining };
        this.pointerDownClientPos = null;
      }
      return;
    }

    this.isPanning = false;
    this.panLastClientPos = null;
    this.pointerDownClientPos = null;
  };
}
