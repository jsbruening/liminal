# Multi-stage build. Deliberately not using Next's "standalone" output mode —
# this app uses a custom server.js (required for Socket.IO), and combining
# that with standalone output's self-contained server.js is fragile. Trades
# a larger image for a much simpler, more reliable build.

FROM node:20-bookworm-slim AS base
WORKDIR /app
# Without this, Prisma can't detect the installed OpenSSL version on this
# slim image and silently picks the wrong query engine binary (warns but
# doesn't fail the build — surfaces as a runtime crash instead).
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json ./
# --ignore-scripts: postinstall runs `prisma generate`, which needs
# prisma/schema.prisma — not copied in until the builder stage below.
RUN npm ci --ignore-scripts

# Full source + devDependencies. Also used directly (via `docker build
# --target builder`) for one-off tasks that need devDependencies at runtime,
# e.g. seeding the first admin with `npx tsx prisma/seed.ts`.
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# No real secrets exist yet at build time — only used for Zod env validation
# during `next build`, never for an actual connection.
ENV SKIP_ENV_VALIDATION=1
RUN npx prisma generate
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
# --ignore-scripts: skip postinstall's `prisma generate` — the already-built
# client is copied in below instead, and prisma/ isn't present yet anyway.
RUN npm ci --omit=dev --ignore-scripts
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/generated ./generated
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/next.config.js ./next.config.js
COPY --from=builder /app/src/env.js ./src/env.js
COPY --from=builder /app/server.js ./server.js

EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
