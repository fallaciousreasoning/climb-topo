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

/** Reference ceiling used both to normalize a raw Ewbank number into the shared 0-1 scalar
 *  and (in gradeToColor below) to place the discrete color bands at the equivalent normalized
 *  cutoffs -- keeping both derived from the same constant is what makes "Ewbank grade 12" and
 *  "the green/yellow boundary" line up exactly. */
const EWBANK_MAX_GRADE = 40;

const ewbankNormalizer: GradeNormalizer = (value) => {
  const match = /^(\d+)/.exec(value.trim());
  if (!match) return null;
  return clamp01(Number(match[1]) / EWBANK_MAX_GRADE);
};

const gradeNormalizers: Record<string, GradeNormalizer> = {
  yds: ydsNormalizer,
  french: frenchNormalizer,
  vscale: vscaleNormalizer,
  ewbank: ewbankNormalizer,
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

/** Discrete difficulty bands, expressed as Ewbank-equivalent grade ceilings (normalized via
 *  EWBANK_MAX_GRADE so they compare directly against any system's 0-1 scalar): grade 12 or
 *  under is green, 18 or under yellow, 24 or under orange, 32 or under red, anything harder
 *  purple. Gray if the grade is missing/unparseable. */
const GRADE_BANDS: { maxGrade: number; color: string }[] = [
  { maxGrade: 12, color: "#43a047" }, // green
  { maxGrade: 18, color: "#fdd835" }, // yellow
  { maxGrade: 24, color: "#fb8c00" }, // orange
  { maxGrade: 32, color: "#e53935" }, // red
];
const HARDEST_BAND_COLOR = "#8e24aa"; // purple, above the top band

export function gradeToColor(scalar: number | null): string {
  if (scalar === null) return NEUTRAL_GRAY;
  for (const band of GRADE_BANDS) {
    if (scalar <= band.maxGrade / EWBANK_MAX_GRADE) return band.color;
  }
  return HARDEST_BAND_COLOR;
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
