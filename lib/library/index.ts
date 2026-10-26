import "server-only";
import { createHash } from "node:crypto";
import { ensureMethodForVersion } from "@/lib/methods";
import { prisma } from "@/lib/prisma";
import { tenantDb } from "@/lib/tenant-db";

// Platform library (docs/27): the super admin builds target systems and flows in a library tenant and
// shares them with customers. Sharing copies the system (without credentials) and the published
// version of every flow into the customer as PUBLISHED versions, then creates their API methods.
// Sharing again adds new flows and a new version for flows that changed in the library.

const LIBRARY_NAME = "Βιβλιοθήκη πλατφόρμας";

export async function libraryTenant() {
  return (
    (await prisma.tenant.findFirst({ where: { isLibrary: true }, select: { id: true, name: true } })) ??
    (await prisma.tenant.create({ data: { name: LIBRARY_NAME, status: "ACTIVE", isDemo: true, isLibrary: true }, select: { id: true, name: true } }))
  );
}

/** The customers a library system is shared with (copies by sourceTargetId). */
export async function sharedWith(libraryTargetId: string) {
  const copies = await prisma.targetSystem.findMany({ where: { sourceTargetId: libraryTargetId }, select: { tenantId: true } });
  return new Set(copies.map((c) => c.tenantId));
}

export type ShareReport = { tenantId: string; tenantName: string; created: boolean; flowsAdded: number; flowsUpdated: number; methods: string[] };

export async function shareTarget(libraryTenantId: string, libraryTargetId: string, tenantIds: string[], actorId: string): Promise<ShareReport[]> {
  const lib = tenantDb(libraryTenantId);
  const src = await lib.targetSystem.findUniqueOrThrow({ where: { id: libraryTargetId } });
  const flows = await lib.workflow.findMany({
    where: { targetSystemId: src.id, archivedAt: null, publishedVersionId: { not: null } },
    include: { versions: true },
  });
  const loginSource = src.loginWorkflowId;
  const reports: ShareReport[] = [];

  for (const tenantId of tenantIds) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, isLibrary: true } });
    if (!tenant || tenant.isLibrary) continue;
    const db = tenantDb(tenantId);
    let target = await db.targetSystem.findFirst({ where: { sourceTargetId: src.id } });
    const created = !target;
    if (!target) {
      let slug = src.slug;
      for (let n = 2; await db.targetSystem.findFirst({ where: { slug } }); n++) slug = `${src.slug}-${n}`;
      target = await db.targetSystem.create({
        data: {
          name: src.name,
          slug,
          baseUrl: src.baseUrl,
          allowedOrigins: src.allowedOrigins,
          description: src.description,
          sessionTtlSec: src.sessionTtlSec,
          maxConcurrency: src.maxConcurrency,
          minDelayMs: src.minDelayMs,
          errorDetectors: src.errorDetectors as never,
          browserOptions: src.browserOptions as never,
          sourceTargetId: src.id,
        } as never,
      });
    } else {
      // Keep the copy's technical settings in step with the library (not its credentials).
      await db.targetSystem.updateMany({ where: { id: target.id }, data: { baseUrl: src.baseUrl, allowedOrigins: src.allowedOrigins, errorDetectors: src.errorDetectors as never } });
    }

    const report: ShareReport = { tenantId, tenantName: tenant.name, created, flowsAdded: 0, flowsUpdated: 0, methods: [] };
    const workflowIdMap = new Map<string, string>();
    for (const f of flows) {
      const pub = f.versions.find((v) => v.id === f.publishedVersionId)!;
      let wf = await db.workflow.findFirst({ where: { sourceWorkflowId: f.id }, include: { versions: { orderBy: { versionNo: "desc" }, take: 1 } } });
      if (wf?.versions[0]?.sourceVersionId === pub.id) {
        workflowIdMap.set(f.id, wf.id);
        continue; // already up to date
      }
      if (!wf) {
        let slug = f.slug;
        for (let n = 2; await db.workflow.findFirst({ where: { slug } }); n++) slug = `${f.slug}-${n}`;
        wf = await db.workflow.create({
          data: { name: f.name, slug, description: f.description, tags: [...new Set([...f.tags, "βιβλιοθήκη"])], intent: f.intent, resourceSlug: f.resourceSlug, isLoginFlow: f.isLoginFlow, targetSystemId: target.id, createdById: actorId, sourceWorkflowId: f.id } as never,
          include: { versions: { orderBy: { versionNo: "desc" }, take: 1 } },
        });
        report.flowsAdded++;
      } else report.flowsUpdated++;
      const versionNo = (wf.versions[0]?.versionNo ?? 0) + 1;
      // Older published copies become DEPRECATED; the shared one is published as tested in the library.
      await db.workflowVersion.updateMany({ where: { workflowId: wf.id, status: "PUBLISHED" }, data: { status: "DEPRECATED" } });
      const v = await db.workflowVersion.create({
        data: {
          workflowId: wf.id,
          versionNo,
          status: "PUBLISHED",
          definition: pub.definition as never,
          inputSchema: pub.inputSchema as never,
          outputSchema: pub.outputSchema as never,
          checksum: createHash("sha256").update(JSON.stringify(pub.definition)).digest("hex"),
          dslVersion: pub.dslVersion,
          changelog: `Από τη βιβλιοθήκη (v${pub.versionNo})${pub.changelog ? ` — ${pub.changelog}` : ""}`,
          createdById: actorId,
          approvedById: actorId,
          approvedAt: new Date(),
          publishedAt: new Date(),
          sourceVersionId: pub.id,
        } as never,
      });
      await db.workflow.updateMany({ where: { id: wf.id }, data: { latestVersionNo: versionNo, publishedVersionId: v.id } });
      workflowIdMap.set(f.id, wf.id);
      if (!f.isLoginFlow) {
        const m = await ensureMethodForVersion(tenantId, v.id);
        const method = await db.method.findUnique({ where: { id: m.methodId }, select: { httpMethod: true, resource: true, slug: true, collection: { select: { slug: true } } } });
        if (method) report.methods.push(`${method.httpMethod} /api/v1/${method.collection.slug}/${method.resource ?? method.slug}`);
      }
    }
    // The library's login flow → the copy's login flow.
    if (loginSource && workflowIdMap.has(loginSource)) await db.targetSystem.updateMany({ where: { id: target.id }, data: { loginWorkflowId: workflowIdMap.get(loginSource) } });
    reports.push(report);
  }
  return reports;
}

/** Customers to choose from in «Κοινοποίηση σε πελάτες», with the ones that already have it. */
export async function shareCandidates(libraryTargetId: string) {
  const [tenants, shared] = await Promise.all([
    prisma.tenant.findMany({ where: { isLibrary: false, status: { in: ["ACTIVE", "PENDING"] } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    sharedWith(libraryTargetId),
  ]);
  return tenants.map((t) => ({ ...t, shared: shared.has(t.id) }));
}
