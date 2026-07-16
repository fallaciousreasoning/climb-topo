import type { Grade } from "./grade.js";
import type { PointId } from "./point.js";

export type RouteType = "sport" | "trad" | "mixed" | "boulder" | "aid";

export interface Climb {
  id: string;
  name: string;
  /** Optional — many climbs may be ungraded. */
  grade?: Grade;
  /** Included/shown on this topo, independent of whether pointIds is populated. */
  visible: boolean;
  /** Ordered path — references into Topo.points, not embedded coordinates. */
  pointIds: PointId[];
  /** Short label (2-4 chars) for compact topo-image annotations, e.g. "ES" for a climb
   *  named "Endless Summer". */
  reference?: string;
  routeType?: RouteType;
  /** Opened (in a new tab) when the climb is clicked in a read-only viewer -- e.g. a link to
   *  the climb's page on a route database. Not used by the editor, where clicking a climb
   *  means something else entirely (switch the active climb being drawn). */
  link?: string;
}
