import type { Climb } from "./climb.js";
import type { PointId, TopoPoint } from "./point.js";

export const CURRENT_SCHEMA_VERSION = 1;

export interface Topo {
  schemaVersion: number;
  id: string;
  image: {
    /** The photo to render as the background — passed straight through to the background
     *  <image> element's href, whatever it is (a URL, a data: URI, ...). Deliberately the
     *  only field here: pixel dimensions are never authored/stored, since a stale or
     *  hand-edited value would silently desync from the actual photo. Every consumer
     *  resolves them itself from the image's own naturalWidth/naturalHeight (see
     *  loadImageNaturalSize in @climb-topo/renderer) before rendering. */
    backgroundUrl: string;
  };
  /** Flat, normalized, shared-point store — the single source of truth for point positions. */
  points: Record<PointId, TopoPoint>;
  climbs: Climb[];
}
