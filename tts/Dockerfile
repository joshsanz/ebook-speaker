# Multi-stage build for optimized image size
FROM python:3.12-slim AS builder

# Install uv for fast Python package installation
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Set working directory
WORKDIR /app

# Copy dependency files
COPY pyproject.toml uv.lock ./

# Install dependencies using uv with GPU support
RUN uv sync --frozen --no-install-project --no-dev --extra gpu

# Production stage
FROM python:3.12-slim AS runtime

# Install runtime system dependencies (if needed)
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN groupadd --gid 1001 appuser && \
    useradd --uid 1001 --gid appuser --shell /bin/bash --create-home appuser

# Set working directory
WORKDIR /app

# Copy installed dependencies from builder stage
COPY --from=builder /app/.venv /app/.venv

# Copy application code and entrypoint
COPY main.py entrypoint.sh ./

# Set proper ownership and permissions
RUN chown -R appuser:appuser /app && \
    chmod +x /app/main.py && \
    chmod +x /app/entrypoint.sh

# Switch to non-root user
USER appuser

# Set environment variables
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONPATH="/app" \
    PYTHONUNBUFFERED=1

# Expose port
EXPOSE 5005

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5005/health || exit 1

# Add shutdown handling 
STOPSIGNAL SIGTERM

# Start the application with the entrypoint script
CMD ["./entrypoint.sh"]
