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

# Each Node app is built in three layers so a deploy only re-sends what changed:
#   deps-*   node_modules, from the package.json files + lockfile only (changes rarely, the big one)
#   build-*  the whole source + build (never shipped)
#   api/web  deps-* + only the built output on top (a few MB per release)

# ── API ──────────────────────────────────────────────────────────────────────
FROM base AS deps-api
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Every workspace's package.json (pnpm needs them all to install just one app's dependencies)
COPY apps/web/package.json apps/web/
COPY apps/shop/package.json apps/shop/
COPY apps/admin/package.json apps/admin/
COPY apps/mobile/package.json apps/mobile/
COPY services/api/package.json services/api/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
# The client is generated in build-api, so a schema change doesn't rebuild node_modules.
RUN cd services/api && npm pkg delete scripts.postinstall
# Photo search's ONNX runtime ships Windows, macOS and GPU (CUDA) binaries: ~500 MB the server never loads.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile --filter "@talad/api..." \
    && for d in node_modules/.pnpm/onnxruntime-node@*/node_modules/onnxruntime-node/bin/napi-v*; do \
         rm -rf "$d/win32" "$d/darwin" "$d"/linux/*/libonnxruntime_providers_cuda.so "$d"/linux/*/libonnxruntime_providers_tensorrt.so; \
       done

FROM deps-api AS build-api
COPY --from=source /repo /repo
RUN pnpm --filter @talad/api db:generate && pnpm turbo run build --filter=@talad/api

FROM deps-api AS api
ENV NODE_ENV=production PORT=4000
COPY --from=build-api /repo/packages/shared/ packages/shared/
COPY --from=build-api /repo/services/api/ services/api/
WORKDIR /repo/services/api
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]

# ── Storefront ───────────────────────────────────────────────────────────────
FROM base AS deps-web
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Every workspace's package.json (pnpm needs them all to install just one app's dependencies)
COPY apps/web/package.json apps/web/
COPY apps/shop/package.json apps/shop/
COPY apps/admin/package.json apps/admin/
COPY apps/mobile/package.json apps/mobile/
COPY services/api/package.json services/api/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile --filter "@talad/web..."

FROM deps-web AS build-web
COPY --from=source /repo /repo
# .next/cache only speeds up the next build; it's large and not needed to run.
RUN NODE_ENV=production pnpm turbo run build --filter=@talad/web && rm -rf apps/web/.next/cache

FROM deps-web AS web
ENV NODE_ENV=production
COPY --from=build-web /repo/packages/shared/ packages/shared/
COPY --from=build-web /repo/apps/web/ apps/web/
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
