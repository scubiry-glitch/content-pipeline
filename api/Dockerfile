# Content Pipeline API Dockerfile
FROM node:18-alpine

# Install dependencies
RUN apk add --no-cache \
    curl \
    postgresql-client

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application files
COPY dist ./dist

# Create directories for uploads and logs
RUN mkdir -p uploads logs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "dist/index.js"]
