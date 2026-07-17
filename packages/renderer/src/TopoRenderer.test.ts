import type { Climb, Topo, TopoPoint } from "@climb-topo/core";
import { describe, expect, it, vi } from "vitest";
import { EDITING_BLUE } from "./grade.js";
import type { PointTypeRenderer } from "./pointTypeRenderers.js";
import { TopoRenderer } from "./TopoRenderer.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function createSvgRoot(): SVGSVGElement {
  return document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
}

function point(id: string, x: number, y: number, type = "vertex"): TopoPoint {
  return { id, x, y, type };
}

function climb(overrides: Partial<Climb> & { id: string }): Climb {
  return { name: overrides.id, visible: true, pointIds: [], ...overrides };
}

function topo(overrides: Partial<Topo> = {}): Topo {
  return {
    schemaVersion: 1,
    id: "t1",
    image: { backgroundUrl: "x.jpg" },
    points: {},
    climbs: [],
    ...overrides,
  };
}

describe("TopoRenderer", () => {
  it("renders one <g data-climb-id> per visible climb with a non-empty curve", () => {
    const svgRoot = createSvgRoot();
    const renderer = new TopoRenderer({ svgRoot, image: { width: 100, height: 100 }, mode: "view" });

    const t = topo({
      points: { p1: point("p1", 0.1, 0.1), p2: point("p2", 0.5, 0.5) },
      climbs: [climb({ id: "a", pointIds: ["p1", "p2"] })],
    });
    renderer.setTopo(t);

    const group = svgRoot.querySelector('[data-climb-id="a"]');
    expect(group).not.toBeNull();
    const linePath = group!.querySelector(".topo-climb__line");
    expect(linePath?.getAttribute("d")).toMatch(/^M /);
  });

  it("does not render a group for a climb marked not visible", () => {
    const svgRoot = createSvgRoot();
    const renderer = new TopoRenderer({ svgRoot, image: { width: 100, height: 100 }, mode: "view" });

    renderer.setTopo(
      topo({
        points: { p1: point("p1", 0.1, 0.1) },
        climbs: [climb({ id: "hidden", visible: false, pointIds: ["p1"] })],
      }),
    );

    expect(svgRoot.querySelector('[data-climb-id="hidden"]')).toBeNull();
  });

  it("removes a climb's group once it is toggled to not-visible on a later render", () => {
    const svgRoot = createSvgRoot();
    const renderer = new TopoRenderer({ svgRoot, image: { width: 100, height: 100 }, mode: "view" });
    const base = topo({
      points: { p1: point("p1", 0.1, 0.1), p2: point("p2", 0.5, 0.5) },
      climbs: [climb({ id: "a", pointIds: ["p1", "p2"] })],
    });
    renderer.setTopo(base);
    expect(svgRoot.querySelector('[data-climb-id="a"]')).not.toBeNull();

    renderer.setTopo({ ...base, climbs: [{ ...base.climbs[0]!, visible: false }] });
    expect(svgRoot.querySelector('[data-climb-id="a"]')).toBeNull();
  });

  it("colors only the active climb EDITING_BLUE in edit mode, regardless of grade", () => {
    const svgRoot = createSvgRoot();
    const renderer = new TopoRenderer({ svgRoot, image: { width: 100, height: 100 }, mode: "edit" });
    renderer.setTopo(
      topo({
        points: {
          p1: point("p1", 0.1, 0.1),
          p2: point("p2", 0.5, 0.5),
          p3: point("p3", 0.6, 0.6),
          p4: point("p4", 0.9, 0.9),
        },
        climbs: [
          climb({ id: "a", pointIds: ["p1", "p2"], grade: { system: "yds", value: "5.13c" } }),
          climb({ id: "b", pointIds: ["p3", "p4"], grade: { system: "yds", value: "5.9" } }),
        ],
      }),
    );
    renderer.setActiveClimb("a");

    const linePathA = svgRoot.querySelector('[data-climb-id="a"] .topo-climb__line');
    const linePathB = svgRoot.querySelector('[data-climb-id="b"] .topo-climb__line');
    expect(linePathA?.getAttribute("stroke")).toBe(EDITING_BLUE);
    expect(linePathB?.getAttribute("stroke")).not.toBe(EDITING_BLUE);
  });

  it("renders point handles only in edit mode", () => {
    const t = topo({
      points: { p1: point("p1", 0.1, 0.1), p2: point("p2", 0.5, 0.5) },
      climbs: [climb({ id: "a", pointIds: ["p1", "p2"] })],
    });

    const viewSvg = createSvgRoot();
    new TopoRenderer({ svgRoot: viewSvg, image: { width: 100, height: 100 }, mode: "view" }).setTopo(t);
    expect(viewSvg.querySelectorAll(".topo-climb__points > *").length).toBe(0);

    const editSvg = createSvgRoot();
    new TopoRenderer({ svgRoot: editSvg, image: { width: 100, height: 100 }, mode: "edit" }).setTopo(t);
    expect(editSvg.querySelectorAll(".topo-climb__points > *").length).toBe(2);
  });

  describe("reference label", () => {
    it("renders the climb's reference code at its lowest (bottom) point", () => {
      const svgRoot = createSvgRoot();
      const renderer = new TopoRenderer({ svgRoot, image: { width: 100, height: 100 }, mode: "view" });
      renderer.setTopo(
        topo({
          points: { p1: point("p1", 0.2, 0.1), p2: point("p2", 0.4, 0.8) }, // p2 has the larger y (lower)
          climbs: [climb({ id: "a", reference: "SC", pointIds: ["p1", "p2"] })],
        }),
      );

      const label = svgRoot.querySelector('[data-climb-id="a"] .topo-climb__reference')!;
      expect(label.textContent).toBe("SC");
      expect(Number(label.getAttribute("x"))).toBeCloseTo(40, 5); // p2.x * width
      expect(Number(label.getAttribute("y"))).toBeGreaterThan(80); // below p2.y * height
    });

    it("hides the label entirely when the climb has no reference", () => {
      const svgRoot = createSvgRoot();
      const renderer = new TopoRenderer({ svgRoot, image: { width: 100, height: 100 }, mode: "view" });
      renderer.setTopo(
        topo({
          points: { p1: point("p1", 0.2, 0.1), p2: point("p2", 0.4, 0.8) },
          climbs: [climb({ id: "a", pointIds: ["p1", "p2"] })],
        }),
      );

      const label = svgRoot.querySelector<SVGElement>('[data-climb-id="a"] .topo-climb__reference')!;
      expect(label.style.display).toBe("none");
    });

    it("hides the label for a climb with a reference but no drawn points yet", () => {
      const svgRoot = createSvgRoot();
      const renderer = new TopoRenderer({ svgRoot, image: { width: 100, height: 100 }, mode: "view" });
      renderer.setTopo(
        topo({
          points: {},
          climbs: [climb({ id: "a", reference: "SC", pointIds: [] })],
        }),
      );

      const label = svgRoot.querySelector<SVGElement>('[data-climb-id="a"] .topo-climb__reference')!;
      expect(label.style.display).toBe("none");
    });

    it("spreads labels out side by side when climbs share the same bottom point", () => {
      const svgRoot = createSvgRoot();
      const renderer = new TopoRenderer({ svgRoot, image: { width: 100, height: 100 }, mode: "view" });
      renderer.setTopo(
        topo({
          points: { shared: point("shared", 0.3, 0.9), p2: point("p2", 0.3, 0.5), p3: point("p3", 0.35, 0.5) },
          climbs: [
            climb({ id: "a", reference: "SC", pointIds: ["shared", "p2"] }),
            climb({ id: "b", reference: "SCD", pointIds: ["shared", "p3"] }),
          ],
        }),
      );

      const labelA = svgRoot.querySelector('[data-climb-id="a"] .topo-climb__reference')!;
      const labelB = svgRoot.querySelector('[data-climb-id="b"] .topo-climb__reference')!;
      const xA = Number(labelA.getAttribute("x"));
      const xB = Number(labelB.getAttribute("x"));
      expect(xA).not.toBe(xB);
      // Both should still be centered around the shared point's x (30), not off near either
      // climb's own second point.
      expect((xA + xB) / 2).toBeCloseTo(30, 1);
    });

    it("does not offset a label when it's the only climb anchored at that point", () => {
      const svgRoot = createSvgRoot();
      const renderer = new TopoRenderer({ svgRoot, image: { width: 100, height: 100 }, mode: "view" });
      renderer.setTopo(
        topo({
          points: { p1: point("p1", 0.3, 0.9), p2: point("p2", 0.3, 0.5) },
          climbs: [climb({ id: "a", reference: "SC", pointIds: ["p1", "p2"] })],
        }),
      );

      const label = svgRoot.querySelector('[data-climb-id="a"] .topo-climb__reference')!;
      expect(Number(label.getAttribute("x"))).toBeCloseTo(30, 5);
    });
  });

  describe("shared-segment color priority", () => {
    it("ties (equal point count) fall back to array order", () => {
      const svgRoot = createSvgRoot();
      const renderer = new TopoRenderer({ svgRoot, image: { width: 100, height: 100 }, mode: "view" });
      const t = topo({
        points: { p1: point("p1", 0.1, 0.1), p2: point("p2", 0.5, 0.5), p3: point("p3", 0.9, 0.9) },
        climbs: [
          climb({ id: "first", pointIds: ["p1", "p2", "p3"], grade: { system: "ewbank", value: "30" } }),
          climb({ id: "second", pointIds: ["p1", "p2", "p3"], grade: { system: "ewbank", value: "10" } }),
        ],
      });
      renderer.setTopo(t);

      const firstLine = svgRoot.querySelector('[data-climb-id="first"] .topo-climb__line')!;
      const secondLine = svgRoot.querySelector('[data-climb-id="second"] .topo-climb__line')!;
      expect(firstLine.getAttribute("d")).toMatch(/^M /);
      expect(secondLine.getAttribute("d")).toBe("");
    });

    it("still gives ownership to the actively-edited climb regardless of grade", () => {
      const svgRoot = createSvgRoot();
      const renderer = new TopoRenderer({ svgRoot, image: { width: 100, height: 100 }, mode: "edit" });
      const t = topo({
        points: { p1: point("p1", 0.1, 0.1), p2: point("p2", 0.5, 0.5) },
        climbs: [
          climb({ id: "easy", pointIds: ["p1", "p2"], grade: { system: "ewbank", value: "10" } }),
          climb({ id: "active", pointIds: ["p1", "p2"], grade: { system: "ewbank", value: "30" } }),
        ],
      });
      renderer.setTopo(t);
      renderer.setActiveClimb("active");

      const activeLine = svgRoot.querySelector('[data-climb-id="active"] .topo-climb__line')!;
      const easyLine = svgRoot.querySelector('[data-climb-id="easy"] .topo-climb__line')!;
      expect(activeLine.getAttribute("stroke")).toBe(EDITING_BLUE);
      expect(activeLine.getAttribute("d")).toMatch(/^M /);
      expect(easyLine.getAttribute("d")).toBe("");
    });

    it("prefers the climb with fewer points (less likely to be a link-up) over grade", () => {
      const svgRoot = createSvgRoot();
      const renderer = new TopoRenderer({ svgRoot, image: { width: 100, height: 100 }, mode: "view" });
      const t = topo({
        points: {
          p1: point("p1", 0.1, 0.1),
          p2: point("p2", 0.5, 0.5),
          p3: point("p3", 0.9, 0.9),
        },
        climbs: [
          // "linkup" has an easier grade but more points -- shortness should still win.
          climb({
            id: "linkup",
            pointIds: ["p1", "p2", "p3"],
            grade: { system: "ewbank", value: "10" },
          }),
          climb({ id: "base", pointIds: ["p1", "p2"], grade: { system: "ewbank", value: "30" } }),
        ],
      });
      renderer.setTopo(t);

      const baseLine = svgRoot.querySelector('[data-climb-id="base"] .topo-climb__line')!;
      const linkupLine = svgRoot.querySelector('[data-climb-id="linkup"] .topo-climb__line')!;
      expect(baseLine.getAttribute("d")).toMatch(/^M /);
      // linkup only draws its own unique tail (p2->p3); base owns the shared p1->p2 edge.
      expect(linkupLine.getAttribute("d")?.match(/^M /)).toBeTruthy();
      expect(linkupLine.getAttribute("d")?.match(/C /g)?.length).toBe(1);
    });
  });

  describe("hover", () => {
    it("turns a climb EDITING_BLUE on hover in view mode, and reverts on hover-leave", () => {
      const svgRoot = createSvgRoot();
      const renderer = new TopoRenderer({ svgRoot, image: { width: 100, height: 100 }, mode: "view" });
      renderer.setTopo(
        topo({
          points: { p1: point("p1", 0.1, 0.1), p2: point("p2", 0.5, 0.5) },
          climbs: [climb({ id: "a", pointIds: ["p1", "p2"], grade: { system: "ewbank", value: "20" } })],
        }),
      );
      const line = svgRoot.querySelector('[data-climb-id="a"] .topo-climb__line')!;
      const hitArea = svgRoot.querySelector('[data-climb-id="a"] .topo-climb__hit-area')!;
      const originalColor = line.getAttribute("stroke");

      hitArea.dispatchEvent(new Event("pointermove", { bubbles: true }));
      expect(svgRoot.querySelector('[data-climb-id="a"] .topo-climb__line')!.getAttribute("stroke")).toBe(
        EDITING_BLUE,
      );

      svgRoot.dispatchEvent(new Event("pointerleave"));
      expect(svgRoot.querySelector('[data-climb-id="a"] .topo-climb__line')!.getAttribute("stroke")).toBe(
        originalColor,
      );
    });

    it("also turns the climb blue when hovering its reference label instead of its line", () => {
      const svgRoot = createSvgRoot();
      const renderer = new TopoRenderer({ svgRoot, image: { width: 100, height: 100 }, mode: "view" });
      renderer.setTopo(
        topo({
          points: { p1: point("p1", 0.1, 0.1), p2: point("p2", 0.5, 0.5) },
          climbs: [
            climb({
              id: "a",
              reference: "SC",
              pointIds: ["p1", "p2"],
              grade: { system: "ewbank", value: "20" },
            }),
          ],
        }),
      );
      const label = svgRoot.querySelector('[data-climb-id="a"] .topo-climb__reference')!;

      label.dispatchEvent(new Event("pointermove", { bubbles: true }));
      expect(svgRoot.querySelector('[data-climb-id="a"] .topo-climb__line')!.getAttribute("stroke")).toBe(
        EDITING_BLUE,
      );

      svgRoot.dispatchEvent(new Event("pointerleave"));
      expect(
        svgRoot.querySelector('[data-climb-id="a"] .topo-climb__line')!.getAttribute("stroke"),
      ).not.toBe(EDITING_BLUE);
    });

    it("does not apply the hover-blue override in edit mode", () => {
      const svgRoot = createSvgRoot();
      const renderer = new TopoRenderer({ svgRoot, image: { width: 100, height: 100 }, mode: "edit" });
      renderer.setTopo(
        topo({
          points: { p1: point("p1", 0.1, 0.1), p2: point("p2", 0.5, 0.5) },
          climbs: [climb({ id: "a", pointIds: ["p1", "p2"], grade: { system: "ewbank", value: "20" } })],
        }),
      );
      const hitArea = svgRoot.querySelector('[data-climb-id="a"] .topo-climb__hit-area')!;
      const before = svgRoot.querySelector('[data-climb-id="a"] .topo-climb__line')!.getAttribute("stroke");

      hitArea.dispatchEvent(new Event("pointermove", { bubbles: true }));
      expect(svgRoot.querySelector('[data-climb-id="a"] .topo-climb__line')!.getAttribute("stroke")).toBe(
        before,
      );
    });

    it("highlights a climb's FULL path on hover via the overlay, without touching the owner's line", () => {
      // Regression: "Mt Pleasant Butcher" shares its top segment with "Weet-bix Kids" -- before
      // this fix, hovering the non-owning climb only highlighted its own unique portion,
      // leaving the shared tail looking un-hovered even though it's part of the same route.
      // A later regression (curve distortion, then over-highlighting a sibling's unrelated
      // portion) means the hover-blue must be a separate overlay path, never a recomputed/
      // recolored version of the owner's own line.
      const svgRoot = createSvgRoot();
      const renderer = new TopoRenderer({ svgRoot, image: { width: 100, height: 100 }, mode: "view" });
      const t = topo({
        points: { p1: point("p1", 0.1, 0.1), p2: point("p2", 0.5, 0.5), p3: point("p3", 0.9, 0.9) },
        climbs: [
          // "owner" has fewer points, so it normally owns the shared p2->p3 edge.
          climb({ id: "owner", pointIds: ["p2", "p3"] }),
          climb({ id: "other", pointIds: ["p1", "p2", "p3"] }),
        ],
      });
      renderer.setTopo(t);

      const ownerLine = svgRoot.querySelector('[data-climb-id="owner"] .topo-climb__line')!;
      const otherLine = svgRoot.querySelector('[data-climb-id="other"] .topo-climb__line')!;
      const ownerOverlay = svgRoot.querySelector('[data-climb-id="owner"] .topo-climb__hover-overlay')!;
      const otherOverlay = svgRoot.querySelector('[data-climb-id="other"] .topo-climb__hover-overlay')!;

      const ownerLineBefore = ownerLine.getAttribute("d");
      const otherLineBefore = otherLine.getAttribute("d");
      // Before hovering: neither overlay draws anything.
      expect(ownerOverlay.getAttribute("d")).toBe("");
      expect(otherOverlay.getAttribute("d")).toBe("");
      // "other" only draws its own unique p1->p2 segment (owner has the shared p2->p3 edge).
      expect(otherLineBefore?.match(/C /g)?.length).toBe(1);

      const otherHitArea = svgRoot.querySelector('[data-climb-id="other"] .topo-climb__hit-area')!;
      otherHitArea.dispatchEvent(new Event("pointermove", { bubbles: true }));

      // The hovered climb's own line/label turn blue, but the line's `d` (its geometry) never
      // changes -- no curve distortion.
      expect(otherLine.getAttribute("stroke")).toBe(EDITING_BLUE);
      expect(otherLine.getAttribute("d")).toBe(otherLineBefore);
      expect(ownerLine.getAttribute("d")).toBe(ownerLineBefore);
      // "other"'s overlay covers its own unique p1->p2 portion...
      expect(otherOverlay.getAttribute("d")?.match(/C /g)?.length).toBe(1);
      // ...and "owner"'s overlay covers just the shared p2->p3 segment it owns, using its own
      // (already-correct) curve -- together the two overlays cover "other"'s full route, but
      // "owner" itself never turns blue and none of its unrelated portions get swept in.
      expect(ownerLine.getAttribute("stroke")).not.toBe(EDITING_BLUE);
      expect(ownerOverlay.getAttribute("d")?.match(/C /g)?.length).toBe(1);

      svgRoot.dispatchEvent(new Event("pointerleave"));
      expect(otherOverlay.getAttribute("d")).toBe("");
      expect(ownerOverlay.getAttribute("d")).toBe("");
    });
  });

  it("hides plain vertex points in view mode but keeps named features (bolt/anchor) visible", () => {
    const t = topo({
      points: {
        p1: point("p1", 0.1, 0.1, "vertex"),
        p2: point("p2", 0.3, 0.3, "bolt"),
        p3: point("p3", 0.6, 0.6, "anchor"),
      },
      climbs: [climb({ id: "a", pointIds: ["p1", "p2", "p3"] })],
    });

    const svgRoot = createSvgRoot();
    new TopoRenderer({ svgRoot, image: { width: 100, height: 100 }, mode: "view" }).setTopo(t);

    expect(svgRoot.querySelector('[data-point-id="p1"]')).toBeNull();
    expect(svgRoot.querySelector('[data-point-id="p2"]')).not.toBeNull();
    expect(svgRoot.querySelector('[data-point-id="p3"]')).not.toBeNull();
  });

  it("disables pointer-events on point hit-areas outside edit mode, so they don't shadow the climb line", () => {
    const t = topo({
      points: { p1: point("p1", 0.3, 0.3, "bolt") },
      climbs: [climb({ id: "a", pointIds: ["p1"] })],
    });

    const svgRoot = createSvgRoot();
    new TopoRenderer({ svgRoot, image: { width: 100, height: 100 }, mode: "view" }).setTopo(t);
    const hitArea = svgRoot.querySelector<SVGElement>('[data-point-id="p1"] .topo-point__hit-area')!;
    expect(hitArea.style.pointerEvents).toBe("none");
  });

  it("renders a wider black outline path behind the visible line", () => {
    const t = topo({
      points: { p1: point("p1", 0.1, 0.1), p2: point("p2", 0.5, 0.5) },
      climbs: [climb({ id: "a", pointIds: ["p1", "p2"] })],
    });
    const svgRoot = createSvgRoot();
    new TopoRenderer({ svgRoot, image: { width: 100, height: 100 }, mode: "view" }).setTopo(t);

    const outline = svgRoot.querySelector('[data-climb-id="a"] .topo-climb__outline')!;
    const line = svgRoot.querySelector('[data-climb-id="a"] .topo-climb__line')!;
    expect(outline.getAttribute("stroke")).toBe("#000");
    expect(Number(outline.getAttribute("stroke-width"))).toBeGreaterThan(Number(line.getAttribute("stroke-width")));
    expect(outline.getAttribute("d")).toBe(line.getAttribute("d"));
    // Outline must come before the visible line in paint order, i.e. sit underneath it.
    expect(outline.compareDocumentPosition(line)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("fires hover and click callbacks with the climb id, via the hit-area path", () => {
    const svgRoot = createSvgRoot();
    const onClimbHover = vi.fn();
    const onClimbClick = vi.fn();
    const renderer = new TopoRenderer({
      svgRoot,
      image: { width: 100, height: 100 },
      mode: "view",
      onClimbHover,
      onClimbClick,
    });
    renderer.setTopo(
      topo({
        points: { p1: point("p1", 0.1, 0.1), p2: point("p2", 0.5, 0.5) },
        climbs: [climb({ id: "a", pointIds: ["p1", "p2"] })],
      }),
    );

    const hitPath = svgRoot.querySelector(".topo-climb__hit-area")!;
    hitPath.dispatchEvent(new Event("pointermove", { bubbles: true }));
    expect(onClimbHover).toHaveBeenCalledWith("a");

    svgRoot.dispatchEvent(new Event("pointerleave"));
    expect(onClimbHover).toHaveBeenLastCalledWith(null);

    hitPath.dispatchEvent(new Event("click"));
    expect(onClimbClick).toHaveBeenCalledWith("a");
  });

  it("does not attach interaction listeners when interactive is false", () => {
    const svgRoot = createSvgRoot();
    const onClimbHover = vi.fn();
    const renderer = new TopoRenderer({
      svgRoot,
      image: { width: 100, height: 100 },
      mode: "view",
      interactive: false,
      onClimbHover,
    });
    renderer.setTopo(
      topo({
        points: { p1: point("p1", 0, 0), p2: point("p2", 1, 1) },
        climbs: [climb({ id: "a", pointIds: ["p1", "p2"] })],
      }),
    );

    svgRoot.querySelector(".topo-climb__hit-area")!.dispatchEvent(new Event("pointermove", { bubbles: true }));
    expect(onClimbHover).not.toHaveBeenCalled();
  });

  it("setHighlightedClimb toggles the highlighted class and brings the group to front", () => {
    const svgRoot = createSvgRoot();
    const renderer = new TopoRenderer({ svgRoot, image: { width: 100, height: 100 }, mode: "view" });
    renderer.setTopo(
      topo({
        points: { p1: point("p1", 0, 0), p2: point("p2", 1, 1) },
        climbs: [
          climb({ id: "a", pointIds: ["p1", "p2"] }),
          climb({ id: "b", pointIds: ["p1", "p2"] }),
        ],
      }),
    );

    renderer.setHighlightedClimb("a");
    const groupA = svgRoot.querySelector('[data-climb-id="a"]')!;
    expect(groupA.classList.contains("topo-climb--highlighted")).toBe(true);
    // Bring-to-front re-appends the node, so it should now be the last child.
    expect(svgRoot.lastElementChild).toBe(groupA);
  });

  it("destroy() removes all rendered groups", () => {
    const svgRoot = createSvgRoot();
    const renderer = new TopoRenderer({ svgRoot, image: { width: 100, height: 100 }, mode: "view" });
    renderer.setTopo(
      topo({
        points: { p1: point("p1", 0, 0), p2: point("p2", 1, 1) },
        climbs: [climb({ id: "a", pointIds: ["p1", "p2"] })],
      }),
    );
    expect(svgRoot.children.length).toBeGreaterThan(0);

    renderer.destroy();
    expect(svgRoot.children.length).toBe(0);
  });

  it("uses a registered custom point-type renderer instead of the default vertex circle", () => {
    const boltRenderer: PointTypeRenderer = {
      type: "bolt",
      render: () => document.createElementNS(SVG_NS, "rect"),
    };
    const svgRoot = createSvgRoot();
    const renderer = new TopoRenderer({
      svgRoot,
      image: { width: 100, height: 100 },
      mode: "edit",
      pointTypeRenderers: [boltRenderer],
    });
    renderer.setTopo(
      topo({
        points: {
          p1: point("p1", 0.1, 0.1, "bolt"),
          p2: point("p2", 0.5, 0.5, "vertex"),
        },
        climbs: [climb({ id: "a", pointIds: ["p1", "p2"] })],
      }),
    );

    const wrappers = svgRoot.querySelectorAll(".topo-climb__points > g");
    expect(wrappers).toHaveLength(2);
    const boltWrapper = svgRoot.querySelector('[data-point-id="p1"]')!;
    expect(boltWrapper.firstElementChild?.tagName.toLowerCase()).toBe("rect");
    // Default vertex renderer draws a <g> containing a fat invisible hit-area circle plus
    // the small visible circle, to make points comfortable to grab for dragging.
    const vertexWrapper = svgRoot.querySelector('[data-point-id="p2"]')!;
    expect(vertexWrapper.firstElementChild?.tagName.toLowerCase()).toBe("g");
    expect(vertexWrapper.querySelector(".topo-point__visible")).not.toBeNull();
  });

  it("rebuilds a point's DOM from scratch when its type changes, instead of patching in place", () => {
    // Regression: a point changing type (e.g. vertex -> anchor via the editor's point-type
    // popup) needs a differently-shaped element (circle vs polygon). update() assumes the
    // same shape as last render, so re-rendering with a new type must call render() again,
    // not update() -- otherwise the old element lingers with attributes the new type doesn't use.
    const svgRoot = createSvgRoot();
    const renderer = new TopoRenderer({ svgRoot, image: { width: 100, height: 100 }, mode: "edit" });
    const base = topo({
      points: { p1: point("p1", 0.1, 0.1, "vertex") },
      climbs: [climb({ id: "a", pointIds: ["p1"] })],
    });
    renderer.setTopo(base);
    expect(svgRoot.querySelector('[data-point-id="p1"] .topo-point__visible')?.tagName.toLowerCase()).toBe("circle");

    renderer.setTopo({ ...base, points: { p1: { ...base.points["p1"]!, type: "anchor" } } });
    expect(svgRoot.querySelector('[data-point-id="p1"] .topo-point__visible')?.tagName.toLowerCase()).toBe("polygon");
  });

  it("setSnapTarget marks the corresponding point as snapTarget state", () => {
    const svgRoot = createSvgRoot();
    const renderer = new TopoRenderer({ svgRoot, image: { width: 100, height: 100 }, mode: "edit" });
    renderer.setTopo(
      topo({
        points: { p1: point("p1", 0.1, 0.1), p2: point("p2", 0.5, 0.5) },
        climbs: [climb({ id: "a", pointIds: ["p1", "p2"] })],
      }),
    );

    renderer.setSnapTarget("p2");
    const circle = svgRoot.querySelector('[data-point-id="p2"] .topo-point__visible')!;
    expect(circle.getAttribute("class")).toContain("topo-point--snapTarget");
  });

  it("setHoveredPoint marks the corresponding point as hovered state", () => {
    const svgRoot = createSvgRoot();
    const renderer = new TopoRenderer({ svgRoot, image: { width: 100, height: 100 }, mode: "edit" });
    renderer.setTopo(
      topo({
        points: { p1: point("p1", 0.1, 0.1), p2: point("p2", 0.5, 0.5) },
        climbs: [climb({ id: "a", pointIds: ["p1", "p2"] })],
      }),
    );

    renderer.setHoveredPoint("p1");
    const circle = svgRoot.querySelector('[data-point-id="p1"] .topo-point__visible')!;
    expect(circle.getAttribute("class")).toContain("topo-point--hovered");

    renderer.setHoveredPoint(null);
    expect(circle.getAttribute("class")).not.toContain("topo-point--hovered");
  });

  it("setSelectedPoint marks the corresponding point as selected state", () => {
    const svgRoot = createSvgRoot();
    const renderer = new TopoRenderer({ svgRoot, image: { width: 100, height: 100 }, mode: "edit" });
    renderer.setTopo(
      topo({
        points: { p1: point("p1", 0.1, 0.1), p2: point("p2", 0.5, 0.5) },
        climbs: [climb({ id: "a", pointIds: ["p1", "p2"] })],
      }),
    );

    renderer.setSelectedPoint("p2");
    const circle = svgRoot.querySelector('[data-point-id="p2"] .topo-point__visible')!;
    expect(circle.getAttribute("class")).toContain("topo-point--selected");
  });

  it("snapTarget state takes priority over selected and hovered on the same point", () => {
    const svgRoot = createSvgRoot();
    const renderer = new TopoRenderer({ svgRoot, image: { width: 100, height: 100 }, mode: "edit" });
    renderer.setTopo(
      topo({
        points: { p1: point("p1", 0.1, 0.1), p2: point("p2", 0.5, 0.5) },
        climbs: [climb({ id: "a", pointIds: ["p1", "p2"] })],
      }),
    );

    renderer.setSelectedPoint("p1");
    renderer.setHoveredPoint("p1");
    renderer.setSnapTarget("p1");

    const circle = svgRoot.querySelector('[data-point-id="p1"] .topo-point__visible')!;
    expect(circle.getAttribute("class")).toContain("topo-point--snapTarget");
    expect(circle.getAttribute("class")).not.toContain("topo-point--selected");
  });

  describe("shared-segment de-duplication", () => {
    function makeLinkupFixture(): Topo {
      return topo({
        points: {
          p1: point("p1", 0.1, 0.1),
          p2: point("p2", 0.2, 0.2),
          p3: point("p3", 0.3, 0.3),
          p4: point("p4", 0.4, 0.4),
          p5: point("p5", 0.5, 0.5),
        },
        climbs: [
          climb({
            id: "base",
            grade: { system: "yds", value: "5.9" },
            pointIds: ["p1", "p2", "p3", "p4"],
          }),
          climb({
            id: "linkup",
            grade: { system: "yds", value: "5.11a" },
            pointIds: ["p1", "p2", "p3", "p4", "p5"],
          }),
        ],
      });
    }

    it("draws the base climb's full line, but only the diverging tail for the link-up", () => {
      const svgRoot = createSvgRoot();
      const renderer = new TopoRenderer({ svgRoot, image: { width: 100, height: 100 }, mode: "view" });
      renderer.setTopo(makeLinkupFixture());

      const baseLine = svgRoot.querySelector('[data-climb-id="base"] .topo-climb__line')!;
      const linkupLine = svgRoot.querySelector('[data-climb-id="linkup"] .topo-climb__line')!;

      expect(baseLine.getAttribute("d")?.match(/C /g)).toHaveLength(3); // full 4-point path
      expect(linkupLine.getAttribute("d")?.match(/C /g)).toHaveLength(1); // only p4->p5
      expect(linkupLine.getAttribute("d")?.match(/M /g)).toHaveLength(1);
    });

    it("hit-area paths are masked the same way as the visible line", () => {
      const svgRoot = createSvgRoot();
      const renderer = new TopoRenderer({ svgRoot, image: { width: 100, height: 100 }, mode: "view" });
      renderer.setTopo(makeLinkupFixture());

      const baseHit = svgRoot.querySelector('[data-climb-id="base"] .topo-climb__hit-area')!;
      const linkupHit = svgRoot.querySelector('[data-climb-id="linkup"] .topo-climb__hit-area')!;
      expect(baseHit.getAttribute("d")).toBe(
        svgRoot.querySelector('[data-climb-id="base"] .topo-climb__line')!.getAttribute("d"),
      );
      expect(linkupHit.getAttribute("d")).toBe(
        svgRoot.querySelector('[data-climb-id="linkup"] .topo-climb__line')!.getAttribute("d"),
      );
    });

    it("colors the shared portion using the base (non-link-up) climb's color", () => {
      const svgRoot = createSvgRoot();
      const renderer = new TopoRenderer({ svgRoot, image: { width: 100, height: 100 }, mode: "view" });
      renderer.setTopo(makeLinkupFixture());

      const baseLine = svgRoot.querySelector('[data-climb-id="base"] .topo-climb__line')!;
      const linkupLine = svgRoot.querySelector('[data-climb-id="linkup"] .topo-climb__line')!;
      // Different grades -> different colors, confirming each climb's own path segment is
      // colored independently (base's shared portion isn't overridden by the link-up).
      expect(baseLine.getAttribute("stroke")).not.toBe(linkupLine.getAttribute("stroke"));
    });

    it("re-renders correctly after toggling a climb's visibility, recomputing ownership", () => {
      const svgRoot = createSvgRoot();
      const renderer = new TopoRenderer({ svgRoot, image: { width: 100, height: 100 }, mode: "view" });
      const fixture = makeLinkupFixture();
      renderer.setTopo(fixture);

      // Hide the base climb -- the link-up should now own (and fully draw) its entire path.
      const hidden = {
        ...fixture,
        climbs: fixture.climbs.map((c) => (c.id === "base" ? { ...c, visible: false } : c)),
      };
      renderer.setTopo(hidden);

      expect(svgRoot.querySelector('[data-climb-id="base"]')).toBeNull();
      const linkupLine = svgRoot.querySelector('[data-climb-id="linkup"] .topo-climb__line')!;
      expect(linkupLine.getAttribute("d")?.match(/C /g)).toHaveLength(4); // now fully owned
    });
  });
});
