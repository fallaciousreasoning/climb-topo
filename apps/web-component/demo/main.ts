import "../src/index.js";
import type { ClimbTopoViewerElement } from "../src/ClimbTopoViewerElement.js";
import { makeFixtureTopo } from "./fixture.js";

const viewer = document.querySelector<ClimbTopoViewerElement>("climb-topo-viewer")!;
viewer.data = makeFixtureTopo();

const status = document.querySelector<HTMLPreElement>("#status")!;
function log(line: string): void {
  status.textContent = `${line}\n${status.textContent ?? ""}`.split("\n").slice(0, 10).join("\n");
}

viewer.addEventListener("climb-hover", (e) => {
  log(`hover: ${(e as CustomEvent).detail.climbId ?? "(none)"}`);
});
viewer.addEventListener("climb-click", (e) => {
  const climbId = (e as CustomEvent).detail.climbId;
  log(`click: ${climbId}`);
  viewer.highlightedClimbId = climbId;
});

document.querySelector<HTMLButtonElement>("#clear-highlight")!.onclick = () => {
  viewer.highlightedClimbId = null;
};

log("Hover/click a line. Click 'Clear highlight' to reset.");
