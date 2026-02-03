# Build context is the repository root (see docker-compose.yml).

FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace apps/server --include-workspace-root=false

FROM deps AS build
COPY tsconfig.base.json ./
COPY apps/server apps/server
RUN npm run build --workspace apps/server

FROM base AS runtime
RUN apk add --no-cache git
ENV NODE_ENV=production \
    REPOS_DIR=/repos \
    PORT=4100
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace apps/server --include-workspace-root=false --omit=dev \
  && npm cache clean --force
COPY --from=build /app/apps/server/dist apps/server/dist

WORKDIR /app/apps/server
USER node
EXPOSE 4100
CMD ["node", "dist/index.js"]
