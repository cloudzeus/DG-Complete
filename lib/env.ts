import { z } from "zod";

// Environment of web and worker (docs/10 §3). Both refuse to start when something is missing:
// the web from instrumentation.ts, the worker from worker/index.ts.

const url = z.url();
const optional = z
  .string()
  .trim()
  .optional()
  .transform((v) => v || undefined);
const int = (def: number) => z.coerce.number().int().positive().default(def);

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: url,
    DATABASE_URL_MIGRATOR: url.optional(),
    DB_POOL_MAX: int(10),
    QUEUE_DATABASE_URL: url,
    QUEUE_POOL_MAX: int(4),
    WORKER_CONCURRENCY: int(8),
    WORKER_ASSIST_URL: optional,
    ASSIST_SHARED_SECRET: optional,

    BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET: τουλάχιστον 32 χαρακτήρες"),
    BETTER_AUTH_URL: url,
    MICROSOFT_CLIENT_ID: optional,
    MICROSOFT_CLIENT_SECRET: optional,
    MICROSOFT_TENANT_ID: z.string().default("common"),
    DATA_ENCRYPTION_KEYS: z.string().regex(/^[A-Za-z0-9_-]+:[A-Za-z0-9+/=]{43,44}(,[A-Za-z0-9_-]+:[A-Za-z0-9+/=]{43,44})*$/, "DATA_ENCRYPTION_KEYS: k1:<base64 32 bytes>[,k2:…]"),
    CRON_SECRET: optional,
    SCHEDULER: optional,

    STORAGE_DRIVER: z.enum(["bunny", "local"]).default("local"),
    BUNNY_STORAGE_ZONE: optional,
    BUNNY_STORAGE_REGION: optional,
    BUNNY_STORAGE_ACCESS_KEY: optional,
    BUNNY_PULLZONE_HOST: optional,
    BUNNY_TOKEN_KEY: optional,

    API_KEY_PEPPER: optional,
    RECORDER_JWT_SECRET: optional,
  })
  .superRefine((env, ctx) => {
    if (env.STORAGE_DRIVER === "bunny") {
      for (const key of ["BUNNY_STORAGE_ZONE", "BUNNY_STORAGE_ACCESS_KEY", "BUNNY_PULLZONE_HOST", "BUNNY_TOKEN_KEY"] as const) {
        if (!env[key]) ctx.addIssue({ code: "custom", path: [key], message: `${key}: απαιτείται με STORAGE_DRIVER=bunny` });
      }
    }
    if (env.NODE_ENV === "production" && !env.CRON_SECRET) {
      ctx.addIssue({ code: "custom", path: ["CRON_SECRET"], message: "CRON_SECRET: απαιτείται στην παραγωγή" });
    }
  });

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Validated environment; throws a readable error (names only, never values) when invalid. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "(env)"}: ${i.message}`);
    throw new Error(`Μη έγκυρες μεταβλητές περιβάλλοντος:\n${lines.join("\n")}`);
  }
  cached = parsed.data;
  return cached;
}
