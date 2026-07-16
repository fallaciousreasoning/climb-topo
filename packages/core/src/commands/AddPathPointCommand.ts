import type { Command } from "./Command.js";
import { generateId } from "../id.js";
import { DEFAULT_POINT_TYPE, type PointId, type TopoPoint } from "../model/point.js";
import type { Topo } from "../model/topo.js";

export type AddPathPointSpec =
  | { kind: "new"; x: number; y: number; type?: string; meta?: Record<string, unknown> }
  | { kind: "existing"; pointId: PointId };

/**
 * The primary drawing action, and where the entire link-up mechanic lives: if the user
 * clicked/snapped an existing point, that exact pointId is reused (no new point created) —
 * this is what lets a link-up climb share identity with the climb(s) it's composed from.
 *
 * `insertAt` defaults to the end of the climb's path (ordinary forward drawing). Passing an
 * explicit index is how "click between two points to split the line there" is implemented —
 * the index is resolved once at creation time (from `state`), not recomputed inside do(), so
 * it stays stable across undo/redo.
 */
export function createAddPathPointCommand(
  state: Topo,
  climbId: string,
  spec: AddPathPointSpec,
  insertAt?: number,
): Command {
  const climb = state.climbs.find((c) => c.id === climbId);
  if (!climb) {
    throw new Error(`createAddPathPointCommand: climb not found: ${climbId}`);
  }
  const index = insertAt ?? climb.pointIds.length;

  let pointId: PointId;
  let newPoint: TopoPoint | null = null;

  if (spec.kind === "existing") {
    pointId = spec.pointId;
  } else {
    pointId = generateId();
    newPoint = {
      id: pointId,
      x: spec.x,
      y: spec.y,
      type: spec.type ?? DEFAULT_POINT_TYPE,
      meta: spec.meta,
    };
  }

  return {
    label: newPoint ? "Add point" : "Add point (link-up)",
    do(s: Topo): Topo {
      const points = newPoint ? { ...s.points, [pointId]: newPoint } : s.points;
      const climbs = s.climbs.map((c) => {
        if (c.id !== climbId) return c;
        const pointIds = [...c.pointIds];
        pointIds.splice(index, 0, pointId);
        return { ...c, pointIds };
      });
      return { ...s, points, climbs };
    },
    undo(s: Topo): Topo {
      const climbs = s.climbs.map((c) => {
        if (c.id !== climbId) return c;
        const pointIds = [...c.pointIds];
        pointIds.splice(index, 1);
        return { ...c, pointIds };
      });

      // Safe by construction: commands are always undone in strict LIFO order, so any
      // later command that referenced this newly-created point from another climb has
      // already been undone by the time this undo runs.
      let points = s.points;
      if (newPoint) {
        const { [pointId]: _removed, ...rest } = points;
        points = rest;
      }

      return { ...s, points, climbs };
    },
  };
}
