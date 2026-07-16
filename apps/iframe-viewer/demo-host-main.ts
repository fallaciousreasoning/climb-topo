import type { Topo } from "@climb-topo/core";
import { TopoIframeController } from "@climb-topo/iframe-client";

const iframe = document.querySelector<HTMLIFrameElement>("#topo-frame")!;
const status = document.querySelector<HTMLPreElement>("#status")!;

function log(line: string): void {
  status.textContent = `${line}\n${status.textContent ?? ""}`.split("\n").slice(0, 10).join("\n");
}

const controller = new TopoIframeController({ iframe });

controller.addEventListener("climb-hover", (e) => {
  log(`hover: ${(e as CustomEvent).detail.climbId ?? "(none)"}`);
});
controller.addEventListener("climb-click", (e) => {
  const climbId = (e as CustomEvent).detail.climbId;
  log(`click: ${climbId}`);
  controller.setHighlightedClimb(climbId);
});
controller.addEventListener("resize", (e) => {
  log(`resize: ${(e as CustomEvent).detail.height}px`);
});

document.querySelector<HTMLButtonElement>("#clear-highlight")!.onclick = () => {
  controller.setHighlightedClimb(null);
};

fetch("/fixtures/sample-topo.json")
  .then((res) => res.json())
  .then((data: Topo) => {
    controller.setTopo(data); // queued internally until the iframe posts 'ready'
    log("Sent topo data to iframe (queued until ready if needed).");
  });
