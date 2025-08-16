const express = require('express');
const path = require('path');
const EpubReader = require('./epub-reader');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static('public'));
app.use(express.json());

// Global epub reader instance
let epubReader = null;

// Initialize EPUB reader
async function initializeEpub() {
    try {
        const epubPath = path.join(__dirname, 'Excession - Iain M. Banks.epub');
        epubReader = new EpubReader(epubPath);
        await epubReader.initialize();
        console.log('EPUB reader initialized successfully');
    } catch (error) {
        console.error('Failed to initialize EPUB reader:', error);
    }
}

// API Routes

// Get book metadata
app.get('/api/metadata', (req, res) => {
    if (!epubReader) {
        return res.status(500).json({ error: 'EPUB reader not initialized' });
    }

    const metadata = epubReader.getMetadata();
    res.json(metadata);
});

// Get chapter list
app.get('/api/chapters', (req, res) => {
    if (!epubReader) {
        return res.status(500).json({ error: 'EPUB reader not initialized' });
    }

    const chapters = epubReader.getChapterList();
    res.json(chapters);
});

// Get specific chapter content
app.get('/api/chapters/:id', async (req, res) => {
    if (!epubReader) {
        return res.status(500).json({ error: 'EPUB reader not initialized' });
    }

    try {
        const chapterId = req.params.id;
        const content = await epubReader.getChapterContent(chapterId);
        const cleanContent = epubReader.cleanHtmlContent(content);

        res.json({
            id: chapterId,
            content: cleanContent,
            rawContent: content
        });
    } catch (error) {
        res.status(404).json({
            error: 'Chapter not found or could not be read',
            message: error.message
        });
    }
});

// Serve the main HTML page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, async () => {
    console.log(`EPUB Speaker server running on http://localhost:${PORT}`);
    await initializeEpub();
});

module.exports = app;
