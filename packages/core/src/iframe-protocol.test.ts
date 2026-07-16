import { describe, expect, it } from "vitest";
import {
  IFRAME_PROTOCOL_SOURCE,
  isIframeToParentMessage,
  isParentToIframeMessage,
} from "./iframe-protocol.js";

describe("isParentToIframeMessage", () => {
  it("accepts valid parent->iframe message shapes", () => {
    expect(
      isParentToIframeMessage({
        source: IFRAME_PROTOCOL_SOURCE,
        type: "set-highlighted-climb",
        payload: { climbId: "a" },
      }),
    ).toBe(true);
  });

  it("rejects messages missing the protocol source", () => {
    expect(isParentToIframeMessage({ type: "set-topo", payload: {} })).toBe(false);
  });

  it("rejects messages with the right source but an iframe->parent-only type", () => {
    expect(isParentToIframeMessage({ source: IFRAME_PROTOCOL_SOURCE, type: "ready" })).toBe(false);
  });

  it("rejects unrelated postMessage traffic (null, primitives, foreign shapes)", () => {
    expect(isParentToIframeMessage(null)).toBe(false);
    expect(isParentToIframeMessage("hello")).toBe(false);
    expect(isParentToIframeMessage({ source: "some-other-widget", type: "init" })).toBe(false);
  });
});

describe("isIframeToParentMessage", () => {
  it("accepts valid iframe->parent message shapes", () => {
    expect(isIframeToParentMessage({ source: IFRAME_PROTOCOL_SOURCE, type: "ready" })).toBe(true);
    expect(
      isIframeToParentMessage({
        source: IFRAME_PROTOCOL_SOURCE,
        type: "climb-click",
        payload: { climbId: "a" },
      }),
    ).toBe(true);
  });

  it("rejects a parent->iframe-only type", () => {
    expect(
      isIframeToParentMessage({ source: IFRAME_PROTOCOL_SOURCE, type: "init", payload: {} }),
    ).toBe(false);
  });
});
