import type { Topo } from "@climb-topo/core";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ClimbTopoViewerElement, defineClimbTopoViewer, TAG_NAME } from "./ClimbTopoViewerElement.js";

beforeAll(() => {
  defineClimbTopoViewer();
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function makeTopo(overrides: Partial<Topo> = {}): Topo {
  return {
    schemaVersion: 1,
    id: "t1",
    image: { url: "x.jpg", width: 100, height: 100 },
    points: {
      p1: { id: "p1", x: 0.1, y: 0.1, type: "vertex" },
      p2: { id: "p2", x: 0.5, y: 0.5, type: "vertex" },
    },
    climbs: [{ id: "a", name: "A", visible: true, pointIds: ["p1", "p2"] }],
    ...overrides,
  };
}

describe("ClimbTopoViewerElement", () => {
  it("registers under the expected tag name", () => {
    expect(customElements.get(TAG_NAME)).toBe(ClimbTopoViewerElement);
  });

  it("renders a climb line into shadow DOM when data is set", () => {
    const el = document.createElement(TAG_NAME) as ClimbTopoViewerElement;
    document.body.appendChild(el);
    el.data = makeTopo();

    const line = el.shadowRoot?.querySelector(".topo-climb__line");
    expect(line?.getAttribute("d")).toMatch(/^M /);
  });

  it("does not render draggable point handles (read-only viewer)", () => {
    const el = document.createElement(TAG_NAME) as ClimbTopoViewerElement;
    document.body.appendChild(el);
    el.data = makeTopo();

    expect(el.shadowRoot?.querySelectorAll(".topo-climb__points > *").length).toBe(0);
  });

  it("reflects highlighted-climb-id attribute to the property and vice versa", () => {
    const el = document.createElement(TAG_NAME) as ClimbTopoViewerElement;
    document.body.appendChild(el);
    el.data = makeTopo();

    el.setAttribute("highlighted-climb-id", "a");
    expect(el.highlightedClimbId).toBe("a");

    el.highlightedClimbId = null;
    expect(el.hasAttribute("highlighted-climb-id")).toBe(false);
  });

  it("applies the highlighted class to the corresponding climb group", () => {
    const el = document.createElement(TAG_NAME) as ClimbTopoViewerElement;
    document.body.appendChild(el);
    el.data = makeTopo();
    el.highlightedClimbId = "a";

    const group = el.shadowRoot?.querySelector('[data-climb-id="a"]');
    expect(group?.classList.contains("topo-climb--highlighted")).toBe(true);
  });

  it("fires climb-hover and climb-click events that bubble and cross the shadow boundary", () => {
    const el = document.createElement(TAG_NAME) as ClimbTopoViewerElement;
    document.body.appendChild(el);
    el.data = makeTopo();

    const hoverListener = vi.fn();
    const clickListener = vi.fn();
    document.body.addEventListener("climb-hover", hoverListener);
    document.body.addEventListener("climb-click", clickListener);

    const hitPath = el.shadowRoot!.querySelector(".topo-climb__hit-area")!;
    hitPath.dispatchEvent(new Event("pointerenter"));
    hitPath.dispatchEvent(new Event("click"));

    expect(hoverListener).toHaveBeenCalledTimes(1);
    expect(hoverListener.mock.calls[0]![0].detail).toEqual({ climbId: "a" });
    expect(clickListener).toHaveBeenCalledTimes(1);
    expect(clickListener.mock.calls[0]![0].detail).toEqual({ climbId: "a" });
  });

  it("opens a climb's link in a new tab when clicked, if one is set", () => {
    const el = document.createElement(TAG_NAME) as ClimbTopoViewerElement;
    document.body.appendChild(el);
    el.data = makeTopo({
      climbs: [
        { id: "a", name: "A", visible: true, pointIds: ["p1", "p2"], link: "https://example.com/a" },
      ],
    });

    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const hitPath = el.shadowRoot!.querySelector(".topo-climb__hit-area")!;
    hitPath.dispatchEvent(new Event("click"));

    expect(openSpy).toHaveBeenCalledWith("https://example.com/a", "_blank", "noopener,noreferrer");
  });

  it("does not call window.open when the climb has no link", () => {
    const el = document.createElement(TAG_NAME) as ClimbTopoViewerElement;
    document.body.appendChild(el);
    el.data = makeTopo(); // climb "a" has no link property

    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const hitPath = el.shadowRoot!.querySelector(".topo-climb__hit-area")!;
    hitPath.dispatchEvent(new Event("click"));

    expect(openSpy).not.toHaveBeenCalled();
  });

  it("loads data via the src attribute using fetch", async () => {
    const topo = makeTopo();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ json: async () => topo }) as Response),
    );

    const el = document.createElement(TAG_NAME) as ClimbTopoViewerElement;
    el.setAttribute("src", "https://example.com/topo.json");
    document.body.appendChild(el);

    await vi.waitFor(() => {
      expect(el.data).toEqual(topo);
    });
    expect(fetch).toHaveBeenCalledWith("https://example.com/topo.json");
  });

  it("destroy()s the renderer on disconnect without throwing", () => {
    const el = document.createElement(TAG_NAME) as ClimbTopoViewerElement;
    document.body.appendChild(el);
    el.data = makeTopo();

    expect(() => el.remove()).not.toThrow();
  });
});
