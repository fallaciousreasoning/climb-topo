import type { Topo } from "./model/topo.js";

/** Constant discriminant on every message so listeners can ignore unrelated postMessage traffic. */
export const IFRAME_PROTOCOL_SOURCE = "climb-topo-viewer" as const;

export type ParentToIframeMessage =
  | { source: typeof IFRAME_PROTOCOL_SOURCE; type: "init"; payload: Topo }
  | { source: typeof IFRAME_PROTOCOL_SOURCE; type: "set-topo"; payload: Topo }
  | {
      source: typeof IFRAME_PROTOCOL_SOURCE;
      type: "set-highlighted-climb";
      payload: { climbId: string | null };
    };

export type IframeToParentMessage =
  | { source: typeof IFRAME_PROTOCOL_SOURCE; type: "ready" }
  | {
      source: typeof IFRAME_PROTOCOL_SOURCE;
      type: "climb-hover";
      payload: { climbId: string | null };
    }
  | { source: typeof IFRAME_PROTOCOL_SOURCE; type: "climb-click"; payload: { climbId: string } }
  | { source: typeof IFRAME_PROTOCOL_SOURCE; type: "resize"; payload: { height: number } };

interface BaseMessage {
  source: typeof IFRAME_PROTOCOL_SOURCE;
  type: string;
}

function hasProtocolSource(data: unknown): data is BaseMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    "source" in data &&
    (data as { source: unknown }).source === IFRAME_PROTOCOL_SOURCE &&
    "type" in data &&
    typeof (data as { type: unknown }).type === "string"
  );
}

const PARENT_TO_IFRAME_TYPES = new Set<ParentToIframeMessage["type"]>([
  "init",
  "set-topo",
  "set-highlighted-climb",
]);
const IFRAME_TO_PARENT_TYPES = new Set<IframeToParentMessage["type"]>([
  "ready",
  "climb-hover",
  "climb-click",
  "resize",
]);

export function isParentToIframeMessage(data: unknown): data is ParentToIframeMessage {
  return hasProtocolSource(data) && PARENT_TO_IFRAME_TYPES.has(data.type as ParentToIframeMessage["type"]);
}

export function isIframeToParentMessage(data: unknown): data is IframeToParentMessage {
  return hasProtocolSource(data) && IFRAME_TO_PARENT_TYPES.has(data.type as IframeToParentMessage["type"]);
}
