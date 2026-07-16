export type EditorTool = "draw" | "select";

export interface ToolbarCallbacks {
  onUndo(): void;
  onRedo(): void;
  onSave(): void;
  onToolChange(tool: EditorTool): void;
  onResetZoom(): void;
  onToggleSidebar(): void;
}

export class Toolbar {
  readonly root: HTMLElement;
  private readonly undoButton: HTMLButtonElement;
  private readonly redoButton: HTMLButtonElement;
  private readonly drawButton: HTMLButtonElement;
  private readonly selectButton: HTMLButtonElement;

  constructor(callbacks: ToolbarCallbacks) {
    this.root = document.createElement("div");
    this.root.className = "topo-editor__toolbar";

    const menuToggleButton = document.createElement("button");
    menuToggleButton.textContent = "☰";
    menuToggleButton.className = "topo-editor__menu-toggle";
    menuToggleButton.setAttribute("aria-label", "Toggle climb list");
    menuToggleButton.onclick = callbacks.onToggleSidebar;

    this.undoButton = document.createElement("button");
    this.undoButton.textContent = "Undo";
    this.undoButton.onclick = callbacks.onUndo;

    this.redoButton = document.createElement("button");
    this.redoButton.textContent = "Redo";
    this.redoButton.onclick = callbacks.onRedo;

    this.drawButton = document.createElement("button");
    this.drawButton.textContent = "Draw";
    this.drawButton.onclick = () => callbacks.onToolChange("draw");

    this.selectButton = document.createElement("button");
    this.selectButton.textContent = "Select";
    this.selectButton.onclick = () => callbacks.onToolChange("select");

    const resetZoomButton = document.createElement("button");
    resetZoomButton.textContent = "Reset Zoom";
    resetZoomButton.onclick = callbacks.onResetZoom;

    const saveButton = document.createElement("button");
    saveButton.textContent = "Save";
    saveButton.className = "topo-editor__save-button";
    saveButton.onclick = callbacks.onSave;

    this.root.append(
      menuToggleButton,
      this.drawButton,
      this.selectButton,
      this.undoButton,
      this.redoButton,
      resetZoomButton,
      saveButton,
    );
  }

  setUndoRedoEnabled(canUndo: boolean, canRedo: boolean): void {
    this.undoButton.disabled = !canUndo;
    this.redoButton.disabled = !canRedo;
  }

  setActiveTool(tool: EditorTool): void {
    this.drawButton.classList.toggle("is-active", tool === "draw");
    this.selectButton.classList.toggle("is-active", tool === "select");
  }
}
