import { DEFAULT_POINT_TYPE, type TopoPoint } from "@climb-topo/core";

export type PointVisualState = "default" | "hovered" | "snapTarget" | "selected" | "dragging";

export interface PointRenderContext {
  state: PointVisualState;
  climbId: string;
  /** Pixel radius appropriate for the current image scale. */
  radius: number;
  /** The owning climb's current line color (EDITING_BLUE, grade-based, ...) — lets a vertex
   *  marker tint itself to match the line it's part of instead of using a fixed color. */
  color: string;
}

/**
 * Adding a new point type (e.g. "bolt", "anchor", "belay") means implementing and
 * registering one of these — no changes to core's data model or the rest of the renderer.
 */
export interface PointTypeRenderer {
  type: string;
  render(point: TopoPoint, ctx: PointRenderContext): SVGElement;
  /** Patch an existing element in place to avoid recreate/flicker on re-render. */
  update?(el: SVGElement, point: TopoPoint, ctx: PointRenderContext): void;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** The visible marker is much smaller than a comfortable mouse/touch target, so grabbing
 *  it for drag needs a larger invisible hit area — same "fat invisible hit area" technique
 *  used for climb lines. */
const HIT_AREA_RADIUS_MULTIPLIER = 3;
const VISIBLE_CIRCLE_CLASS = "topo-point__visible";

function pointClass(state: PointVisualState): string {
  return `topo-point topo-point--${state}`;
}

/** A translucent tint of the climb's own line color (not a fixed color) with a solid white
 *  outline — `fill-opacity` (rather than baking alpha into the color string) works regardless
 *  of whether the line color is a hex string or an hsl() one from the grade gradient. */
function applyVertexVisual(circle: SVGCircleElement, ctx: PointRenderContext): void {
  circle.setAttribute("r", String(ctx.radius));
  circle.setAttribute("fill", ctx.color);
  circle.setAttribute("fill-opacity", "0.55");
  circle.setAttribute("stroke", "#fff");
  circle.setAttribute("stroke-width", "1.5");
  circle.setAttribute("class", `${VISIBLE_CIRCLE_CLASS} ${pointClass(ctx.state)}`);
}

export const vertexPointRenderer: PointTypeRenderer = {
  type: DEFAULT_POINT_TYPE,
  render(_point, ctx) {
    const group = document.createElementNS(SVG_NS, "g") as SVGGElement;
    group.setAttribute("class", "topo-point-marker");

    const hitArea = document.createElementNS(SVG_NS, "circle") as SVGCircleElement;
    hitArea.setAttribute("cx", "0");
    hitArea.setAttribute("cy", "0");
    hitArea.setAttribute("r", String(ctx.radius * HIT_AREA_RADIUS_MULTIPLIER));
    hitArea.setAttribute("fill", "transparent");
    hitArea.setAttribute("class", "topo-point__hit-area");
    hitArea.style.pointerEvents = "all";

    const visible = document.createElementNS(SVG_NS, "circle") as SVGCircleElement;
    visible.setAttribute("cx", "0");
    visible.setAttribute("cy", "0");
    visible.style.pointerEvents = "none";
    applyVertexVisual(visible, ctx);

    group.append(hitArea, visible);
    return group;
  },
  update(el, _point, ctx) {
    const hitArea = el.querySelector<SVGCircleElement>(".topo-point__hit-area");
    hitArea?.setAttribute("r", String(ctx.radius * HIT_AREA_RADIUS_MULTIPLIER));

    const visible = el.querySelector<SVGCircleElement>(`.${VISIBLE_CIRCLE_CLASS}`);
    if (visible) applyVertexVisual(visible, ctx);
  },
};

/** Base visual attributes set directly (not just via CSS class) so bolt/anchor markers look
 *  right even where no editor stylesheet is loaded — they're the two point types meant to
 *  stay visible in view mode too (web component / iframe viewer), unlike plain vertex points
 *  which only ever render in the editor's own edit mode. CSS state classes are still applied
 *  on top for editor-only hover/selected/dragging affordances. */
function applyBoltVisual(circle: SVGCircleElement, ctx: PointRenderContext): void {
  circle.setAttribute("r", String(ctx.radius * 0.6));
  circle.setAttribute("fill", "#9a9a9a");
  circle.setAttribute("stroke", "#1a1a1a");
  circle.setAttribute("stroke-width", "1");
  circle.setAttribute("class", `${VISIBLE_CIRCLE_CLASS} topo-point--bolt ${pointClass(ctx.state)}`);
}

export const boltPointRenderer: PointTypeRenderer = {
  type: "bolt",
  render(_point, ctx) {
    const group = document.createElementNS(SVG_NS, "g") as SVGGElement;
    group.setAttribute("class", "topo-point-marker");

    const hitArea = document.createElementNS(SVG_NS, "circle") as SVGCircleElement;
    hitArea.setAttribute("cx", "0");
    hitArea.setAttribute("cy", "0");
    hitArea.setAttribute("r", String(ctx.radius * HIT_AREA_RADIUS_MULTIPLIER));
    hitArea.setAttribute("fill", "transparent");
    hitArea.setAttribute("class", "topo-point__hit-area");
    hitArea.style.pointerEvents = "all";

    const visible = document.createElementNS(SVG_NS, "circle") as SVGCircleElement;
    visible.setAttribute("cx", "0");
    visible.setAttribute("cy", "0");
    visible.style.pointerEvents = "none";
    applyBoltVisual(visible, ctx);

    group.append(hitArea, visible);
    return group;
  },
  update(el, _point, ctx) {
    const hitArea = el.querySelector<SVGCircleElement>(".topo-point__hit-area");
    hitArea?.setAttribute("r", String(ctx.radius * HIT_AREA_RADIUS_MULTIPLIER));

    const visible = el.querySelector<SVGCircleElement>(`.${VISIBLE_CIRCLE_CLASS}`);
    if (visible) applyBoltVisual(visible, ctx);
  },
};

/** Points (in local coordinates, tip pointing down) for a simple downward arrow — the anchor
 *  marker's shape, sized off the point radius so it scales the same way other markers do. */
function downwardArrowPoints(radius: number): string {
  const shaftHalfWidth = radius * 0.38;
  const shaftTop = -radius * 0.8;
  const shaftBottom = radius * 0.1;
  const headHalfWidth = radius * 0.95;
  const headTop = radius * 0.1;
  const tipY = radius * 0.9;
  return [
    [-shaftHalfWidth, shaftTop],
    [shaftHalfWidth, shaftTop],
    [shaftHalfWidth, shaftBottom],
    [headHalfWidth, headTop],
    [0, tipY],
    [-headHalfWidth, headTop],
    [-shaftHalfWidth, shaftBottom],
  ]
    .map(([x, y]) => `${x},${y}`)
    .join(" ");
}

/** A downward-pointing arrow (unlike the bolt's plain dot) — points at the belay/lower-off
 *  itself, since an anchor is a specific spot rather than just "a bolt along the way". Same
 *  color treatment as the vertex marker (translucent tint of the line color, white outline)
 *  so it reads as "part of this climb's line" — the arrow shape is what sets it apart, not color. */
function applyAnchorVisual(polygon: SVGPolygonElement, ctx: PointRenderContext): void {
  polygon.setAttribute("points", downwardArrowPoints(ctx.radius * 2.4));
  polygon.setAttribute("fill", ctx.color);
  polygon.setAttribute("fill-opacity", "0.55");
  polygon.setAttribute("stroke", "#fff");
  polygon.setAttribute("stroke-width", "1.5");
  polygon.setAttribute("class", `${VISIBLE_CIRCLE_CLASS} topo-point--anchor ${pointClass(ctx.state)}`);
}

// The arrow is drawn at 2.4x the base radius (see applyAnchorVisual), so its own hit area
// needs a correspondingly larger multiplier to fully cover it, rather than reusing the plain
// HIT_AREA_RADIUS_MULTIPLIER sized for the smaller vertex/bolt markers.
const ANCHOR_HIT_AREA_RADIUS_MULTIPLIER = 3.5;

export const anchorPointRenderer: PointTypeRenderer = {
  type: "anchor",
  render(_point, ctx) {
    const group = document.createElementNS(SVG_NS, "g") as SVGGElement;
    group.setAttribute("class", "topo-point-marker");

    const hitArea = document.createElementNS(SVG_NS, "circle") as SVGCircleElement;
    hitArea.setAttribute("cx", "0");
    hitArea.setAttribute("cy", "0");
    hitArea.setAttribute("r", String(ctx.radius * ANCHOR_HIT_AREA_RADIUS_MULTIPLIER));
    hitArea.setAttribute("fill", "transparent");
    hitArea.setAttribute("class", "topo-point__hit-area");
    hitArea.style.pointerEvents = "all";

    const visible = document.createElementNS(SVG_NS, "polygon") as SVGPolygonElement;
    visible.style.pointerEvents = "none";
    applyAnchorVisual(visible, ctx);

    group.append(hitArea, visible);
    return group;
  },
  update(el, _point, ctx) {
    const hitArea = el.querySelector<SVGCircleElement>(".topo-point__hit-area");
    hitArea?.setAttribute("r", String(ctx.radius * ANCHOR_HIT_AREA_RADIUS_MULTIPLIER));

    const visible = el.querySelector<SVGPolygonElement>(`.${VISIBLE_CIRCLE_CLASS}`);
    if (visible) applyAnchorVisual(visible, ctx);
  },
};

/** Every point type the renderer ships out of the box — used by editor UI (e.g. the
 *  point-type-picker popup) to offer a fixed set of choices without hardcoding strings. */
export const BUILT_IN_POINT_TYPES = [
  vertexPointRenderer.type,
  boltPointRenderer.type,
  anchorPointRenderer.type,
] as const;

const BUILT_IN_RENDERERS = [vertexPointRenderer, boltPointRenderer, anchorPointRenderer];

export class PointTypeRegistry {
  private renderers = new Map<string, PointTypeRenderer>();

  constructor(renderers: PointTypeRenderer[] = []) {
    for (const renderer of BUILT_IN_RENDERERS) {
      this.renderers.set(renderer.type, renderer);
    }
    // Consumer-provided renderers are applied after, so they can override a built-in type
    // (e.g. a host app wanting its own bolt icon) as well as register wholly new ones.
    for (const renderer of renderers) {
      this.register(renderer);
    }
  }

  register(renderer: PointTypeRenderer): void {
    this.renderers.set(renderer.type, renderer);
  }

  get(type: string): PointTypeRenderer {
    return this.renderers.get(type) ?? this.renderers.get(DEFAULT_POINT_TYPE) ?? vertexPointRenderer;
  }
}
