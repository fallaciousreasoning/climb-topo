import { IFRAME_PROTOCOL_SOURCE } from "@climb-topo/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TopoIframeController } from "./TopoIframeController.js";

let iframe: HTMLIFrameElement;

beforeEach(() => {
  iframe = document.createElement("iframe");
  document.body.appendChild(iframe);
});

afterEach(() => {
  document.body.replaceChildren();
});

function fromIframe(controller: TopoIframeController, message: unknown): void {
  window.dispatchEvent(
    new MessageEvent("message", { data: message, source: iframe.contentWindow! }),
  );
  void controller; // keep signature symmetric with other helpers; controller reacts via its own listener
}

describe("TopoIframeController", () => {
  it("queues outgoing messages until the iframe signals ready, then flushes in order", () => {
    const postSpy = vi.spyOn(iframe.contentWindow!, "postMessage");
    const controller = new TopoIframeController({ iframe });

    const topo = { schemaVersion: 1, id: "t1", image: { backgroundUrl: "x" }, points: {}, climbs: [] };
    controller.setTopo(topo);
    controller.setHighlightedClimb("a");
    expect(postSpy).not.toHaveBeenCalled();

    fromIframe(controller, { source: IFRAME_PROTOCOL_SOURCE, type: "ready" });

    expect(postSpy).toHaveBeenCalledTimes(2);
    expect(postSpy.mock.calls[0]![0]).toMatchObject({ type: "set-topo", payload: topo });
    expect(postSpy.mock.calls[1]![0]).toMatchObject({
      type: "set-highlighted-climb",
      payload: { climbId: "a" },
    });
  });

  it("sends immediately once ready, without queuing", () => {
    const controller = new TopoIframeController({ iframe });
    fromIframe(controller, { source: IFRAME_PROTOCOL_SOURCE, type: "ready" });

    const postSpy = vi.spyOn(iframe.contentWindow!, "postMessage");
    controller.setHighlightedClimb("b");
    expect(postSpy).toHaveBeenCalledTimes(1);
  });

  it("highlightedClimbId reflects the last call regardless of ready state", () => {
    const controller = new TopoIframeController({ iframe });
    controller.setHighlightedClimb("a");
    expect(controller.highlightedClimbId).toBe("a");
  });

  it("dispatches climb-hover and climb-click events with the iframe's payload", () => {
    const controller = new TopoIframeController({ iframe });
    const hover = vi.fn();
    const click = vi.fn();
    controller.addEventListener("climb-hover", hover);
    controller.addEventListener("climb-click", click);

    fromIframe(controller, {
      source: IFRAME_PROTOCOL_SOURCE,
      type: "climb-hover",
      payload: { climbId: "a" },
    });
    fromIframe(controller, {
      source: IFRAME_PROTOCOL_SOURCE,
      type: "climb-click",
      payload: { climbId: "a" },
    });

    expect(hover).toHaveBeenCalledTimes(1);
    expect((hover.mock.calls[0]![0] as CustomEvent).detail).toEqual({ climbId: "a" });
    expect(click).toHaveBeenCalledTimes(1);
    expect((click.mock.calls[0]![0] as CustomEvent).detail).toEqual({ climbId: "a" });
  });

  it("ignores messages whose source is not this iframe's contentWindow", () => {
    const controller = new TopoIframeController({ iframe });
    const hover = vi.fn();
    controller.addEventListener("climb-hover", hover);

    const otherWindow = document.createElement("iframe");
    document.body.appendChild(otherWindow);
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { source: IFRAME_PROTOCOL_SOURCE, type: "climb-hover", payload: { climbId: "x" } },
        source: otherWindow.contentWindow!,
      }),
    );

    expect(hover).not.toHaveBeenCalled();
  });

  it("ignores unrelated message shapes even from the right window", () => {
    const controller = new TopoIframeController({ iframe });
    const hover = vi.fn();
    controller.addEventListener("climb-hover", hover);
    fromIframe(controller, { unrelated: true });
    expect(hover).not.toHaveBeenCalled();
  });

  it("destroy() stops reacting to further messages", () => {
    const controller = new TopoIframeController({ iframe });
    const hover = vi.fn();
    controller.addEventListener("climb-hover", hover);
    controller.destroy();

    fromIframe(controller, {
      source: IFRAME_PROTOCOL_SOURCE,
      type: "climb-hover",
      payload: { climbId: "a" },
    });
    expect(hover).not.toHaveBeenCalled();
  });
});
