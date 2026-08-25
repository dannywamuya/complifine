# syntax=docker/dockerfile:1
# Build from the workspace root (complifine/), not this folder:
#   docker build -f apps/web/Dockerfile --build-arg API_PROXY_TARGET=http://api:3311 .
#
# Railway: Root Directory = complifine, Dockerfile path = apps/web/Dockerfile
# Set build-time API_PROXY_TARGET to the private API URL (rewrites are baked in).

FROM oven/bun:1.2.0 AS builder
WORKDIR /app

COPY . .

ARG API_PROXY_TARGET=http://api:3311
ARG NEXT_PUBLIC_API_URL=/api
ARG NEXT_PUBLIC_CAL_URL=
ENV API_PROXY_TARGET=$API_PROXY_TARGET
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
ENV API_PROXY_TARGET=http://api:3311
ENV NEXT_PUBLIC_API_URL=/api

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000
CMD ["bun", "apps/web/server.js"]
