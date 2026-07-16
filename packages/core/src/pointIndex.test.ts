import { describe, expect, it } from "vitest";
import { findNearestPoint, getClimbsUsingPoint, isShared } from "./pointIndex.js";
import { makeClimb, makePoint, makeTopo, withPoints } from "./testing/fixtures.js";

describe("getClimbsUsingPoint / isShared", () => {
  it("returns every climb referencing a point", () => {
    let topo = makeTopo();
    topo = withPoints(topo, [makePoint({ id: "p1" })]);
    topo.climbs = [
      makeClimb({ id: "a", pointIds: ["p1"] }),
      makeClimb({ id: "b", pointIds: ["p1"] }),
      makeClimb({ id: "c", pointIds: [] }),
    ];

    expect(getClimbsUsingPoint(topo, "p1").map((c) => c.id)).toEqual(["a", "b"]);
    expect(isShared(topo, "p1")).toBe(true);
  });

  it("is not shared when only one climb references it", () => {
    let topo = makeTopo();
    topo = withPoints(topo, [makePoint({ id: "p1" })]);
    topo.climbs = [makeClimb({ id: "a", pointIds: ["p1"] })];

    expect(isShared(topo, "p1")).toBe(false);
  });
});

describe("findNearestPoint", () => {
  it("finds the closest point within maxDistance", () => {
    let topo = makeTopo();
    topo = withPoints(topo, [
      makePoint({ id: "near", x: 0.1, y: 0.1 }),
      makePoint({ id: "far", x: 0.9, y: 0.9 }),
    ]);

    const result = findNearestPoint(topo, { x: 0.11, y: 0.1 }, { maxDistance: 0.05 });
    expect(result?.id).toBe("near");
  });

  it("returns null when nothing is within maxDistance", () => {
    let topo = makeTopo();
    topo = withPoints(topo, [makePoint({ id: "p1", x: 0.9, y: 0.9 })]);

    const result = findNearestPoint(topo, { x: 0.1, y: 0.1 }, { maxDistance: 0.05 });
    expect(result).toBeNull();
  });

  it("excludeClimbId still finds a point that is ALSO used by another climb", () => {
    // Shared points must remain valid snap targets even from the perspective of one of
    // their own owning climbs — excludeClimbId only hides points that are exclusively
    // that climb's own (unshared) points.
    let topo = makeTopo();
    topo = withPoints(topo, [makePoint({ id: "shared", x: 0.5, y: 0.5 })]);
    topo.climbs = [
      makeClimb({ id: "a", pointIds: ["shared"] }),
      makeClimb({ id: "b", pointIds: ["shared"] }),
    ];

    const result = findNearestPoint(
      topo,
      { x: 0.5, y: 0.5 },
      { maxDistance: 0.1, excludeClimbId: "a" },
    );
    expect(result?.id).toBe("shared");
  });

  it("excludeClimbId hides a point that belongs only to that climb", () => {
    let topo = makeTopo();
    topo = withPoints(topo, [makePoint({ id: "own", x: 0.5, y: 0.5 })]);
    topo.climbs = [makeClimb({ id: "a", pointIds: ["own"] })];

    const result = findNearestPoint(
      topo,
      { x: 0.5, y: 0.5 },
      { maxDistance: 0.1, excludeClimbId: "a" },
    );
    expect(result).toBeNull();
  });

  it("picks the strictly nearest candidate among several in range", () => {
    let topo = makeTopo();
    topo = withPoints(topo, [
      makePoint({ id: "a", x: 0.2, y: 0.2 }),
      makePoint({ id: "b", x: 0.21, y: 0.2 }),
      makePoint({ id: "c", x: 0.25, y: 0.2 }),
    ]);

    const result = findNearestPoint(topo, { x: 0.2, y: 0.2 }, { maxDistance: 0.5 });
    expect(result?.id).toBe("a");
  });
});
