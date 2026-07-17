import {
  IFRAME_PROTOCOL_SOURCE,
  isParentToIframeMessage,
  type IframeToParentMessage,
  type Topo,
} from "@climb-topo/core";
import {
  createStageScaffold,
  loadImageNaturalSize,
  PanZoomGestures,
  TopoRenderer,
  Viewport,
} from "@climb-topo/renderer";

export interface IframeViewerAppOptions {
  container: HTMLElement;
  /** Injectable so the message-handling logic is testable without a real cross-window iframe. */
  postMessage: (message: IframeToParentMessage) => void;
  /** 'width' (default): fill the container's width and grow height freely -- right for the
   *  dynamic postMessage-driven protocol, where the host manages the iframe's height itself in
   *  response to the `resize` message below. 'page': clamp to the container's available height
   *  instead, shrinking width to match -- right when this page is the whole thing on screen
   *  (opened directly, or a static `?src=` embed with a host-fixed iframe box). */
  fit?: "width" | "page";
}

/** Core logic of the served iframe page, kept DOM-adjacent but postMessage-injectable for tests. */
export class IframeViewerApp {
  private renderer: TopoRenderer | null = null;
  private destroyScaffold: (() => void) | null = null;
  private panZoom: PanZoomGestures | null = null;
  private highlightedClimbId: string | null = null;
  private readonly container: HTMLElement;
  private readonly postMessage: (message: IframeToParentMessage) => void;
  private readonly fit: "width" | "page";

  constructor(opts: IframeViewerAppOptions) {
    this.container = opts.container;
    this.postMessage = opts.postMessage;
    this.fit = opts.fit ?? "width";
  }

  handleMessage(data: unknown): void {
    if (!isParentToIframeMessage(data)) return;

    if (data.type === "init" || data.type === "set-topo") {
      void this.mount(data.payload);
    } else if (data.type === "set-highlighted-climb") {
      this.highlightedClimbId = data.payload.climbId;
      this.renderer?.setHighlightedClimb(this.highlightedClimbId);
    }
  }

  async mount(topo: Topo): Promise<void> {
    // Pixel dimensions are never authored/stored (see the comment on Topo.image) -- resolve
    // them by loading the image once before anything that needs them gets constructed.
    const { width, height } = await loadImageNaturalSize(topo.image.backgroundUrl);
    const image = { backgroundUrl: topo.image.backgroundUrl, width, height };

    this.renderer?.destroy();
    this.panZoom?.destroy();
    this.destroyScaffold?.();
    this.container.replaceChildren();

    const scaffold = createStageScaffold(image, { fit: this.fit });
    this.destroyScaffold = scaffold.destroy;
    this.container.appendChild(scaffold.root);
    this.panZoom = new PanZoomGestures({
      svgRoot: scaffold.svg,
      viewport: new Viewport(image),
    });

    this.renderer = new TopoRenderer({
      svgRoot: scaffold.svg,
      image,
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
