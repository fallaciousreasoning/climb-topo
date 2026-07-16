import type { Climb, Topo } from "@climb-topo/core";
import { buildSplineSegments, type BezierSegment, type Vec2 } from "./spline.js";

const SAMPLES_PER_SEGMENT = 20;

function cubicBezierPoint(seg: BezierSegment, t: number): Vec2 {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * seg.from.x + b * seg.c1.x + c * seg.c2.x + d * seg.to.x,
    y: a * seg.from.y + b * seg.c1.y + c * seg.c2.y + d * seg.to.y,
  };
}

function distancePointToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);

  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  const closest = { x: a.x + t * dx, y: a.y + t * dy };
  return Math.hypot(p.x - closest.x, p.y - closest.y);
}

function climbPoints(climb: Climb, topo: Topo): Vec2[] {
  const result: Vec2[] = [];
  for (const id of climb.pointIds) {
    const p = topo.points[id];
    if (p) result.push({ x: p.x, y: p.y });
  }
  return result;
}

export interface NearestSegment {
  /** Segment i is between climb.pointIds[i] and climb.pointIds[i+1]. */
  segmentIndex: number;
  distance: number;
}

/** Shared scan used by both distanceToClimb and findNearestSegmentOnClimb. */
function findNearestSegment(segments: BezierSegment[], point: Vec2): NearestSegment | null {
  if (segments.length === 0) return null;

  let best: NearestSegment = { segmentIndex: 0, distance: Infinity };
  segments.forEach((seg, segmentIndex) => {
    let prevSample = cubicBezierPoint(seg, 0);
    for (let i = 1; i <= SAMPLES_PER_SEGMENT; i++) {
      const sample = cubicBezierPoint(seg, i / SAMPLES_PER_SEGMENT);
      const d = distancePointToSegment(point, prevSample, sample);
      if (d < best.distance) best = { segmentIndex, distance: d };
      prevSample = sample;
    }
  });
  return best;
}

/**
 * Math-only distance from `point` to a climb's rendered curve, walking the same bezier
 * segments buildSmoothPath draws — this is a supporting utility for tests and non-DOM use;
 * the primary interaction path relies on native SVG hit-testing (see TopoRenderer).
 */
export function distanceToClimb(
  climb: Climb,
  topo: Topo,
  point: Vec2,
  opts?: { tension?: number },
): number {
  const points = climbPoints(climb, topo);
  if (points.length === 0) return Infinity;
  if (points.length === 1) return Math.hypot(point.x - points[0]!.x, point.y - points[0]!.y);

  const segments = buildSplineSegments(points, opts);
  return findNearestSegment(segments, point)?.distance ?? Infinity;
}

export function hitTestClimb(
  climb: Climb,
  topo: Topo,
  point: Vec2,
  tolerance: number,
  opts?: { tension?: number },
): boolean {
  return distanceToClimb(climb, topo, point, opts) <= tolerance;
}

/**
 * Finds which segment of a climb's own curve is nearest `point` — used for "click between
 * two points to split the line there": inserting a new point at
 * `climb.pointIds[result.segmentIndex + 1]` splits the path at that location. Returns null
 * for climbs with fewer than 2 points (nothing to split).
 */
export function findNearestSegmentOnClimb(
  climb: Climb,
  topo: Topo,
  point: Vec2,
  opts?: { tension?: number },
): NearestSegment | null {
  const points = climbPoints(climb, topo);
  if (points.length < 2) return null;

  const segments = buildSplineSegments(points, opts);
  return findNearestSegment(segments, point);
}
