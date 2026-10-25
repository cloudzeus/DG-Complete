import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";

// Secrets shared between this app and the Cube server. Stored encrypted in cube_deployment,
// handed to Coolify as environment variables (never embedded in the compose YAML).
export type CubeSecrets = {
  apiSecret: string; // CUBEJS_API_SECRET — signs tenant JWTs (HS256)
  roleSecret: string; // WH_ROLE_SECRET — derives passwords of warehouse roles r_<tenantId>
  internalToken: string; // CONTROL_PLANE_TOKEN — Cube → app (/api/internal/cube/*)
  playgroundSecret: string; // CUBEJS_PLAYGROUND_AUTH_SECRET — dev Playground login
  devApiSecret: string; // CUBEJS_API_SECRET of the dev instance
};

export const CUBE_DEPLOYMENT_ID = "default";
export const JWT_ISSUER = "dgsmartbi";

const AAD = "cube_deployment:secrets";

export function generateCubeSecrets(): CubeSecrets {
  const s = () => randomBytes(32).toString("hex");
  return { apiSecret: s(), roleSecret: s(), internalToken: s(), playgroundSecret: s(), devApiSecret: s() };
}

export function sealCubeSecrets(secrets: CubeSecrets) {
  return encryptJson(secrets, AAD);
}

export function openCubeSecrets(envelope: string) {
  return decryptJson<CubeSecrets>(envelope, AAD);
}

export async function getCubeDeployment() {
  return prisma.cubeDeployment.findUnique({
    where: { id: CUBE_DEPLOYMENT_ID },
    include: { warehouseConnection: true, devConnection: true },
  });
}

export async function getCubeSecrets(): Promise<CubeSecrets | null> {
  const row = await prisma.cubeDeployment.findUnique({
    where: { id: CUBE_DEPLOYMENT_ID },
    select: { secretsEnc: true },
  });
  return row ? openCubeSecrets(row.secretsEnc) : null;
}

/** JWT audience = Cube API hostname (matches CUBEJS_JWT_AUDIENCE in the generated compose). */
export function jwtAudience(apiUrl: string) {
  return new URL(apiUrl).hostname;
}

/** Password of warehouse role r_<tenantId>; Cube computes the same value from WH_ROLE_SECRET. */
export function tenantRolePassword(roleSecret: string, tenantId: string) {
  return createHmac("sha256", roleSecret).update(tenantId).digest("hex");
}

const b64url = (v: string | Buffer) => Buffer.from(v).toString("base64url");

/** Short-lived HS256 token that scopes a Cube request to one tenant. */
export function signCubeToken(
  secrets: Pick<CubeSecrets, "apiSecret">,
  apiUrl: string,
  claims: { tenantId: string; modules?: string[] | null },
  ttlSeconds = 60,
) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      tenantId: claims.tenantId,
      ...(claims.modules ? { modules: claims.modules } : {}),
      iss: JWT_ISSUER,
      aud: jwtAudience(apiUrl),
      iat: now,
      exp: now + ttlSeconds,
    }),
  );
  const signature = createHmac("sha256", secrets.apiSecret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

/** Constant-time check of the bearer token Cube sends to /api/internal/cube/*. */
export async function verifyInternalToken(authorization: string | null): Promise<boolean> {
  const secrets = await getCubeSecrets();
  if (!secrets || !authorization?.startsWith("Bearer ")) return false;
  const given = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(secrets.internalToken);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export type CubeMetaCheck = { ok: true; cubes: string[]; latencyMs: number } | { ok: false; error: string };

/** Calls the deployed Cube API as `tenantId` (/meta) — end-to-end check of JWT + driverFactory. */
export async function checkCubeForTenant(tenantId: string): Promise<CubeMetaCheck> {
  const deployment = await getCubeDeployment();
  if (!deployment) return { ok: false, error: "Ο Cube server δεν έχει ρυθμιστεί." };
  const token = signCubeToken(openCubeSecrets(deployment.secretsEnc), deployment.apiUrl, { tenantId });
  const started = Date.now();
  try {
    const res = await fetch(`${deployment.apiUrl}/cubejs-api/v1/meta`, {
      headers: { Authorization: token },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    const body = await res.text();
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 300)}` };
    const meta = JSON.parse(body) as { cubes?: { name: string }[] };
    return { ok: true, cubes: (meta.cubes ?? []).map((c) => c.name), latencyMs: Date.now() - started };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
