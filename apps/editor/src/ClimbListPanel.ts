import type { Topo } from "@climb-topo/core";

export interface ClimbListCallbacks {
  onActivate(climbId: string): void;
  onToggleVisibility(climbId: string, visible: boolean): void;
  onAddClimb(): void;
}

export class ClimbListPanel {
  readonly root: HTMLElement;
  private readonly listEl: HTMLUListElement;
  private callbacks: ClimbListCallbacks;

  constructor(callbacks: ClimbListCallbacks) {
    this.callbacks = callbacks;
    this.root = document.createElement("aside");
    this.root.className = "topo-editor__sidebar";

    this.listEl = document.createElement("ul");
    this.listEl.className = "topo-editor__climb-list";
    this.listEl.setAttribute("role", "listbox");
    this.listEl.setAttribute("aria-label", "Climbs");

    const addButton = document.createElement("button");
    addButton.textContent = "+ New Climb";
    addButton.onclick = () => this.callbacks.onAddClimb();

    this.root.append(this.listEl, addButton);
  }

  render(topo: Topo, activeClimbId: string | null): void {
    this.listEl.replaceChildren();

    for (const climb of topo.climbs) {
      const isActive = climb.id === activeClimbId;
      const item = document.createElement("li");
      item.className = "topo-editor__climb-row";
      item.classList.toggle("is-active", isActive);
      item.dataset.climbId = climb.id;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(isActive));
      item.tabIndex = 0;

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = climb.visible;
      checkbox.setAttribute("aria-label", `Show "${climb.name}" on this topo`);
      checkbox.onclick = (e) => e.stopPropagation();
      checkbox.onchange = () => this.callbacks.onToggleVisibility(climb.id, checkbox.checked);

      const reference = document.createElement("span");
      reference.className = "topo-editor__climb-reference";
      reference.textContent = climb.reference ?? "";

      const label = document.createElement("span");
      label.className = "topo-editor__climb-name";
      label.textContent = climb.name;

      const grade = document.createElement("span");
      grade.className = "topo-editor__climb-grade";
      grade.textContent = climb.grade ? climb.grade.value : "";

      const routeType = document.createElement("span");
      routeType.className = "topo-editor__climb-type";
      routeType.textContent = climb.routeType ?? "";

      item.append(checkbox, reference, label, grade, routeType);

      if (climb.pointIds.length === 0) {
        const badge = document.createElement("span");
        badge.className = "topo-editor__climb-badge";
        badge.textContent = "not drawn";
        item.appendChild(badge);
      }

      item.onclick = () => this.callbacks.onActivate(climb.id);
      item.addEventListener("keydown", (e) => {
        if (e.target !== item) return; // let the checkbox handle its own key presses
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.callbacks.onActivate(climb.id);
        }
      });

      this.listEl.appendChild(item);
    }
  }
}
