import type { Topo } from "@climb-topo/core";
import { initTopoEditor, type TopoEditorHandle } from "./initTopoEditor.js";

const STORAGE_KEY = "climb-topo-editor:dev-data";

function saveToLocalStorage(data: Topo): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    // Most likely a quota error from embedding a large image as a data URL — fine for a
    // dev-only convenience, just don't crash the save flow over it.
    console.warn("Could not save topo to localStorage:", err);
  }
}

/** No backend yet -- until there is one, Save hands you the JSON as a downloaded file so your
 *  work is actually portable/durable, rather than trapped in this tab's localStorage alone. */
function downloadAsJsonFile(data: Topo, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function loadInitialData(): Promise<Topo> {
  // A `?json=` or `?src=` link (same convention as the iframe viewer) loads specific data for
  // this session, taking priority over any locally-saved draft -- e.g. for sharing a link
  // straight to a particular topo's data for editing.
  const params = new URLSearchParams(window.location.search);
  const json = params.get("json");
  if (json) {
    try {
      return JSON.parse(json) as Topo;
    } catch (err) {
      console.warn("Ignoring malformed ?json= topo JSON:", err);
    }
  }
  const src = params.get("src");
  if (src) {
    const response = await fetch(src);
    return (await response.json()) as Topo;
  }

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored) as Topo;
    } catch (err) {
      console.warn("Ignoring corrupt localStorage topo data:", err);
    }
  }
  const response = await fetch("/fixtures/sample-topo.json");
  return (await response.json()) as Topo;
}

async function main(): Promise<void> {
  const container = document.querySelector<HTMLDivElement>("#app")!;

  const editorHandle = await initTopoEditor({
    container,
    initialData: await loadInitialData(),
    onSave: (savedData) => {
      console.log("Saved topo:", savedData);
      saveToLocalStorage(savedData);
      downloadAsJsonFile(savedData, `${savedData.id || "topo"}.json`);
    },
  });
  // Handy for manual/console poking during dev.
  (window as unknown as { __editor: TopoEditorHandle }).__editor = editorHandle;

  container.addEventListener("topo-editor:save", (e) => {
    console.log("topo-editor:save event fired", (e as CustomEvent).detail);
  });
}

void main();
