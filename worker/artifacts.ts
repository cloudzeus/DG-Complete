// Error artifacts (docs/06 §3, docs/08 §2): screenshots (sensitive fields masked), redacted DOM and
// console log → lib/storage (never a public URL) + RunArtifact rows.
import { randomUUID } from "node:crypto";
import type { Locator, Page } from "playwright";
import type { ArtifactKind } from "@/lib/generated/prisma/enums";
import { getStorage } from "@/lib/storage";
import { withTenantTx } from "@/lib/tenant-db";

export type ArtifactCtx = { tenantId: string; runId: string; retentionDays: number };

const EXT: Record<string, string> = { "image/png": "png", "text/html": "html", "application/json": "json", "application/zip": "zip" };

export async function saveArtifact(ctx: ArtifactCtx, kind: ArtifactKind, body: Buffer, contentType: string, extra: { runStepId?: string | null; meta?: Record<string, unknown>; width?: number; height?: number } = {}) {
  const id = randomUUID().replaceAll("-", "");
  const now = new Date();
  const path = `tenants/${ctx.tenantId}/runs/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${ctx.runId}/${id}.${EXT[contentType] ?? "bin"}`;
  const storage = await getStorage();
  const { sizeBytes, sha256 } = await storage.put(path, body, contentType);
  await withTenantTx(ctx.tenantId, (tx) =>
    tx.runArtifact.create({
      data: {
        id,
        tenantId: ctx.tenantId,
        runId: ctx.runId,
        runStepId: extra.runStepId ?? null,
        kind,
        storagePath: path,
        contentType,
        sizeBytes,
        sha256,
        width: extra.width,
        height: extra.height,
        meta: (extra.meta ?? undefined) as never,
        expiresAt: new Date(now.getTime() + ctx.retentionDays * 86_400_000),
      },
    }),
  );
  return id;
}

/** HTML with every input/textarea value and password attribute removed. */
export function redactDom(html: string) {
  return html
    .replace(/(<input\b[^>]*\bvalue=)("[^"]*"|'[^']*')/gi, '$1"••••"')
    .replace(/(<textarea\b[^>]*>)[\s\S]*?(<\/textarea>)/gi, "$1••••$2")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "<script>/* removed */</script>");
}

export async function collectOnError(ctx: ArtifactCtx, page: Page, opts: { runStepId?: string | null; element?: Locator; sensitive: Locator[]; console: string[] }) {
  const mask = opts.sensitive;
  const viewport = page.viewportSize() ?? undefined;
  const shots: [ArtifactKind, () => Promise<Buffer>][] = [
    ["SCREENSHOT_FULL", () => page.screenshot({ fullPage: true, mask, timeout: 10_000 })],
    ["SCREENSHOT_VIEWPORT", () => page.screenshot({ mask, timeout: 10_000 })],
  ];
  if (opts.element) {
    const el = opts.element;
    shots.push([
      "SCREENSHOT_ELEMENT",
      async () => {
        await el.evaluate((n: Element) => ((n as HTMLElement).style.outline = "3px solid #E31E2A")).catch(() => undefined);
        return el.screenshot({ mask, timeout: 5_000 });
      },
    ]);
  }
  for (const [kind, take] of shots) {
    const buf = await take().catch(() => null);
    if (buf) await saveArtifact(ctx, kind, buf, "image/png", { runStepId: opts.runStepId, width: kind === "SCREENSHOT_VIEWPORT" ? viewport?.width : undefined, height: kind === "SCREENSHOT_VIEWPORT" ? viewport?.height : undefined });
  }
  const html = await page.content().catch(() => null);
  if (html) await saveArtifact(ctx, "DOM_SNAPSHOT", Buffer.from(redactDom(html)), "text/html", { runStepId: opts.runStepId, meta: { url: page.url() } });
  if (opts.console.length) await saveArtifact(ctx, "CONSOLE_LOG", Buffer.from(JSON.stringify(opts.console.slice(-500))), "application/json", { runStepId: opts.runStepId });
}
