import {
  createAddPathPointCommand,
  createMovePointCommand,
  findNearestPoint,
  type Command,
  type Topo,
} from "@climb-topo/core";
import {
  createStageScaffold,
  TopoRenderer,
  Viewport,
  type PointTypeRenderer,
} from "@climb-topo/renderer";
import { resolveDrawClick } from "./drawClickRouting.js";
import type { EditorTool } from "./Toolbar.js";

const SVG_NS = "http://www.w3.org/2000/svg";

// A finger is far less precise than a mouse cursor, both in where it lands relative to a
// thin line/point and in how much it drifts between touching down and lifting off. Widen
// tolerances for touch input specifically rather than loosening them for everyone.
const SNAP_THRESHOLD_MOUSE = 0.02;
const SNAP_THRESHOLD_TOUCH = 0.04;
const HIT_TOLERANCE_MOUSE = 0.015;
const HIT_TOLERANCE_TOUCH = 0.03;
/** Max client-pixel movement between pointerdown and pointerup to still count as a tap —
 *  past this, a single-pointer gesture becomes a pan instead. */
const TAP_MOVEMENT_THRESHOLD_PX_MOUSE = 5;
const TAP_MOVEMENT_THRESHOLD_PX_TOUCH = 20;

function isTouchPointerType(pointerType: string): boolean {
  return pointerType === "touch";
}

export interface SelectedPoint {
  climbId: string;
  pointId: string;
}

export interface StageCallbacks {
  onExecute(command: Command): void;
  getActiveClimbId(): string | null;
  getActiveTool(): EditorTool;
  onSwitchActiveClimb(climbId: string): void;
  onSelectionChange(selection: SelectedPoint | null): void;
}

/** Ties the shared TopoRenderer to editor-specific pointer interaction: Draw and Select tools,
 *  plus pan/zoom (drag on empty space to pan, pinch or wheel/trackpad to zoom). */
export class Stage {
  readonly root: HTMLElement;
  private readonly renderer: TopoRenderer;
  private readonly svg: SVGSVGElement;
  private readonly callbacks: StageCallbacks;
  private readonly viewport: Viewport;

  private topo: Topo;
  private draggingPointId: string | null = null;
  /** Offset between the point's position and the cursor at grab time, preserved through the
   *  drag so the point doesn't jump to the cursor if it wasn't grabbed exactly at its center. */
  private dragGrabOffset: { x: number; y: number } | null = null;
  private dragCurrentPos: { x: number; y: number } | null = null;

  /** Client coords of the most recent single-pointer pointerdown that didn't grab a point —
   *  the anchor for deciding whether the gesture is a tap (synthesized click) or a pan. We
   *  synthesize the click ourselves from pointerdown+pointerup rather than depending on the
   *  browser's native click event: confirmed via a document-level capturing click listener
   *  that it can silently fail to fire for SVG stroke-based hit areas in some browser/input
   *  setups (Chrome + trackpad), even though mousedown/mouseup fire correctly at the
   *  identical position. */
  private pointerDownClientPos: { x: number; y: number } | null = null;
  private isPanning = false;
  private panLastClientPos: { x: number; y: number } | null = null;

  /** Tracks every currently-down pointer (by id) for multi-touch pinch detection. */
  private readonly activePointers = new Map<number, { x: number; y: number }>();
  private pinchLastDistance: number | null = null;
  /** True once 2+ pointers have been down simultaneously during the current gesture group,
   *  so its tail end (e.g. lifting down to one finger, then that finger too) is never
   *  mistaken for a tap. Reset once every pointer is up. */
  private hadMultiTouch = false;

  private selection: SelectedPoint | null = null;
  private readonly destroyScaffold: () => void;

  constructor(topo: Topo, callbacks: StageCallbacks, pointTypeRenderers?: PointTypeRenderer[]) {
    this.topo = topo;
    this.callbacks = callbacks;
    this.viewport = new Viewport(topo.image);

    // Full-coverage rect so empty-stage taps register reliably — without an explicit painted
    // shape, unpainted svg regions don't receive pointer events, and the tap would otherwise
    // fall through to the <img> stacked beneath it. Deliberately NOT `fill="transparent"`:
    // some WebKit/mobile-Safari versions fail to hit-test a literally-transparent fill for
    // touch input even with `pointer-events: all` (a known quirk), while a technically-painted
    // near-zero-alpha fill hit-tests reliably everywhere and is visually indistinguishable.
    // Sized/repositioned on every resize (see onResize below) to cover the current max pan
    // extent, which can be bigger than the image itself once the box is a different shape.
    const background = document.createElementNS(SVG_NS, "rect") as SVGRectElement;
    background.setAttribute("x", "0");
    background.setAttribute("y", "0");
    background.setAttribute("width", String(topo.image.width));
    background.setAttribute("height", String(topo.image.height));
    background.setAttribute("fill", "rgba(0,0,0,0.01)");
    background.style.pointerEvents = "all";

    const scaffold = createStageScaffold(topo.image, {
      fit: "contain",
      onResize: (width, height) => {
        this.viewport.setContainerAspect(width / height);
        const extent = this.viewport.getMaxExtentRect();
        background.setAttribute("x", String(extent.x));
        background.setAttribute("y", String(extent.y));
        background.setAttribute("width", String(extent.width));
        background.setAttribute("height", String(extent.height));
        this.applyViewport();
      },
    });
    this.root = scaffold.root;
    this.svg = scaffold.svg;
    this.destroyScaffold = scaffold.destroy;
    // We own touch gestures ourselves (pan/pinch/drag) — otherwise the browser's default
    // scroll/pinch-zoom handling competes with our own pointer-driven gestures.
    this.svg.style.touchAction = "none";
    this.svg.appendChild(background);

    this.renderer = new TopoRenderer({
      svgRoot: this.svg,
      image: topo.image,
      mode: "edit",
      pointTypeRenderers,
      onClimbHover: () => {},
      onClimbClick: () => {},
    });
    this.renderer.setTopo(topo);
    this.applyViewport();

    this.svg.addEventListener("pointermove", this.handlePointerMove);
    this.svg.addEventListener("pointerdown", this.handlePointerDown);
    this.svg.addEventListener("pointerleave", this.handlePointerLeaveStage);
    this.svg.addEventListener("wheel", this.handleWheel, { passive: false });
    window.addEventListener("pointerup", this.handlePointerUp);
  }

  setTopo(topo: Topo): void {
    this.topo = topo;
    this.renderer.setTopo(topo);
  }

  setActiveClimb(climbId: string | null): void {
    this.renderer.setActiveClimb(climbId);
  }

  getSelection(): SelectedPoint | null {
    return this.selection;
  }

  /** Current client-pixel position of the selected point, for positioning a UI overlay (e.g.
   *  the point-editing popup) that needs to track it across pan/zoom/drag. Null if nothing
   *  is selected or the point has since been removed. */
  getSelectionScreenPos(): { x: number; y: number } | null {
    if (!this.selection) return null;
    const point = this.topo.points[this.selection.pointId];
    if (!point) return null;
    return this.viewport.normalizedToClient(this.svg, point);
  }

  clearSelection(): void {
    this.selection = null;
    this.renderer.setSelectedPoint(null);
    this.callbacks.onSelectionChange(null);
  }

  resetZoom(): void {
    this.viewport.reset();
    this.applyViewport();
  }

  destroy(): void {
    this.svg.removeEventListener("pointermove", this.handlePointerMove);
    this.svg.removeEventListener("pointerdown", this.handlePointerDown);
    this.svg.removeEventListener("pointerleave", this.handlePointerLeaveStage);
    this.svg.removeEventListener("wheel", this.handleWheel);
    window.removeEventListener("pointerup", this.handlePointerUp);
    this.renderer.destroy();
    this.destroyScaffold();
  }

  private applyViewport(): void {
    this.svg.setAttribute("viewBox", this.viewport.getViewBox());
  }

  private normalizedPos(e: PointerEvent | MouseEvent | WheelEvent): { x: number; y: number } {
    return this.viewport.clientToNormalized(this.svg, e.clientX, e.clientY);
  }

  private pointWrapperOf(target: EventTarget | null): SVGGElement | null {
    if (!(target instanceof Element)) return null;
    return target.closest<SVGGElement>("[data-point-id]");
  }

  private handleWheel = (e: WheelEvent): void => {
    e.preventDefault();
    // A smooth, deltaY-magnitude-proportional zoom factor — works for both notched mouse
    // wheels (large deltaY steps) and continuous trackpad scrolling (small deltaY steps).
    const factor = Math.pow(1.002, -e.deltaY);
    this.viewport.zoomAtClientPoint(this.svg, e.clientX, e.clientY, factor);
    this.applyViewport();
  };

  private handlePointerMove = (e: PointerEvent): void => {
    if (this.activePointers.has(e.pointerId)) {
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    // Dragging an existing point takes priority, unconditionally, over pan/pinch/draw — it
    // starts on pointerdown directly on a point, in ANY tool (see handlePointerDown).
    if (this.draggingPointId && this.dragGrabOffset) {
      const cursorPos = this.normalizedPos(e);
      const pos = { x: cursorPos.x + this.dragGrabOffset.x, y: cursorPos.y + this.dragGrabOffset.y };
      this.dragCurrentPos = pos;
      const draft: Topo = {
        ...this.topo,
        points: {
          ...this.topo.points,
          [this.draggingPointId]: { ...this.topo.points[this.draggingPointId]!, x: pos.x, y: pos.y },
        },
      };
      // eslint-disable-next-line no-console
      console.log(
        "[Stage] DEBUG pointermove while dragging:",
        "pointId=", this.draggingPointId,
        "cursorPos=", cursorPos,
        "newPos=", pos,
      );
      this.renderer.setTopo(draft);
      return;
    }

    // Pinch-zoom: two (or more) pointers down and not mid-point-drag.
    if (this.activePointers.size >= 2 && this.pinchLastDistance !== null) {
      const [p1, p2] = [...this.activePointers.values()];
      const distance = Math.hypot(p2!.x - p1!.x, p2!.y - p1!.y);
      const midpoint = { x: (p1!.x + p2!.x) / 2, y: (p1!.y + p2!.y) / 2 };
      const factor = this.pinchLastDistance > 0 ? distance / this.pinchLastDistance : 1;
      this.viewport.zoomAtClientPoint(this.svg, midpoint.x, midpoint.y, factor);
      this.applyViewport();
      this.pinchLastDistance = distance;
      return;
    }

    // Single pointer, not dragging a point, not pinching: tentative tap, or an in-progress
    // pan once movement crosses the threshold.
    if (this.pointerDownClientPos) {
      if (!this.isPanning) {
        const threshold = isTouchPointerType(e.pointerType)
          ? TAP_MOVEMENT_THRESHOLD_PX_TOUCH
          : TAP_MOVEMENT_THRESHOLD_PX_MOUSE;
        const moved = Math.hypot(
          e.clientX - this.pointerDownClientPos.x,
          e.clientY - this.pointerDownClientPos.y,
        );
        if (moved > threshold) {
          this.isPanning = true;
          this.panLastClientPos = { x: e.clientX, y: e.clientY };
          // eslint-disable-next-line no-console
          console.log("[Stage] DEBUG pan started, moved=", moved);
        }
      }
      if (this.isPanning && this.panLastClientPos) {
        const dx = e.clientX - this.panLastClientPos.x;
        const dy = e.clientY - this.panLastClientPos.y;
        this.viewport.panByClientDelta(this.svg, dx, dy);
        this.applyViewport();
        this.panLastClientPos = { x: e.clientX, y: e.clientY };
        return;
      }
    }

    if (this.callbacks.getActiveTool() === "draw") {
      const activeClimbId = this.callbacks.getActiveClimbId();
      if (!activeClimbId) {
        this.renderer.setSnapTarget(null);
        this.renderer.setHoveredPoint(null);
        return;
      }
      const pos = this.normalizedPos(e);
      const nearest = findNearestPoint(this.topo, pos, {
        maxDistance: isTouchPointerType(e.pointerType) ? SNAP_THRESHOLD_TOUCH : SNAP_THRESHOLD_MOUSE,
        excludeClimbId: activeClimbId,
      });
      this.renderer.setSnapTarget(nearest?.id ?? null);
      this.renderer.setHoveredPoint(this.pointWrapperOf(e.target)?.dataset.pointId ?? null);
      return;
    }

    this.renderer.setHoveredPoint(this.pointWrapperOf(e.target)?.dataset.pointId ?? null);
  };

  private handlePointerLeaveStage = (): void => {
    this.renderer.setHoveredPoint(null);
  };

  private handlePointerDown = (e: PointerEvent): void => {
    // eslint-disable-next-line no-console
    console.log(
      "[Stage] DEBUG pointerdown:",
      "tool=", this.callbacks.getActiveTool(),
      "target=", e.target,
      "pointerType=", e.pointerType,
      "pointerId=", e.pointerId,
      "clientX=", e.clientX,
      "clientY=", e.clientY,
      "activePointers=", this.activePointers.size + 1,
    );

    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // Keep receiving move/up for this pointer even if it travels outside the svg's bounds
    // mid-gesture (routine for wide pans/pinches, especially on touch).
    try {
      this.svg.setPointerCapture(e.pointerId);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log("[Stage] DEBUG setPointerCapture THREW (gesture should still work without it):", err);
    }

    if (this.activePointers.size >= 2 && this.draggingPointId === null) {
      // A second pointer just joined (and we're not mid-point-drag): this gesture is now a
      // pinch, regardless of what the first pointer had been doing.
      this.hadMultiTouch = true;
      this.isPanning = false;
      this.pointerDownClientPos = null;
      this.panLastClientPos = null;
      const [p1, p2] = [...this.activePointers.values()];
      this.pinchLastDistance = Math.hypot(p2!.x - p1!.x, p2!.y - p1!.y);
      // eslint-disable-next-line no-console
      console.log("[Stage] DEBUG pinch started, distance=", this.pinchLastDistance);
      return;
    }
    if (this.activePointers.size >= 2) return; // mid point-drag with a 2nd pointer down; ignore it

    // Captured for every single-pointer-down (even ones that don't grab a point) so
    // pointerup can decide tap-vs-pan and synthesize a click from the pair directly.
    this.pointerDownClientPos = { x: e.clientX, y: e.clientY };

    // Starting a drag is allowed in any tool: it requires pointerdown directly on an existing
    // point's hit area, a gesture distinct enough from Draw-tool clicks (empty space / a
    // climb's line) that the two never conflict.
    const wrapper = this.pointWrapperOf(e.target);
    if (!wrapper) {
      // eslint-disable-next-line no-console
      console.log("[Stage] DEBUG pointerdown: no point wrapper found under target, ignoring.");
      return;
    }

    const pointId = wrapper.dataset.pointId;
    const domClimbGroup = wrapper.closest<SVGGElement>("[data-climb-id]");
    const domClimbId = domClimbGroup?.dataset.climbId;
    if (!pointId || !domClimbId) {
      // eslint-disable-next-line no-console
      console.log("[Stage] DEBUG pointerdown: wrapper found but missing pointId/climbId", {
        pointId,
        domClimbId,
      });
      return;
    }

    // A shared point (link-up) is rendered once per climb that includes it, so the DOM group
    // actually hit can be a DIFFERENT climb than the one the user means to drag — checking
    // whether the point belongs to a climb's own pointIds is the only reliable membership
    // test, not which specific overlapping copy the pointerdown happened to land on.
    let climbId = domClimbId;
    if (this.callbacks.getActiveTool() === "draw") {
      const activeClimbId = this.callbacks.getActiveClimbId();
      const activeClimb = this.topo.climbs.find((c) => c.id === activeClimbId);
      const belongsToActiveClimb = activeClimb?.pointIds.includes(pointId) ?? false;
      if (!belongsToActiveClimb) {
        // Not part of the active climb — leave it for the click-based "snap to link up" gesture.
        // eslint-disable-next-line no-console
        console.log(
          "[Stage] DEBUG pointerdown: point isn't part of the active climb in draw mode, leaving it for click-based snap.",
          { pointId, domClimbId, activeClimbId },
        );
        return;
      }
      climbId = activeClimbId!;
    }

    const point = this.topo.points[pointId];
    if (!point) {
      // eslint-disable-next-line no-console
      console.log("[Stage] DEBUG pointerdown: pointId not found in topo.points", pointId);
      return;
    }
    const cursorPos = this.normalizedPos(e);

    this.draggingPointId = pointId;
    this.dragGrabOffset = { x: point.x - cursorPos.x, y: point.y - cursorPos.y };
    this.dragCurrentPos = null;
    this.selection = { climbId, pointId };
    this.renderer.setSelectedPoint(pointId);
    this.renderer.setDraggingPoint(pointId);
    this.callbacks.onSelectionChange(this.selection);
    // eslint-disable-next-line no-console
    console.log("[Stage] DEBUG drag started:", { pointId, climbId, cursorPos, grabOffset: this.dragGrabOffset });
  };

  private handlePointerUp = (e: PointerEvent): void => {
    // eslint-disable-next-line no-console
    console.log(
      "[Stage] DEBUG pointerup:",
      "draggingPointId=", this.draggingPointId,
      "dragCurrentPos=", this.dragCurrentPos,
      "pointerId=", e.pointerId,
      "target=", e.target,
      "clientX=", e.clientX,
      "clientY=", e.clientY,
      "activePointers-before-delete=", this.activePointers.size,
    );

    this.activePointers.delete(e.pointerId);
    try {
      this.svg.releasePointerCapture(e.pointerId);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log("[Stage] DEBUG releasePointerCapture THREW:", err);
    }

    if (this.draggingPointId) {
      const pointId = this.draggingPointId;
      const finalPos = this.dragCurrentPos;
      this.draggingPointId = null;
      this.dragGrabOffset = null;
      this.dragCurrentPos = null;
      this.pointerDownClientPos = null;
      this.renderer.setDraggingPoint(null);

      // Commit the drag as a single undo step — intermediate drag positions (rendered via
      // renderer.setTopo(draft) above) never touch the command stack.
      if (finalPos) {
        // eslint-disable-next-line no-console
        console.log("[Stage] DEBUG committing MovePointCommand:", { pointId, finalPos });
        this.callbacks.onExecute(createMovePointCommand(this.topo, pointId, finalPos.x, finalPos.y));
      } else {
        // eslint-disable-next-line no-console
        console.log("[Stage] DEBUG drag ended with no dragCurrentPos — no pointermove was ever recorded during the drag.");
      }
      return;
    }

    if (this.pinchLastDistance !== null) {
      this.pinchLastDistance = null;
      const remaining = [...this.activePointers.values()][0];
      if (remaining) {
        // One finger of a pinch lifted, one remains down: keep panning with it rather than
        // treating the rest of the gesture as a fresh tap.
        this.isPanning = true;
        this.panLastClientPos = { ...remaining };
        this.pointerDownClientPos = null;
        // eslint-disable-next-line no-console
        console.log("[Stage] DEBUG pinch ended, continuing as a pan with the remaining pointer.");
      }
      return;
    }

    if (this.hadMultiTouch && this.activePointers.size === 0) {
      // The whole gesture involved 2+ fingers at some point — never treat its tail end as a tap.
      this.hadMultiTouch = false;
      this.isPanning = false;
      this.panLastClientPos = null;
      this.pointerDownClientPos = null;
      return;
    }

    if (this.isPanning) {
      this.isPanning = false;
      this.panLastClientPos = null;
      this.pointerDownClientPos = null;
      return;
    }

    // Not a point-drag, not a pinch/pan: synthesize a "click" directly from this
    // pointerdown+pointerup pair, rather than depending on the browser's native click event
    // (see the class-level comment on pointerDownClientPos for why).
    const downPos = this.pointerDownClientPos;
    this.pointerDownClientPos = null;
    if (!downPos) return;

    const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
    const movementThreshold = isTouchPointerType(e.pointerType)
      ? TAP_MOVEMENT_THRESHOLD_PX_TOUCH
      : TAP_MOVEMENT_THRESHOLD_PX_MOUSE;
    // eslint-disable-next-line no-console
    console.log("[Stage] DEBUG synthesized click candidate: moved=", moved, "px threshold=", movementThreshold);
    if (moved > movementThreshold) {
      // Defensive fallback: pointermove should already have flipped isPanning above this
      // threshold, but a sparse/coalesced pointermove stream could in principle skip straight
      // from pointerdown to a far-away pointerup.
      // eslint-disable-next-line no-console
      console.log("[Stage] DEBUG synthesized click discarded: moved too far to count as a tap.");
      return;
    }

    this.performDrawAction(e);
  };

  private performDrawAction(e: PointerEvent): void {
    if (this.callbacks.getActiveTool() !== "draw") {
      // eslint-disable-next-line no-console
      console.log("[Stage] DEBUG click ignored: tool is not 'draw'.");
      return;
    }
    const activeClimbId = this.callbacks.getActiveClimbId();
    if (!activeClimbId) {
      // eslint-disable-next-line no-console
      console.log("[Stage] DEBUG click ignored: no active climb.");
      return;
    }

    const touch = isTouchPointerType(e.pointerType);
    const pos = this.normalizedPos(e);
    const action = resolveDrawClick({
      topo: this.topo,
      activeClimbId,
      pos,
      snapThreshold: touch ? SNAP_THRESHOLD_TOUCH : SNAP_THRESHOLD_MOUSE,
      hitTolerance: touch ? HIT_TOLERANCE_TOUCH : HIT_TOLERANCE_MOUSE,
    });
    // eslint-disable-next-line no-console
    console.log("[Stage] DEBUG resolveDrawClick result:", { activeClimbId, pos, action });

    switch (action.type) {
      case "snap":
        this.callbacks.onExecute(
          createAddPathPointCommand(this.topo, activeClimbId, {
            kind: "existing",
            pointId: action.pointId,
          }),
        );
        break;
      case "switchActiveClimb":
        this.callbacks.onSwitchActiveClimb(action.climbId);
        break;
      case "split":
        this.callbacks.onExecute(
          createAddPathPointCommand(
            this.topo,
            activeClimbId,
            { kind: "new", x: pos.x, y: pos.y },
            action.insertAt,
          ),
        );
        break;
      case "append":
        this.callbacks.onExecute(
          createAddPathPointCommand(this.topo, activeClimbId, {
            kind: "new",
            x: pos.x,
            y: pos.y,
          }),
        );
        break;
    }
  }
}
