"use client";

import { JobsTable, type JobRow } from "@/app/admin/settings/sync/jobs-table";
import { SeedButton } from "@/app/admin/settings/sync/seed-button";

type SeedResult =
  | { ok: true; report: { name: string; status: "created" | "exists" | "failed" | "skipped"; note?: string }[] }
  | { ok: false; message: string };

/** The tenant's SoftOne → warehouse imports (same job engine and scheduler as DGsoft syncs). */
export function ImportsPanel({
  tenantId,
  jobs,
  seed,
  canManage,
}: {
  tenantId: string;
  jobs: JobRow[];
  seed: (() => Promise<SeedResult>) | null;
  canManage: boolean;
}) {
  return (
    <JobsTable
      data={jobs}
      connected={canManage}
      canCreate={false}
      storageKey="tenant-imports"
      dataHref={(id) => `/admin/tenants/${tenantId}/data/${id}`}
      toolbar={
        seed ? (
          <SeedButton action={seed} label="Δημιουργία εισαγωγών" title="Εισαγωγές από το SoftOne του πελάτη" disabled={!canManage} />
        ) : null
      }
    />
  );
}
