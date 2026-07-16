import {
  IFRAME_PROTOCOL_SOURCE,
  isIframeToParentMessage,
  type ParentToIframeMessage,
  type Topo,
} from "@climb-topo/core";

export interface TopoIframeControllerOptions {
  iframe: HTMLIFrameElement;
  /** Defaults to "*" for early development; pass the iframe's real origin once known. */
  targetOrigin?: string;
}

/**
 * Parent-side wrapper around a `<climb-topo-editor iframe viewer>` embed. Normalizes the
 * postMessage protocol to the same event API the web component exposes on itself:
 * `addEventListener('climb-hover' | 'climb-click', ...)` plus a `highlightedClimbId` getter,
 * so host integration code can be written once regardless of embedding mode.
 */
export class TopoIframeController extends EventTarget {
  private readonly iframe: HTMLIFrameElement;
  private readonly targetOrigin: string;
  private ready = false;
  private readonly pending: ParentToIframeMessage[] = [];
  private currentHighlightedClimbId: string | null = null;

  constructor(opts: TopoIframeControllerOptions) {
    super();
    this.iframe = opts.iframe;
    this.targetOrigin = opts.targetOrigin ?? "*";
    window.addEventListener("message", this.handleMessage);
  }

  setTopo(data: Topo): void {
    this.send({ source: IFRAME_PROTOCOL_SOURCE, type: "set-topo", payload: data });
  }

  setHighlightedClimb(climbId: string | null): void {
    this.currentHighlightedClimbId = climbId;
    this.send({
      source: IFRAME_PROTOCOL_SOURCE,
      type: "set-highlighted-climb",
      payload: { climbId },
    });
  }

  get highlightedClimbId(): string | null {
    return this.currentHighlightedClimbId;
  }

  destroy(): void {
    window.removeEventListener("message", this.handleMessage);
  }

  /** Queues a message until the iframe signals 'ready', avoiding a lost-init race. */
  private send(message: ParentToIframeMessage): void {
    if (!this.ready) {
      this.pending.push(message);
      return;
    }
    this.postNow(message);
  }

  private postNow(message: ParentToIframeMessage): void {
    this.iframe.contentWindow?.postMessage(message, this.targetOrigin);
  }

  private handleMessage = (e: MessageEvent): void => {
    if (e.source !== this.iframe.contentWindow) return;
    if (!isIframeToParentMessage(e.data)) return;
    const message = e.data;

    if (message.type === "ready") {
      this.ready = true;
      for (const queued of this.pending.splice(0)) this.postNow(queued);
    } else if (message.type === "climb-hover") {
      this.dispatchEvent(new CustomEvent("climb-hover", { detail: message.payload }));
    } else if (message.type === "climb-click") {
      this.dispatchEvent(new CustomEvent("climb-click", { detail: message.payload }));
    } else if (message.type === "resize") {
      this.dispatchEvent(new CustomEvent("resize", { detail: message.payload }));
    }
  };
}
