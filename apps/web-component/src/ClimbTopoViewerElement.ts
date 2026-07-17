import type { Topo } from "@climb-topo/core";
import {
  createStageScaffold,
  loadImageNaturalSize,
  PanZoomGestures,
  TopoRenderer,
  Viewport,
} from "@climb-topo/renderer";

export const TAG_NAME = "climb-topo-viewer";

export interface ClimbHoverEventDetail {
  climbId: string | null;
}
export interface ClimbClickEventDetail {
  climbId: string;
}

const HOST_STYLE = `:host { display: block; }`;

/**
 * Read-only embeddable topo viewer. Given a Topo document (via the `data` property or a
 * `src` URL attribute), renders it read-only and fires `climb-hover` / `climb-click` events.
 * Supports highlighting a climb via the `highlighted-climb-id` attribute/property.
 */
export class ClimbTopoViewerElement extends HTMLElement {
  static get observedAttributes(): string[] {
    return ["src", "highlighted-climb-id"];
  }

  private renderer: TopoRenderer | null = null;
  private topoData: Topo | null = null;
  private destroyScaffold: (() => void) | null = null;
  private panZoom: PanZoomGestures | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback(): void {
    if (!this.topoData) {
      const src = this.getAttribute("src");
      if (src) void this.loadFromSrc(src);
    }
  }

  disconnectedCallback(): void {
    this.renderer?.destroy();
    this.renderer = null;
    this.panZoom?.destroy();
    this.panZoom = null;
    this.destroyScaffold?.();
    this.destroyScaffold = null;
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (newValue === oldValue) return;

    if (name === "src" && newValue) {
      void this.loadFromSrc(newValue);
    } else if (name === "highlighted-climb-id") {
      this.renderer?.setHighlightedClimb(newValue);
    }
  }

  get data(): Topo | null {
    return this.topoData;
  }

  set data(value: Topo | null) {
    this.topoData = value;
    if (value) void this.mount(value);
  }

  get highlightedClimbId(): string | null {
    return this.getAttribute("highlighted-climb-id");
  }

  set highlightedClimbId(value: string | null) {
    if (value === null) this.removeAttribute("highlighted-climb-id");
    else this.setAttribute("highlighted-climb-id", value);
  }

  private async loadFromSrc(url: string): Promise<void> {
    const response = await fetch(url);
    const json = (await response.json()) as Topo;
    this.data = json;
  }

  private async mount(topo: Topo): Promise<void> {
    // Pixel dimensions are never authored/stored (see the comment on Topo.image) -- resolve
    // them by loading the image once before anything that needs them gets constructed.
    const { width, height } = await loadImageNaturalSize(topo.image.backgroundUrl);
    const image = { backgroundUrl: topo.image.backgroundUrl, width, height };

    const shadow = this.shadowRoot;
    if (!shadow) return;

    this.renderer?.destroy();
    this.panZoom?.destroy();
    this.destroyScaffold?.();
    shadow.replaceChildren();

    const style = document.createElement("style");
    style.textContent = HOST_STYLE;
    shadow.appendChild(style);

    const scaffold = createStageScaffold(image);
    this.destroyScaffold = scaffold.destroy;
    shadow.appendChild(scaffold.root);
    this.panZoom = new PanZoomGestures({
      svgRoot: scaffold.svg,
      viewport: new Viewport(image),
    });

    this.renderer = new TopoRenderer({
      svgRoot: scaffold.svg,
      image,
      mode: "view",
      onClimbHover: (climbId) => {
        this.dispatchEvent(
          new CustomEvent<ClimbHoverEventDetail>("climb-hover", {
            detail: { climbId },
            bubbles: true,
            composed: true,
          }),
        );
      },
      onClimbClick: (climbId) => {
        this.dispatchEvent(
          new CustomEvent<ClimbClickEventDetail>("climb-click", {
            detail: { climbId },
            bubbles: true,
            composed: true,
          }),
        );
        const link = topo.climbs.find((c) => c.id === climbId)?.link;
        if (link) window.open(link, "_blank", "noopener,noreferrer");
      },
    });
    this.renderer.setTopo(topo);

    if (this.highlightedClimbId) this.renderer.setHighlightedClimb(this.highlightedClimbId);
  }
}

export function defineClimbTopoViewer(): void {
  if (!customElements.get(TAG_NAME)) {
    customElements.define(TAG_NAME, ClimbTopoViewerElement);
  }
}
