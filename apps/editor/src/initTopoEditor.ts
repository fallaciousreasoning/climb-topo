import {
  createAddClimbCommand,
  createRemovePathPointCommand,
  createSetClimbVisibilityCommand,
  createSetPointTypeCommand,
  generateId,
  type Topo,
} from "@climb-topo/core";
import type { PointTypeRenderer } from "@climb-topo/renderer";
import { ClimbListPanel } from "./ClimbListPanel.js";
import { EditorStore } from "./EditorStore.js";
import { PointPopup } from "./PointPopup.js";
import { Stage, type SelectedPoint } from "./Stage.js";
import { Toolbar, type EditorTool } from "./Toolbar.js";

export interface TopoEditorConfig {
  container: HTMLElement;
  initialData: Topo;
  onSave?: (data: Topo) => void;
  /** Extra point-type renderers beyond the built-in 'vertex' circle — e.g. bolt, anchor. */
  pointTypeRenderers?: PointTypeRenderer[];
}

export interface TopoEditorHandle {
  destroy(): void;
  undo(): void;
  redo(): void;
  getState(): Topo;
}

const SAVE_EVENT = "topo-editor:save";

export function initTopoEditor(config: TopoEditorConfig): TopoEditorHandle {
  const store = new EditorStore(config.initialData);
  let activeClimbId: string | null = config.initialData.climbs[0]?.id ?? null;
  let activeTool: EditorTool = "draw";
  let selection: SelectedPoint | null = null;

  const root = document.createElement("div");
  root.className = "topo-editor";

  const body = document.createElement("div");
  body.className = "topo-editor__body";

  const sidebarBackdrop = document.createElement("div");
  sidebarBackdrop.className = "topo-editor__sidebar-backdrop";

  function setSidebarOpen(open: boolean): void {
    sidebar.root.classList.toggle("is-open", open);
    sidebarBackdrop.classList.toggle("is-open", open);
  }
  sidebarBackdrop.onclick = () => setSidebarOpen(false);

  const stage = new Stage(
    config.initialData,
    {
      onExecute: (command) => store.execute(command),
      getActiveClimbId: () => activeClimbId,
      getActiveTool: () => activeTool,
      onSwitchActiveClimb: (id) => setActiveClimb(id),
      onSelectionChange: (next) => {
        selection = next;
        updatePointPopup();
      },
    },
    config.pointTypeRenderers,
  );

  function removeSelectedPoint(): void {
    if (!selection) return;
    const climb = store.getState().climbs.find((c) => c.id === selection!.climbId);
    const index = climb?.pointIds.indexOf(selection.pointId) ?? -1;
    if (climb && index !== -1) {
      store.execute(createRemovePathPointCommand(store.getState(), climb.id, index));
      stage.clearSelection();
    }
  }

  const pointPopup = new PointPopup({
    onChangeType: (type) => {
      if (!selection) return;
      store.execute(createSetPointTypeCommand(store.getState(), selection.pointId, type));
      updatePointPopup(); // re-highlight the now-current type immediately
    },
    onRemove: () => removeSelectedPoint(),
    onClose: () => stage.clearSelection(),
  });

  let popupFrame: number | null = null;
  function updatePointPopup(): void {
    const pos = selection ? stage.getSelectionScreenPos() : null;
    if (!selection || !pos) {
      pointPopup.hide();
      if (popupFrame !== null) {
        cancelAnimationFrame(popupFrame);
        popupFrame = null;
      }
      return;
    }
    const point = store.getState().points[selection.pointId];
    pointPopup.show(pos, point?.type ?? "vertex");
    // The point can move under pan/zoom/drag without a discrete "selection changed" event,
    // so keep tracking its screen position every frame for as long as it stays selected.
    if (popupFrame === null) {
      const tick = () => {
        const nextPos = selection ? stage.getSelectionScreenPos() : null;
        if (!selection || !nextPos) {
          pointPopup.hide();
          popupFrame = null;
          return;
        }
        pointPopup.setPosition(nextPos);
        popupFrame = requestAnimationFrame(tick);
      };
      popupFrame = requestAnimationFrame(tick);
    }
  }

  const sidebar = new ClimbListPanel({
    onActivate: (id) => {
      setActiveClimb(id);
      setSidebarOpen(false); // no-op on desktop layouts, closes the drawer on mobile
    },
    onToggleVisibility: (id, visible) =>
      store.execute(createSetClimbVisibilityCommand(store.getState(), id, visible)),
    onAddClimb: () => {
      const id = generateId();
      const ordinal = store.getState().climbs.length + 1;
      store.execute(
        createAddClimbCommand({ id, name: `Climb ${ordinal}`, visible: true, pointIds: [] }),
      );
      setActiveClimb(id);
      setSidebarOpen(false);
    },
  });

  const toolbar = new Toolbar({
    onUndo: () => store.commands.undo(),
    onRedo: () => store.commands.redo(),
    onSave: () => handleSave(),
    onToolChange: (tool) => {
      activeTool = tool;
      toolbar.setActiveTool(tool);
    },
    onResetZoom: () => stage.resetZoom(),
    onToggleSidebar: () => setSidebarOpen(!sidebar.root.classList.contains("is-open")),
  });

  function setActiveClimb(id: string | null): void {
    activeClimbId = id;
    stage.setActiveClimb(id);
    sidebar.render(store.getState(), activeClimbId);
  }

  function renderAll(): void {
    sidebar.render(store.getState(), activeClimbId);
    stage.setTopo(store.getState());
    toolbar.setUndoRedoEnabled(store.commands.canUndo(), store.commands.canRedo());
    updatePointPopup();
  }

  function handleSave(): void {
    const data = store.getState();
    config.onSave?.(data);
    root.dispatchEvent(new CustomEvent(SAVE_EVENT, { detail: data, bubbles: true }));
  }

  function handleKeyDown(e: KeyboardEvent): void {
    const mod = e.ctrlKey || e.metaKey;

    if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
      e.preventDefault();
      store.commands.undo();
    } else if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
      e.preventDefault();
      store.commands.redo();
    } else if (mod && e.key.toLowerCase() === "s") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      setActiveClimb(null);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      if (activeTool !== "select") return;
      removeSelectedPoint();
    }
  }

  const unsubscribe = store.subscribe(() => renderAll());
  window.addEventListener("keydown", handleKeyDown);

  // Temporary diagnostic, completely independent of Stage's own event wiring: confirms
  // whether the browser dispatches mousedown/mouseup/click at all for a given gesture, and
  // exactly where, regardless of any of our own listeners or early returns.
  function debugGlobalEventLog(e: Event): void {
    const me = e as MouseEvent;
    // eslint-disable-next-line no-console
    console.log(
      `[GlobalDebug] ${e.type} on`,
      e.target,
      "client=",
      me.clientX,
      me.clientY,
      "phase=capture",
    );
  }
  window.addEventListener("mousedown", debugGlobalEventLog, true);
  window.addEventListener("mouseup", debugGlobalEventLog, true);
  window.addEventListener("click", debugGlobalEventLog, true);

  body.append(sidebarBackdrop, sidebar.root, stage.root);
  root.append(toolbar.root, body, pointPopup.root);
  config.container.appendChild(root);

  toolbar.setActiveTool(activeTool);
  setActiveClimb(activeClimbId);
  renderAll();

  return {
    destroy(): void {
      unsubscribe();
      window.removeEventListener("keydown", handleKeyDown);
      if (popupFrame !== null) cancelAnimationFrame(popupFrame);
      stage.destroy();
      root.remove();
    },
    undo: () => store.commands.undo(),
    redo: () => store.commands.redo(),
    getState: () => store.getState(),
  };
}
