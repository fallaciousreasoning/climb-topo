import type { Climb, Grade, GradeSystem } from "@climb-topo/core";

export type RenderMode = "edit" | "view";

/** Fixed color used for every climb line while editing — grade is never consulted. */
export const EDITING_BLUE = "#1e88ff";

const NEUTRAL_GRAY = "#9e9e9e";

export type GradeNormalizer = (value: string) => number | null;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Example adapters — approximate, meant as a swappable starting point, not authoritative. */
const ydsNormalizer: GradeNormalizer = (value) => {
  const match = /^5\.(\d+)([a-d])?/i.exec(value.trim());
  if (!match) return null;
  const major = Number(match[1]);
  const minor = match[2] ? "abcd".indexOf(match[2].toLowerCase()) : 0;
  return clamp01((major - 5 + minor / 4) / 10);
};

const frenchNormalizer: GradeNormalizer = (value) => {
  const match = /^(\d+)([a-c])?(\+)?/i.exec(value.trim());
  if (!match) return null;
  const major = Number(match[1]);
  const minor = match[2] ? "abc".indexOf(match[2].toLowerCase()) : 0;
  const plus = match[3] ? 0.5 : 0;
  return clamp01((major - 3 + (minor + plus) / 3) / 10);
};

const vscaleNormalizer: GradeNormalizer = (value) => {
  const match = /^v\s*(\d+)/i.exec(value.trim());
  if (!match) return null;
  return clamp01(Number(match[1]) / 12);
};

const gradeNormalizers: Record<string, GradeNormalizer> = {
  yds: ydsNormalizer,
  french: frenchNormalizer,
  vscale: vscaleNormalizer,
};

/** Registers or replaces the normalizer for a grading system, without touching renderer internals. */
export function registerGradeNormalizer(system: GradeSystem, normalizer: GradeNormalizer): void {
  gradeNormalizers[system] = normalizer;
}

/** Maps a Grade to a [0,1] difficulty scalar via its system's adapter; null if unparseable/missing. */
export function normalizeGrade(grade: Grade | undefined): number | null {
  if (!grade) return null;
  const normalizer = gradeNormalizers[grade.system];
  if (!normalizer) return null;
  return normalizer(grade.value);
}

/** Generic, grading-system-independent gradient: green (easy) -> red (hard); gray if null. */
export function gradeToColor(scalar: number | null): string {
  if (scalar === null) return NEUTRAL_GRAY;
  const hue = 120 * (1 - scalar);
  return `hsl(${hue.toFixed(0)}, 70%, 45%)`;
}

/**
 * The single call site the renderer uses for climb line color. Only the climb currently
 * being edited (activeClimbId) renders as EDITING_BLUE in edit mode — every other climb,
 * in either mode, is colored by grade. Color-by-grade is strictly a rendering concern, never
 * baked into the data model.
 */
export function colorForClimb(
  climb: Climb,
  mode: RenderMode,
  activeClimbId?: string | null,
): string {
  if (mode === "edit" && climb.id === activeClimbId) return EDITING_BLUE;
  return gradeToColor(normalizeGrade(climb.grade));
}
