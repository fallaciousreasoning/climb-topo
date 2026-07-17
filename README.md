# climb-topo-editor

An editor for drawing guidebook-style climb topos (route lines) on top of a crag photo, plus two
read-only ways to embed the result on another site: a web component and an iframe.

Points are stored in a normalized, shared registry keyed by id rather than embedded per-climb
coordinates, so link-ups (climbs sharing part of another climb's line) share the same point
identity — moving a shared point moves it for every climb that uses it, and drawing a link-up is
just reusing an existing point id instead of creating a new one.

## Layout

pnpm workspace:

- `packages/core` — data model (`Topo`/`Climb`/`TopoPoint`/`Grade`), command stack (undo/redo),
  shared-point queries, iframe postMessage protocol types.
- `packages/renderer` — SVG rendering shared by the editor, web component, and iframe viewer:
  bezier-smoothed climb lines, grade-based coloring, pan/zoom, pluggable point-type rendering.
- `packages/iframe-client` — parent-side helper (`TopoIframeController`) for hosts embedding the
  iframe viewer.
- `apps/editor` — the standalone drawing/editing app.
- `apps/web-component` — `<climb-topo-viewer>`, a read-only custom element.
- `apps/iframe-viewer` — the read-only page served inside a third-party `<iframe>`.

## Development

```sh
pnpm install
pnpm dev:editor          # editor app
pnpm dev:iframe-viewer    # iframe viewer app (also serves apps/web-component's demo separately
                          # via `pnpm --filter @climb-topo/web-component dev`)
pnpm test                # vitest, all packages
pnpm typecheck           # tsc --noEmit, all packages
```

## Embedding a topo

Both embed options are read-only viewers: they render a `Topo` document and report
hover/click back out, but never mutate it. Neither ships a way to fetch data on its own behalf
from a database — you provide the `Topo` JSON (see `packages/core/src/model/topo.ts`) via
whichever loading mechanism fits your embedding mode.

### Web component (`<climb-topo-viewer>`)

Same-origin embeds, or anywhere you can load a `<script type="module">`.

```html
<script type="module" src="/path/to/climb-topo-viewer.es.js"></script>
<climb-topo-viewer src="/topos/my-crag.json"></climb-topo-viewer>
```

```js
const viewer = document.querySelector("climb-topo-viewer");

viewer.addEventListener("climb-hover", (e) => {
  console.log("hovering:", e.detail.climbId); // string | null
});
viewer.addEventListener("climb-click", (e) => {
  console.log("clicked:", e.detail.climbId); // string
  viewer.highlightedClimbId = e.detail.climbId; // reflects back as a visual highlight
});
```

Both events bubble and are `composed: true`, so they cross the shadow DOM boundary and can be
listened for on an ancestor instead of the element itself. If the clicked climb has a `link` set,
the component also opens it in a new tab as a side effect of `climb-click`.

| Attribute/property | Type | Notes |
|---|---|---|
| `src` (attr) | `string` | URL to fetch a `Topo` JSON document from. |
| `data` (prop only) | `Topo \| null` | Set the document directly instead of fetching it. |
| `highlighted-climb-id` / `highlightedClimbId` | `string \| null` | Reflected attribute/property; highlights one climb. |

| Event | `detail` | Fires when |
|---|---|---|
| `climb-hover` | `{ climbId: string \| null }` | The pointer moves onto/off of a climb's line or its reference label. `null` on leave. |
| `climb-click` | `{ climbId: string }` | A climb's line or reference label is clicked. |

### Iframe viewer

For hosts that can't load a custom element (CSP, sandboxing, a CMS that only allows `<iframe>`).
The served page supports two independent ways to get data in:

**Static, no host JS required** — pass the data via the URL:

```
https://your-deployment/?src=https://example.com/topos/my-crag.json
https://your-deployment/?json=%7B%22schemaVersion%22%3A1%2C...%7D   (URL-encoded Topo JSON inline)
```

`json` takes priority over `src` if both are present. `json` avoids a second network request but
only makes sense for small documents — it's the whole JSON document, URL-encoded, inline in the
URL. Both also clamp the page to whatever height it's given (shrinking width to fit) rather than
overflowing, matching this being the whole page rather than a dynamically-sized widget.

**Dynamic, host-driven** — via `postMessage`, using the parent-side `TopoIframeController` from
`@climb-topo/iframe-client` (or the raw protocol below, if you're not in a JS environment that can
depend on it):

```js
import { TopoIframeController } from "@climb-topo/iframe-client";

const controller = new TopoIframeController({ iframe: document.querySelector("#topo-frame") });

controller.addEventListener("climb-hover", (e) => console.log(e.detail.climbId));
controller.addEventListener("climb-click", (e) => controller.setHighlightedClimb(e.detail.climbId));
controller.addEventListener("resize", (e) => console.log(e.detail.height)); // iframe's content height, for auto-sizing

controller.setTopo(myTopoDocument); // safe to call before the iframe has loaded -- queued until it's ready
controller.setHighlightedClimb(null);
```

`TopoIframeController` extends `EventTarget` and dispatches the same `climb-hover`/`climb-click`
event shapes as the web component, so host code can target either embedding mode through one
interface. Messages sent before the iframe announces itself ready are queued and flushed
automatically — no manual handshake needed. Like the web component, clicking a climb with a
`link` set also opens it in a new tab, independent of the `climb-click` message.

Raw protocol (`packages/core/src/iframe-protocol.ts`), if writing your own parent-side glue:

| Direction | `type` | `payload` | Notes |
|---|---|---|---|
| parent → iframe | `init` / `set-topo` | `Topo` | Both do the same thing (mount/replace the document); `init` is accepted for semantic clarity on first load. |
| parent → iframe | `set-highlighted-climb` | `{ climbId: string \| null }` | |
| iframe → parent | `ready` | — | Announced once on load (and re-announced a few times briefly after, to cover a host listener attached after the message already fired). Anything sent before this is queued by `TopoIframeController`. |
| iframe → parent | `climb-hover` | `{ climbId: string \| null }` | |
| iframe → parent | `climb-click` | `{ climbId: string }` | |
| iframe → parent | `resize` | `{ height: number }` | The document's rendered height, for a host that wants to auto-size the `<iframe>` element itself. |

Every message carries `source: "climb-topo-viewer"` so handlers can ignore unrelated
`postMessage` traffic on the page.
