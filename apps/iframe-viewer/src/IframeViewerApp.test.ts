import { IFRAME_PROTOCOL_SOURCE, type IframeToParentMessage, type Topo } from "@climb-topo/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IframeViewerApp } from "./IframeViewerApp.js";

/** jsdom's Image never actually loads anything or sets naturalWidth/naturalHeight -- stub the
 *  global constructor so `new Image()` behaves like a real one that just finished loading.
 *  Pixel dimensions are always resolved this way now (see the comment on Topo.image), so every
 *  test that mounts data needs this in place. */
function stubImageLoad(size = { width: 100, height: 100 }): void {
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = size.width;
    naturalHeight = size.height;
    set src(_url: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal("Image", FakeImage);
}

function makeTopo(overrides: Partial<Topo> = {}): Topo {
  return {
    schemaVersion: 1,
    id: "t1",
    image: { backgroundUrl: "x.jpg" },
    points: {
      p1: { id: "p1", x: 0.1, y: 0.1, type: "vertex" },
      p2: { id: "p2", x: 0.5, y: 0.5, type: "vertex" },
    },
    climbs: [{ id: "a", name: "A", visible: true, pointIds: ["p1", "p2"] }],
    ...overrides,
  };
}

beforeEach(() => {
  stubImageLoad();
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("IframeViewerApp", () => {
  it("sendReady posts a ready message", () => {
    const postMessage = vi.fn<(m: IframeToParentMessage) => void>();
    const app = new IframeViewerApp({ container: document.body, postMessage });
    app.sendReady();
    expect(postMessage).toHaveBeenCalledWith({ source: IFRAME_PROTOCOL_SOURCE, type: "ready" });
  });

  it("ignores unrelated postMessage traffic", () => {
    const postMessage = vi.fn<(m: IframeToParentMessage) => void>();
    const app = new IframeViewerApp({ container: document.body, postMessage });
    app.handleMessage({ some: "unrelated payload" });
    app.handleMessage(null);
    app.handleMessage("just a string");
    expect(document.body.querySelector(".topo-climb__line")).toBeNull();
  });

  it("mounts a renderer on init/set-topo messages and reports a resize", async () => {
    const postMessage = vi.fn<(m: IframeToParentMessage) => void>();
    const app = new IframeViewerApp({ container: document.body, postMessage });

    app.handleMessage({ source: IFRAME_PROTOCOL_SOURCE, type: "init", payload: makeTopo() });

    await vi.waitFor(() => {
      expect(document.body.querySelector(".topo-climb__line")).not.toBeNull();
    });
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ source: IFRAME_PROTOCOL_SOURCE, type: "resize" }),
    );
  });

  it("re-mounts on a later set-topo message without leaking the old renderer's DOM", async () => {
    const postMessage = vi.fn<(m: IframeToParentMessage) => void>();
    const app = new IframeViewerApp({ container: document.body, postMessage });

    const first = makeTopo();
    app.handleMessage({ source: IFRAME_PROTOCOL_SOURCE, type: "init", payload: first });
    await vi.waitFor(() => {
      expect(document.body.querySelector('[data-climb-id="a"]')).not.toBeNull();
    });

    const second: Topo = { ...first, climbs: [{ ...first.climbs[0]!, id: "b" }] };
    app.handleMessage({ source: IFRAME_PROTOCOL_SOURCE, type: "set-topo", payload: second });

    await vi.waitFor(() => {
      expect(document.body.querySelector('[data-climb-id="b"]')).not.toBeNull();
    });
    expect(document.body.querySelector('[data-climb-id="a"]')).toBeNull();
  });

  it("applies set-highlighted-climb to the mounted renderer", async () => {
    const postMessage = vi.fn<(m: IframeToParentMessage) => void>();
    const app = new IframeViewerApp({ container: document.body, postMessage });

    app.handleMessage({ source: IFRAME_PROTOCOL_SOURCE, type: "init", payload: makeTopo() });
    await vi.waitFor(() => {
      expect(document.body.querySelector('[data-climb-id="a"]')).not.toBeNull();
    });
    app.handleMessage({
      source: IFRAME_PROTOCOL_SOURCE,
      type: "set-highlighted-climb",
      payload: { climbId: "a" },
    });

    const group = document.body.querySelector('[data-climb-id="a"]');
    expect(group?.classList.contains("topo-climb--highlighted")).toBe(true);
  });

  it("forwards hover/click from the renderer as postMessage calls", async () => {
    const postMessage = vi.fn<(m: IframeToParentMessage) => void>();
    const app = new IframeViewerApp({ container: document.body, postMessage });
    app.handleMessage({ source: IFRAME_PROTOCOL_SOURCE, type: "init", payload: makeTopo() });
    await vi.waitFor(() => {
      expect(document.body.querySelector(".topo-climb__hit-area")).not.toBeNull();
    });

    document.body
      .querySelector(".topo-climb__hit-area")!
      .dispatchEvent(new Event("pointermove", { bubbles: true }));
    expect(postMessage).toHaveBeenCalledWith({
      source: IFRAME_PROTOCOL_SOURCE,
      type: "climb-hover",
      payload: { climbId: "a" },
    });

    document.body.querySelector(".topo-climb__hit-area")!.dispatchEvent(new Event("click"));
    expect(postMessage).toHaveBeenCalledWith({
      source: IFRAME_PROTOCOL_SOURCE,
      type: "climb-click",
      payload: { climbId: "a" },
    });
  });

  it("opens a climb's link in a new tab when clicked, if one is set", async () => {
    const postMessage = vi.fn<(m: IframeToParentMessage) => void>();
    const app = new IframeViewerApp({ container: document.body, postMessage });
    app.handleMessage({
      source: IFRAME_PROTOCOL_SOURCE,
      type: "init",
      payload: makeTopo({
        climbs: [
          { id: "a", name: "A", visible: true, pointIds: ["p1", "p2"], link: "https://example.com/a" },
        ],
      }),
    });
    await vi.waitFor(() => {
      expect(document.body.querySelector(".topo-climb__hit-area")).not.toBeNull();
    });

    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    document.body.querySelector(".topo-climb__hit-area")!.dispatchEvent(new Event("click"));

    expect(openSpy).toHaveBeenCalledWith("https://example.com/a", "_blank", "noopener,noreferrer");
  });

  it("does not call window.open when the climb has no link", async () => {
    const postMessage = vi.fn<(m: IframeToParentMessage) => void>();
    const app = new IframeViewerApp({ container: document.body, postMessage });
    app.handleMessage({ source: IFRAME_PROTOCOL_SOURCE, type: "init", payload: makeTopo() });
    await vi.waitFor(() => {
      expect(document.body.querySelector(".topo-climb__hit-area")).not.toBeNull();
    });

    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    document.body.querySelector(".topo-climb__hit-area")!.dispatchEvent(new Event("click"));

    expect(openSpy).not.toHaveBeenCalled();
  });
});
