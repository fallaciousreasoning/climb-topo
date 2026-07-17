import { defineConfig } from "vite";

// Deployed alongside the read-only viewer on the same origin, under /edit/ (see the root
// vercel-build script) -- base must match wherever the build actually gets served from, so
// asset URLs resolve correctly. Defaults to "/" for local dev and standalone builds.
export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
});
