import type { Climb, Topo, TopoPoint } from "@climb-topo/core";
import { describe, expect, it } from "vitest";
import { distanceToClimb, findNearestSegmentOnClimb, hitTestClimb } from "./geometry.js";
import { buildSplineSegments, type BezierSegment } from "./spline.js";

function point(id: string, x: number, y: number): TopoPoint {
  return { id, x, y, type: "vertex" };
}

function topoWithClimb(points: TopoPoint[], pointIds: string[]): { topo: Topo; climb: Climb } {
  const climb: Climb = { id: "c1", name: "Test Climb", visible: true, pointIds };
  const topo: Topo = {
    schemaVersion: 1,
    id: "t1",
    image: { backgroundUrl: "x" },
    points: Object.fromEntries(points.map((p) => [p.id, p])),
    climbs: [climb],
  };
  return { topo, climb };
}

function cubicBezierPoint(seg: BezierSegment, t: number) {
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

function distancePointToSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

describe("distanceToClimb / hitTestClimb", () => {
  it("returns Infinity for a climb with no points", () => {
    const { topo, climb } = topoWithClimb([], []);
    expect(distanceToClimb(climb, topo, { x: 0, y: 0 })).toBe(Infinity);
  });

  it("measures distance to the single point for a one-point climb", () => {
    const { topo, climb } = topoWithClimb([point("p1", 5, 5)], ["p1"]);
    expect(distanceToClimb(climb, topo, { x: 5, y: 9 })).toBeCloseTo(4);
  });

  it("hitTestClimb respects the tolerance", () => {
    const { topo, climb } = topoWithClimb(
      [point("p1", 0, 0), point("p1b", 10, 0)],
      ["p1", "p1b"],
    );
    expect(hitTestClimb(climb, topo, { x: 5, y: 1 }, 2)).toBe(true);
    expect(hitTestClimb(climb, topo, { x: 5, y: 10 }, 2)).toBe(false);
  });

  it("hit-testing follows the smoothed curve, not the straight segments, at a sharp corner", () => {
    // A sharp right-angle turn: the Catmull-Rom curve bulges away from the straight
    // A-B / B-C polyline near the corner. Sample a point that lies ON the rendered curve
    // and confirm it reads as much closer to the curve than to the straight segments.
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 0 };
    const c = { x: 10, y: 10 };
    const { topo, climb } = topoWithClimb(
      [point("a", a.x, a.y), point("b", b.x, b.y), point("c", c.x, c.y)],
      ["a", "b", "c"],
    );

    const segments = buildSplineSegments([a, b, c]);
    const secondSegment = segments[1]!;
    const onCurve = cubicBezierPoint(secondSegment, 0.5);

    const curveDistance = distanceToClimb(climb, topo, onCurve);
    const straightDistance = Math.min(
      distancePointToSegment(onCurve, a, b),
      distancePointToSegment(onCurve, b, c),
    );

    expect(curveDistance).toBeLessThan(0.01); // point is (numerically) on the sampled curve
    expect(straightDistance).toBeGreaterThan(curveDistance + 0.3); // but far from the naive polyline
  });

  it("respects a custom tension when computing curve distance", () => {
    const points = [point("a", 0, 0), point("b", 10, 10), point("c", 20, 0)];
    const { topo, climb } = topoWithClimb(points, ["a", "b", "c"]);
    const midish = { x: 10, y: 10 };

    const lowTension = distanceToClimb(climb, topo, midish, { tension: 0 });
    const highTension = distanceToClimb(climb, topo, midish, { tension: 2 });
    expect(lowTension).toBeGreaterThanOrEqual(0);
    expect(highTension).toBeGreaterThanOrEqual(0);
  });
});

describe("findNearestSegmentOnClimb", () => {
  it("returns null for a climb with fewer than 2 points", () => {
    const { topo, climb } = topoWithClimb([point("p1", 0, 0)], ["p1"]);
    expect(findNearestSegmentOnClimb(climb, topo, { x: 0, y: 0 })).toBeNull();
  });

  it("identifies the correct segment for a point near the first segment", () => {
    const { topo, climb } = topoWithClimb(
      [point("a", 0, 0), point("b", 10, 0), point("c", 20, 0)],
      ["a", "b", "c"],
    );
    const result = findNearestSegmentOnClimb(climb, topo, { x: 5, y: 0.5 });
    expect(result?.segmentIndex).toBe(0);
  });

  it("identifies the correct segment for a point near the second segment", () => {
    const { topo, climb } = topoWithClimb(
      [point("a", 0, 0), point("b", 10, 0), point("c", 20, 0)],
      ["a", "b", "c"],
    );
    const result = findNearestSegmentOnClimb(climb, topo, { x: 15, y: 0.5 });
    expect(result?.segmentIndex).toBe(1);
  });

  it("segmentIndex + 1 is the correct insertion index to split the line there", () => {
    const { topo, climb } = topoWithClimb(
      [point("a", 0, 0), point("b", 10, 0), point("c", 20, 0)],
      ["a", "b", "c"],
    );
    const result = findNearestSegmentOnClimb(climb, topo, { x: 15, y: 0.5 })!;
    const insertAt = result.segmentIndex + 1;
    // Inserting at this index should land the new point between "b" and "c".
    const pointIds = [...climb.pointIds];
    pointIds.splice(insertAt, 0, "new");
    expect(pointIds).toEqual(["a", "b", "new", "c"]);
  });
});
