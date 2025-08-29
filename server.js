/**
 * EPUB Speaker Server
 * 
 * A Node.js/Express server that provides:
 * - EPUB file management and parsing
 * - Text-to-speech proxy with caching
 * - RESTful API for React frontend
 * - Static file serving for production builds
 */

// Load environment variables
require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const cors = require('cors');
const { processForTTSAndHighlighting } = require('./shared/textProcessing.js');
const multer = require('multer');
const fileUpload = require('express-fileupload');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const log = require('loglevel');
const EpubReader = require('./epub-reader');
const apicache = require('apicache');
const { validateFilename, createSecurePath, validateFileAccess } = require('./utils/security');
const { sanitizeEpubHtml, analyzeHtmlSecurity } = require('./utils/htmlSanitizer');
const { 
    validateFileUpload, 
    quarantineFile, 
    MAX_FILE_SIZE, 
    ALLOWED_FILE_EXTENSIONS 
} = require('./utils/fileUploadSecurity');

// =============================================================================
// CONFIGURATION
// =============================================================================

// Server configuration
const PORT = process.env.PORT || 3001;
const TTS_SERVICE_URL = process.env.TTS_SERVICE_URL || 'http://localhost:5005';
const TTS_CACHE_DURATION = '15 minutes';
const DATA_DIR = path.join(__dirname, 'data');
const CLIENT_BUILD_DIR = path.join(__dirname, 'client/build');

// Set default log level to INFO to reduce noise, can be changed via log.setLevel()
log.setLevel('INFO');

const app = express();

// Enable CORS for React development
app.use(cors());
app.use(express.json());

// Serve static files from React build only in production
if (process.env.NODE_ENV === 'production') {
    log.info('Production mode: serving static files from client/build');
    app.use(express.static(CLIENT_BUILD_DIR));
} else {
    log.info('Development mode: static file serving disabled (use Vite dev server on port 3000)');
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Parse author name for directory structure (Last_First_Middle format)
 * @param {string} author - Author name in various formats
 * @returns {string} Formatted author directory name
 */
function parseAuthorForDirectory(author) {
    if (!author || author === 'Unknown') {
        return 'Unknown';
    }

    if (author.includes(',')) {
        // Already in "Last, First [Middle]" format
        const parts = author.split(',').map(p => p.trim());
        const lastName = parts[0];
        const restOfName = parts[1].replace(/\s+/g, '_');
        return `${lastName}_${restOfName}`;
    } else {
        // Assume "First [Middle] Last" format, convert to "Last_First_Middle"
        const parts = author.trim().split(/\s+/);
        if (parts.length >= 2) {
            const lastName = parts[parts.length - 1];
            const otherNames = parts.slice(0, -1).join('_');
            return `${lastName}_${otherNames}`;
        } else {
            // Single name
            return author.replace(/\s+/g, '_');
        }
    }
}

/**
 * Recursively read directory and find EPUB files
 * @param {string} dir - Directory to scan
 * @param {Array} epubFiles - Array to collect EPUB file metadata
 */
async function readDirectoryRecursive(dir, epubFiles) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            await readDirectoryRecursive(fullPath, epubFiles);
        } else if (file.toLowerCase().endsWith('.epub')) {
            const reader = await getEpubReader(fullPath);
            const metadata = reader.getMetadata();
            epubFiles.push({
                filename: path.relative(DATA_DIR, fullPath),
                title: metadata.title,
                author: metadata.creator,
                date_uploaded: stat.ctime
            });
        }
    }
}

/**
 * Initialize EPUB reader for a specific book
 * @param {string} filePath - Path to EPUB file
 * @returns {Promise<EpubReader>} Initialized EPUB reader
 */
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
        log.error(`Failed to initialize EPUB reader for ${filePath}:`, error);
        throw error;
    }
}

/**
 * Clean up empty directories after file deletion
 * @param {string} dirPath - Directory path to check and potentially delete
 */
function cleanupEmptyDirectory(dirPath) {
    // Only delete if it's a subdirectory of data/ (not data/ itself)
    if (dirPath !== DATA_DIR) {
        try {
            const files = fs.readdirSync(dirPath);
            if (files.length === 0) {
                fs.rmdirSync(dirPath);
                log.info(`Deleted empty directory: ${path.basename(dirPath)}`);
            }
        } catch (dirError) {
            log.warn('Could not check/delete directory:', dirError.message);
        }
    }
}

// =============================================================================
// HEALTH CHECK
// =============================================================================

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// =============================================================================
// BOOK MANAGEMENT ROUTES
// =============================================================================

// Cache configuration for TTS endpoint - only cache successful responses
const ttsCacheOptions = {
    duration: TTS_CACHE_DURATION,
    statusCodes: {
        include: [200] // Only cache successful responses
    },
    headers: {
        'X-TTS-Cache': 'HIT'
    }
};

// Rate limiting configuration for file uploads
const uploadRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 uploads per window
    message: {
        error: 'Too many upload attempts. Please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Custom key generator to include user agent for better tracking
    keyGenerator: (req) => {
        return ipKeyGenerator(req) + ':' + (req.get('User-Agent') || '').substring(0, 50);
    },
    // Skip successful uploads from the rate limit count
    skipSuccessfulRequests: true,
    // Skip failed uploads to prevent lockout from legitimate errors
    skipFailedRequests: false
});

// File upload middleware configuration
const fileUploadConfig = {
    limits: {
        fileSize: MAX_FILE_SIZE,
        files: 1 // Only allow single file uploads
    },
    abortOnLimit: true,
    responseOnLimit: 'File too large',
    useTempFiles: true,
    tempFileDir: '/tmp/',
    safeFileNames: true,
    preserveExtension: 4, // Preserve up to 4 characters of extension
    debug: process.env.NODE_ENV === 'development'
};

// Legacy multer support (keeping for now, may be used elsewhere)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Configure apicache for TTS responses
const cache = apicache.middleware;

// Configure apicache with custom key generation for TTS requests
apicache.options({
    appendKey: (req, res) => {
        // Only customize cache key for TTS requests
        if (req.url === '/api/tts/speech' && req.method === 'POST') {
            const { model, input, voice, response_format, speed } = req.body;
            const keyData = {
                model: model || 'kokoro',
                input: input || '',
                voice: voice || '',
                response_format: response_format || 'wav',
                speed: speed || 1.0
            };
            return JSON.stringify(keyData);
        }
        
        // For all other requests, no additional key
        return '';
    }
});

// Store active EPUB readers
const epubReaders = new Map();

// =============================================================================
// MIDDLEWARE SETUP
// =============================================================================


/**
 * Get list of EPUB files with metadata
 */
app.get('/api/books', async (req, res) => {
    try {
        const epubFiles = [];
        await readDirectoryRecursive(DATA_DIR, epubFiles);
        res.json(epubFiles);
    } catch (error) {
        log.error('Error reading data directory:', error);
        res.status(500).json({ error: 'Failed to read books directory' });
    }
});

/**
 * Upload a new EPUB file with comprehensive security validation
 */
app.post('/api/books', uploadRateLimit, fileUpload(fileUploadConfig), async (req, res) => {
    const startTime = Date.now();
    let tempFilePath = null;
    
    try {
        // Check if file was uploaded
        if (!req.files || !req.files.file) {
            return res.status(400).json({ 
                error: 'No file uploaded',
                allowedTypes: ALLOWED_FILE_EXTENSIONS,
                maxSize: `${MAX_FILE_SIZE / (1024*1024)}MB`
            });
        }

        const uploadedFile = req.files.file;
        tempFilePath = uploadedFile.tempFilePath;
        
        // Security logging
        log.info('File upload attempt:', {
            originalName: uploadedFile.name,
            size: uploadedFile.size,
            mimetype: uploadedFile.mimetype,
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });

        // Read file buffer for validation
        let fileBuffer;
        if (uploadedFile.data) {
            fileBuffer = uploadedFile.data;
        } else if (tempFilePath) {
            fileBuffer = await fsPromises.readFile(tempFilePath);
        } else {
            return res.status(400).json({ error: 'Could not read uploaded file' });
        }

        // SECURITY: Comprehensive file validation
        const validation = await validateFileUpload(fileBuffer, uploadedFile.name, {
            dataDir: DATA_DIR,
            userId: 'anonymous', // TODO: Use actual user ID when auth is implemented
            strictMode: process.env.NODE_ENV === 'production'
        });

        // Handle validation failures
        if (!validation.isValid) {
            log.warn('File upload rejected:', {
                originalName: uploadedFile.name,
                errors: validation.errors,
                warnings: validation.warnings,
                ip: req.ip
            });

            return res.status(400).json({
                error: 'File validation failed',
                details: validation.errors,
                allowedTypes: ALLOWED_FILE_EXTENSIONS,
                maxSize: `${MAX_FILE_SIZE / (1024*1024)}MB`
            });
        }

        // Handle suspicious files requiring quarantine
        if (validation.shouldQuarantine) {
            const quarantinePath = await quarantineFile(
                fileBuffer, 
                uploadedFile.name, 
                validation.warnings
            );
            
            log.warn('File quarantined for manual review:', {
                originalName: uploadedFile.name,
                quarantinePath: quarantinePath,
                warnings: validation.warnings,
                ip: req.ip
            });

            return res.status(202).json({
                message: 'File quarantined for security review',
                warnings: validation.warnings,
                supportMessage: 'Please contact support if you believe this is an error'
            });
        }

        // Parse the EPUB to get metadata (with additional error handling)
        let reader, metadata;
        try {
            reader = new EpubReader(fileBuffer, true);
            await reader.initialize();
            await reader.improveChapterTitles();
            metadata = reader.getMetadata();
        } catch (epubError) {
            log.error('EPUB parsing failed:', {
                originalName: uploadedFile.name,
                error: epubError.message,
                fileHash: validation.fileHash
            });

            return res.status(400).json({
                error: 'Invalid EPUB file - could not parse book content',
                details: 'The file appears to be corrupted or not a valid EPUB format'
            });
        }

        // Create secure storage path
        const author = metadata.creator || 'Unknown';
        const authorDir = parseAuthorForDirectory(author);
        const dirPath = path.join(DATA_DIR, authorDir);

        // Ensure directory exists with proper permissions
        await fsPromises.mkdir(dirPath, { recursive: true });

        // Use secure filename to prevent conflicts and attacks
        const secureFileName = validation.secureFilename;
        const finalFilePath = path.join(dirPath, secureFileName);

        // Check if file would overwrite existing file
        if (await fsPromises.access(finalFilePath).then(() => true).catch(() => false)) {
            log.warn('File would overwrite existing file:', {
                originalName: uploadedFile.name,
                finalPath: finalFilePath
            });
            
            return res.status(409).json({
                error: 'A file with this content already exists',
                suggestion: 'Please check if this book is already in your library'
            });
        }

        // Write file securely
        await fsPromises.writeFile(finalFilePath, fileBuffer);

        // Success logging
        const processingTime = Date.now() - startTime;
        log.info('File upload successful:', {
            originalName: uploadedFile.name,
            secureFileName: secureFileName,
            fileHash: validation.fileHash,
            title: metadata.title,
            author: author,
            size: uploadedFile.size,
            processingTime: `${processingTime}ms`,
            warnings: validation.warnings.length > 0 ? validation.warnings : undefined
        });

        // Return success response with metadata
        const response = {
            message: 'File uploaded successfully',
            book: {
                title: metadata.title,
                author: author,
                filename: path.join(authorDir, secureFileName),
                size: uploadedFile.size,
                uploadDate: new Date().toISOString()
            }
        };

        // Include warnings if any (but file was still accepted)
        if (validation.warnings.length > 0) {
            response.warnings = validation.warnings;
        }

        res.status(201).json(response);

    } catch (error) {
        // Security incident logging for unexpected errors
        log.error('File upload error:', {
            originalName: req.files?.file?.name || 'unknown',
            error: error.message,
            stack: error.stack,
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });

        res.status(500).json({
            error: 'Upload processing failed',
            message: 'An error occurred while processing your upload'
        });
    } finally {
        // Cleanup temporary files
        if (tempFilePath) {
            try {
                await fsPromises.unlink(tempFilePath);
            } catch (cleanupError) {
                log.warn('Failed to cleanup temp file:', cleanupError.message);
            }
        }
    }
});

/**
 * Delete an EPUB file
 */
app.delete('/api/books/:filename', (req, res) => {
    try {
        // Validate filename to prevent path traversal attacks
        const filename = validateFilename(req.params.filename, DATA_DIR);
        const filePath = createSecurePath(DATA_DIR, filename);

        // Double-check file access is safe
        if (!validateFileAccess(filePath, DATA_DIR)) {
            return res.status(404).json({ error: 'File not found' });
        }

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            epubReaders.delete(filename);

            // Check if the parent directory is now empty and delete it if so
            const parentDir = path.dirname(filePath);
            cleanupEmptyDirectory(parentDir);

            res.status(200).json({ message: 'File deleted successfully' });
        } else {
            res.status(404).json({ error: 'File not found' });
        }
    } catch (error) {
        // Log security-relevant errors
        if (error.message.includes('traversal') || error.message.includes('injection')) {
            log.warn('Security violation attempt:', {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                filename: req.params.filename,
                error: error.message
            });
            return res.status(400).json({ error: 'Invalid filename' });
        }
        
        log.error('Error deleting file:', error);
        res.status(500).json({ error: 'Failed to delete file' });
    }
});



/**
 * Get book metadata
 */
app.get('/api/books/:filename/metadata', async (req, res) => {
    try {
        // Validate filename to prevent path traversal attacks
        const filename = validateFilename(req.params.filename, DATA_DIR);
        const filePath = createSecurePath(DATA_DIR, filename);
        
        // Verify file access is safe
        if (!validateFileAccess(filePath, DATA_DIR)) {
            return res.status(404).json({ error: 'Book not found' });
        }
        
        const reader = await getEpubReader(filePath);
        const metadata = reader.getMetadata();
        res.json(metadata);
    } catch (error) {
        // Handle security violations
        if (error.message.includes('traversal') || error.message.includes('injection')) {
            log.warn('Security violation attempt:', {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                filename: req.params.filename,
                error: error.message
            });
            return res.status(400).json({ error: 'Invalid filename' });
        }
        
        res.status(500).json({
            error: 'Failed to get book metadata'
        });
    }
});

/**
 * Get chapter list for a specific book
 */
app.get('/api/books/:filename/chapters', async (req, res) => {
    try {
        // Validate filename to prevent path traversal attacks
        const filename = validateFilename(req.params.filename, DATA_DIR);
        const filePath = createSecurePath(DATA_DIR, filename);
        
        // Verify file access is safe
        if (!validateFileAccess(filePath, DATA_DIR)) {
            return res.status(404).json({ error: 'Book not found' });
        }
        
        const reader = await getEpubReader(filePath);
        const chapters = reader.getChapterList();
        res.json(chapters);
    } catch (error) {
        // Handle security violations
        if (error.message.includes('traversal') || error.message.includes('injection')) {
            log.warn('Security violation attempt:', {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                filename: req.params.filename,
                error: error.message
            });
            return res.status(400).json({ error: 'Invalid filename' });
        }
        
        res.status(500).json({
            error: 'Failed to get chapters'
        });
    }
});

// addSentenceSpans function now imported from shared/textProcessing.js

/**
 * Get specific chapter content
 */
app.get('/api/books/:filename/chapters/:id', async (req, res) => {
    try {
        // Validate filename to prevent path traversal attacks
        const filename = validateFilename(req.params.filename, DATA_DIR);
        const chapterId = req.params.id;
        const filePath = createSecurePath(DATA_DIR, filename);
        
        // Verify file access is safe
        if (!validateFileAccess(filePath, DATA_DIR)) {
            return res.status(404).json({ error: 'Book not found' });
        }
        
        const reader = await getEpubReader(filePath);

        const rawContent = await reader.getChapterContent(chapterId);
        const cleanTextContent = reader.cleanHtmlContent(rawContent);

        // Process hyperlinks for React routing by passing the book filename
        let htmlContent = reader.getRawHtmlContent(rawContent, filename);
        
        // SECURITY: Sanitize HTML content to prevent XSS attacks BEFORE adding spans
        const securityAnalysis = analyzeHtmlSecurity(htmlContent);
        if (!securityAnalysis.safe) {
            log.warn('Potentially unsafe HTML content detected in EPUB:', {
                book: filename,
                chapter: chapterId,
                warnings: securityAnalysis.warnings.map(w => `${w.type} (${w.count})`),
                riskLevel: securityAnalysis.riskLevel
            });
        }
        
        // Sanitize the HTML content first to prevent spans from being removed
        htmlContent = sanitizeEpubHtml(htmlContent);
        
        // Process text for both TTS and highlighting in single pass
        const processedResult = processForTTSAndHighlighting(htmlContent, cleanTextContent);

        res.json({
            id: chapterId,
            content: processedResult.htmlContent,  // HTML with sentence spans for highlighting
            textContent: cleanTextContent,  // Original clean text (for reference)
            ttsSentences: processedResult.pronounceableSentences,  // ONLY pronounceable sentences for TTS
            sentenceCount: processedResult.pronounceableSentences.length,  // Count for client
            rawContent: rawContent  // Original HTML content (for debugging only)
        });
    } catch (error) {
        // Handle security violations
        if (error.message.includes('traversal') || error.message.includes('injection')) {
            log.warn('Security violation attempt:', {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                filename: req.params.filename,
                error: error.message
            });
            return res.status(400).json({ error: 'Invalid filename' });
        }
        
        res.status(404).json({
            error: 'Chapter not found or could not be read'
        });
    }
});

// =============================================================================
// TTS (TEXT-TO-SPEECH) ROUTES
// =============================================================================

/**
 * Get available TTS voices
 */
app.get('/api/tts/voices', async (req, res) => {
    try {
        const { default: fetch } = await import('node-fetch');
        const ttsResponse = await fetch(`${TTS_SERVICE_URL}/v1/audio/voices`);

        if (!ttsResponse.ok) {
            throw new Error(`TTS server error: ${ttsResponse.status} - ${ttsResponse.statusText}`);
        }

        const voices = await ttsResponse.json();
        res.json(voices);
    } catch (error) {
        log.error('Error fetching voices:', error);
        res.status(500).json({ error: 'Failed to fetch voices from TTS service' });
    }
});

/**
 * Proxy endpoint for TTS requests with caching
 */
app.post('/api/tts/speech', cache(ttsCacheOptions), async (req, res) => {
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
        const ttsResponse = await fetch(`${TTS_SERVICE_URL}/v1/audio/speech`, {
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
            'Content-Disposition': 'attachment; filename="speech.wav"',
            'X-TTS-Cache': res.get('X-TTS-Cache') || 'MISS'
        });

        // Stream the audio response
        ttsResponse.body.pipe(res);

    } catch (error) {
        log.error('TTS proxy error:', error);
        res.status(500).json({
            error: 'TTS service unavailable',
            message: error.message
        });
    }
});

/**
 * Get TTS cache statistics
 */
app.get('/api/tts/cache/stats', (req, res) => {
    try {
        const stats = apicache.getPerformance();
        res.json(stats);
    } catch (error) {
        log.error('Error getting cache stats:', error);
        res.status(500).json({ error: 'Failed to get cache statistics' });
    }
});

/**
 * Clear TTS cache
 */
app.delete('/api/tts/cache', (req, res) => {
    try {
        apicache.clear();
        res.json({ message: 'TTS cache cleared successfully' });
    } catch (error) {
        log.error('Error clearing cache:', error);
        res.status(500).json({ error: 'Failed to clear cache' });
    }
});

// =============================================================================
// STATIC FILE SERVING
// =============================================================================

/**
 * Serve React app for all other routes (catch-all) - only in production
 */
app.get('*', (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        res.sendFile(path.join(CLIENT_BUILD_DIR, 'index.html'));
    } else {
        res.status(404).json({ 
            error: 'Not Found', 
            message: 'In development mode, please use the Vite dev server on port 3000',
            developmentUrl: 'http://localhost:3000'
        });
    }
});

// =============================================================================
// SERVER STARTUP
// =============================================================================

/**
 * Start the Express server
 */
app.listen(PORT, () => {
    log.info(`🚀 EPUB Speaker server running on http://localhost:${PORT}`);
    
    if (process.env.NODE_ENV === 'production') {
        log.info(`📦 Production mode: Full-stack app available at http://localhost:${PORT}`);
    } else {
        log.info(`🔧 Development mode: API server only`);
        log.info(`🌐 For frontend, use: http://localhost:3000 (Vite dev server)`);
        log.info(`🚫 Port ${PORT} serves API only - frontend requests will redirect to port 3000`);
    }
    
    log.info(`TTS Service URL: ${TTS_SERVICE_URL}`);
    log.info(`TTS Cache enabled with ${TTS_CACHE_DURATION} timeout (apicache)`);
    log.info('Available EPUB files in data directory:');
    
    try {
        const files = fs.readdirSync(DATA_DIR);
        const epubFiles = files.filter(file => file.toLowerCase().endsWith('.epub'));
        if (epubFiles.length === 0) {
            log.info('  - No EPUB files found');
        } else {
            epubFiles.forEach(file => log.info(`  - ${file}`));
        }
    } catch (error) {
        log.error('Error reading data directory:', error);
    }
});

module.exports = app;
