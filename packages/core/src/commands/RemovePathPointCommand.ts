import type { Command } from "./Command.js";
import { getClimbsUsingPoint } from "../pointIndex.js";
import type { PointId, TopoPoint } from "../model/point.js";
import type { Topo } from "../model/topo.js";

export function createRemovePathPointCommand(
  state: Topo,
  climbId: string,
  index: number,
): Command {
  const climb = state.climbs.find((c) => c.id === climbId);
  if (!climb) {
    throw new Error(`createRemovePathPointCommand: climb not found: ${climbId}`);
  }
  const pointId: PointId | undefined = climb.pointIds[index];
  if (pointId === undefined) {
    throw new Error(`createRemovePathPointCommand: no point at index ${index}`);
  }
  const removedPoint: TopoPoint | undefined = state.points[pointId];

  return {
    label: "Remove point",
    do(s: Topo): Topo {
      const climbs = s.climbs.map((c) => {
        if (c.id !== climbId) return c;
        const pointIds = [...c.pointIds];
        pointIds.splice(index, 1);
        return { ...c, pointIds };
      });
      const nextState = { ...s, climbs };

      const stillReferenced = getClimbsUsingPoint(nextState, pointId).length > 0;
      let points = s.points;
      if (!stillReferenced) {
        const { [pointId]: _removed, ...rest } = points;
        points = rest;
      }

      return { ...nextState, points };
    },
    undo(s: Topo): Topo {
      const climbs = s.climbs.map((c) => {
        if (c.id !== climbId) return c;
        const pointIds = [...c.pointIds];
        pointIds.splice(index, 0, pointId);
        return { ...c, pointIds };
      });

      const points = s.points[pointId]
        ? s.points
        : removedPoint
          ? { ...s.points, [pointId]: removedPoint }
          : s.points;

      return { ...s, points, climbs };
    },
  };
}
