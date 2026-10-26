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

# ── worker (docs/06, docs/10 §2): Playwright image with the same version as package.json ─────
# Coolify: a second application from this repo with Docker target `worker` (no domain).
FROM mcr.microsoft.com/playwright:v1.64.1-noble AS worker
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=pwuser:pwuser /app/node_modules ./node_modules
COPY --from=build --chown=pwuser:pwuser /app/package.json /app/tsconfig.json ./
COPY --from=build --chown=pwuser:pwuser /app/lib ./lib
COPY --from=build --chown=pwuser:pwuser /app/worker ./worker
USER pwuser
EXPOSE 9100
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:9100').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "--conditions=react-server", "--import", "tsx", "worker/index.ts"]

# ── runtime ───────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates curl && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
# Chromium for the embedded worker (ADR-025) — same Playwright version as package.json.
RUN npx -y playwright@1.64.1 install --with-deps chromium-headless-shell \
  && rm -rf /var/lib/apt/lists/* /root/.npm && chmod -R a+rX /ms-playwright

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
