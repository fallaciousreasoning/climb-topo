import type { Climb } from "@climb-topo/core";
import { describe, expect, it } from "vitest";
import { computeEdgeOwnership, computeOwnedSegmentMask, edgeKey } from "./sharedSegments.js";

function climb(overrides: Partial<Climb> & { id: string }): Climb {
  return { name: overrides.id, visible: true, pointIds: [], ...overrides };
}

describe("computeEdgeOwnership / computeOwnedSegmentMask", () => {
  it("gives every edge of a lone climb to itself", () => {
    const a = climb({ id: "a", pointIds: ["p1", "p2", "p3"] });
    const ownership = computeEdgeOwnership([a]);
    expect(ownership.get(edgeKey("p1", "p2"))).toBe("a");
    expect(ownership.get(edgeKey("p2", "p3"))).toBe("a");
    expect(computeOwnedSegmentMask(a, ownership)).toEqual([true, true]);
  });

  it("a climb sharing a full prefix with an earlier climb only owns its unique tail", () => {
    const base = climb({ id: "base", pointIds: ["p1", "p2", "p3", "p4"] });
    const extension = climb({ id: "extension", pointIds: ["p1", "p2", "p3", "p4", "p5"] });
    const ownership = computeEdgeOwnership([base, extension]);

    expect(computeOwnedSegmentMask(base, ownership)).toEqual([true, true, true]);
    // extension's first 3 edges duplicate base's; only the last (p4->p5) is unique to it.
    expect(computeOwnedSegmentMask(extension, ownership)).toEqual([false, false, false, true]);
  });

  it("the first climb in array order wins ownership of a fully-shared edge", () => {
    const first = climb({ id: "first", pointIds: ["p1", "p2"] });
    const second = climb({ id: "second", pointIds: ["p1", "p2"] });
    const ownership = computeEdgeOwnership([first, second]);

    expect(ownership.get(edgeKey("p1", "p2"))).toBe("first");
    expect(computeOwnedSegmentMask(first, ownership)).toEqual([true]);
    expect(computeOwnedSegmentMask(second, ownership)).toEqual([false]);
  });

  it("two independent climbs with no shared edges each own their own segments", () => {
    const a = climb({ id: "a", pointIds: ["p1", "p2"] });
    const b = climb({ id: "b", pointIds: ["p3", "p4"] });
    const ownership = computeEdgeOwnership([a, b]);

    expect(computeOwnedSegmentMask(a, ownership)).toEqual([true]);
    expect(computeOwnedSegmentMask(b, ownership)).toEqual([true]);
  });

  it("a climb with fewer than 2 points has no edges at all", () => {
    const solo = climb({ id: "solo", pointIds: ["p1"] });
    const empty = climb({ id: "empty", pointIds: [] });
    const ownership = computeEdgeOwnership([solo, empty]);

    expect(computeOwnedSegmentMask(solo, ownership)).toEqual([]);
    expect(computeOwnedSegmentMask(empty, ownership)).toEqual([]);
  });

  it("handles a shared middle run between two otherwise-independent climbs", () => {
    // a: p1-p2-p3-p4 ; b: p5-p2-p3-p6 -- share the p2->p3 edge only.
    const a = climb({ id: "a", pointIds: ["p1", "p2", "p3", "p4"] });
    const b = climb({ id: "b", pointIds: ["p5", "p2", "p3", "p6"] });
    const ownership = computeEdgeOwnership([a, b]);

    expect(computeOwnedSegmentMask(a, ownership)).toEqual([true, true, true]);
    expect(computeOwnedSegmentMask(b, ownership)).toEqual([true, false, true]);
  });
});
