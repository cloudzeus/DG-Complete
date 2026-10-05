import "server-only";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

// The Cube data model lives in this repo (cube/model/*.yml) and is served to the Cube server
// through /api/internal/cube/model (repositoryFactory in cube.js). Deploying the app deploys the
// model; Cube recompiles when the version hash changes.

const MODEL_DIR = path.join(process.cwd(), "cube", "model");

export type CubeModelFile = { fileName: string; content: string };

export async function readCubeModel(): Promise<{ version: string; files: CubeModelFile[] }> {
  const names = (await readdir(MODEL_DIR)).filter((n) => /\.(ya?ml|js)$/.test(n)).sort();
  const files = await Promise.all(
    names.map(async (fileName) => ({ fileName, content: await readFile(path.join(MODEL_DIR, fileName), "utf8") })),
  );
  const h = createHash("sha256");
  for (const f of files) h.update(f.fileName).update("\0").update(f.content).update("\0");
  return { version: h.digest("hex").slice(0, 16), files };
}
