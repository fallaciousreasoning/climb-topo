import type { Climb } from "./model/climb.js";
import type { PointId, TopoPoint } from "./model/point.js";
import type { Topo } from "./model/topo.js";

/** Recomputed on demand — cheap at realistic scale (dozens of climbs, hundreds of points). */
export function getClimbsUsingPoint(topo: Topo, pointId: PointId): Climb[] {
  return topo.climbs.filter((climb) => climb.pointIds.includes(pointId));
}

export function isShared(topo: Topo, pointId: PointId): boolean {
  return getClimbsUsingPoint(topo, pointId).length > 1;
}

export interface FindNearestPointOptions {
  /** Normalized-space distance; candidates further than this are ignored. */
  maxDistance: number;
  /** Exclude points that belong only to this climb's own path (still finds shared points). */
  excludeClimbId?: string;
}

/**
 * Finds the nearest existing point to `pos` across all climbs, for link-up snapping.
 * A point is a candidate unless every climb referencing it is the excluded climb.
 */
export function findNearestPoint(
  topo: Topo,
  pos: { x: number; y: number },
  opts: FindNearestPointOptions,
): TopoPoint | null {
  let best: TopoPoint | null = null;
  let bestDistance = Infinity;

  for (const point of Object.values(topo.points)) {
    if (opts.excludeClimbId !== undefined) {
      const referencingClimbs = getClimbsUsingPoint(topo, point.id);
      const onlyExcluded =
        referencingClimbs.length > 0 &&
        referencingClimbs.every((climb) => climb.id === opts.excludeClimbId);
      if (onlyExcluded) continue;
    }

    const dx = point.x - pos.x;
    const dy = point.y - pos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance <= opts.maxDistance && distance < bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }

  return best;
}
