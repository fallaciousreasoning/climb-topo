export interface StageScaffoldOptions {
  /**
   * 'width' (default): root fills its container's width; height is derived from the image's
   * aspect ratio. Right for an embedded widget, where the host page controls width and the
   * container has no meaningful bounded height (e.g. web component, iframe viewer).
   *
   * 'contain': root and svg both fill 100% of whatever box the parent gives them (both
   * dimensions — the parent must actually constrain height, e.g. via flexbox). Unlike
   * 'width', this doesn't shrink the svg to the image's own aspect ratio — a consumer pairs
   * this with `Viewport.setContainerAspect` (via `onResize` below) so the *viewBox* itself
   * absorbs the aspect-ratio mismatch instead, letting the rendered box use 100% of the
   * available screen space rather than being letterboxed down to a smaller inset box.
   */
  fit?: "width" | "contain";
  /** 'contain' fit only: called with the root's rendered box size whenever it resizes
   *  (including once on initial mount), so the consumer can keep a Viewport's container
   *  aspect ratio (and anything sized off of it, like a full-coverage hit-test rect) in sync. */
  onResize?: (width: number, height: number) => void;
}

export interface StageScaffold {
  root: HTMLElement;
  svg: SVGSVGElement;
  /** Stops the ResizeObserver that keeps the aspect ratio pixel-exact. Call when this
   *  scaffold's root is being torn down or replaced by a fresh one. */
  destroy(): void;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";

/**
 * A wrapper containing a single <svg> that fills it, with the background photo rendered as an
 * <svg:image> spanning the full viewBox (behind everything else) rather than a sibling HTML
 * <img>. This is deliberate: pan/zoom works by changing the svg's viewBox, and only content
 * that lives inside that viewBox (i.e. inside the svg) moves/scales with it. A separate <img>
 * layered on top would stay static while the drawn climb lines panned/zoomed underneath it.
 * Putting the photo inside the svg as the backmost element means both share one coordinate
 * space, so they move together for free.
 *
 * `preserveAspectRatio="none"` on the svg is deliberate and load-bearing: without it, any
 * mismatch between the box's rendered aspect ratio and the viewBox's makes the svg letterbox
 * its content (center it, leaving a gap on two edges) — silently breaking the assumption
 * (baked into clientPointToNormalized/toPixel) that the svg's rendered box maps 1:1 onto its
 * viewBox with no gaps. That produced a real click/render coordinate drift that grew toward
 * the edges and vanished at the center. `preserveAspectRatio="none"` makes the svg stretch to
 * fill its box exactly instead.
 *
 * That in turn means the svg's viewBox aspect ratio needs to match its rendered box's aspect
 * ratio *exactly*, or the stretch becomes visible image distortion. In 'width' fit, the box is
 * shaped to match the image (so the default viewBox, which spans exactly the image, already
 * matches) — CSS `aspect-ratio` alone isn't pixel-reliable enough for that though (browser
 * layout can round the computed size by a pixel or two), so it's used only as an instant
 * first-paint approximation; a ResizeObserver then measures the actual rendered width and sets
 * an exact pixel height from it. In 'contain' fit, the box can be any shape, so instead the
 * *viewBox* is reshaped to match the box (see Viewport's containerAspect) — the `onResize`
 * option here is how the box's live aspect ratio gets to the consumer that owns the Viewport.
 */
export function createStageScaffold(
  image: { backgroundUrl: string; width: number; height: number },
  opts: StageScaffoldOptions = {},
): StageScaffold {
  const fit = opts.fit ?? "width";

  const root = document.createElement("div");
  root.className = "topo-stage";
  root.style.position = "relative";

  const svg = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
  svg.setAttribute("viewBox", `0 0 ${image.width} ${image.height}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("class", "topo-stage__svg");

  const backgroundImage = document.createElementNS(SVG_NS, "image");
  backgroundImage.setAttribute("x", "0");
  backgroundImage.setAttribute("y", "0");
  backgroundImage.setAttribute("width", String(image.width));
  backgroundImage.setAttribute("height", String(image.height));
  backgroundImage.setAttribute("preserveAspectRatio", "none");
  backgroundImage.setAttribute("class", "topo-stage__image");
  backgroundImage.setAttributeNS(XLINK_NS, "href", image.backgroundUrl);
  backgroundImage.setAttribute("href", image.backgroundUrl);
  svg.appendChild(backgroundImage);

  root.appendChild(svg);

  let destroy = () => {};

  if (fit === "width") {
    root.style.width = "100%";
    root.style.aspectRatio = `${image.width} / ${image.height}`;
    svg.style.position = "absolute";
    svg.style.inset = "0";
    svg.style.width = "100%";
    svg.style.height = "100%";

    if (typeof ResizeObserver !== "undefined") {
      let lastHeightPx: number | null = null;
      const resizeObserver = new ResizeObserver((entries) => {
        const width = entries[0]?.contentRect.width;
        if (!width) return;
        const height = (width * image.height) / image.width;
        // Skip the write if it wouldn't meaningfully change anything — setting an equal
        // height would otherwise re-trigger the observer for no reason.
        if (lastHeightPx !== null && Math.abs(height - lastHeightPx) < 0.5) return;
        lastHeightPx = height;
        root.style.height = `${height}px`;
      });
      resizeObserver.observe(root);
      destroy = () => resizeObserver.disconnect();
    }
  } else {
    // 'contain': root and svg both simply fill whatever box the parent gives them. The
    // aspect-ratio mismatch (if any) is absorbed by the viewBox itself (see Viewport's
    // containerAspect/padding logic), not by shrinking this box — that's what lets the stage
    // use all available screen space instead of being letterboxed down to a smaller inset.
    root.style.width = "100%";
    root.style.height = "100%";
    svg.style.display = "block";
    svg.style.width = "100%";
    svg.style.height = "100%";

    if (typeof ResizeObserver !== "undefined") {
      const resizeObserver = new ResizeObserver((entries) => {
        const box = entries[0]?.contentRect;
        if (!box || !box.width || !box.height) return;
        opts.onResize?.(box.width, box.height);
      });
      resizeObserver.observe(root);
      destroy = () => resizeObserver.disconnect();
    }
  }

  return { root, svg, destroy };
}
