// Combines two independent Vite apps into one static output so they can be deployed to a
// single Vercel project on one origin: the read-only viewer at "/" and the editor at "/edit"
// (see the root README/vercel.json). Each app still builds completely independently -- this
// script only assembles their outputs afterward.
import { execSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(rootDir, "dist");

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

execSync("pnpm --filter @climb-topo/iframe-viewer build", { stdio: "inherit", cwd: rootDir });
cpSync(path.join(rootDir, "apps/iframe-viewer/dist"), outDir, { recursive: true });

execSync("pnpm --filter @climb-topo/editor build", {
  stdio: "inherit",
  cwd: rootDir,
  env: { ...process.env, VITE_BASE: "/edit/" },
});
cpSync(path.join(rootDir, "apps/editor/dist"), path.join(outDir, "edit"), { recursive: true });
