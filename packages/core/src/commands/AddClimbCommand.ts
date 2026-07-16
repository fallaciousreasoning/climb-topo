import type { Command } from "./Command.js";
import type { Climb } from "../model/climb.js";
import type { Topo } from "../model/topo.js";

export function createAddClimbCommand(climb: Climb): Command {
  return {
    label: "Add climb",
    do(state: Topo): Topo {
      return { ...state, climbs: [...state.climbs, climb] };
    },
    undo(state: Topo): Topo {
      return { ...state, climbs: state.climbs.filter((c) => c.id !== climb.id) };
    },
  };
}
