import type { Topo } from "../model/topo.js";

export interface Command {
  readonly label: string;
  do(state: Topo): Topo;
  undo(state: Topo): Topo;
}
