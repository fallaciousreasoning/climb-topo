import type { Command } from "./Command.js";
import { getClimbsUsingPoint } from "../pointIndex.js";
import type { Topo } from "../model/topo.js";

/**
 * Removal cascades to garbage-collect any points solely owned by the removed climb, as a
 * single atomic undo step — undo restores both the climb and any points it orphaned.
 */
export function createRemoveClimbCommand(state: Topo, climbId: string): Command {
  const climb = state.climbs.find((c) => c.id === climbId);
  if (!climb) {
    throw new Error(`createRemoveClimbCommand: climb not found: ${climbId}`);
  }
  const removedIndex = state.climbs.indexOf(climb);
  const removedPointIds = [...new Set(climb.pointIds)];

  return {
    label: "Remove climb",
    do(s: Topo): Topo {
      const climbs = s.climbs.filter((c) => c.id !== climbId);
      const nextState = { ...s, climbs };

      const points = { ...s.points };
      for (const pointId of removedPointIds) {
        if (getClimbsUsingPoint(nextState, pointId).length === 0) {
          delete points[pointId];
        }
      }

      return { ...nextState, points };
    },
    undo(s: Topo): Topo {
      const climbs = [...s.climbs];
      climbs.splice(removedIndex, 0, climb);

      const points = { ...s.points };
      for (const pointId of removedPointIds) {
        if (!points[pointId]) {
          const original = state.points[pointId];
          if (original) points[pointId] = original;
        }
      }

      return { ...s, climbs, points };
    },
  };
}
