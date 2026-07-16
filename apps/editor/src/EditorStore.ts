import { CommandStack, type Command, type Topo } from "@climb-topo/core";

export type EditorStoreListener = (state: Topo) => void;

/** Wraps a Topo document with a CommandStack and a simple subscribe mechanism for UI updates. */
export class EditorStore {
  private state: Topo;
  readonly commands: CommandStack;
  private readonly listeners = new Set<EditorStoreListener>();

  constructor(initial: Topo) {
    this.state = initial;
    this.commands = new CommandStack(
      () => this.state,
      (next) => {
        this.state = next;
        this.notify();
      },
    );
  }

  getState(): Topo {
    return this.state;
  }

  execute(command: Command): void {
    this.commands.execute(command);
  }

  subscribe(listener: EditorStoreListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this.state);
  }
}
