import { BUILT_IN_POINT_TYPES } from "@climb-topo/renderer";

export interface PointPopupCallbacks {
  onChangeType(type: string): void;
  onRemove(): void;
  onClose(): void;
}

const TYPE_LABELS: Record<string, string> = {
  vertex: "Normal",
  bolt: "Bolt",
  anchor: "Anchor",
};

/** A small floating panel anchored to the currently-selected point (Select tool), letting the
 *  user change its type or remove it — an alternative to the Delete/Backspace shortcut, and
 *  the only way to turn a plain vertex into a bolt/anchor (or back). Positioned in client
 *  (viewport) coordinates, so `position: fixed` -- the caller repositions it every frame the
 *  selection is active, since the point can move under pan/zoom/drag. */
export class PointPopup {
  readonly root: HTMLElement;
  private readonly typeButtons: HTMLButtonElement[] = [];

  constructor(callbacks: PointPopupCallbacks) {
    this.root = document.createElement("div");
    this.root.className = "topo-point-popup";
    this.root.style.display = "none";

    const closeButton = document.createElement("button");
    closeButton.textContent = "×";
    closeButton.className = "topo-point-popup__close";
    closeButton.setAttribute("aria-label", "Close");
    closeButton.onclick = () => callbacks.onClose();
    this.root.appendChild(closeButton);

    for (const type of BUILT_IN_POINT_TYPES) {
      const button = document.createElement("button");
      button.textContent = TYPE_LABELS[type] ?? type;
      button.dataset.pointType = type;
      button.onclick = () => callbacks.onChangeType(type);
      this.typeButtons.push(button);
      this.root.appendChild(button);
    }

    const removeButton = document.createElement("button");
    removeButton.textContent = "Remove";
    removeButton.className = "topo-point-popup__remove";
    removeButton.onclick = () => callbacks.onRemove();
    this.root.appendChild(removeButton);

    // Selecting/typing in the popup shouldn't also register as a stage click (which would
    // otherwise reach the background rect underneath and re-trigger draw/pan logic).
    this.root.addEventListener("pointerdown", (e) => e.stopPropagation());
  }

  show(clientPos: { x: number; y: number }, currentType: string): void {
    this.root.style.display = "flex";
    this.setPosition(clientPos);
    for (const button of this.typeButtons) {
      button.classList.toggle("is-active", button.dataset.pointType === currentType);
    }
  }

  setPosition(clientPos: { x: number; y: number }): void {
    this.root.style.left = `${clientPos.x}px`;
    this.root.style.top = `${clientPos.y}px`;
  }

  hide(): void {
    this.root.style.display = "none";
  }
}
