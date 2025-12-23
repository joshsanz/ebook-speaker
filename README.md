# Ebook Speaker

A full-stack web application that reads EPUB ebooks aloud using advanced text-to-speech technology. Provides a better TTS experience than Apple's default page reader with a clean, intuitive interface for browsing and reading ebooks.

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Running the Application](#running-the-application)
- [Usage](#usage)
- [API Endpoints](#api-endpoints)
- [Configuration](#configuration)
- [Testing](#testing)
- [Project Structure](#project-structure)
- [Deployment](#deployment)
- [Docker](#docker)
- [Contributing](#contributing)
- [License](#license)

## Features

- 📚 EPUB file parsing and display
- 🔊 High-quality text-to-speech synthesis with playback controls (pause, resume, fast-forward, rewind)
- 🌐 Web-based reader with chapter navigation
- 📱 Responsive design for multiple devices
- 🎯 Clean text extraction optimized for speech synthesis
- 🚀 Sentence-level audio streaming for faster playback

## Architecture

The application is composed of three main components:

1.  **Frontend:** A React single-page application (SPA) built with Vite. It provides the user interface for browsing books, reading content, and controlling audio playback. The core of the TTS functionality is in the `useTTS.js` custom hook, which manages audio generation, queueing, and playback.

2.  **Backend:** A Node.js/Express server that provides a REST API for the frontend. It handles EPUB file parsing, metadata extraction, and chapter retrieval. It also acts as a proxy to the TTS service.

3.  **TTS Service:** A Python FastAPI application that serves the Kokoro TTS model. It downloads the model files if they are missing and provides endpoints for generating speech.

The data flow for TTS is as follows:

1.  The user clicks the "Speak" button on a chapter's page.
2.  The `useTTS.js` hook on the client-side splits the chapter text into sentences.
3.  For each sentence, the client sends a request to the backend's `/api/tts/speech` endpoint.
4.  The backend proxies the request to the Python TTS service.
5.  The TTS service generates the audio and returns it to the backend.
6.  The backend streams the audio back to the client.
7.  The client receives the audio and adds it to an audio queue, which is then played back sentence by sentence.

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Python 3.10 or higher (for the TTS service)
- Docker (optional, for running with Docker)

## Installation

1.  **Clone the repository:**

    ```bash
    git clone <repository-url>
    cd ebook-speaker
    ```

2.  **Install server dependencies:**

    ```bash
    npm install
    ```

3.  **Install client dependencies:**

    ```bash
    npm run install-client
    ```

4.  **Install TTS service dependencies:**

    ```bash
    cd tts
    pip install -r requirements.txt
    cd ..
    ```

5.  **Create a data directory for EPUB files:**

    ```bash
    mkdir data
    ```

6.  Add your EPUB files to the `data/` directory.

## Running the Application

### Full System with Docker (Recommended)

This will start the Node.js server, build the React client, and run the Python TTS service.

```bash
docker-compose up --build
```

- Web UI + API: `http://localhost:3001`
- TTS Service: `http://localhost:5005`

GPU/CPU variants are available:

```bash
docker-compose -f docker-compose.cpu.yml up --build
docker-compose -f docker-compose.gpu.yml up --build
docker-compose -f docker-compose.coreml.yml up --build
```

### Full System without Docker (Local Dev)

If you prefer to run the services manually:

1.  **Start the TTS Service:**

    ```bash
    cd tts
    uvicorn main:app --reload --port 5005
    ```

2.  **Start the Backend + Frontend:**

    ```bash
    npm run dev
    ```

    - API runs on `http://localhost:3001`
    - Client runs on `http://localhost:3000`

If your TTS service is not at `http://localhost:5005`, set `TTS_SERVICE_URL` before starting the server.

## Usage

1.  Place your EPUB files in the `data/` directory.
2.  Start the application using one of the methods above.
3.  Open your web browser and navigate to `http://localhost:3000`.
4.  Browse the available books and select one to read.
5.  Use the chapter navigation to move through the book.
6.  Click the "Speak" button to hear the chapter read aloud.

## API Endpoints

### Backend (Node.js)

- `GET /api/books`: List available EPUB files.
- `GET /api/books/:filename/metadata`: Get book metadata.
- `GET /api/books/:filename/chapters`: Get the list of chapters for a book.
- `GET /api/books/:filename/chapters/:id`: Get the content of a specific chapter.
- `POST /api/tts/speech`: Proxy a text-to-speech request to the TTS service.
- `GET /api/tts/voices`: Get the list of available voices from the TTS service.

### TTS Service (Python)

- `GET /v1/audio/voices`: Get the list of available voices.
- `POST /v1/audio/speech`: Generate speech from text.

## Configuration

### TTS Service

The application expects a TTS service to be running at `http://localhost:5005`. You can configure the URL of the TTS service by setting the `TTS_SERVICE_URL` environment variable in the `docker-compose.yml` file or in your environment.

To select a specific model file (for example `model_quantized.onnx` or `kokoro-v1.0.fp16.onnx`), set `TTS_MODEL_FILE` for the Python TTS service. The file is expected under the TTS assets directory and will be downloaded if missing.

### Port

The server runs on port 3001 by default. You can change this by setting the `PORT` environment variable.

## Testing

Run the client-side tests:

```bash
cd client
npm test
```

## Project Structure

```
ebook-speaker/
├── client/                # React frontend application
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── hooks/         # Custom React hooks (useTTS.js)
│   │   └── ...
├── data/                  # Directory for EPUB files
├── tts/                   # Python TTS service
│   ├── main.py            # FastAPI application
│   └── ...
├── docker-compose.yml     # Docker Compose configuration
├── Dockerfile             # Dockerfile for the main application
├── epub-reader.js         # EPUB parsing logic
├── package.json           # Server dependencies
├── README.md              # This file
└── server.js              # Express server
```

## Docker

The easiest way to run the full system is with Docker Compose.

1.  **Build and run the containers:**

    ```bash
    docker-compose up --build
    ```

    This will build the `ebook-speaker` image and start the server, client build, and TTS services.

2.  **Access the application:**

    The application will be available at `http://localhost:3001`.

## Contributing

Contributions are welcome! Please feel free to submit a pull request or open an issue.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
