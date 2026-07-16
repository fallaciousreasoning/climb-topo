import type { Command } from "./Command.js";
import type { Topo } from "../model/topo.js";

/** Sequences multiple independent commands into a single atomic undo/redo step. */
export function createCompositeCommand(label: string, commands: Command[]): Command {
  return {
    label,
    do(state: Topo): Topo {
      return commands.reduce((s, command) => command.do(s), state);
    },
    undo(state: Topo): Topo {
      return [...commands].reverse().reduce((s, command) => command.undo(s), state);
    },
  };
}
