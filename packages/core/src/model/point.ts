export type PointId = string;

export interface TopoPoint {
  id: PointId;
  /** Normalized 0..1, relative to Topo.image.width */
  x: number;
  /** Normalized 0..1, relative to Topo.image.height */
  y: number;
  /** 'vertex' is the only built-in type; renderers register handling for others. */
  type: string;
  meta?: Record<string, unknown>;
}

export const DEFAULT_POINT_TYPE = "vertex";
