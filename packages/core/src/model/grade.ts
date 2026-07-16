/**
 * Kept generic across grading systems (YDS, French, V-scale, UIAA, Ewbank, Font, ...).
 * The raw token is stored tagged with its system rather than normalized at rest, since
 * normalization is lossy and system-dependent — it happens only at render time.
 */
export type GradeSystem = "yds" | "french" | "vscale" | "uiaa" | "ewbank" | "font" | string;

export interface Grade {
  system: GradeSystem;
  /** Raw token as authored, e.g. "5.10a", "6b+", "V4" */
  value: string;
}
