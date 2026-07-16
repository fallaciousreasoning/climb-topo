import type { Command } from "./Command.js";
import type { PointId } from "../model/point.js";
import type { Topo } from "../model/topo.js";

/** Changes a shared point's type (e.g. plain vertex -> bolt/anchor) in place — every climb
 *  referencing it sees the change automatically, same as MovePointCommand. */
export function createSetPointTypeCommand(state: Topo, pointId: PointId, type: string): Command {
  const before = state.points[pointId];
  if (!before) {
    throw new Error(`createSetPointTypeCommand: point not found: ${pointId}`);
  }

  return {
    label: "Set point type",
    do(s: Topo): Topo {
      const existing = s.points[pointId];
      if (!existing) return s;
      return { ...s, points: { ...s.points, [pointId]: { ...existing, type } } };
    },
    undo(s: Topo): Topo {
      if (!s.points[pointId]) return s;
      return { ...s, points: { ...s.points, [pointId]: before } };
    },
  };
}
