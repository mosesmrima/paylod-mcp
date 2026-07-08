# ---------------------------------------------------------------------------
# paylod MCP server — OAuth 2.1 resource server over Streamable HTTP.
# Multi-stage build: compile with tsup, then ship dist + prod deps only.
# ---------------------------------------------------------------------------

# --- build stage ----------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# Install all deps (incl. dev) against the lockfile for a reproducible build.
COPY package.json package-lock.json ./
RUN npm ci

# Compile TypeScript -> dist/ via tsup.
COPY tsconfig.json tsup.config.ts ./
COPY src ./src
RUN npm run build

# --- production deps stage ------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# --- runtime stage --------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    MCP_PORT=8787

COPY package.json ./
COPY --from=deps  /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

# Run as the built-in unprivileged node user.
USER node

EXPOSE 8787
CMD ["node", "dist/index.js"]
