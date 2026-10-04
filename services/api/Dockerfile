# Build from the repo root: docker build -f services/api/Dockerfile .
FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile --filter @talad/api...
RUN pnpm --filter @talad/api... build
RUN pnpm --filter @talad/api deploy --prod --ignore-scripts /out

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./
COPY --from=build /repo/services/api/dist ./dist
COPY --from=build /repo/services/api/prisma ./prisma
COPY --from=build /repo/services/api/prisma.config.ts ./
USER node
EXPOSE 4000
CMD ["node", "dist/main"]
