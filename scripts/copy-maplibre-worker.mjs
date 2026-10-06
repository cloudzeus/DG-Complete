// Copies MapLibre's module worker (and the shared chunk it imports) to public/vendor/maplibre,
// so the map can load it with setWorkerUrl — bundlers can't resolve the worker's own URL.
// Run after upgrading maplibre-gl: npm run maplibre:worker (the copies are committed).
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const from = path.join(process.cwd(), "node_modules", "maplibre-gl", "dist");
const to = path.join(process.cwd(), "public", "vendor", "maplibre");
if (!existsSync(from)) process.exit(0);
mkdirSync(to, { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) copyFileSync(path.join(from, f), path.join(to, f));
console.log("maplibre worker → public/vendor/maplibre");
