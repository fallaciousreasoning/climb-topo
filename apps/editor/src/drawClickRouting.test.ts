import type { Climb, Topo, TopoPoint } from "@climb-topo/core";
import { describe, expect, it } from "vitest";
import { resolveDrawClick } from "./drawClickRouting.js";

function point(id: string, x: number, y: number): TopoPoint {
  return { id, x, y, type: "vertex" };
}

function climb(overrides: Partial<Climb> & { id: string }): Climb {
  return { name: overrides.id, visible: true, pointIds: [], ...overrides };
}

function topo(overrides: Partial<Topo> = {}): Topo {
  return {
    schemaVersion: 1,
    id: "t1",
    image: { backgroundUrl: "x" },
    points: {},
    climbs: [],
    ...overrides,
  };
}

const SNAP = 0.03;
const HIT = 0.02;

describe("resolveDrawClick", () => {
  it("snaps to a nearby point from another climb (link-up)", () => {
    const t = topo({
      points: { p1: point("p1", 0.5, 0.5) },
      climbs: [climb({ id: "other", pointIds: ["p1"] }), climb({ id: "active" })],
    });

    const action = resolveDrawClick({
      topo: t,
      activeClimbId: "active",
      pos: { x: 0.51, y: 0.5 },
      snapThreshold: SNAP,
      hitTolerance: HIT,
    });
    expect(action).toEqual({ type: "snap", pointId: "p1" });
  });

  it("does not snap to a point that belongs only to the active climb itself", () => {
    const t = topo({
      points: { p1: point("p1", 0.5, 0.5) },
      climbs: [climb({ id: "active", pointIds: ["p1"] })],
    });

    const action = resolveDrawClick({
      topo: t,
      activeClimbId: "active",
      pos: { x: 0.51, y: 0.5 },
      snapThreshold: SNAP,
      hitTolerance: HIT,
    });
    expect(action.type).not.toBe("snap");
  });

  it("switches the active climb when clicking a different climb's line", () => {
    const t = topo({
      points: { p1: point("p1", 0, 0), p2: point("p2", 1, 0) },
      climbs: [climb({ id: "other", pointIds: ["p1", "p2"] }), climb({ id: "active" })],
    });

    const action = resolveDrawClick({
      topo: t,
      activeClimbId: "active",
      pos: { x: 0.5, y: 0 },
      snapThreshold: SNAP,
      hitTolerance: HIT,
    });
    expect(action).toEqual({ type: "switchActiveClimb", climbId: "other" });
  });

  it("ignores a non-visible climb's line when routing clicks", () => {
    const t = topo({
      points: { p1: point("p1", 0, 0), p2: point("p2", 1, 0) },
      climbs: [
        climb({ id: "hidden", visible: false, pointIds: ["p1", "p2"] }),
        climb({ id: "active" }),
      ],
    });

    const action = resolveDrawClick({
      topo: t,
      activeClimbId: "active",
      pos: { x: 0.5, y: 0 },
      snapThreshold: SNAP,
      hitTolerance: HIT,
    });
    expect(action.type).toBe("append");
  });

  it("splits the active climb's own line when clicked between two of its points", () => {
    const t = topo({
      points: { p1: point("p1", 0, 0), p2: point("p2", 1, 0), p3: point("p3", 2, 0) },
      climbs: [climb({ id: "active", pointIds: ["p1", "p2", "p3"] })],
    });

    const action = resolveDrawClick({
      topo: t,
      activeClimbId: "active",
      pos: { x: 1.5, y: 0 },
      snapThreshold: SNAP,
      hitTolerance: HIT,
    });
    expect(action).toEqual({ type: "split", insertAt: 2 });
  });

  it("appends when clicking empty space", () => {
    const t = topo({
      points: { p1: point("p1", 0, 0), p2: point("p2", 1, 0) },
      climbs: [climb({ id: "active", pointIds: ["p1", "p2"] })],
    });

    const action = resolveDrawClick({
      topo: t,
      activeClimbId: "active",
      pos: { x: 0.9, y: 0.9 },
      snapThreshold: SNAP,
      hitTolerance: HIT,
    });
    expect(action).toEqual({ type: "append" });
  });

  it("appends when the active climb has fewer than 2 points, even if clicked near its single point", () => {
    const t = topo({
      points: { p1: point("p1", 0.5, 0.5) },
      climbs: [climb({ id: "active", pointIds: ["p1"] })],
    });

    const action = resolveDrawClick({
      topo: t,
      activeClimbId: "active",
      pos: { x: 0.505, y: 0.5 },
      snapThreshold: SNAP,
      hitTolerance: HIT,
    });
    expect(action.type).toBe("append");
  });

  it("prefers splitting the active climb over switching to another climb sharing the same line", () => {
    // Regression: a link-up sharing a full prefix with its base climb has geometrically
    // identical curve segments over that shared portion. Clicking there while the SHARED
    // climb is active must split it, not get misread as "click on the other climb's line"
    // and switch away — even though that other climb's hitTest ALSO matches at this spot.
    const t = topo({
      points: {
        p1: point("p1", 0, 0),
        p2: point("p2", 1, 0),
        p3: point("p3", 2, 0),
      },
      climbs: [
        climb({ id: "base", pointIds: ["p1", "p2", "p3"] }),
        climb({ id: "active", pointIds: ["p1", "p2", "p3"] }),
      ],
    });

    const action = resolveDrawClick({
      topo: t,
      activeClimbId: "active",
      pos: { x: 1.5, y: 0 },
      snapThreshold: SNAP,
      hitTolerance: HIT,
    });
    expect(action).toEqual({ type: "split", insertAt: 2 });
  });

  it("prefers snapping over switching active climb when both are in range", () => {
    const t = topo({
      points: { shared: point("shared", 0.5, 0.5) },
      climbs: [
        climb({ id: "other", pointIds: ["shared"] }),
        climb({ id: "active" }),
      ],
    });

    const action = resolveDrawClick({
      topo: t,
      activeClimbId: "active",
      pos: { x: 0.5, y: 0.5 }, // exactly on the shared point, which is also "other"'s line endpoint
      snapThreshold: SNAP,
      hitTolerance: HIT,
    });
    expect(action).toEqual({ type: "snap", pointId: "shared" });
  });
});
