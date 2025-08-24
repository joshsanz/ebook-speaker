# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ebook-speaker is a full-stack web application that reads EPUB files aloud using text-to-speech technology. It consists of:

- **Backend (Node.js/Express)**: Server handling EPUB parsing, API endpoints, and TTS proxy
- **Frontend (React)**: Single-page application for book browsing and reading interface
- **EPUB Processing**: Custom EpubReader class using the epub2 library for parsing EPUB files

## Development Commands

### Root Project Commands
- `npm run dev` - Start both server and client in development mode (recommended)
- `npm start` - Start only the server (production mode)
- `npm run client` - Start only the React client
- `npm run build` - Build the React client for production
- `npm run install-client` - Install client dependencies

### Client Commands (in /client directory)
- `npm start` - Start React development server on port 3000
- `npm run build` - Build for production
- `npm test` - Run tests with Jest/React Testing Library
- `npm run test -- --watchAll=false` - Run tests once without watch mode

## Architecture

### Server Architecture (server.js)
- Express server on port 3001 (or PORT environment variable)
- CORS enabled for React development
- Static file serving from client/build for production
- In-memory EPUB reader cache using Map for performance
- TTS proxy endpoint forwarding to localhost:5005

### EPUB Processing (epub-reader.js)
- EpubReader class handles EPUB file parsing using epub2 library
- Manages chapter extraction from table of contents or spine order
- Provides both clean text (for TTS) and HTML content (for display)
- Handles HTML entity decoding and content cleaning

### Frontend Structure
- React Router for navigation between book list and reader
- BookList component displays available EPUB files from /data directory
- BookReader component handles chapter navigation and content display
- VoiceSelector component with emoji-enhanced voice selection
- Custom hooks for TTS functionality (useTTS.js), cleanup (useCleanup.js), and voice management (useVoices.js)
- Proxy configuration in client/package.json routes API calls to port 3001

## Key API Endpoints

- `GET /api/books` - List available EPUB files
- `GET /api/books/:filename/metadata` - Book metadata  
- `GET /api/books/:filename/chapters` - Chapter list
- `GET /api/books/:filename/chapters/:id` - Chapter content (HTML + clean text)
- `GET /api/tts/voices` - List available TTS voices with metadata
- `POST /api/tts/speech` - TTS proxy to external service

## Data Directory

EPUB files should be placed in `/data` directory at project root. The server automatically scans this directory for .epub files on startup.

## External Dependencies

- TTS service expected at `http://localhost:5005/v1/audio/speech`
- Client proxies API requests to port 3001 during development

## TTS Integration

The application uses a custom useTTS hook that:
- Splits text into sentences for faster streaming audio
- Manages audio queue for continuous playback
- Provides abort functionality for stopping speech
- Handles long text by breaking it at punctuation marks
- Supports both sentence-by-sentence and full chapter playback

### Voice Selection System
- Dynamic voice fetching from TTS service via `/api/tts/voices` endpoint
- Emoji-enhanced voice display with language flags (🇺🇸 🇬🇧 🇯🇵 etc.) and gender icons (👩 🧔‍♂️)
- Automatic language detection (American vs British English)
- Grouped voice organization by language
- Fallback to hardcoded voices if API is unavailable

## Testing

Client uses React Testing Library and Jest. Run tests with `npm test` in the client directory.
Test files are located alongside components and follow standard React testing patterns.