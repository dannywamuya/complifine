# syntax=docker/dockerfile:1
# Build context MUST be the git repo root (the folder with workspaces in
# package.json). Docker cannot COPY files outside the context.
#
#   docker build -f apps/api/Dockerfile .
#
# Railway (repo is already this folder — do not set Root Directory to
# "complifine" or "apps/api"):
#   Root Directory     = empty
#   Dockerfile path    = apps/api/Dockerfile
#   Docker build context = empty (same as root)

FROM oven/bun:1.2.0
WORKDIR /app

COPY package.json bun.lock bunfig.toml tsconfig.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
COPY infra ./infra
COPY scripts ./scripts

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
