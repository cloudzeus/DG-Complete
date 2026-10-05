#!/usr/bin/env node
// Fluid typography token generator (rem + clamp, adapts continuously to the viewport).
// Scans the codebase for --fs-<n> usages, adds the DG type ramp, and prints the :root token block.
// Rules: ≤15px → +1px on phones · 16–20px unchanged · ≥22px → ×0.78 on phones.
// Linear ramp from a 360px phone to a 1280px desktop. Usage: npm run fluid-type
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const PHONE = 360;
const DESKTOP = 1280;
const DG_RAMP = [11, 12, 13, 14, 16, 18, 20, 24, 32, 40, 56];
const SCAN_DIRS = ["app", "components", "lib"];
const SKIP = new Set(["node_modules", ".next", "generated"]);

function phoneSize(d) {
  if (d <= 15) return d + 1;
  if (d <= 20) return d;
  return Math.round(d * 0.78 * 100) / 100;
}

const r = (n) => Math.round(n * 10000) / 10000;

function token(d) {
  const m = phoneSize(d);
  const name = `--fs-${String(d).replace(".", "-")}`;
  if (m === d) return `  ${name}: ${r(d / 16)}rem;`;
  const slope = (d - m) / (DESKTOP - PHONE);
  const intercept = m - slope * PHONE;
  const sign = slope >= 0 ? "+" : "-";
  const lo = Math.min(m, d) / 16;
  const hi = Math.max(m, d) / 16;
  return `  ${name}: clamp(${r(lo)}rem, ${r(intercept / 16)}rem ${sign} ${r(Math.abs(slope) * 100)}vw, ${r(hi)}rem);`;
}

function walk(dir, out) {
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const e of entries) {
    if (SKIP.has(e)) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|css|mdx?)$/.test(e)) {
      for (const m of readFileSync(p, "utf8").matchAll(/--fs-(\d+(?:-5)?)/g)) {
        out.add(Number(m[1].replace("-", ".")));
      }
    }
  }
}

const sizes = new Set(DG_RAMP);
for (const d of SCAN_DIRS) walk(d, sizes);

console.log(":root {");
for (const d of [...sizes].sort((a, b) => a - b)) console.log(token(d));
console.log("}");
