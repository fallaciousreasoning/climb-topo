/** Loads an image just far enough to read its natural pixel dimensions off it. Works for any
 *  publicly-loadable URL regardless of CORS -- naturalWidth/naturalHeight aren't gated by CORS
 *  the way reading pixel data via a <canvas> would be, since they're not pixel data.
 *
 *  Every consumer (editor, web component, iframe viewer) calls this once per mount to get the
 *  {width, height} pair that Viewport/TopoRenderer/createStageScaffold need, rather than
 *  trusting a stored/authored value — see the comment on Topo.image for why. */
export function loadImageNaturalSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}
