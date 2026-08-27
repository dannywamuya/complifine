# syntax=docker/dockerfile:1
# Build context MUST be the git repo root (see apps/api/Dockerfile).
#
#   docker build -f apps/console/Dockerfile .
#
# Railway: Root Directory empty, Dockerfile path apps/console/Dockerfile.
# Set runtime API_PROXY_TARGET to the private API URL (not a build arg).

FROM oven/bun:1.2.0 AS builder
WORKDIR /app

COPY package.json bun.lock bunfig.toml tsconfig.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps

ARG NEXT_PUBLIC_API_URL=/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN bun install --frozen-lockfile \
  && bun --filter @complifine/console build

FROM oven/bun:1.2.0
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
ENV HOSTNAME=0.0.0.0
ENV NEXT_PUBLIC_API_URL=/api

COPY --from=builder /app/apps/console/.next/standalone ./
COPY --from=builder /app/apps/console/.next/static ./apps/console/.next/static
COPY --from=builder /app/apps/console/public ./apps/console/public

EXPOSE 3001
CMD ["bun", "apps/console/server.js"]
