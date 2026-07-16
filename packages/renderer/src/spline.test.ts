import { describe, expect, it } from "vitest";
import { buildSmoothPath, buildSmoothPathFiltered, buildSplineSegments } from "./spline.js";

describe("buildSplineSegments", () => {
  it("returns no segments for 0 or 1 points", () => {
    expect(buildSplineSegments([])).toEqual([]);
    expect(buildSplineSegments([{ x: 0, y: 0 }])).toEqual([]);
  });

  it("collapses control points onto the line for exactly 2 points (straight bezier)", () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 10, y: 0 };
    const [seg] = buildSplineSegments([p0, p1]);
    expect(seg).toBeDefined();
    // Control points must lie exactly on the p0->p1 line (same y, x strictly between).
    expect(seg!.c1.y).toBeCloseTo(0);
    expect(seg!.c2.y).toBeCloseTo(0);
    expect(seg!.c1.x).toBeGreaterThan(p0.x);
    expect(seg!.c1.x).toBeLessThan(p1.x);
    expect(seg!.c2.x).toBeGreaterThan(p0.x);
    expect(seg!.c2.x).toBeLessThan(p1.x);
  });

  it("produces one fewer segment than points for many points", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 0 },
      { x: 3, y: 1 },
    ];
    expect(buildSplineSegments(points)).toHaveLength(3);
  });

  it("scales curviness with the tension parameter", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 0 },
    ];
    const low = buildSplineSegments(points, { tension: 0 });
    const high = buildSplineSegments(points, { tension: 1.5 });
    // Higher tension pulls control points further from the endpoints.
    const lowOffset = Math.abs(low[0]!.c1.x - points[0]!.x);
    const highOffset = Math.abs(high[0]!.c1.x - points[0]!.x);
    expect(highOffset).toBeGreaterThan(lowOffset);
  });
});

describe("buildSmoothPath", () => {
  it("returns empty string for 0 or 1 points", () => {
    expect(buildSmoothPath([])).toBe("");
    expect(buildSmoothPath([{ x: 1, y: 2 }])).toBe("");
  });

  it("starts with M at the first point", () => {
    const d = buildSmoothPath([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ]);
    expect(d.startsWith("M 0 0")).toBe(true);
  });

  it("emits one C command per segment", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 0 },
    ];
    const d = buildSmoothPath(points);
    expect(d.match(/C /g)).toHaveLength(2);
  });

  it("does not emit floating point noise", () => {
    const d = buildSmoothPath([
      { x: 0.1, y: 0.2 },
      { x: 0.3, y: 0.4 },
    ]);
    expect(d).not.toMatch(/\d+\.\d{5,}/);
  });
});

describe("buildSmoothPathFiltered", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 2, y: 0 },
    { x: 3, y: 1 },
  ];

  it("matches buildSmoothPath exactly when every segment is owned", () => {
    const filtered = buildSmoothPathFiltered(points, [true, true, true]);
    expect(filtered).toBe(buildSmoothPath(points));
  });

  it("returns an empty string when no segment is owned", () => {
    expect(buildSmoothPathFiltered(points, [false, false, false])).toBe("");
  });

  it("returns empty string for 0 or 1 points regardless of mask", () => {
    expect(buildSmoothPathFiltered([], [])).toBe("");
    expect(buildSmoothPathFiltered([{ x: 1, y: 2 }], [])).toBe("");
  });

  it("drops only the unowned leading segments, keeping one continuous subpath", () => {
    const filtered = buildSmoothPathFiltered(points, [false, true, true]);
    expect(filtered.match(/M /g)).toHaveLength(1);
    expect(filtered.match(/C /g)).toHaveLength(2);
    // The remaining path should start at the second point, not the first.
    expect(filtered.startsWith(`M ${points[1]!.x} ${points[1]!.y}`)).toBe(true);
  });

  it("produces multiple disconnected subpaths when ownership has a gap in the middle", () => {
    const filtered = buildSmoothPathFiltered(points, [true, false, true]);
    expect(filtered.match(/M /g)).toHaveLength(2);
    expect(filtered.match(/C /g)).toHaveLength(2);
  });
});
