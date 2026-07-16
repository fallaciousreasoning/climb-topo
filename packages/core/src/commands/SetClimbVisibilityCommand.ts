import type { Command } from "./Command.js";
import type { Topo } from "../model/topo.js";

export function createSetClimbVisibilityCommand(
  state: Topo,
  climbId: string,
  visible: boolean,
): Command {
  const climb = state.climbs.find((c) => c.id === climbId);
  if (!climb) {
    throw new Error(`createSetClimbVisibilityCommand: climb not found: ${climbId}`);
  }
  const before = climb.visible;

  return {
    label: visible ? "Show climb" : "Hide climb",
    do(s: Topo): Topo {
      return { ...s, climbs: s.climbs.map((c) => (c.id === climbId ? { ...c, visible } : c)) };
    },
    undo(s: Topo): Topo {
      return {
        ...s,
        climbs: s.climbs.map((c) => (c.id === climbId ? { ...c, visible: before } : c)),
      };
    },
  };
}
