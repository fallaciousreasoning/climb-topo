import {
  IFRAME_PROTOCOL_SOURCE,
  isParentToIframeMessage,
  type IframeToParentMessage,
  type Topo,
} from "@climb-topo/core";
import { createStageScaffold, PanZoomGestures, TopoRenderer, Viewport } from "@climb-topo/renderer";

export interface IframeViewerAppOptions {
  container: HTMLElement;
  /** Injectable so the message-handling logic is testable without a real cross-window iframe. */
  postMessage: (message: IframeToParentMessage) => void;
}

/** Core logic of the served iframe page, kept DOM-adjacent but postMessage-injectable for tests. */
export class IframeViewerApp {
  private renderer: TopoRenderer | null = null;
  private destroyScaffold: (() => void) | null = null;
  private panZoom: PanZoomGestures | null = null;
  private highlightedClimbId: string | null = null;
  private readonly container: HTMLElement;
  private readonly postMessage: (message: IframeToParentMessage) => void;

  constructor(opts: IframeViewerAppOptions) {
    this.container = opts.container;
    this.postMessage = opts.postMessage;
  }

  handleMessage(data: unknown): void {
    if (!isParentToIframeMessage(data)) return;

    if (data.type === "init" || data.type === "set-topo") {
      this.mount(data.payload);
    } else if (data.type === "set-highlighted-climb") {
      this.highlightedClimbId = data.payload.climbId;
      this.renderer?.setHighlightedClimb(this.highlightedClimbId);
    }
  }

  mount(topo: Topo): void {
    this.renderer?.destroy();
    this.panZoom?.destroy();
    this.destroyScaffold?.();
    this.container.replaceChildren();

    const scaffold = createStageScaffold(topo.image);
    this.destroyScaffold = scaffold.destroy;
    this.container.appendChild(scaffold.root);
    this.panZoom = new PanZoomGestures({
      svgRoot: scaffold.svg,
      viewport: new Viewport(topo.image),
    });

    this.renderer = new TopoRenderer({
      svgRoot: scaffold.svg,
      image: topo.image,
      mode: "view",
      onClimbHover: (climbId) =>
        this.postMessage({
          source: IFRAME_PROTOCOL_SOURCE,
          type: "climb-hover",
          payload: { climbId },
        }),
      onClimbClick: (climbId) => {
        this.postMessage({
          source: IFRAME_PROTOCOL_SOURCE,
          type: "climb-click",
          payload: { climbId },
        });
        const link = topo.climbs.find((c) => c.id === climbId)?.link;
        if (link) window.open(link, "_blank", "noopener,noreferrer");
      },
    });
    this.renderer.setTopo(topo);
    if (this.highlightedClimbId) this.renderer.setHighlightedClimb(this.highlightedClimbId);

    this.postMessage({
      source: IFRAME_PROTOCOL_SOURCE,
      type: "resize",
      payload: { height: document.body.scrollHeight },
    });
  }

  sendReady(): void {
    this.postMessage({ source: IFRAME_PROTOCOL_SOURCE, type: "ready" });
  }
}
