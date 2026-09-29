FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y openssl --no-install-recommends && rm -rf /var/lib/apt/lists/*

FROM base AS build
COPY package*.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages packages
RUN npm ci
COPY apps/backend apps/backend
RUN npm run build -w apps/backend

FROM base AS dependencies
COPY package*.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages packages
# Prisma CLI is retained for production migrations; frontend and test tools are omitted.
RUN npm ci --omit=dev --workspace=@recruiter/backend --include-workspace-root && npm cache clean --force

FROM base AS runtime
COPY --from=dependencies /app/node_modules ./node_modules
COPY package*.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/backend/prisma.config.ts apps/backend/prisma.config.ts
COPY apps/backend/prisma apps/backend/prisma
COPY --from=build /app/apps/backend/dist apps/backend/dist
ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["sh", "-c", "npm run db:migrate && npm run start -w apps/backend"]
