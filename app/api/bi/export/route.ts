import { NextResponse } from "next/server";
import { z } from "zod";
import { cubeLoad } from "@/lib/cube-client";
import { buildWorkbook } from "@/lib/excel";
import { can, getCurrentUser } from "@/lib/rbac";

// Excel export for dashboards (and later the report builder). Either a Cube query, run for the
// tenant with the same short-lived tenant-scoped token as the dashboards, or rows the page
// already shows (e.g. the insights list). Max 50k rows.

const column = z.object({
  key: z.string().max(120),
  label: z.string().max(120),
  format: z.enum(["text", "eur", "int", "num", "pct", "date"]).optional(),
});
const body = z.object({
  tenantId: z.string().regex(/^[a-z0-9]{1,40}$/),
  title: z.string().max(150),
  subtitle: z.string().max(300).optional(),
  fileName: z.string().max(100).optional(),
  sheets: z
    .array(
      z.object({
        name: z.string().max(31),
        columns: z.array(column).min(1).max(60),
        query: z.record(z.string(), z.unknown()).optional(),
        rows: z.array(z.record(z.string(), z.unknown())).max(50_000).optional(),
      }),
    )
    .min(1)
    .max(10),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });
  const b = parsed.data;
  if (!can(user, "tenant.dashboards.view", b.tenantId)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const sheets = await Promise.all(
      b.sheets.map(async (s) => ({
        name: s.name,
        columns: s.columns,
        rows: s.query ? (await cubeLoad(b.tenantId, { ...(s.query as object), limit: Math.min(Number((s.query as { limit?: number }).limit ?? 50_000), 50_000) })) : (s.rows ?? []),
      })),
    );
    const file = await buildWorkbook(b.title, sheets, { subtitle: b.subtitle });
    const name = (b.fileName ?? b.title).replace(/[^\p{L}\p{N} _.-]/gu, "").trim().slice(0, 80) || "export";
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="export.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}.xlsx`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message.slice(0, 300) }, { status: 502 });
  }
}
