import { DEFAULT_POINT_TYPE, type Climb, type Topo, type TopoPoint } from "@climb-topo/core";
import { toPixel } from "./coords.js";
import { colorForClimb, type RenderMode } from "./grade.js";
import {
  PointTypeRegistry,
  type PointTypeRenderer,
  type PointVisualState,
} from "./pointTypeRenderers.js";
import { computeEdgeOwnership, computeOwnedSegmentMask } from "./sharedSegments.js";
import { buildSmoothPathFiltered } from "./spline.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const DEFAULT_POINT_RADIUS_RATIO = 0.006;
const HIT_AREA_STROKE_WIDTH = 24;

export interface TopoRendererOptions {
  svgRoot: SVGSVGElement;
  image: { width: number; height: number };
  mode: RenderMode;
  pointTypeRenderers?: PointTypeRenderer[];
  /** Whether hover/click listeners are attached. Defaults to true for 'edit', true for 'view'
   *  too (viewers still support hover/click) — set false to render fully inert output. */
  interactive?: boolean;
  onClimbHover?(climbId: string | null): void;
  onClimbClick?(climbId: string): void;
}

const LINE_STROKE_WIDTH = 4;
/** 1px black border on each side of the visible line. */
const LINE_OUTLINE_STROKE_WIDTH = LINE_STROKE_WIDTH + 2;

interface ClimbGroupRefs {
  group: SVGGElement;
  hitPath: SVGPathElement;
  outlinePath: SVGPathElement;
  visiblePath: SVGPathElement;
  pointsGroup: SVGGElement;
}

export class TopoRenderer {
  private readonly svgRoot: SVGSVGElement;
  private readonly image: { width: number; height: number };
  private readonly mode: RenderMode;
  private readonly interactive: boolean;
  private readonly pointTypes: PointTypeRegistry;
  private readonly onClimbHover?: (climbId: string | null) => void;
  private readonly onClimbClick?: (climbId: string) => void;

  private topo: Topo | null = null;
  private readonly climbGroups = new Map<string, ClimbGroupRefs>();
  private highlightedClimbId: string | null = null;
  private snapTargetPointId: string | null = null;
  private hoveredPointId: string | null = null;
  private selectedPointId: string | null = null;
  private draggingPointId: string | null = null;
  private activeClimbId: string | null = null;

  constructor(opts: TopoRendererOptions) {
    this.svgRoot = opts.svgRoot;
    this.image = opts.image;
    this.mode = opts.mode;
    this.interactive = opts.interactive ?? true;
    this.pointTypes = new PointTypeRegistry(opts.pointTypeRenderers);
    this.onClimbHover = opts.onClimbHover;
    this.onClimbClick = opts.onClimbClick;
  }

  setTopo(topo: Topo): void {
    this.topo = topo;
    this.render();
  }

  setHighlightedClimb(climbId: string | null): void {
    this.highlightedClimbId = climbId;
    this.applyHighlight();
  }

  /** Editor-only affordance: visually marks a point as the current link-up snap target. */
  setSnapTarget(pointId: string | null): void {
    this.snapTargetPointId = pointId;
    this.refreshAllPointStates();
  }

  /** Editor-only: visually marks a point as hovered (e.g. while the Select tool is active). */
  setHoveredPoint(pointId: string | null): void {
    this.hoveredPointId = pointId;
    this.refreshAllPointStates();
  }

  /** Editor-only: visually marks the currently-selected point (Select tool). */
  setSelectedPoint(pointId: string | null): void {
    this.selectedPointId = pointId;
    this.refreshAllPointStates();
  }

  /** Editor-only: visually marks a point as actively being dragged — highest-priority state,
   *  so it's obvious the instant a drag gesture starts. */
  setDraggingPoint(pointId: string | null): void {
    this.draggingPointId = pointId;
    this.refreshAllPointStates();
  }

  /**
   * Editor-only: the climb currently being drawn/edited. Only this climb renders as
   * EDITING_BLUE in edit mode — every other climb keeps its grade-based color, so context
   * from the rest of the topo stays visible while drawing.
   */
  setActiveClimb(climbId: string | null): void {
    this.activeClimbId = climbId;
    this.render();
  }

  destroy(): void {
    for (const refs of this.climbGroups.values()) {
      refs.group.remove();
    }
    this.climbGroups.clear();
    this.topo = null;
  }

  private render(): void {
    const topo = this.topo;
    if (!topo) return;

    const visibleClimbs = topo.climbs.filter((c) => c.visible);
    const currentIds = new Set(visibleClimbs.map((c) => c.id));
    for (const [id, refs] of this.climbGroups) {
      if (!currentIds.has(id)) {
        refs.group.remove();
        this.climbGroups.delete(id);
      }
    }

    // A segment (consecutive point pair) shared by more than one climb's path — a link-up
    // sharing points with its base climb(s) — should paint once, not once per climb.
    const edgeOwnership = computeEdgeOwnership(visibleClimbs);

    for (const climb of visibleClimbs) {
      this.renderClimb(climb, topo, edgeOwnership);
    }

    this.applyHighlight();
  }

  private renderClimb(climb: Climb, topo: Topo, edgeOwnership: Map<string, string>): void {
    let refs = this.climbGroups.get(climb.id);
    if (!refs) {
      refs = this.createClimbGroup(climb.id);
      this.climbGroups.set(climb.id, refs);
      this.svgRoot.appendChild(refs.group);
    }

    const points = climb.pointIds
      .map((id) => topo.points[id])
      .filter((p): p is TopoPoint => p !== undefined);
    const pixelPoints = points.map((p) => toPixel(p, this.image));
    const segmentMask = computeOwnedSegmentMask(climb, edgeOwnership);
    const d = buildSmoothPathFiltered(pixelPoints, segmentMask);

    const color = colorForClimb(climb, this.mode, this.activeClimbId);

    refs.hitPath.setAttribute("d", d);
    refs.outlinePath.setAttribute("d", d);
    refs.visiblePath.setAttribute("d", d);
    refs.visiblePath.setAttribute("stroke", color);

    this.renderPoints(refs, climb, points, color);
  }

  private createClimbGroup(climbId: string): ClimbGroupRefs {
    const group = document.createElementNS(SVG_NS, "g") as SVGGElement;
    group.dataset.climbId = climbId;
    group.setAttribute("class", "topo-climb");

    // Wide, transparent, pointer-events:stroke path carrying the event listeners — its `d`
    // is the same bezier curve as the visible line, so native hit-testing follows the
    // rendered curve rather than straight segments between points.
    const hitPath = document.createElementNS(SVG_NS, "path") as SVGPathElement;
    hitPath.setAttribute("class", "topo-climb__hit-area");
    hitPath.setAttribute("fill", "none");
    hitPath.setAttribute("stroke", "transparent");
    hitPath.setAttribute("stroke-width", String(HIT_AREA_STROKE_WIDTH));
    hitPath.style.pointerEvents = this.interactive ? "stroke" : "none";

    // A wider black stroke painted directly beneath the visible line, offset by
    // LINE_OUTLINE_EXTRA_WIDTH on each side — the standard SVG "outlined stroke" trick, since
    // SVG has no native stroke-outline property of its own.
    const outlinePath = document.createElementNS(SVG_NS, "path") as SVGPathElement;
    outlinePath.setAttribute("class", "topo-climb__outline");
    outlinePath.setAttribute("fill", "none");
    outlinePath.setAttribute("stroke", "#000");
    outlinePath.setAttribute("stroke-width", String(LINE_OUTLINE_STROKE_WIDTH));
    outlinePath.setAttribute("vector-effect", "non-scaling-stroke");
    outlinePath.style.pointerEvents = "none";

    const visiblePath = document.createElementNS(SVG_NS, "path") as SVGPathElement;
    visiblePath.setAttribute("class", "topo-climb__line");
    visiblePath.setAttribute("fill", "none");
    visiblePath.setAttribute("stroke-width", String(LINE_STROKE_WIDTH));
    visiblePath.setAttribute("vector-effect", "non-scaling-stroke");
    visiblePath.style.pointerEvents = "none";

    const pointsGroup = document.createElementNS(SVG_NS, "g") as SVGGElement;
    pointsGroup.setAttribute("class", "topo-climb__points");

    group.append(hitPath, outlinePath, visiblePath, pointsGroup);

    if (this.interactive) {
      hitPath.addEventListener("pointerenter", () => {
        this.onClimbHover?.(climbId);
        this.bringToFront(climbId);
      });
      hitPath.addEventListener("pointerleave", () => {
        this.onClimbHover?.(null);
      });
      hitPath.addEventListener("click", () => {
        this.onClimbClick?.(climbId);
      });
    }

    return { group, hitPath, outlinePath, visiblePath, pointsGroup };
  }

  private renderPoints(refs: ClimbGroupRefs, climb: Climb, points: TopoPoint[], color: string): void {
    const radius = this.image.width * DEFAULT_POINT_RADIUS_RATIO;
    const seenIds = new Set<string>();

    for (const point of points) {
      // Plain path vertices are just line-shape control points with no real-world meaning,
      // so they only make sense in edit mode. Named features (bolt, anchor, ...) are real
      // beta a viewer wants to see too, so they stay visible outside edit mode as well.
      if (this.mode !== "edit" && point.type === DEFAULT_POINT_TYPE) continue;

      seenIds.add(point.id);
      const renderer = this.pointTypes.get(point.type);
      const pixel = toPixel(point, this.image);
      const state = this.pointVisualState(point.id);
      const ctx = { state, climbId: climb.id, radius, color };

      let wrapper = refs.pointsGroup.querySelector<SVGGElement>(`[data-point-id="${point.id}"]`);
      if (!wrapper) {
        wrapper = document.createElementNS(SVG_NS, "g") as SVGGElement;
        wrapper.dataset.pointId = point.id;
        wrapper.dataset.pointType = point.type;
        wrapper.appendChild(renderer.render(point, ctx));
        refs.pointsGroup.appendChild(wrapper);
      } else {
        const el = wrapper.firstElementChild as SVGElement | null;
        // A point's type can change in place (e.g. the editor's point-type popup turning a
        // vertex into a bolt/anchor) — update() assumes the same element shape/tag as last
        // render, so a type change must rebuild from scratch rather than patch in place.
        const typeChanged = wrapper.dataset.pointType !== point.type;
        wrapper.dataset.pointType = point.type;
        if (el && renderer.update && !typeChanged) {
          renderer.update(el, point, ctx);
        } else if (el) {
          wrapper.replaceChild(renderer.render(point, ctx), el);
        }
      }
      wrapper.setAttribute("transform", `translate(${pixel.x}, ${pixel.y})`);

      // Point renderers always build their hit-area with pointer-events enabled (convenient
      // for edit-mode drag/select); outside edit mode nothing listens for it, so leaving it
      // "on" would just create small dead zones over the climb line's own hit-test area for
      // no benefit — force it off centrally instead of pushing this policy into every renderer.
      const hitArea = wrapper.querySelector<SVGElement>(".topo-point__hit-area");
      if (hitArea) hitArea.style.pointerEvents = this.mode === "edit" ? "all" : "none";
    }

    for (const child of Array.from(refs.pointsGroup.children)) {
      const id = (child as SVGGElement).dataset.pointId;
      if (id && !seenIds.has(id)) child.remove();
    }
  }

  /** Priority: actively dragging (must be unmistakable the instant a drag starts) > snap
   *  target (a distinct "this click does something special" affordance) > selected (persists
   *  across interactions) > hovered (transient) > default. */
  private pointVisualState(pointId: string): PointVisualState {
    if (this.draggingPointId === pointId) return "dragging";
    if (this.snapTargetPointId === pointId) return "snapTarget";
    if (this.selectedPointId === pointId) return "selected";
    if (this.hoveredPointId === pointId) return "hovered";
    return "default";
  }

  private applyHighlight(): void {
    for (const [id, refs] of this.climbGroups) {
      refs.group.classList.toggle("topo-climb--highlighted", id === this.highlightedClimbId);
    }
    if (this.highlightedClimbId) this.bringToFront(this.highlightedClimbId);
  }

  /** Re-appends the node as the last child of its parent — preserves listeners, paints on top. */
  private bringToFront(climbId: string): void {
    const refs = this.climbGroups.get(climbId);
    if (refs) this.svgRoot.appendChild(refs.group);
  }

  private refreshAllPointStates(): void {
    const topo = this.topo;
    if (!topo) return;
    for (const climb of topo.climbs) {
      const refs = this.climbGroups.get(climb.id);
      if (!refs) continue;
      const points = climb.pointIds
        .map((id) => topo.points[id])
        .filter((p): p is TopoPoint => p !== undefined);
      const color = colorForClimb(climb, this.mode, this.activeClimbId);
      this.renderPoints(refs, climb, points, color);
    }
  }
}
