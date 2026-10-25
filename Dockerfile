# DG Complete — production image for Coolify (Next.js standalone + Prisma migrations on start).
# Runtime env: see .env.example (DATABASE_URL via PgBouncer, DATABASE_URL_MIGRATOR direct 5432, …)

ARG NODE_VERSION=24-bookworm-slim

# ── deps ──────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
# postinstall runs `prisma generate`; it only needs the schema, not a database.
RUN npm ci

# ── build ─────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build-time placeholders only (pages are dynamic; nothing connects during the build).
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    BETTER_AUTH_SECRET="build-only-placeholder-not-used-at-runtime" \
    DATA_ENCRYPTION_KEYS="k1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" \
    npx prisma generate && npm run build

# ── migrate toolchain (prisma CLI + config + migrations) ─────────────
FROM node:${NODE_VERSION} AS migrator
WORKDIR /migrate
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm init -y >/dev/null && npm install --omit=dev --no-audit --no-fund prisma@7.10.0 dotenv@18
COPY prisma ./prisma
COPY prisma.config.ts ./

# ── runtime ───────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates curl && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=migrator --chown=nextjs:nodejs /migrate /migrate
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=5 \
  CMD curl -fs http://127.0.0.1:3000/api/health || exit 1

# Apply pending migrations, then start the server.
CMD ["sh", "-c", "cd /migrate && npx prisma migrate deploy && cd /app && exec node server.js"]
