const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const multer = require('multer');
const EpubReader = require('./epub-reader');

const app = express();
const PORT = process.env.PORT || 3001;

// Enable CORS for React development
app.use(cors());
app.use(express.json());

// Serve static files from React build
app.use(express.static(path.join(__dirname, 'client/build')));

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Store active EPUB readers
const epubReaders = new Map();

// Multer configuration for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Get list of EPUB files with metadata
app.get('/api/books', async (req, res) => {
    try {
        const dataDir = path.join(__dirname, 'data');
        const epubFiles = [];

        const readDirectory = async (dir) => {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                const fullPath = path.join(dir, file);
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    await readDirectory(fullPath);
                } else if (file.toLowerCase().endsWith('.epub')) {
                    const reader = await getEpubReader(fullPath);
                    const metadata = reader.getMetadata();
                    epubFiles.push({
                        filename: path.relative(dataDir, fullPath),
                        title: metadata.title,
                        author: metadata.creator,
                        date_uploaded: stat.ctime
                    });
                }
            }
        };

        await readDirectory(dataDir);
        res.json(epubFiles);
    } catch (error) {
        console.error('Error reading data directory:', error);
        res.status(500).json({ error: 'Failed to read books directory' });
    }
});

// Upload a new EPUB file
app.post('/api/books', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Parse the EPUB buffer to get metadata
        const reader = new EpubReader(req.file.buffer, true);
        await reader.initialize();
        await reader.improveChapterTitles();
        const metadata = reader.getMetadata();
        
        const author = metadata.creator || 'Unknown';
        
        // Parse author name for Last_First_Middle format
        let authorDir = 'Unknown';
        if (author !== 'Unknown') {
            if (author.includes(',')) {
                // Already in "Last, First [Middle]" format
                const parts = author.split(',').map(p => p.trim());
                const lastName = parts[0];
                const restOfName = parts[1].replace(/\s+/g, '_');
                authorDir = `${lastName}_${restOfName}`;
            } else {
                // Assume "First [Middle] Last" format, convert to "Last_First_Middle"
                const parts = author.trim().split(/\s+/);
                if (parts.length >= 2) {
                    const lastName = parts[parts.length - 1];
                    const otherNames = parts.slice(0, -1).join('_');
                    authorDir = `${lastName}_${otherNames}`;
                } else {
                    // Single name
                    authorDir = author.replace(/\s+/g, '_');
                }
            }
        }
        const dirPath = path.join(__dirname, 'data', authorDir);

        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }

        const filePath = path.join(dirPath, req.file.originalname);
        fs.writeFileSync(filePath, req.file.buffer);

        res.status(201).json({ message: 'File uploaded successfully' });
    } catch (error) {
        console.error('Error uploading file:', error);
        res.status(500).json({ error: 'Failed to upload file' });
    }
});

// Delete an EPUB file
app.delete('/api/books/:filename', (req, res) => {
    try {
        const filename = decodeURIComponent(req.params.filename);
        const filePath = path.join(__dirname, 'data', filename);
        
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            epubReaders.delete(filename);
            
            // Check if the parent directory is now empty and delete it if so
            const parentDir = path.dirname(filePath);
            const dataDir = path.join(__dirname, 'data');
            
            // Only delete if it's a subdirectory of data/ (not data/ itself)
            if (parentDir !== dataDir) {
                try {
                    const files = fs.readdirSync(parentDir);
                    if (files.length === 0) {
                        fs.rmdirSync(parentDir);
                        console.log(`Deleted empty directory: ${path.basename(parentDir)}`);
                    }
                } catch (dirError) {
                    console.warn('Could not check/delete directory:', dirError.message);
                }
            }
            
            res.status(200).json({ message: 'File deleted successfully' });
        } else {
            res.status(404).json({ error: 'File not found' });
        }
    } catch (error) {
        console.error('Error deleting file:', error);
        res.status(500).json({ error: 'Failed to delete file' });
    }
});


// Initialize EPUB reader for a specific book
async function getEpubReader(filePath) {
    if (epubReaders.has(filePath)) {
        return epubReaders.get(filePath);
    }

    try {
        const reader = new EpubReader(filePath);
        await reader.initialize();
        await reader.improveChapterTitles();
        epubReaders.set(filePath, reader);
        return reader;
    } catch (error) {
        console.error(`Failed to initialize EPUB reader for ${filePath}:`, error);
        throw error;
    }
}

// Get book metadata
app.get('/api/books/:filename/metadata', async (req, res) => {
    try {
        const filename = decodeURIComponent(req.params.filename);
        const filePath = path.join(__dirname, 'data', filename);
        const reader = await getEpubReader(filePath);
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
        const filePath = path.join(__dirname, 'data', filename);
        const reader = await getEpubReader(filePath);
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
        const filePath = path.join(__dirname, 'data', filename);
        const reader = await getEpubReader(filePath);

        const rawContent = await reader.getChapterContent(chapterId);
        const cleanTextContent = reader.cleanHtmlContent(rawContent);
        
        // Process hyperlinks for React routing by passing the book filename
        const htmlContent = reader.getRawHtmlContent(rawContent, filename);

        res.json({
            id: chapterId,
            content: htmlContent,  // HTML content for web display with processed hyperlinks
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

// TTS Voices endpoint
app.get('/api/tts/voices', async (req, res) => {
    try {
        const { default: fetch } = await import('node-fetch');
        const ttsServiceUrl = process.env.TTS_SERVICE_URL || 'http://localhost:5005';
        const ttsResponse = await fetch(`${ttsServiceUrl}/v1/audio/voices`);

        if (!ttsResponse.ok) {
            throw new Error(`TTS server error: ${ttsResponse.status} - ${ttsResponse.statusText}`);
        }

        const voices = await ttsResponse.json();
        res.json(voices);
    } catch (error) {
        console.error('Error fetching voices:', error);
        res.status(500).json({ error: 'Failed to fetch voices from TTS service' });
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
        const { default: fetch } = await import('node-fetch');
        const ttsServiceUrl = process.env.TTS_SERVICE_URL || 'http://localhost:5005';
        const ttsResponse = await fetch(`${ttsServiceUrl}/v1/audio/speech`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: model || 'kokoro',
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
