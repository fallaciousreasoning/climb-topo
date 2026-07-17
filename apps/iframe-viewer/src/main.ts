import type { Topo } from "@climb-topo/core";
import { IframeViewerApp } from "./IframeViewerApp.js";

const container = document.querySelector<HTMLDivElement>("#app")!;
const params = new URLSearchParams(window.location.search);
// A `?src=` or `?json=` link is how this page gets shared/opened as a standalone viewer (or
// embedded in a static host iframe with a fixed box) -- clamp to whatever height it's given
// rather than growing past it. Without either, the page is being driven by the dynamic
// postMessage protocol instead, where the host manages the iframe's height via the `resize`
// message.
const fit = params.has("src") || params.has("json") ? "page" : "width";
const app = new IframeViewerApp({
  container,
  postMessage: (message) => window.parent.postMessage(message, "*"),
  fit,
});

window.addEventListener("message", (e: MessageEvent) => app.handleMessage(e.data));

async function initFromQueryParam(): Promise<void> {
  // `json`: the topo JSON itself, URL-encoded inline -- no fetch, no hosting the JSON anywhere.
  // `src`: a URL to fetch the topo JSON from, for when it's too large/awkward to inline.
  const json = params.get("json");
  if (json) {
    let topo: Topo;
    try {
      topo = JSON.parse(json) as Topo;
    } catch (err) {
      console.error("Ignoring malformed ?json= topo JSON:", err);
      return;
    }
    await app.mount(topo);
    return;
  }

  const src = params.get("src");
  if (!src) return;
  const response = await fetch(src);
  const topo = (await response.json()) as Topo;
  await app.mount(topo);
}

void initFromQueryParam();

// Retry the 'ready' announcement briefly: a <script type="module"> on the host page is
// deferred until after DOM parsing, so a fast/cached iframe load can post 'ready' before the
// host has even constructed its listener. Re-announcing a few times over ~1s covers that race
// without requiring an ack — receiving 'ready' more than once is harmless (idempotent).
for (const delayMs of [0, 100, 300, 600]) {
  setTimeout(() => app.sendReady(), delayMs);
}
