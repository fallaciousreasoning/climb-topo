import { describe, expect, it } from "vitest";
import { Viewport } from "./Viewport.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/** jsdom's getBoundingClientRect always returns zeros; stub a fixed rendered size for tests. */
function createSvgRoot(rect: { left: number; top: number; width: number; height: number }): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
  svg.getBoundingClientRect = () =>
    ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height, x: rect.left, y: rect.top, toJSON() {} }) as DOMRect;
  return svg;
}

const IMAGE = { width: 800, height: 1200 };

describe("Viewport", () => {
  it("starts fully zoomed out, viewBox spanning the whole image", () => {
    const viewport = new Viewport(IMAGE);
    expect(viewport.getViewBox()).toBe("0 0 800 1200");
    expect(viewport.getScale()).toBe(1);
    expect(viewport.isAtDefault()).toBe(true);
  });

  it("clientToNormalized maps the rendered box edges to 0 and 1 at default zoom", () => {
    const viewport = new Viewport(IMAGE);
    const svg = createSvgRoot({ left: 100, top: 50, width: 400, height: 600 });

    expect(viewport.clientToNormalized(svg, 100, 50)).toEqual({ x: 0, y: 0 });
    expect(viewport.clientToNormalized(svg, 500, 650)).toEqual({ x: 1, y: 1 });
    expect(viewport.clientToNormalized(svg, 300, 350)).toEqual({ x: 0.5, y: 0.5 });
  });

  it("normalizedToClient is the inverse of clientToNormalized at default zoom", () => {
    const viewport = new Viewport(IMAGE);
    const svg = createSvgRoot({ left: 100, top: 50, width: 400, height: 600 });

    expect(viewport.normalizedToClient(svg, { x: 0, y: 0 })).toEqual({ x: 100, y: 50 });
    expect(viewport.normalizedToClient(svg, { x: 1, y: 1 })).toEqual({ x: 500, y: 650 });
    expect(viewport.normalizedToClient(svg, { x: 0.5, y: 0.5 })).toEqual({ x: 300, y: 350 });
  });

  it("normalizedToClient round-trips through clientToNormalized after zoom/pan", () => {
    const viewport = new Viewport(IMAGE);
    const svg = createSvgRoot({ left: 0, top: 0, width: 400, height: 600 });
    viewport.zoomAtClientPoint(svg, 250, 400, 2.5);
    viewport.panByClientDelta(svg, 30, -20);

    const normalized = viewport.clientToNormalized(svg, 180, 220);
    const client = viewport.normalizedToClient(svg, normalized);
    expect(client.x).toBeCloseTo(180, 5);
    expect(client.y).toBeCloseTo(220, 5);
  });

  it("zoomAtClientPoint keeps the focal point at the same normalized position after zooming", () => {
    const viewport = new Viewport(IMAGE);
    const svg = createSvgRoot({ left: 0, top: 0, width: 400, height: 600 });

    const focalClient = { x: 300, y: 400 }; // some point that's not the center
    const before = viewport.clientToNormalized(svg, focalClient.x, focalClient.y);

    viewport.zoomAtClientPoint(svg, focalClient.x, focalClient.y, 2);
    const after = viewport.clientToNormalized(svg, focalClient.x, focalClient.y);

    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.y).toBeCloseTo(before.y, 5);
    expect(viewport.getScale()).toBe(2);
  });

  it("clamps scale to the configured min/max", () => {
    const viewport = new Viewport(IMAGE, { minScale: 1, maxScale: 4 });
    const svg = createSvgRoot({ left: 0, top: 0, width: 400, height: 600 });

    viewport.zoomAtClientPoint(svg, 200, 300, 0.1); // way below minScale
    expect(viewport.getScale()).toBe(1);

    viewport.zoomAtClientPoint(svg, 200, 300, 100); // way above maxScale
    expect(viewport.getScale()).toBe(4);
  });

  it("panByClientDelta moves the viewBox window, but clamps within image bounds", () => {
    const viewport = new Viewport(IMAGE);
    const svg = createSvgRoot({ left: 0, top: 0, width: 400, height: 600 });
    viewport.zoomAtClientPoint(svg, 200, 300, 2); // zoom in so there's room to pan

    viewport.panByClientDelta(svg, 50, 50); // drag right+down -> content should move left+up
    const afterSomePan = viewport.getViewBox();
    expect(afterSomePan).not.toBe("0 0 400 600");

    // Pan a huge amount in one direction -- should clamp at the image edge, not go negative
    // or beyond the image bounds.
    viewport.panByClientDelta(svg, -100000, -100000);
    const [x, y] = viewport.getViewBox().split(" ").map(Number);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeGreaterThanOrEqual(0);

    viewport.panByClientDelta(svg, 100000, 100000);
    const [x2, y2, w2, h2] = viewport.getViewBox().split(" ").map(Number);
    expect(x2! + w2!).toBeLessThanOrEqual(IMAGE.width + 0.001);
    expect(y2! + h2!).toBeLessThanOrEqual(IMAGE.height + 0.001);
  });

  it("cannot pan at all at the default (fully zoomed out) scale", () => {
    const viewport = new Viewport(IMAGE);
    const svg = createSvgRoot({ left: 0, top: 0, width: 400, height: 600 });

    viewport.panByClientDelta(svg, 9999, 9999);
    expect(viewport.getViewBox()).toBe("0 0 800 1200");
  });

  it("reset() returns to the default view", () => {
    const viewport = new Viewport(IMAGE);
    const svg = createSvgRoot({ left: 0, top: 0, width: 400, height: 600 });
    viewport.zoomAtClientPoint(svg, 200, 300, 3);
    viewport.panByClientDelta(svg, 20, 20);
    expect(viewport.isAtDefault()).toBe(false);

    viewport.reset();
    expect(viewport.isAtDefault()).toBe(true);
    expect(viewport.getViewBox()).toBe("0 0 800 1200");
  });
});
