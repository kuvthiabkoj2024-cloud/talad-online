# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────────────────────
# Taladonline images, one target per app (built by infra/docker/docker-compose.prod.yml):
#   api    NestJS API                 node, port 4000
#   web    Next.js storefront         node, port 3000
#   shop   Seller Center (static)     nginx, port 80
#   admin  Admin console (static)     nginx, port 80
# Build context: the repository root. Settings baked into the browser apps come from each app's
# .env.production (Next.js / Vite read it during the build). The API's secrets are NOT copied
# into any image (see Dockerfile.dockerignore); compose passes them at run time.
# ─────────────────────────────────────────────────────────────────────────────
ARG NODE_VERSION=24.21.0

FROM node:${NODE_VERSION}-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true \
    TURBO_TELEMETRY_DISABLED=1 \
    NEXT_TELEMETRY_DISABLED=1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# pnpm comes from "packageManager" in package.json; ca-certificates for HTTPS (Bunny, Anthropic, model download)
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/* \
    && corepack enable
WORKDIR /repo

FROM base AS source
COPY . .

# ── API ──────────────────────────────────────────────────────────────────────
FROM source AS build-api
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile --filter "@talad/api..."
RUN pnpm turbo run build --filter=@talad/api

FROM base AS api
ENV NODE_ENV=production PORT=4000
COPY --from=build-api /repo /repo
WORKDIR /repo/services/api
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]

# ── Storefront ───────────────────────────────────────────────────────────────
FROM source AS build-web
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile --filter "@talad/web..."
RUN NODE_ENV=production pnpm turbo run build --filter=@talad/web

FROM base AS web
ENV NODE_ENV=production
COPY --from=build-web /repo /repo
WORKDIR /repo/apps/web
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/lo').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["node", "node_modules/next/dist/bin/next", "start", "--port", "3000", "--hostname", "0.0.0.0"]

# ── Seller Center & admin (static files) ─────────────────────────────────────
FROM source AS build-shop
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile --filter "@talad/shop..."
RUN NODE_ENV=production pnpm turbo run build --filter=@talad/shop

FROM source AS build-admin
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile --filter "@talad/admin..."
RUN NODE_ENV=production pnpm turbo run build --filter=@talad/admin

FROM nginx:stable-alpine AS shop
COPY infra/docker/nginx-spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build-shop /repo/apps/shop/dist /usr/share/nginx/html

FROM nginx:stable-alpine AS admin
COPY infra/docker/nginx-spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build-admin /repo/apps/admin/dist /usr/share/nginx/html
