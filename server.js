const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const fetch = require('node-fetch');
const EpubReader = require('./epub-reader');

const app = express();
const PORT = process.env.PORT || 3001;

// Enable CORS for React development
app.use(cors());
app.use(express.json());

// Serve static files from React build
app.use(express.static(path.join(__dirname, 'client/build')));

// Store active EPUB readers
const epubReaders = new Map();

// Get list of EPUB files
app.get('/api/books', (req, res) => {
    try {
        const dataDir = path.join(__dirname, 'data');
        const files = fs.readdirSync(dataDir);
        const epubFiles = files
            .filter(file => file.toLowerCase().endsWith('.epub'))
            .map(file => ({
                filename: file,
                title: file.replace('.epub', ''),
                path: `/api/books/${encodeURIComponent(file)}`
            }));

        res.json(epubFiles);
    } catch (error) {
        console.error('Error reading data directory:', error);
        res.status(500).json({ error: 'Failed to read books directory' });
    }
});

// Initialize EPUB reader for a specific book
async function getEpubReader(filename) {
    if (epubReaders.has(filename)) {
        return epubReaders.get(filename);
    }

    try {
        const epubPath = path.join(__dirname, 'data', filename);
        const reader = new EpubReader(epubPath);
        await reader.initialize();
        epubReaders.set(filename, reader);
        return reader;
    } catch (error) {
        console.error(`Failed to initialize EPUB reader for ${filename}:`, error);
        throw error;
    }
}

// Get book metadata
app.get('/api/books/:filename/metadata', async (req, res) => {
    try {
        const filename = decodeURIComponent(req.params.filename);
        const reader = await getEpubReader(filename);
        const metadata = reader.getMetadata();
        res.json(metadata);
    } catch (error) {
        res.status(500).json({
            error: 'Failed to get book metadata',
            message: error.message
        });
    }
});

// Get chapter list for a specific book
app.get('/api/books/:filename/chapters', async (req, res) => {
    try {
        const filename = decodeURIComponent(req.params.filename);
        const reader = await getEpubReader(filename);
        const chapters = reader.getChapterList();
        res.json(chapters);
    } catch (error) {
        res.status(500).json({
            error: 'Failed to get chapters',
            message: error.message
        });
    }
});

// Get specific chapter content
app.get('/api/books/:filename/chapters/:id', async (req, res) => {
    try {
        const filename = decodeURIComponent(req.params.filename);
        const chapterId = req.params.id;
        const reader = await getEpubReader(filename);

        const rawContent = await reader.getChapterContent(chapterId);
        const cleanTextContent = reader.cleanHtmlContent(rawContent);
        const htmlContent = reader.getRawHtmlContent(rawContent);

        res.json({
            id: chapterId,
            content: htmlContent,  // HTML content for web display
            textContent: cleanTextContent,  // Clean text for speech synthesis
            rawContent: rawContent  // Original HTML content
        });
    } catch (error) {
        res.status(404).json({
            error: 'Chapter not found or could not be read',
            message: error.message
        });
    }
});

// Proxy endpoint for TTS requests
app.post('/api/tts/speech', async (req, res) => {
    try {
        const { model, input, voice, response_format, speed } = req.body;

        // Validate required fields
        if (!input || !voice) {
            return res.status(400).json({
                error: 'Missing required fields: input and voice are required'
            });
        }

        // Forward request to TTS server
        const ttsResponse = await fetch('http://localhost:5005/v1/audio/speech', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: model || 'orpheus',
                input,
                voice,
                response_format: response_format || 'wav',
                speed: speed || 1.0
            })
        });

        if (!ttsResponse.ok) {
            throw new Error(`TTS server error: ${ttsResponse.status} - ${ttsResponse.statusText}`);
        }

        // Set appropriate headers
        res.set({
            'Content-Type': 'audio/wav',
            'Content-Disposition': 'attachment; filename="speech.wav"'
        });

        // Stream the audio response
        ttsResponse.body.pipe(res);

    } catch (error) {
        console.error('TTS proxy error:', error);
        res.status(500).json({
            error: 'TTS service unavailable',
            message: error.message
        });
    }
});

// Serve React app for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`EPUB Speaker server running on http://localhost:${PORT}`);
    console.log('Available EPUB files in data directory:');
    try {
        const dataDir = path.join(__dirname, 'data');
        const files = fs.readdirSync(dataDir);
        const epubFiles = files.filter(file => file.toLowerCase().endsWith('.epub'));
        epubFiles.forEach(file => console.log(`  - ${file}`));
    } catch (error) {
        console.error('Error reading data directory:', error);
    }
});

module.exports = app;
