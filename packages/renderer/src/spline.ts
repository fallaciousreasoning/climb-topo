export interface Vec2 {
  x: number;
  y: number;
}

export interface BezierSegment {
  from: Vec2;
  c1: Vec2;
  c2: Vec2;
  to: Vec2;
}

/** tension: 0.5 reproduces the classic uniform Catmull-Rom-to-Bezier conversion. */
const DEFAULT_TENSION = 0.5;

/**
 * Catmull-Rom-to-Bezier control points for each consecutive pair of points, clamping at
 * the array ends by duplicating the nearest real point. This is the single source of truth
 * for climb-line curve geometry — both SVG path rendering (buildSmoothPath) and hit-testing
 * (distanceToClimb) walk these same segments, so they never drift apart.
 */
export function buildSplineSegments(
  points: readonly Vec2[],
  opts?: { tension?: number },
): BezierSegment[] {
  if (points.length < 2) return [];
  const tension = opts?.tension ?? DEFAULT_TENSION;
  const factor = tension / 3;

  const segments: BezierSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const prev = points[i - 1] ?? points[i]!;
    const curr = points[i]!;
    const next = points[i + 1]!;
    const nextNext = points[i + 2] ?? next;

    const c1: Vec2 = {
      x: curr.x + factor * (next.x - prev.x),
      y: curr.y + factor * (next.y - prev.y),
    };
    const c2: Vec2 = {
      x: next.x - factor * (nextNext.x - curr.x),
      y: next.y - factor * (nextNext.y - curr.y),
    };
    segments.push({ from: curr, c1, c2, to: next });
  }
  return segments;
}

/** Avoids floating-point noise like "0.30000000000000004" in emitted path strings. */
function formatNum(n: number): string {
  return Number(n.toFixed(4)).toString();
}

function segmentCommand(seg: BezierSegment): string {
  return (
    `C ${formatNum(seg.c1.x)} ${formatNum(seg.c1.y)}, ` +
    `${formatNum(seg.c2.x)} ${formatNum(seg.c2.y)}, ` +
    `${formatNum(seg.to.x)} ${formatNum(seg.to.y)}`
  );
}

/**
 * Builds an SVG path `d` string tracing a smooth curve through `points`.
 * Degenerate cases: 0/1 points -> "" (nothing to draw); 2 points -> a straight bezier
 * (control points collapse onto the p0-p1 line, degrading gracefully to a line).
 */
export function buildSmoothPath(points: readonly Vec2[], opts?: { tension?: number }): string {
  if (points.length < 2) return "";

  const segments = buildSplineSegments(points, opts);
  const first = points[0]!;
  const parts = [`M ${formatNum(first.x)} ${formatNum(first.y)}`];
  for (const seg of segments) {
    parts.push(segmentCommand(seg));
  }
  return parts.join(" ");
}

/**
 * Like buildSmoothPath, but skips drawing segments where `segmentMask[i]` is false — used to
 * omit a climb's segments that are already drawn by another climb sharing the same points
 * (see sharedSegments.ts), so an overlapping stretch paints only once. Segments still use the
 * full `points` array for curve-shape context (so the drawn portions curve exactly as they
 * would if the whole path were drawn), they're just selectively included in the output.
 * Skipped segments break the path into a fresh `M` wherever drawing resumes, so the result
 * may contain multiple disconnected subpaths.
 */
export function buildSmoothPathFiltered(
  points: readonly Vec2[],
  segmentMask: readonly boolean[],
  opts?: { tension?: number },
): string {
  if (points.length < 2) return "";

  const segments = buildSplineSegments(points, opts);
  const parts: string[] = [];
  let needMoveTo = true;
  segments.forEach((seg, i) => {
    if (!segmentMask[i]) {
      needMoveTo = true;
      return;
    }
    if (needMoveTo) {
      parts.push(`M ${formatNum(seg.from.x)} ${formatNum(seg.from.y)}`);
      needMoveTo = false;
    }
    parts.push(segmentCommand(seg));
  });
  return parts.join(" ");
}
