import { resolve } from "node:path";
import { defineConfig } from "vite";

// Dev serves the demo page; build produces the distributable library (ES + UMD).
export default defineConfig(({ command }) => {
  if (command === "serve") {
    return { root: "demo" };
  }

  return {
    build: {
      lib: {
        entry: resolve(__dirname, "src/index.ts"),
        name: "ClimbTopoViewer",
        formats: ["es", "umd"],
        fileName: (format) => `climb-topo-viewer.${format}.js`,
      },
    },
  };
});
