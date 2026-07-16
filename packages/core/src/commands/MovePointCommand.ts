import type { Command } from "./Command.js";
import type { PointId } from "../model/point.js";
import type { Topo } from "../model/topo.js";

/**
 * Mutates the one shared point object — every climb referencing it sees the new
 * position automatically, with zero per-climb propagation logic.
 */
export function createMovePointCommand(
  state: Topo,
  pointId: PointId,
  newX: number,
  newY: number,
): Command {
  const before = state.points[pointId];
  if (!before) {
    throw new Error(`createMovePointCommand: point not found: ${pointId}`);
  }

  return {
    label: "Move point",
    do(s: Topo): Topo {
      const existing = s.points[pointId];
      if (!existing) return s;
      return { ...s, points: { ...s.points, [pointId]: { ...existing, x: newX, y: newY } } };
    },
    undo(s: Topo): Topo {
      if (!s.points[pointId]) return s;
      return { ...s, points: { ...s.points, [pointId]: before } };
    },
  };
}
