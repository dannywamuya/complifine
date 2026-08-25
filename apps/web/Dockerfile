# syntax=docker/dockerfile:1
# Build context MUST be the git repo root (see apps/api/Dockerfile).
#
#   docker build -f apps/web/Dockerfile .
#
# Railway: Root Directory empty, Dockerfile path apps/web/Dockerfile.
# Set runtime API_PROXY_TARGET to the private API URL (not a build arg).

FROM oven/bun:1.2.0 AS builder
WORKDIR /app

COPY package.json bun.lock bunfig.toml tsconfig.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps

ARG NEXT_PUBLIC_API_URL=/api
ARG NEXT_PUBLIC_CAL_URL=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_CAL_URL=$NEXT_PUBLIC_CAL_URL
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN bun install --frozen-lockfile \
  && bun --filter @complifine/web build

FROM oven/bun:1.2.0
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_PUBLIC_API_URL=/api

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000
CMD ["bun", "apps/web/server.js"]
