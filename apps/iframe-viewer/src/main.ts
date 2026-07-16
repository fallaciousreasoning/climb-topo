import type { Topo } from "@climb-topo/core";
import { IframeViewerApp } from "./IframeViewerApp.js";

const container = document.querySelector<HTMLDivElement>("#app")!;
const app = new IframeViewerApp({
  container,
  postMessage: (message) => window.parent.postMessage(message, "*"),
});

window.addEventListener("message", (e: MessageEvent) => app.handleMessage(e.data));

async function initFromQueryParam(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const src = params.get("src");
  if (!src) return;
  const response = await fetch(src);
  const topo = (await response.json()) as Topo;
  app.mount(topo);
}

void initFromQueryParam();

// Retry the 'ready' announcement briefly: a <script type="module"> on the host page is
// deferred until after DOM parsing, so a fast/cached iframe load can post 'ready' before the
// host has even constructed its listener. Re-announcing a few times over ~1s covers that race
// without requiring an ack — receiving 'ready' more than once is harmless (idempotent).
for (const delayMs of [0, 100, 300, 600]) {
  setTimeout(() => app.sendReady(), delayMs);
}
