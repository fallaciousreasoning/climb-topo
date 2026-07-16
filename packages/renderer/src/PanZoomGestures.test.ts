import { afterEach, describe, expect, it, vi } from "vitest";
import { PanZoomGestures } from "./PanZoomGestures.js";
import { Viewport } from "./Viewport.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const IMAGE = { width: 800, height: 1200 };

function createSvgRoot(rect: { left: number; top: number; width: number; height: number }): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
  svg.getBoundingClientRect = () =>
    ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height, x: rect.left, y: rect.top, toJSON() {} }) as DOMRect;
  document.body.appendChild(svg);
  return svg;
}

/** jsdom has no global PointerEvent constructor; a MouseEvent with `pointerId` patched on
 *  works fine here since our code only reads clientX/clientY/pointerId off the event. */
function pointerEvent(
  type: string,
  opts: { pointerId: number; clientX: number; clientY: number },
): PointerEvent {
  const event = new MouseEvent(type, {
    clientX: opts.clientX,
    clientY: opts.clientY,
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(event, "pointerId", { value: opts.pointerId, configurable: true });
  return event as unknown as PointerEvent;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("PanZoomGestures", () => {
  it("pans the viewBox on a single-pointer drag past the start threshold", () => {
    const svg = createSvgRoot({ left: 0, top: 0, width: 400, height: 600 });
    const viewport = new Viewport(IMAGE);
    viewport.zoomAtClientPoint(svg, 200, 300, 2); // zoom in so there's room to pan
    const before = svg.getAttribute("viewBox");
    // eslint-disable-next-line no-new
    new PanZoomGestures({ svgRoot: svg, viewport });

    svg.dispatchEvent(pointerEvent("pointerdown", { pointerId: 1, clientX: 200, clientY: 300 }));
    svg.dispatchEvent(pointerEvent("pointermove", { pointerId: 1, clientX: 260, clientY: 340 }));
    window.dispatchEvent(pointerEvent("pointerup", { pointerId: 1, clientX: 260, clientY: 340 }));

    expect(svg.getAttribute("viewBox")).not.toBe(before);
  });

  it("does not pan for movement under the start threshold (stays a tap)", () => {
    const svg = createSvgRoot({ left: 0, top: 0, width: 400, height: 600 });
    const viewport = new Viewport(IMAGE);
    viewport.zoomAtClientPoint(svg, 200, 300, 2);
    const before = svg.getAttribute("viewBox");
    // eslint-disable-next-line no-new
    new PanZoomGestures({ svgRoot: svg, viewport });

    svg.dispatchEvent(pointerEvent("pointerdown", { pointerId: 1, clientX: 200, clientY: 300 }));
    svg.dispatchEvent(pointerEvent("pointermove", { pointerId: 1, clientX: 202, clientY: 301 }));
    window.dispatchEvent(pointerEvent("pointerup", { pointerId: 1, clientX: 202, clientY: 301 }));

    expect(svg.getAttribute("viewBox")).toBe(before);
  });

  it("zooms on a two-pointer pinch (distance increasing)", () => {
    const svg = createSvgRoot({ left: 0, top: 0, width: 400, height: 600 });
    const viewport = new Viewport(IMAGE);
    // eslint-disable-next-line no-new
    new PanZoomGestures({ svgRoot: svg, viewport });

    svg.dispatchEvent(pointerEvent("pointerdown", { pointerId: 1, clientX: 180, clientY: 300 }));
    svg.dispatchEvent(pointerEvent("pointerdown", { pointerId: 2, clientX: 220, clientY: 300 }));
    svg.dispatchEvent(pointerEvent("pointermove", { pointerId: 1, clientX: 120, clientY: 300 }));
    svg.dispatchEvent(pointerEvent("pointermove", { pointerId: 2, clientX: 280, clientY: 300 }));

    expect(viewport.getScale()).toBeGreaterThan(1);
  });

  it("ignores wheel zoom without ctrlKey when wheelZoomRequiresCtrl is true (default)", () => {
    const svg = createSvgRoot({ left: 0, top: 0, width: 400, height: 600 });
    const viewport = new Viewport(IMAGE);
    // eslint-disable-next-line no-new
    new PanZoomGestures({ svgRoot: svg, viewport });

    svg.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, ctrlKey: false, cancelable: true }));
    expect(viewport.getScale()).toBe(1);
  });

  it("zooms on ctrl+wheel", () => {
    const svg = createSvgRoot({ left: 0, top: 0, width: 400, height: 600 });
    const viewport = new Viewport(IMAGE);
    // eslint-disable-next-line no-new
    new PanZoomGestures({ svgRoot: svg, viewport });

    svg.dispatchEvent(
      new WheelEvent("wheel", { deltaY: -100, ctrlKey: true, clientX: 200, clientY: 300, cancelable: true }),
    );
    expect(viewport.getScale()).toBeGreaterThan(1);
  });

  it("zooms on plain wheel when wheelZoomRequiresCtrl is false", () => {
    const svg = createSvgRoot({ left: 0, top: 0, width: 400, height: 600 });
    const viewport = new Viewport(IMAGE);
    // eslint-disable-next-line no-new
    new PanZoomGestures({ svgRoot: svg, viewport, wheelZoomRequiresCtrl: false });

    svg.dispatchEvent(
      new WheelEvent("wheel", { deltaY: -100, ctrlKey: false, clientX: 200, clientY: 300, cancelable: true }),
    );
    expect(viewport.getScale()).toBeGreaterThan(1);
  });

  it("destroy() stops reacting to further gestures", () => {
    const svg = createSvgRoot({ left: 0, top: 0, width: 400, height: 600 });
    const viewport = new Viewport(IMAGE);
    viewport.zoomAtClientPoint(svg, 200, 300, 2);
    const before = svg.getAttribute("viewBox");
    const gestures = new PanZoomGestures({ svgRoot: svg, viewport });
    gestures.destroy();

    svg.dispatchEvent(pointerEvent("pointerdown", { pointerId: 1, clientX: 200, clientY: 300 }));
    svg.dispatchEvent(pointerEvent("pointermove", { pointerId: 1, clientX: 260, clientY: 340 }));
    window.dispatchEvent(pointerEvent("pointerup", { pointerId: 1, clientX: 260, clientY: 340 }));

    expect(svg.getAttribute("viewBox")).toBe(before);
  });

  it("does not throw when setPointerCapture is unavailable", () => {
    const svg = createSvgRoot({ left: 0, top: 0, width: 400, height: 600 });
    svg.setPointerCapture = () => {
      throw new Error("not supported in this environment");
    };
    const viewport = new Viewport(IMAGE);
    // eslint-disable-next-line no-new
    new PanZoomGestures({ svgRoot: svg, viewport });

    expect(() =>
      svg.dispatchEvent(pointerEvent("pointerdown", { pointerId: 1, clientX: 200, clientY: 300 })),
    ).not.toThrow();
  });
});
