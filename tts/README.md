# TTS Service

A FastAPI-based Text-to-Speech service using Kokoro-ONNX.

## Features

- **Text-to-Speech**: Convert text to high-quality speech audio
- **Multiple Voices**: Support for various voices with different languages and genders
- **Language Support**: Multiple language support based on available voices
- **Health Checks**: Service health monitoring endpoint
- **CORS Support**: Cross-origin requests enabled for web integration

## API Endpoints

### Health Check

- `GET /health` - Returns service health status

### Text-to-Speech

- `POST /v1/audio/speech` - Convert text to speech
  - **Request Body**:

    ```json
    {
      "model": "kokoro",
      "input": "Hello, world!",
      "voice": "af_heart",
      "response_format": "wav",
      "speed": 1.0
    }
    ```

  - **Response**: WAV audio file

### Voices

- `GET /v1/audio/voices` - List all available voices
  - **Response**: JSON array of voice objects with metadata

### Languages

- `GET /v1/audio/languages` - List supported languages
  - **Response**: JSON array of language objects

## Example curl Commands

Here are example curl commands to test each endpoint. Replace `localhost:5005` with your server address if running on a different host/port.

### Health Check

```bash
curl -X GET http://localhost:5005/health
```

### Root Endpoint

```bash
curl -X GET http://localhost:5005/
```

### List Available Voices

```bash
curl -X GET http://localhost:5005/v1/audio/voices
```

### List Supported Languages

```bash
curl -X GET http://localhost:5005/v1/audio/languages
```

### Text-to-Speech (Save audio to file)

```bash
curl -X POST http://localhost:5005/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{
    "model": "kokoro",
    "input": "Hello, world! This is a test of the text-to-speech service.",
    "voice": "af_heart",
    "response_format": "wav",
    "speed": 1.0
  }' \
  --output speech.wav
```

### Text-to-Speech (Play audio directly - Linux/macOS)

```bash
curl -X POST http://localhost:5005/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{
    "model": "kokoro",
    "input": "Hello, world! This is a test of the text-to-speech service.",
    "voice": "af_heart",
    "response_format": "wav",
    "speed": 1.0
  }' | aplay  # Linux
# or
curl -X POST http://localhost:5005/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{
    "model": "kokoro",
    "input": "Hello, world! This is a test of the text-to-speech service.",
    "voice": "af_heart",
    "response_format": "wav",
    "speed": 1.0
  }' | afplay  # macOS
```

### Text-to-Speech with Different Voice

```bash
curl -X POST http://localhost:5005/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{
    "model": "kokoro",
    "input": "Bonjour le monde! Ceci est un test du service de synthèse vocale.",
    "voice": "bf_alice",
    "response_format": "wav",
    "speed": 0.8
  }' \
  --output french_speech.wav
```

### Text-to-Speech with Custom Speed

```bash
curl -X POST http://localhost:5005/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{
    "model": "kokoro",
    "input": "This is spoken at a slower pace for clarity.",
    "voice": "af_heart",
    "response_format": "wav",
    "speed": 0.7
  }' \
  --output slow_speech.wav
```

## Installation & Usage

### Local Development

1. Install dependencies:

   ```bash
   pip install -r requirements.txt
   # or using uv (recommended)
   uv pip install -e .
   ```

2. **Model Files**: The service will automatically download required model files on first startup:
   - `kokoro-v1.0.onnx` - TTS model (downloaded from GitHub releases)
   - `voices-v1.0.bin` - Voice definitions (downloaded from GitHub releases)

3. Run the service:

   ```bash
   python run.py
   # or
   python main.py
   # or
   uvicorn main:app --host 0.0.0.0 --port 5005 --reload
   ```

### Docker Deployment

The service can be containerized using Docker for easy deployment and portability.

#### Using Docker Compose (Recommended)

1. Build and run with Docker Compose:

   ```bash
   # Build and start the service
   docker-compose up --build

   # Run in background
   docker-compose up -d --build

   # Stop the service
   docker-compose down

   # View logs
   docker-compose logs -f tts-service
   ```

2. The service will be available at `http://localhost:5005`

#### Using Docker Commands

1. Build the Docker image:

   ```bash
   docker build -t tts-service .
   ```

2. Run the container:

   ```bash
   # Basic run
   docker run -p 5005:5005 tts-service

   # With resource limits and restart policy
   docker run -p 5005:5005 \
     --memory=2g \
     --cpus=1.0 \
     --restart unless-stopped \
     tts-service
   ```

3. Health check:

   ```bash
   # Check container health
   docker ps

   # Test health endpoint
   curl http://localhost:5005/health
   ```

#### Docker Configuration

- **Base Image**: Python 3.13 slim
- **Port**: 5005
- **Health Check**: Integrated with `/health` endpoint
- **Resource Limits**: 2GB RAM, 1 CPU (configurable in docker-compose.yml)
- **User**: Non-root user for security
- **Model Files**: Downloaded at runtime to keep image size small

## Configuration

- **Port**: 5005 (default)
- **Host**: 0.0.0.0 (accessible from all interfaces)
- **Model**: Kokoro-ONNX v0.19
- **Audio Format**: WAV (16-bit, 24kHz)

## Default Voice

- **Default Voice**: `af_heart` (American Female Heart)
- **Speed Range**: 0.5x to 2.0x (default: 1.0x)

## Voice Naming Convention

Voices follow the pattern: `[language_code][gender_code]_[voice_name]`

- **Language Codes**: `a`=American, `b`=British, `j`=Japanese, `k`=Korean, etc.
- **Gender Codes**: `f`=female, `m`=male
- **Examples**: `af_heart`, `bm_george`, `jf_aioede`

## Error Handling

The service returns appropriate HTTP status codes:

- `400` - Bad Request (invalid parameters)
- `500` - Internal Server Error (TTS generation failed)

## Development

For development with auto-reload:

```bash
uvicorn main:app --reload
```

## Integration with Frontend

The service is designed to work with the ebook-speaker frontend. Make sure to:

1. Start the TTS service on port 5005
2. Configure your frontend to use the correct API endpoints
3. Ensure CORS is properly configured for your domain in production
