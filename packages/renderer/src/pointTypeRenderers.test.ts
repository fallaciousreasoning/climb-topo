import type { TopoPoint } from "@climb-topo/core";
import { describe, expect, it } from "vitest";
import {
  anchorPointRenderer,
  BUILT_IN_POINT_TYPES,
  boltPointRenderer,
  PointTypeRegistry,
  vertexPointRenderer,
  type PointRenderContext,
  type PointTypeRenderer,
} from "./pointTypeRenderers.js";

function point(overrides: Partial<TopoPoint> = {}): TopoPoint {
  return { id: "p1", x: 0.1, y: 0.1, type: "vertex", ...overrides };
}

function ctx(overrides: Partial<PointRenderContext> = {}): PointRenderContext {
  return { state: "default", climbId: "a", radius: 5, color: "#1e88ff", ...overrides };
}

describe("vertexPointRenderer", () => {
  it("renders a fat invisible hit area larger than the visible circle, for easier grabbing", () => {
    const el = vertexPointRenderer.render(point(), ctx({ radius: 5 }));
    const hitArea = el.querySelector<SVGCircleElement>(".topo-point__hit-area")!;
    const visible = el.querySelector<SVGCircleElement>(".topo-point__visible")!;

    expect(Number(hitArea.getAttribute("r"))).toBeGreaterThan(Number(visible.getAttribute("r")));
    expect(visible.getAttribute("r")).toBe("5");
    expect(hitArea.style.pointerEvents).toBe("all");
    expect(visible.style.pointerEvents).toBe("none");
  });

  it("update() resizes both circles when radius changes and applies the new state class", () => {
    const el = vertexPointRenderer.render(point(), ctx({ radius: 5 }));
    vertexPointRenderer.update?.(el, point(), ctx({ radius: 10, state: "snapTarget" }));

    const hitArea = el.querySelector<SVGCircleElement>(".topo-point__hit-area")!;
    const visible = el.querySelector<SVGCircleElement>(".topo-point__visible")!;
    expect(visible.getAttribute("r")).toBe("10");
    expect(visible.getAttribute("class")).toContain("topo-point--snapTarget");
    expect(Number(hitArea.getAttribute("r"))).toBeGreaterThan(10);
  });
});

describe("boltPointRenderer", () => {
  it("renders a solid circle with a hit area, distinct fill from vertex", () => {
    const el = boltPointRenderer.render(point({ type: "bolt" }), ctx({ radius: 5 }));
    const visible = el.querySelector<SVGCircleElement>(".topo-point__visible")!;
    expect(visible.getAttribute("fill")).not.toBe("none");
    expect(visible.getAttribute("class")).toContain("topo-point--bolt");
  });

  it("update() applies the new state class", () => {
    const el = boltPointRenderer.render(point({ type: "bolt" }), ctx({ radius: 5 }));
    boltPointRenderer.update?.(el, point({ type: "bolt" }), ctx({ radius: 5, state: "hovered" }));
    const visible = el.querySelector<SVGCircleElement>(".topo-point__visible")!;
    expect(visible.getAttribute("class")).toContain("topo-point--hovered");
  });
});

describe("anchorPointRenderer", () => {
  it("renders a downward-pointing arrow polygon", () => {
    const el = anchorPointRenderer.render(point({ type: "anchor" }), ctx({ radius: 5 }));
    const visible = el.querySelector<SVGPolygonElement>(".topo-point__visible")!;
    expect(visible.tagName.toLowerCase()).toBe("polygon");
    expect(visible.getAttribute("points")).toBeTruthy();
    expect(visible.getAttribute("class")).toContain("topo-point--anchor");

    // The lowest point (largest y) should sit at x=0 -- confirms the shape actually comes to
    // a centered point at the bottom (an arrow tip), rather than pointing some other way.
    const pts = visible
      .getAttribute("points")!
      .trim()
      .split(" ")
      .map((pair) => pair.split(",").map(Number) as [number, number]);
    const lowestPoint = pts.reduce((a, b) => (b[1] > a[1] ? b : a));
    expect(lowestPoint[0]).toBe(0);
  });

  it("update() resizes the arrow when radius changes", () => {
    const el = anchorPointRenderer.render(point({ type: "anchor" }), ctx({ radius: 5 }));
    const before = el.querySelector<SVGPolygonElement>(".topo-point__visible")!.getAttribute("points");
    anchorPointRenderer.update?.(el, point({ type: "anchor" }), ctx({ radius: 10 }));
    const after = el.querySelector<SVGPolygonElement>(".topo-point__visible")!.getAttribute("points");
    expect(after).not.toBe(before);
  });
});

describe("BUILT_IN_POINT_TYPES", () => {
  it("lists exactly vertex, bolt, and anchor", () => {
    expect(BUILT_IN_POINT_TYPES).toEqual(["vertex", "bolt", "anchor"]);
  });
});

describe("PointTypeRegistry", () => {
  it("falls back to the vertex renderer for an unregistered type", () => {
    const registry = new PointTypeRegistry();
    expect(registry.get("nonexistent-type")).toBe(vertexPointRenderer);
  });

  it("registers bolt and anchor renderers by default, with no configuration needed", () => {
    const registry = new PointTypeRegistry();
    expect(registry.get("bolt")).toBe(boltPointRenderer);
    expect(registry.get("anchor")).toBe(anchorPointRenderer);
  });

  it("lets a consumer-provided renderer override a built-in type", () => {
    const customBolt: PointTypeRenderer = { type: "bolt", render: () => document.createElementNS("http://www.w3.org/2000/svg", "g") };
    const registry = new PointTypeRegistry([customBolt]);
    expect(registry.get("bolt")).toBe(customBolt);
  });
});
