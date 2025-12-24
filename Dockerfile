# Multi-stage build for optimized image size
FROM node:24-slim AS builder

# Set working directory
WORKDIR /app

# Copy package files for backend
COPY package*.json ./

# Install backend dependencies 
RUN npm ci --only=production && npm cache clean --force

# Build React client in a separate stage
FROM node:20-slim AS client-builder

WORKDIR /app/client

# Copy client package files
COPY client/package*.json ./

# Install client dependencies (including dev dependencies for building)
RUN npm ci

# Copy client source code
COPY client/ ./

# Copy shared directory for imports
COPY shared/ ../shared/

# Build React client
RUN npm run build

# Production stage
FROM node:24-slim AS runtime

# Install runtime system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for security (handle existing GID gracefully)
RUN groupadd --gid 1001 appuser || groupadd appuser && \
    useradd --uid 1001 --gid appuser --shell /bin/bash --create-home appuser

# Set working directory
WORKDIR /app

# Copy installed dependencies from builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy built React client from client-builder stage
COPY --from=client-builder /app/client/build ./client/build

# Copy application code
COPY server.js ./
COPY epub-reader.js ./
COPY package*.json ./
COPY shared/ ./shared/
COPY utils/ ./utils/

# Create data directory and set proper ownership
RUN mkdir -p data && chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Set environment variables
ENV NODE_ENV=production \
    PORT=3001

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Start the application
CMD ["node", "server.js"]
