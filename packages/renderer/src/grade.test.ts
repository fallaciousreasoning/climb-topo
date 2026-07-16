import type { Climb } from "@climb-topo/core";
import { describe, expect, it } from "vitest";
import {
  colorForClimb,
  EDITING_BLUE,
  gradeToColor,
  normalizeGrade,
  registerGradeNormalizer,
} from "./grade.js";

function climb(overrides: Partial<Climb> = {}): Climb {
  return { id: "c1", name: "Test", visible: true, pointIds: [], ...overrides };
}

describe("normalizeGrade", () => {
  it("parses a YDS grade", () => {
    const scalar = normalizeGrade({ system: "yds", value: "5.10a" });
    expect(scalar).not.toBeNull();
    expect(scalar).toBeGreaterThan(0);
    expect(scalar).toBeLessThanOrEqual(1);
  });

  it("parses a French grade", () => {
    const scalar = normalizeGrade({ system: "french", value: "6b+" });
    expect(scalar).not.toBeNull();
  });

  it("parses a V-scale grade", () => {
    const scalar = normalizeGrade({ system: "vscale", value: "V4" });
    expect(scalar).not.toBeNull();
  });

  it("harder grades normalize to a larger scalar within the same system", () => {
    const easy = normalizeGrade({ system: "yds", value: "5.6" });
    const hard = normalizeGrade({ system: "yds", value: "5.13c" });
    expect(hard!).toBeGreaterThan(easy!);
  });

  it("returns null for an unparseable value", () => {
    expect(normalizeGrade({ system: "yds", value: "not-a-grade" })).toBeNull();
  });

  it("returns null for a missing grade", () => {
    expect(normalizeGrade(undefined)).toBeNull();
  });

  it("returns null for an unregistered grading system", () => {
    expect(normalizeGrade({ system: "unknown-system", value: "5" })).toBeNull();
  });

  it("allows registering a new grading system adapter", () => {
    registerGradeNormalizer("custom", (value) => (value === "hard" ? 1 : 0));
    expect(normalizeGrade({ system: "custom", value: "hard" })).toBe(1);
  });
});

describe("gradeToColor", () => {
  it("returns a neutral gray for null (missing/unparseable)", () => {
    expect(gradeToColor(null)).toBe("#9e9e9e");
  });

  it("returns distinct colors across the scalar range", () => {
    const low = gradeToColor(0);
    const high = gradeToColor(1);
    expect(low).not.toBe(high);
  });
});

describe("colorForClimb", () => {
  it("returns EDITING_BLUE for the active climb in edit mode, regardless of grade", () => {
    const c = climb({ id: "a", grade: { system: "yds", value: "5.13c" } });
    expect(colorForClimb(c, "edit", "a")).toBe(EDITING_BLUE);
    expect(colorForClimb(climb({ id: "b" }), "edit", "b")).toBe(EDITING_BLUE);
  });

  it("does not color a non-active climb EDITING_BLUE in edit mode, even with no grade", () => {
    const c = climb({ id: "a" });
    expect(colorForClimb(c, "edit", "some-other-climb")).not.toBe(EDITING_BLUE);
    expect(colorForClimb(c, "edit", null)).not.toBe(EDITING_BLUE);
    expect(colorForClimb(c, "edit")).not.toBe(EDITING_BLUE);
  });

  it("derives color from grade in view mode regardless of activeClimbId", () => {
    const graded = colorForClimb(
      climb({ id: "a", grade: { system: "yds", value: "5.10a" } }),
      "view",
      "a",
    );
    const ungraded = colorForClimb(climb({ id: "b" }), "view", "b");
    expect(graded).not.toBe(EDITING_BLUE);
    expect(ungraded).toBe("#9e9e9e");
  });
});
