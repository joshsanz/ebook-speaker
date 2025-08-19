# ebook-speaker

A full-stack web application that reads EPUB ebooks aloud using advanced text-to-speech technology. Provides a better TTS experience than Apple's default page reader with a clean, intuitive interface for browsing and reading ebooks.

## Features

- 📚 EPUB file parsing and display
- 🔊 High-quality text-to-speech synthesis
- 🌐 Web-based reader with chapter navigation
- 📱 Responsive design for multiple devices
- 🎯 Clean text extraction optimized for speech synthesis

## Architecture

**Backend (Node.js/Express)**
- REST API for EPUB file management
- Custom EPUB parser using epub2 library
- TTS proxy service integration
- Static file serving for production builds

**Frontend (React)**
- Single-page application with React Router
- Book library browser
- Chapter-based reading interface
- Audio controls for text-to-speech

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- External TTS service running on `http://localhost:5005` (optional)

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd ebook-speaker
```

2. Install server dependencies:
```bash
npm install
```

3. Install client dependencies:
```bash
npm run install-client
```

4. Create a data directory for EPUB files:
```bash
mkdir data
```

5. Add your EPUB files to the `data/` directory

## Running the Application

### Development Mode (Recommended)
Start both server and client with hot reload:
```bash
npm run dev
```
- Server runs on `http://localhost:3001`
- Client runs on `http://localhost:3000`

### Production Mode
1. Build the client:
```bash
npm run build
```

2. Start the server:
```bash
npm start
```
- Application runs on `http://localhost:3001`

### Individual Components
```bash
# Server only
npm start

# Client only
npm run client
```

## Usage

1. Place EPUB files in the `data/` directory
2. Start the application using one of the methods above
3. Navigate to the web interface
4. Browse available books and select one to read
5. Use chapter navigation to move through the book
6. Click text to hear it read aloud (requires TTS service)

## API Endpoints

- `GET /api/books` - List available EPUB files
- `GET /api/books/:filename/metadata` - Get book metadata
- `GET /api/books/:filename/chapters` - Get chapter list
- `GET /api/books/:filename/chapters/:id` - Get chapter content
- `POST /api/tts/speech` - Text-to-speech proxy endpoint

## Configuration

### TTS Service
The application expects a TTS service at `http://localhost:5005/v1/audio/speech`. Configure your TTS service to match this endpoint or modify the proxy URL in `server.js:127`.

### Port Configuration
Set the `PORT` environment variable to change the server port:
```bash
PORT=8080 npm start
```

## Testing

Run client tests:
```bash
cd client
npm test
```

## Project Structure

```
ebook-speaker/
├── server.js              # Express server
├── epub-reader.js          # EPUB parsing logic
├── package.json           # Server dependencies
├── data/                  # EPUB files directory
└── client/                # React application
    ├── src/
    │   ├── components/
    │   │   ├── BookList.js    # Book library component
    │   │   └── BookReader.js  # Reading interface
    │   └── App.js         # Main application
    └── package.json       # Client dependencies
```
