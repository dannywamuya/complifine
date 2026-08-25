# syntax=docker/dockerfile:1
# Build from the workspace root (complifine/), not this folder:
#   docker build -f apps/api/Dockerfile .
#
# Railway: Root Directory = complifine, Dockerfile path = apps/api/Dockerfile
# npm cannot install this repo (workspace:*). Images use Bun only.

FROM oven/bun:1.2.0
WORKDIR /app

COPY . .
RUN bun install --frozen-lockfile \
  && chmod +x apps/api/docker-entrypoint.sh \
  && mkdir -p /data/storage

ENV NODE_ENV=production
ENV PORT=3311
ENV STORAGE_ROOT=/data/storage

EXPOSE 3311
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD bun -e 'fetch("http://127.0.0.1:"+(process.env.PORT||"3311")+"/health").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))'

CMD ["apps/api/docker-entrypoint.sh"]
