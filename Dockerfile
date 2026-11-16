# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:24.22.1-bookworm-slim
FROM ${NODE_IMAGE} AS base
RUN node -e 'if (process.versions.node !== "24.22.1") process.exit(1)' \
    && apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/epp

FROM base AS build
# Native modules are installed for this Linux image, never copied from the host.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY prisma.config.ts tsconfig.json tsconfig.build.json ./
COPY prisma ./prisma
COPY scripts ./scripts
COPY src ./src
COPY config ./config
# prebuild generates the Prisma TypeScript client offline; build also copies assets.
RUN npm run build

FROM build AS production-deps
RUN npm prune --omit=dev

FROM base AS runtime
ENV NODE_ENV=production
RUN mkdir -p /work \
    && chown 10001:10001 /work \
    && chmod 0700 /work
COPY --from=production-deps /opt/epp/node_modules ./node_modules
COPY --from=build /opt/epp/dist ./dist
COPY package.json ./package.json
COPY database/chapter-51/clean.mjs ./database/chapter-51/clean.mjs
COPY scripts/verify-database.mjs ./scripts/verify-database.mjs
USER 10001:10001
WORKDIR /work
STOPSIGNAL SIGTERM
ENTRYPOINT ["node", "--enable-source-maps"]
CMD ["/opt/epp/dist/src/server.js"]
