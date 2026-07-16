import type { Topo } from "@climb-topo/core";
import { findNearestPoint } from "@climb-topo/core";
import { findNearestSegmentOnClimb, hitTestClimb } from "@climb-topo/renderer";

export type DrawClickAction =
  | { type: "snap"; pointId: string }
  | { type: "switchActiveClimb"; climbId: string }
  | { type: "split"; insertAt: number }
  | { type: "append" };

export interface ResolveDrawClickParams {
  topo: Topo;
  activeClimbId: string;
  /** Normalized [0,1] stage coordinates. */
  pos: { x: number; y: number };
  snapThreshold: number;
  hitTolerance: number;
}

/**
 * Decides what a Draw-tool stage click should do, in priority order:
 *  1. Near an existing point (from any other climb) -> reuse it (link-up snap).
 *  2. On the ACTIVE climb's own line, between two of its points -> split the line there.
 *  3. On a DIFFERENT climb's rendered line -> switch the active climb to it.
 *  4. Otherwise -> append a new point to the end of the active climb's path.
 *
 * Split is checked before switching to another climb because a link-up climb can share
 * identical geometry with its base climb over the shared portion — clicking there to split
 * your OWN active climb's line would otherwise also match "click on a different climb's
 * line" (that climb's curve passes through the exact same spot) and get misread as switching
 * climbs instead. If the click is part of the active climb's own path, it stays about the
 * active climb regardless of who else's line happens to overlap there.
 *
 * Pure and DOM-free: only needs current data plus a position in normalized stage space,
 * so it's testable without a browser and independent of native SVG hit-testing quirks.
 */
export function resolveDrawClick(params: ResolveDrawClickParams): DrawClickAction {
  const { topo, activeClimbId, pos, snapThreshold, hitTolerance } = params;

  const snapTarget = findNearestPoint(topo, pos, {
    maxDistance: snapThreshold,
    excludeClimbId: activeClimbId,
  });
  if (snapTarget) return { type: "snap", pointId: snapTarget.id };

  const activeClimb = topo.climbs.find((c) => c.id === activeClimbId);
  if (activeClimb && activeClimb.pointIds.length >= 2 && hitTestClimb(activeClimb, topo, pos, hitTolerance)) {
    const nearest = findNearestSegmentOnClimb(activeClimb, topo, pos);
    if (nearest) return { type: "split", insertAt: nearest.segmentIndex + 1 };
  }

  for (const climb of topo.climbs) {
    if (climb.id === activeClimbId || !climb.visible) continue;
    if (hitTestClimb(climb, topo, pos, hitTolerance)) {
      return { type: "switchActiveClimb", climbId: climb.id };
    }
  }

  return { type: "append" };
}
