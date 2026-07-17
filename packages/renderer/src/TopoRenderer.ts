import { DEFAULT_POINT_TYPE, type Climb, type Topo, type TopoPoint } from "@climb-topo/core";
import { toPixel } from "./coords.js";
import { colorForClimb, EDITING_BLUE, type RenderMode } from "./grade.js";
import {
  PointTypeRegistry,
  type PointTypeRenderer,
  type PointVisualState,
} from "./pointTypeRenderers.js";
import { computeEdgeOwnership, computeOwnedSegmentMask, edgeKey } from "./sharedSegments.js";
import { buildSmoothPathFiltered } from "./spline.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const DEFAULT_POINT_RADIUS_RATIO = 0.006;
const HIT_AREA_STROKE_WIDTH = 24;
const REFERENCE_LABEL_FONT_SIZE_RATIO = 0.016;
/** How far below the climb's lowest point the reference label sits, in point-radius units. */
const REFERENCE_LABEL_OFFSET_RADIUS_MULTIPLIER = 3;
/** Horizontal spacing (in font-size units) between labels that share the same anchor point. */
const REFERENCE_LABEL_SLOT_WIDTH_RATIO = 2.2;

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

const LINE_STROKE_WIDTH = 2;
/** 1px black border on each side of the visible line. */
const LINE_OUTLINE_STROKE_WIDTH = LINE_STROKE_WIDTH + 2;

interface ClimbGroupRefs {
  group: SVGGElement;
  hitPath: SVGPathElement;
  outlinePath: SVGPathElement;
  visiblePath: SVGPathElement;
  /** Painted on top of visiblePath, in EDITING_BLUE, covering only whichever of this climb's
   *  own (owned-and-drawn) segments are also part of the hovered climb's path -- see
   *  computeHoverOverlayMask for why this can't just be a color swap on visiblePath itself. */
  hoverOverlayPath: SVGPathElement;
  pointsGroup: SVGGElement;
  referenceLabel: SVGTextElement;
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
  /** The climb currently under the pointer, tracked regardless of mode so hover-changed
   *  notifications stay deduplicated either way — but only consulted for color (turning
   *  EDITING_BLUE, same as the editor's active-climb highlight) in view mode. */
  private hoveredClimbId: string | null = null;
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

    // Hover is tracked centrally here (continuously re-derived from whatever's actually under
    // the pointer on every move) rather than via each climb's own pointerenter/pointerleave --
    // with many adjacent/overlapping hit-areas, per-element leave events can be missed on fast
    // pointer movement, which left a climb looking "stuck" highlighted until some other
    // element's enter happened to fire. Sampling the real target on every move self-corrects
    // regardless of any individual event that didn't fire.
    if (this.interactive) {
      this.svgRoot.addEventListener("pointermove", this.handleStagePointerMove);
      this.svgRoot.addEventListener("pointerleave", this.handleStagePointerLeave);
    }
  }

  private handleStagePointerMove = (e: PointerEvent): void => {
    const climbId =
      (e.target as Element | null)?.closest<SVGGElement>("[data-climb-id]")?.dataset.climbId ?? null;
    this.setHoveredClimb(climbId);
  };

  private handleStagePointerLeave = (): void => {
    this.setHoveredClimb(null);
  };

  private setHoveredClimb(climbId: string | null): void {
    if (climbId === this.hoveredClimbId) return;
    this.hoveredClimbId = climbId;
    this.onClimbHover?.(climbId);
    if (climbId) this.bringToFront(climbId);
    // Only view mode's color logic (resolveColor) consults hoveredClimbId, but the field
    // itself is tracked regardless of mode so notifications above stay deduplicated either way.
    if (this.mode === "view") this.render();
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
    this.svgRoot.removeEventListener("pointermove", this.handleStagePointerMove);
    this.svgRoot.removeEventListener("pointerleave", this.handleStagePointerLeave);
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
    // sharing points with its base climb(s) — should paint once, not once per climb, colored
    // as the easier of the overlapping climbs (computeEdgeOwnership gives priority to
    // whichever climb comes first, so sort easiest-first here rather than changing that
    // function's own tie-breaking rule). The climb actively being edited still always wins,
    // regardless of grade, so a shared segment never silently drops out of the edit-blue
    // highlight for the climb you're actually drawing.
    const edgeOwnership = computeEdgeOwnership(this.sortByEdgeOwnershipPriority(visibleClimbs));
    // Climbs whose reference labels would otherwise land in the exact same spot (e.g. two
    // climbs/link-ups starting from a shared point) — grouped so renderReferenceLabel can
    // spread them out side by side instead of stacking them illegibly on top of each other.
    const labelGroups = this.computeLabelGroups(visibleClimbs, topo);

    for (const climb of visibleClimbs) {
      this.renderClimb(climb, topo, edgeOwnership, labelGroups);
    }

    this.applyHighlight();
  }

  /** Maps a point id to the ids (in a stable order) of every climb whose lowest point is that
   *  point — i.e. every climb whose reference label would anchor there. */
  private computeLabelGroups(climbs: readonly Climb[], topo: Topo): Map<string, string[]> {
    const groups = new Map<string, string[]>();
    for (const climb of climbs) {
      if (!climb.reference) continue;
      const points = climb.pointIds
        .map((id) => topo.points[id])
        .filter((p): p is TopoPoint => p !== undefined);
      if (points.length === 0) continue;
      const bottomPointId = points.reduce((lowest, p) => (p.y > lowest.y ? p : lowest)).id;
      const group = groups.get(bottomPointId);
      if (group) group.push(climb.id);
      else groups.set(bottomPointId, [climb.id]);
    }
    return groups;
  }

  /** Priority order for computeEdgeOwnership's "first wins" rule (this also decides which
   *  climb's hit-area exists on a shared segment, so it governs hover/click there too):
   *  1. The actively-edited climb always comes first (so a shared segment never drops out of
   *     its edit-blue highlight while you're drawing it).
   *  2. Fewer points wins, always: a link-up typically incorporates a shared base route plus
   *     extra points on top of it, so the climb with fewer points is the more fundamental
   *     route — simpler and more natural-looking than factoring grade in as well. Ties (equal
   *     point counts) fall back to array order. */
  private sortByEdgeOwnershipPriority(climbs: readonly Climb[]): Climb[] {
    return [...climbs].sort((a, b) => {
      if (this.mode === "edit") {
        const aActive = a.id === this.activeClimbId;
        const bActive = b.id === this.activeClimbId;
        if (aActive !== bActive) return aActive ? -1 : 1;
      }
      return a.pointIds.length - b.pointIds.length;
    });
  }

  private renderClimb(
    climb: Climb,
    topo: Topo,
    edgeOwnership: Map<string, string>,
    labelGroups: Map<string, string[]>,
  ): void {
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

    const color = this.resolveColor(climb);

    refs.hitPath.setAttribute("d", d);
    refs.outlinePath.setAttribute("d", d);
    refs.visiblePath.setAttribute("d", d);
    refs.visiblePath.setAttribute("stroke", color);
    refs.hoverOverlayPath.setAttribute(
      "d",
      buildSmoothPathFiltered(pixelPoints, this.computeHoverOverlayMask(climb, segmentMask)),
    );

    this.renderReferenceLabel(refs, climb, points, pixelPoints, color, labelGroups);
    this.renderPoints(refs, climb, points, color);
  }

  /**
   * Which of this climb's OWN (already owned-and-drawn) segments should also show the blue
   * hover overlay: exactly the ones that are also an edge of the currently-hovered climb's own
   * path. For the hovered climb itself this is every one of its owned segments (trivially all
   * its own edges are its own edges), so its full visible line lights up; for a climb that
   * merely shares an edge with the hovered one, only that specific shared segment lights up —
   * never its own unrelated portions, and never a segment it doesn't already own and draw
   * itself (which is what keeps this from redrawing another climb's geometry from scratch and
   * subtly changing the curve's shape).
   */
  private computeHoverOverlayMask(climb: Climb, ownedSegmentMask: readonly boolean[]): boolean[] {
    if (this.mode !== "view" || !this.hoveredClimbId) return ownedSegmentMask.map(() => false);

    const hoveredClimb = this.topo?.climbs.find((c) => c.id === this.hoveredClimbId);
    if (!hoveredClimb) return ownedSegmentMask.map(() => false);
    const hoveredEdgeKeys = new Set<string>();
    for (let i = 0; i < hoveredClimb.pointIds.length - 1; i++) {
      hoveredEdgeKeys.add(edgeKey(hoveredClimb.pointIds[i]!, hoveredClimb.pointIds[i + 1]!));
    }

    return ownedSegmentMask.map((owned, i) => {
      if (!owned) return false;
      return hoveredEdgeKeys.has(edgeKey(climb.pointIds[i]!, climb.pointIds[i + 1]!));
    });
  }

  /** The climb's short reference code (e.g. "SC"), shown at the bottom of its line -- the
   *  common topo convention of labeling a route near its base. Skipped entirely if the climb
   *  has no reference or isn't drawn yet. If another climb's label shares the same anchor
   *  point (e.g. two climbs starting from the same spot), both are spread out side by side
   *  around it instead of rendering exactly on top of each other. */
  private renderReferenceLabel(
    refs: ClimbGroupRefs,
    climb: Climb,
    points: TopoPoint[],
    pixelPoints: { x: number; y: number }[],
    color: string,
    labelGroups: Map<string, string[]>,
  ): void {
    if (!climb.reference || points.length === 0) {
      refs.referenceLabel.style.display = "none";
      return;
    }

    let bottomIndex = 0;
    for (let i = 1; i < points.length; i++) {
      if (points[i]!.y > points[bottomIndex]!.y) bottomIndex = i;
    }
    const bottomPointId = points[bottomIndex]!.id;
    const bottomPixel = pixelPoints[bottomIndex]!;

    const fontSize = this.image.width * REFERENCE_LABEL_FONT_SIZE_RATIO;
    const radius = this.image.width * DEFAULT_POINT_RADIUS_RATIO;

    const siblings = labelGroups.get(bottomPointId) ?? [climb.id];
    const indexInGroup = siblings.indexOf(climb.id);
    const slotWidth = fontSize * REFERENCE_LABEL_SLOT_WIDTH_RATIO;
    const xOffset = (indexInGroup - (siblings.length - 1) / 2) * slotWidth;

    refs.referenceLabel.style.display = "";
    refs.referenceLabel.textContent = climb.reference;
    refs.referenceLabel.setAttribute("x", String(bottomPixel.x + xOffset));
    refs.referenceLabel.setAttribute(
      "y",
      String(bottomPixel.y + radius * REFERENCE_LABEL_OFFSET_RADIUS_MULTIPLIER),
    );
    refs.referenceLabel.setAttribute("font-size", String(fontSize));
    refs.referenceLabel.setAttribute("fill", color);
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
    outlinePath.setAttribute("stroke-opacity", "0.8");
    outlinePath.setAttribute("stroke-width", String(LINE_OUTLINE_STROKE_WIDTH));
    outlinePath.setAttribute("vector-effect", "non-scaling-stroke");
    outlinePath.style.pointerEvents = "none";

    const visiblePath = document.createElementNS(SVG_NS, "path") as SVGPathElement;
    visiblePath.setAttribute("class", "topo-climb__line");
    visiblePath.setAttribute("fill", "none");
    visiblePath.setAttribute("stroke-width", String(LINE_STROKE_WIDTH));
    visiblePath.setAttribute("vector-effect", "non-scaling-stroke");
    visiblePath.style.pointerEvents = "none";

    const hoverOverlayPath = document.createElementNS(SVG_NS, "path") as SVGPathElement;
    hoverOverlayPath.setAttribute("class", "topo-climb__hover-overlay");
    hoverOverlayPath.setAttribute("fill", "none");
    hoverOverlayPath.setAttribute("stroke", EDITING_BLUE);
    hoverOverlayPath.setAttribute("stroke-width", String(LINE_STROKE_WIDTH));
    hoverOverlayPath.setAttribute("vector-effect", "non-scaling-stroke");
    hoverOverlayPath.style.pointerEvents = "none";

    const pointsGroup = document.createElementNS(SVG_NS, "g") as SVGGElement;
    pointsGroup.setAttribute("class", "topo-climb__points");

    // A white halo behind the colored fill (paint-order: stroke first) keeps the reference
    // code legible over a photo background regardless of the climb's own color, the same
    // reasoning as the line's black outline.
    const referenceLabel = document.createElementNS(SVG_NS, "text") as SVGTextElement;
    referenceLabel.setAttribute("class", "topo-climb__reference");
    referenceLabel.setAttribute("text-anchor", "middle");
    referenceLabel.setAttribute("font-weight", "bold");
    referenceLabel.setAttribute("paint-order", "stroke");
    referenceLabel.setAttribute("stroke", "#fff");
    referenceLabel.setAttribute("stroke-width", "3");
    // Also a hover target in its own right: in a cluster of tightly-packed lines, the label is
    // often a much easier target than the thin line it belongs to, and hovering it should show
    // that specific climb the same way hovering its line does.
    referenceLabel.style.pointerEvents = this.interactive ? "all" : "none";
    referenceLabel.style.cursor = this.interactive ? "pointer" : "";

    group.append(hitPath, outlinePath, visiblePath, hoverOverlayPath, pointsGroup, referenceLabel);

    // Hover itself is handled centrally (see handleStagePointerMove) rather than per element;
    // only click stays wired here directly.
    if (this.interactive) {
      const onClimbClick = (): void => this.onClimbClick?.(climbId);
      hitPath.addEventListener("click", onClimbClick);
      referenceLabel.addEventListener("click", onClimbClick);
    }

    return { group, hitPath, outlinePath, visiblePath, hoverOverlayPath, pointsGroup, referenceLabel };
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

  /** The climb's usual grade/edit color, except in view mode while it is DIRECTLY the hovered
   *  climb (not merely sharing a segment with it — see computeHoverOverlayMask for how a
   *  shared segment gets highlighted instead), where it turns EDITING_BLUE for its label/point
   *  markers — free hover feedback for read-only viewers, reusing the editor's active-climb
   *  blue. The line itself is never recolored directly; it's always drawn in this color with
   *  the hover overlay optionally painted on top, so a sibling climb's own unrelated portions
   *  never get swept up into the highlight. */
  private resolveColor(climb: Climb): string {
    if (this.mode === "view" && this.hoveredClimbId === climb.id) return EDITING_BLUE;
    return colorForClimb(climb, this.mode, this.activeClimbId);
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
      const color = this.resolveColor(climb);
      this.renderPoints(refs, climb, points, color);
    }
  }
}
