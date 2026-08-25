# syntax=docker/dockerfile:1
# Build from the workspace root (complifine/), not this folder:
#   docker build -f apps/console/Dockerfile --build-arg API_PROXY_TARGET=http://api:3311 .
#
# Railway: Root Directory = complifine, Dockerfile path = apps/console/Dockerfile
# Set build-time API_PROXY_TARGET to the private API URL (rewrites are baked in).

FROM oven/bun:1.2.0 AS builder
WORKDIR /app

COPY . .

ARG API_PROXY_TARGET=http://api:3311
ARG NEXT_PUBLIC_API_URL=/api
ENV API_PROXY_TARGET=$API_PROXY_TARGET
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
ENV API_PROXY_TARGET=http://api:3311
ENV NEXT_PUBLIC_API_URL=/api

COPY --from=builder /app/apps/console/.next/standalone ./
COPY --from=builder /app/apps/console/.next/static ./apps/console/.next/static

EXPOSE 3001
CMD ["bun", "apps/console/server.js"]
