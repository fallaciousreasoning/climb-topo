import { CURRENT_SCHEMA_VERSION, type Topo } from "../model/topo.js";
import type { Climb } from "../model/climb.js";
import type { TopoPoint } from "../model/point.js";

export function makePoint(overrides: Partial<TopoPoint> & { id: string }): TopoPoint {
  return { x: 0, y: 0, type: "vertex", ...overrides };
}

export function makeClimb(overrides: Partial<Climb> & { id: string }): Climb {
  return { name: overrides.id, visible: true, pointIds: [], ...overrides };
}

export function makeTopo(overrides: Partial<Topo> = {}): Topo {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: "topo-1",
    image: { backgroundUrl: "https://example.com/topo.jpg" },
    points: {},
    climbs: [],
    ...overrides,
  };
}

/** Builds a Topo where `points` is keyed by id, from a plain array — convenience for tests. */
export function withPoints(topo: Topo, points: TopoPoint[]): Topo {
  const byId = Object.fromEntries(points.map((p) => [p.id, p]));
  return { ...topo, points: { ...topo.points, ...byId } };
}
