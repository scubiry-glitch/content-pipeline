# Content Pipeline — multi-stage build
# Stage 1: compile TypeScript
FROM node:20-alpine AS builder
WORKDIR /app
COPY api/package*.json ./
RUN npm ci --no-audit --no-fund
COPY api/src ./src
COPY api/tsconfig.json ./
RUN npm run build

# Stage 2: runtime image (production deps only)
FROM node:20-alpine
RUN apk add --no-cache curl
WORKDIR /app
COPY api/package*.json ./
RUN npm ci --only=production --no-audit --no-fund
COPY --from=builder /app/dist ./dist
# meeting-notes & ceo migrations are read at runtime from src (not dist)
COPY api/src/modules/meeting-notes/migrations ./src/modules/meeting-notes/migrations
COPY api/src/modules/ceo/migrations ./src/modules/ceo/migrations
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1
CMD ["node", "dist/server.js"]
