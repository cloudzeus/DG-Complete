"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { openCredentials } from "@/lib/connections";
import { buildCubeEnv } from "@/lib/cube-compose";
import {
  CUBE_DEPLOYMENT_ID,
  generateCubeSecrets,
  getCubeDeployment,
  openCubeSecrets,
  sealCubeSecrets,
} from "@/lib/cube";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

const httpsUrl = (label: string) =>
  z
    .url({ message: `${label}: μη έγκυρο URL` })
    .refine((u) => /^https?:\/\//.test(u), `${label}: πρέπει να ξεκινά με https://`)
    .transform((u) => u.replace(/\/+$/, ""));

const schema = z.object({
  apiUrl: httpsUrl("Cube API"),
  devUrl: httpsUrl("Cube Playground").optional(),
  controlPlaneUrl: httpsUrl("URL εφαρμογής"),
  warehouseConnectionId: z.string().min(1, "Επιλέξτε τη βάση production"),
  devConnectionId: z.string().optional(),
});

type Field = keyof z.input<typeof schema>;

export type CubeFormState = { ok?: boolean; message?: string; errors?: Partial<Record<Field, string>> };

export async function saveCubeDeployment(_prev: CubeFormState, formData: FormData): Promise<CubeFormState> {
  const user = await requirePermission("platform.settings.manage");
  const parsed = schema.safeParse({
    apiUrl: formData.get("apiUrl"),
    devUrl: formData.get("devUrl") || undefined,
    controlPlaneUrl: formData.get("controlPlaneUrl"),
    warehouseConnectionId: formData.get("warehouseConnectionId") || "",
    devConnectionId: formData.get("devConnectionId") || undefined,
  });
  if (!parsed.success) {
    const errors: CubeFormState["errors"] = {};
    for (const issue of parsed.error.issues) errors[issue.path[0] as Field] ??= issue.message;
    return { errors };
  }
  const input = parsed.data;
  if (input.devConnectionId && !input.devUrl) return { errors: { devUrl: "Δώστε URL για το Playground" } };

  const ids = [input.warehouseConnectionId, input.devConnectionId].filter(Boolean) as string[];
  const conns = await prisma.dataConnection.findMany({ where: { id: { in: ids } } });
  const wh = conns.find((c) => c.id === input.warehouseConnectionId);
  if (!wh || wh.purpose !== "CUBE_WAREHOUSE" || wh.engine !== "POSTGRES") {
    return { errors: { warehouseConnectionId: "Απαιτείται σύνδεση «Βάση Cube» τύπου PostgreSQL" } };
  }
  if (input.devConnectionId) {
    const dev = conns.find((c) => c.id === input.devConnectionId);
    if (!dev || dev.purpose !== "CUBE_WAREHOUSE" || dev.engine !== "POSTGRES") {
      return { errors: { devConnectionId: "Απαιτείται σύνδεση «Βάση Cube» τύπου PostgreSQL" } };
    }
    if (dev.id === wh.id) return { errors: { devConnectionId: "Η βάση dev πρέπει να διαφέρει από την production" } };
  }

  const data = {
    apiUrl: input.apiUrl,
    devUrl: input.devConnectionId ? input.devUrl! : null,
    controlPlaneUrl: input.controlPlaneUrl,
    warehouseConnectionId: wh.id,
    devConnectionId: input.devConnectionId ?? null,
  };
  const existing = await prisma.cubeDeployment.findUnique({ where: { id: CUBE_DEPLOYMENT_ID }, select: { id: true } });
  await prisma.cubeDeployment.upsert({
    where: { id: CUBE_DEPLOYMENT_ID },
    update: data,
    create: { id: CUBE_DEPLOYMENT_ID, ...data, secretsEnc: sealCubeSecrets(generateCubeSecrets()) },
  });
  await audit({
    actorId: user.id,
    action: existing ? "cube.update" : "cube.create",
    entity: "CubeDeployment",
    entityId: CUBE_DEPLOYMENT_ID,
    meta: data,
  });
  revalidatePath("/admin/settings/cube");
  return { ok: true, message: existing ? "Οι ρυθμίσεις ενημερώθηκαν." : "Ο Cube server ρυθμίστηκε — τα secrets δημιουργήθηκαν." };
}

/** Returns the Coolify environment block (secrets). Every reveal is audited. */
export async function revealCubeEnv(): Promise<{ ok: true; env: string } | { ok: false; message: string }> {
  const user = await requirePermission("platform.settings.manage");
  const deployment = await getCubeDeployment();
  if (!deployment) return { ok: false, message: "Ο Cube server δεν έχει ρυθμιστεί." };
  const secrets = openCubeSecrets(deployment.secretsEnc);
  const devCreds = deployment.devConnection
    ? openCredentials(deployment.devConnection.id, deployment.devConnection.credentialsEnc)
    : null;
  await audit({ actorId: user.id, action: "cube.secrets.reveal", entity: "CubeDeployment", entityId: deployment.id });
  return {
    ok: true,
    env: buildCubeEnv({ ...secrets, devUser: devCreds?.username, devPassword: devCreds?.password }),
  };
}

/** Generates new shared secrets. Cube must be redeployed with the new env afterwards. */
export async function rotateCubeSecrets(): Promise<{ ok: boolean; message: string }> {
  const user = await requirePermission("platform.settings.manage");
  const deployment = await prisma.cubeDeployment.findUnique({ where: { id: CUBE_DEPLOYMENT_ID } });
  if (!deployment) return { ok: false, message: "Ο Cube server δεν έχει ρυθμιστεί." };
  await prisma.cubeDeployment.update({
    where: { id: CUBE_DEPLOYMENT_ID },
    data: { secretsEnc: sealCubeSecrets(generateCubeSecrets()) },
  });
  await audit({ actorId: user.id, action: "cube.secrets.rotate", entity: "CubeDeployment", entityId: deployment.id });
  revalidatePath("/admin/settings/cube");
  return { ok: true, message: "Νέα secrets δημιουργήθηκαν. Ενημερώστε τα env στο Coolify και κάντε redeploy." };
}
