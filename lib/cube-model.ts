import "server-only";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

// The Cube data model lives in this repo (cube/model/*.yml) and is served to the Cube server
// through /api/internal/cube/model (repositoryFactory in cube.js). Deploying the app deploys the
// model; Cube recompiles when the version hash changes. Files matching `exclude` (globs, from
// Ρυθμίσεις → Cube) are held back — for staged roll-outs and instant rollback without a deploy.

const MODEL_DIR = path.join(process.cwd(), "cube", "model");

export type CubeModelFile = { fileName: string; content: string };

const globToRegExp = (g: string) => new RegExp(`^${g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`);

export async function listCubeModelFiles() {
  return (await readdir(MODEL_DIR)).filter((n) => /\.(ya?ml|js)$/.test(n)).sort();
}

export async function readCubeModel(exclude: string[] = []): Promise<{ version: string; files: CubeModelFile[]; excluded: string[] }> {
  const patterns = exclude.map(globToRegExp);
  const all = await listCubeModelFiles();
  const names = all.filter((n) => !patterns.some((re) => re.test(n) || re.test(n.replace(/\.(ya?ml|js)$/, ""))));
  const files = await Promise.all(
    names.map(async (fileName) => ({ fileName, content: await readFile(path.join(MODEL_DIR, fileName), "utf8") })),
  );
  const h = createHash("sha256");
  for (const f of files) h.update(f.fileName).update("\0").update(f.content).update("\0");
  return { version: h.digest("hex").slice(0, 16), files, excluded: all.filter((n) => !names.includes(n)) };
}
