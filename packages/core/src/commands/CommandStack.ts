import type { Command } from "./Command.js";
import type { Topo } from "../model/topo.js";

export class CommandStack {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];

  constructor(
    private getState: () => Topo,
    private setState: (state: Topo) => void,
  ) {}

  execute(command: Command): void {
    const next = command.do(this.getState());
    // Stack bookkeeping happens before setState (below) so that any subscriber notified
    // synchronously by setState sees canUndo()/canRedo() already reflecting this command.
    this.undoStack.push(command);
    this.redoStack = [];
    this.setState(next);
  }

  undo(): void {
    const command = this.undoStack.pop();
    if (!command) return;
    const next = command.undo(this.getState());
    this.redoStack.push(command);
    this.setState(next);
  }

  redo(): void {
    const command = this.redoStack.pop();
    if (!command) return;
    const next = command.do(this.getState());
    this.undoStack.push(command);
    this.setState(next);
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}
