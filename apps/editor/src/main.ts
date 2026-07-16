import type { Topo } from "@climb-topo/core";
import { initTopoEditor, type TopoEditorHandle } from "./initTopoEditor.js";

const STORAGE_KEY = "climb-topo-editor:dev-data";

/** Wipes every drawn point (from the shared registry and every climb's own path) while
 *  keeping the climb list itself (names, grades, visibility) — a quick way to test drawing
 *  from a blank slate without recreating climbs each time. */
function clearAllPoints(topo: Topo): Topo {
  return {
    ...topo,
    points: {},
    climbs: topo.climbs.map((climb) => ({ ...climb, pointIds: [] })),
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function loadImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = url;
  });
}

function saveToLocalStorage(data: Topo): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    // Most likely a quota error from embedding a large image as a data URL — fine for a
    // dev-only convenience, just don't crash the save flow over it.
    console.warn("Could not save topo to localStorage:", err);
  }
}

async function loadInitialData(): Promise<Topo> {
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

/** Mirrors console.log/warn/error into an on-screen panel, bounded to the most recent lines.
 *  Lets a real device (phone) capture the [Stage] DEBUG trail for a failing gesture without
 *  needing chrome://inspect/about:debugging remote-debugging setup — just tap the gesture,
 *  then read or copy the panel directly on the device. */
function installOnScreenLogPanel(): { panel: HTMLElement; toggleButton: HTMLButtonElement } {
  const MAX_LINES = 300;
  const lines: string[] = [];

  const panel = document.createElement("pre");
  panel.style.cssText =
    "display:none; position:fixed; inset:auto 0 0 0; height:35vh; margin:0; overflow:auto; " +
    "background:#111; color:#0f0; font-size:11px; line-height:1.4; padding:8px; box-sizing:border-box; " +
    "z-index:1000; white-space:pre-wrap; word-break:break-all;";

  const toggleButton = document.createElement("button");
  toggleButton.textContent = "Show Debug Log";
  toggleButton.onclick = () => {
    const willShow = panel.style.display === "none";
    panel.style.display = willShow ? "block" : "none";
    toggleButton.textContent = willShow ? "Hide Debug Log" : "Show Debug Log";
  };

  function render(): void {
    panel.textContent = lines.join("\n");
    panel.scrollTop = panel.scrollHeight;
  }

  function formatArg(arg: unknown): string {
    if (typeof arg === "string") return arg;
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }

  (["log", "warn", "error"] as const).forEach((level) => {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      lines.push(`[${level}] ${args.map(formatArg).join(" ")}`);
      if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
      render();
    };
  });

  // console.error only catches deliberate console.error(...) calls -- an uncaught throw from
  // inside a native event handler (e.g. a pointerup listener) never goes through console.error
  // at all, it goes through the browser's own global error reporting instead. Without these,
  // a silent-looking failure (a handler throwing partway through, aborting the rest of its own
  // work) would show no trace in the panel above even though devtools would show it clearly.
  window.addEventListener("error", (e) => {
    lines.push(`[UNCAUGHT ERROR] ${e.message} @ ${e.filename}:${e.lineno}:${e.colno}\n${e.error?.stack ?? ""}`);
    if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
    render();
  });
  window.addEventListener("unhandledrejection", (e) => {
    lines.push(`[UNHANDLED REJECTION] ${formatArg(e.reason)}`);
    if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
    render();
  });

  return { panel, toggleButton };
}

async function main(): Promise<void> {
  const container = document.querySelector<HTMLDivElement>("#app")!;
  const { panel: logPanel, toggleButton: logToggleButton } = installOnScreenLogPanel();

  // Dev-only controls, not part of the real editor UI: swap the background image, wipe all
  // drawn points, and persist to localStorage on save so a reload picks up where you left off.
  const devToolbar = document.createElement("div");
  devToolbar.style.cssText =
    "display:flex; gap:8px; padding:8px; border-bottom:1px solid #8883; align-items:center; flex-wrap:wrap;";

  const chooseImageButton = document.createElement("button");
  chooseImageButton.textContent = "Choose Background Image";
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.style.display = "none";

  const clearButton = document.createElement("button");
  clearButton.textContent = "Clear Canvas";

  const copyLogButton = document.createElement("button");
  copyLogButton.textContent = "Copy Debug Log";
  copyLogButton.onclick = async () => {
    try {
      await navigator.clipboard.writeText(logPanel.textContent ?? "");
      copyLogButton.textContent = "Copied!";
      setTimeout(() => (copyLogButton.textContent = "Copy Debug Log"), 1200);
    } catch (err) {
      console.warn("Could not copy debug log to clipboard:", err);
    }
  };

  const devLabel = document.createElement("span");
  devLabel.textContent = "(dev tools — saves to localStorage)";
  devLabel.style.cssText = "opacity:0.6; font-size:0.85em;";

  devToolbar.append(chooseImageButton, fileInput, clearButton, logToggleButton, copyLogButton, devLabel);
  container.before(devToolbar);
  container.before(logPanel);

  let editorHandle: TopoEditorHandle | null = null;

  function mountEditor(data: Topo): void {
    editorHandle?.destroy();
    editorHandle = initTopoEditor({
      container,
      initialData: data,
      onSave: (savedData) => {
        console.log("Saved topo:", savedData);
        saveToLocalStorage(savedData);
      },
    });
    // Handy for manual/console poking during dev.
    (window as unknown as { __editor: TopoEditorHandle }).__editor = editorHandle;
  }

  container.addEventListener("topo-editor:save", (e) => {
    console.log("topo-editor:save event fired", (e as CustomEvent).detail);
  });

  chooseImageButton.onclick = () => fileInput.click();
  fileInput.onchange = async () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file || !editorHandle) return;

    const dataUrl = await readFileAsDataUrl(file);
    const { width, height } = await loadImageDimensions(dataUrl);
    // Old points wouldn't line up with a different photo, so start fresh on the new image.
    const next = clearAllPoints(editorHandle.getState());
    mountEditor({ ...next, image: { url: dataUrl, width, height } });
  };

  clearButton.onclick = () => {
    if (!editorHandle) return;
    mountEditor(clearAllPoints(editorHandle.getState()));
  };

  mountEditor(await loadInitialData());
}

void main();
