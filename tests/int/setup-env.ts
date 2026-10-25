import { inject } from "vitest";

// lib/prisma reads DATABASE_URL when first imported: point it at the app role (RLS applies).
process.env.DATABASE_URL = inject("appUrl");
process.env.TEST_MIGRATOR_URL = inject("migratorUrl");
