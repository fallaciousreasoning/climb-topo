import { createStageScaffold, loadImageNaturalSize, TopoRenderer, type RenderMode } from "../src/index.js";
import type { PointTypeRenderer } from "../src/pointTypeRenderers.js";
import { makeFixtureTopo } from "./fixture.js";

const SVG_NS = "http://www.w3.org/2000/svg";

// Demonstrates the point-type extensibility point: a "bolt" renderer registered without
// touching core or the rest of the renderer.
const boltPointRenderer: PointTypeRenderer = {
  type: "bolt",
  render(_point, ctx) {
    const rect = document.createElementNS(SVG_NS, "rect");
    const size = ctx.radius * 2.2;
    rect.setAttribute("x", String(-size / 2));
    rect.setAttribute("y", String(-size / 2));
    rect.setAttribute("width", String(size));
    rect.setAttribute("height", String(size));
    rect.setAttribute("fill", "#e0b400");
    rect.setAttribute("class", `topo-point topo-point--bolt topo-point--${ctx.state}`);
    return rect;
  },
  update(el, _point, ctx) {
    el.setAttribute("class", `topo-point topo-point--bolt topo-point--${ctx.state}`);
  },
};

const topo = makeFixtureTopo();
const app = document.querySelector<HTMLDivElement>("#app")!;

const controls = document.createElement("div");
controls.style.marginBottom = "12px";
controls.style.display = "flex";
controls.style.gap = "8px";
app.appendChild(controls);

const stageContainer = document.createElement("div");
stageContainer.style.maxWidth = "500px";
app.appendChild(stageContainer);

const status = document.createElement("pre");
status.style.fontFamily = "monospace";
status.style.fontSize = "12px";
app.appendChild(status);

const { width, height } = await loadImageNaturalSize(topo.image.backgroundUrl);
const image = { backgroundUrl: topo.image.backgroundUrl, width, height };

const scaffold = createStageScaffold(image);
stageContainer.appendChild(scaffold.root);

let mode: RenderMode = "view";
let highlighted: string | null = null;

function log(line: string) {
  status.textContent = `${line}\n${status.textContent ?? ""}`.split("\n").slice(0, 12).join("\n");
}

function createRenderer(): TopoRenderer {
  return new TopoRenderer({
    svgRoot: scaffold.svg,
    image,
    mode,
    pointTypeRenderers: [boltPointRenderer],
    onClimbHover: (id) => log(`hover: ${id ?? "(none)"}`),
    onClimbClick: (id) => {
      log(`click: ${id}`);
      highlighted = id;
      renderer.setHighlightedClimb(highlighted);
    },
  });
}

let renderer = createRenderer();
renderer.setTopo(topo);

const modeButton = document.createElement("button");
modeButton.textContent = "Toggle edit/view mode";
modeButton.onclick = () => {
  mode = mode === "view" ? "edit" : "view";
  renderer.destroy();
  renderer = createRenderer();
  renderer.setTopo(topo);
  if (highlighted) renderer.setHighlightedClimb(highlighted);
  // In edit mode, only the active (currently-being-drawn) climb renders EDITING_BLUE —
  // every other visible climb keeps its grade color, same as view mode.
  if (mode === "edit") renderer.setActiveClimb("climb-a");
  log(`mode: ${mode}`);
};
controls.appendChild(modeButton);

const clearHighlightButton = document.createElement("button");
clearHighlightButton.textContent = "Clear highlight";
clearHighlightButton.onclick = () => {
  highlighted = null;
  renderer.setHighlightedClimb(null);
};
controls.appendChild(clearHighlightButton);

log(`mode: ${mode}`);
log(
  "Hover/click a line. Toggle mode: only 'Sunny Corner' (active climb) turns edit-blue; " +
    "others keep grade colors. Also see bezier point handles + bolt marker.",
);
