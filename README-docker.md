# Docker Setup for EBook Speaker

This document describes the Docker setup for running the EBook Speaker application with all its components.

## Architecture

The application consists of three main services:

1. **Server** (Node.js/Express) - Port 3001
   - EPUB reading functionality
   - API endpoints for books and chapters
   - TTS proxy to communicate with TTS service
   - Serves the React frontend

2. **React Client** - Built and served by the server
   - User interface for reading ebooks
   - Audio playback controls

3. **TTS Service** (Python/FastAPI) - Port 5005
   - Text-to-speech conversion
   - Voice selection and audio generation

## Quick Start

1. **Build and start all services:**
   ```bash
   docker-compose up --build
   ```

2. **Access the application:**
   - Web UI: http://localhost:3001
   - Server API: http://localhost:3001/api
   - TTS Service: http://localhost:5005

## Docker Configuration

### Files Created

- `Dockerfile` - Multi-stage Node.js build for the server
- `docker-compose.yml` - Orchestrates all services
- `.dockerignore` - Optimizes build context

### Security Features

- **Multi-stage builds** - Reduces final image size
- **Non-root users** - Enhanced security
- **Slim base images** - Minimal attack surface
- **Health checks** - Service monitoring

### Environment Variables

- `NODE_ENV=production` - Production mode for server
- `PORT=3001` - Server port
- `TTS_SERVICE_URL=http://tts-service:5005` - TTS service URL for Docker network

### Volumes

- `./data:/app/data:ro` - EPUB files (read-only)
- `./client/build:/app/client/build:ro` - Built React app (read-only)

## Development vs Production

### Development
```bash
# Run without Docker (existing setup)
npm install
cd client && npm install
npm run dev
```

### Production (Docker)
```bash
# Build and run with Docker
docker-compose up --build -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## Adding EPUB Files

1. Place your `.epub` files in the `data/` directory
2. The server will automatically detect them on restart
3. Access via the web UI at http://localhost:3001

## Troubleshooting

### Health Checks
All services include health checks. Monitor with:
```bash
docker-compose ps
```

### Logs
View service logs:
```bash
docker-compose logs server
docker-compose logs tts-service
```

### Rebuilding
If you make changes to the code:
```bash
docker-compose up --build --force-recreate
```

## Service Dependencies

- Server waits for TTS service to be healthy
- React client is built during container startup
- Services communicate via Docker network `ebook-speaker`
