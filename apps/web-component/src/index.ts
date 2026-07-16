export * from "./ClimbTopoViewerElement.js";

import { defineClimbTopoViewer } from "./ClimbTopoViewerElement.js";

// Auto-register on import, so a plain `<script type="module" src=".../climb-topo-viewer.es.js">`
// tag is enough to use `<climb-topo-viewer>` — no separate init call required.
defineClimbTopoViewer();
