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
const crypto = require('crypto');
const cors = require('cors');
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const { processForTTSAndHighlighting, splitIntoPronounceable } = require('./shared/textProcessing.js');
const multer = require('multer');
const fileUpload = require('express-fileupload');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const log = require('loglevel');
const EpubReader = require('./epub-reader');
const { createClient } = require('redis');
const { createAuthStore } = require('./utils/authStore');
const {
    normalizeEmail,
    validateEmail,
    validatePassword,
    hashPassword,
    verifyPassword
} = require('./utils/auth');
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
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const TTS_CACHE_TTL_SECONDS = Number.parseInt(process.env.TTS_CACHE_TTL_SECONDS || '86400', 10);
const TTS_LOCK_TTL_SECONDS = Number.parseInt(process.env.TTS_LOCK_TTL_SECONDS || '60', 10);
const TTS_PREFETCH_COUNT = Number.parseInt(process.env.TTS_PREFETCH_COUNT || '15', 10);
const DATA_DIR = path.join(__dirname, 'data');
const CLIENT_BUILD_DIR = path.join(__dirname, 'client/build');
const AUTH_DB_PATH = process.env.AUTH_DB_PATH || path.join(DATA_DIR, 'auth.sqlite');
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'ebook_speaker.sid';
const SESSION_MAX_AGE_MS = Number.parseInt(process.env.SESSION_MAX_AGE_MS || String(8 * 60 * 60 * 1000), 10);
const TRUST_PROXY = process.env.TRUST_PROXY === 'true' || process.env.NODE_ENV === 'production';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ADMIN_ROLE = process.env.ADMIN_ROLE || 'admin';

// Set default log level to INFO to reduce noise, can be changed via log.setLevel()
log.setLevel('INFO');

let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret && process.env.NODE_ENV !== 'production') {
    sessionSecret = crypto.randomBytes(32).toString('hex');
    log.warn('SESSION_SECRET not set; using a random secret for this run');
}

if (!sessionSecret) {
    log.error('SESSION_SECRET must be set in production');
    process.exit(1);
}

const SESSION_SECRET = sessionSecret;

const app = express();

if (TRUST_PROXY) {
    app.set('trust proxy', 1);
}

const allowedOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.length === 0) {
            callback(null, true);
            return;
        }

        if (allowedOrigins.includes(origin)) {
            callback(null, true);
            return;
        }

        callback(new Error('Not allowed by CORS'));
    },
    credentials: true
}));
app.use(express.json());

const authStore = createAuthStore({ dbPath: AUTH_DB_PATH, log });

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
const QUEUE_BOOK_SET_KEY = 'queue:tts:books';
const PREFETCH_QUEUE_PREFIX = 'queue:tts:prefetch:';
const CHAPTER_QUEUE_PREFIX = 'queue:tts:chapter:';
const TTS_CACHE_KEY_PREFIX = 'tts:';
const TTS_LOCK_KEY_PREFIX = 'lock:tts:';
const LOCK_RELEASE_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
else
    return 0
end
`;

let redisReady = false;
let ttsQueueWorkerStarted = false;
const redisClient = createClient({ url: REDIS_URL });

redisClient.on('error', (error) => {
    redisReady = false;
    log.error('Redis error:', error);
});

redisClient.on('ready', () => {
    redisReady = true;
    log.info(`Redis connected: ${REDIS_URL}`);
    startTtsQueueWorker();
});

redisClient.connect().catch((error) => {
    redisReady = false;
    log.error('Failed to connect to Redis:', error);
});

const sessionStore = new RedisStore({
    client: redisClient,
    prefix: 'session:'
});

app.use(session({
    name: SESSION_COOKIE_NAME,
    store: sessionStore,
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    proxy: TRUST_PROXY,
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: SESSION_MAX_AGE_MS
    }
}));

app.use((req, res, next) => {
    if (req.session && req.session.user) {
        req.user = req.session.user;
    }

    next();
});

function encodeBookId(bookId) {
    return encodeURIComponent(bookId || 'unknown');
}

function getPrefetchQueueKey(bookId) {
    return `${PREFETCH_QUEUE_PREFIX}${encodeBookId(bookId)}`;
}

function getChapterQueueKey(bookId) {
    return `${CHAPTER_QUEUE_PREFIX}${encodeBookId(bookId)}`;
}

function createSentenceHash(sentence) {
    return crypto.createHash('sha256').update(sentence, 'utf8').digest('hex');
}

function getTtsCacheKey({ bookId, model, voice, speed, sentence }) {
    const normalizedSentence = (sentence || '').trim();
    const sentenceHash = createSentenceHash(normalizedSentence);
    const normalizedModel = model || 'supertonic';
    const normalizedVoice = voice || 'default';
    const normalizedSpeed = typeof speed === 'number' ? speed.toFixed(2) : String(speed || '1.00');
    return `${TTS_CACHE_KEY_PREFIX}${encodeBookId(bookId)}:${normalizedModel}:${normalizedVoice}:${normalizedSpeed}:${sentenceHash}`;
}

function getTtsLockKey({ bookId, model, voice, speed, sentence }) {
    const cacheKey = getTtsCacheKey({ bookId, model, voice, speed, sentence });
    return `${TTS_LOCK_KEY_PREFIX}${cacheKey.slice(TTS_CACHE_KEY_PREFIX.length)}`;
}

function redisSupportsBuffers() {
    return typeof redisClient.getBuffer === 'function';
}

async function getCachedAudio(key) {
    if (!redisReady) {
        return null;
    }

    if (redisSupportsBuffers()) {
        return await redisClient.getBuffer(key);
    }

    const value = await redisClient.get(key);
    if (!value) {
        return null;
    }

    return Buffer.from(value, 'base64');
}

async function setCachedAudio(key, audioBuffer) {
    if (!redisReady) {
        return;
    }

    if (redisSupportsBuffers()) {
        await redisClient.set(key, audioBuffer, { EX: TTS_CACHE_TTL_SECONDS });
        return;
    }

    await redisClient.set(key, audioBuffer.toString('base64'), { EX: TTS_CACHE_TTL_SECONDS });
}

async function releaseLock(lockKey, token) {
    if (!redisReady) {
        return;
    }

    try {
        await redisClient.eval(LOCK_RELEASE_SCRIPT, {
            keys: [lockKey],
            arguments: [token]
        });
    } catch (error) {
        log.warn('Failed to release Redis lock:', error);
    }
}

function getSessionUser(user) {
    return {
        id: user.id,
        email: user.email,
        role: user.role
    };
}

function regenerateSession(req) {
    return new Promise((resolve, reject) => {
        req.session.regenerate((error) => {
            if (error) {
                reject(error);
                return;
            }

            resolve();
        });
    });
}

function destroySession(req) {
    return new Promise((resolve, reject) => {
        req.session.destroy((error) => {
            if (error) {
                reject(error);
                return;
            }

            resolve();
        });
    });
}

async function seedAdminUser() {
    if (!ADMIN_EMAIL && !ADMIN_PASSWORD) {
        log.warn('Admin user seed skipped: ADMIN_EMAIL and ADMIN_PASSWORD not set');
        return;
    }

    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
        log.error('Admin user seed failed: ADMIN_EMAIL and ADMIN_PASSWORD must both be set');
        return;
    }

    const normalizedEmail = normalizeEmail(ADMIN_EMAIL);
    if (!validateEmail(normalizedEmail)) {
        log.error('Admin user seed failed: ADMIN_EMAIL is not a valid email address');
        return;
    }

    const passwordCheck = validatePassword(ADMIN_PASSWORD);
    if (!passwordCheck.isValid) {
        log.error('Admin user seed failed: ADMIN_PASSWORD does not meet requirements');
        passwordCheck.issues.forEach((issue) => log.error(`Password issue: ${issue}`));
        return;
    }

    try {
        const passwordHash = await hashPassword(ADMIN_PASSWORD);
        const result = await authStore.ensureUser({
            email: normalizedEmail,
            passwordHash,
            role: ADMIN_ROLE
        });

        if (result.created) {
            log.info(`Seeded admin user: ${normalizedEmail}`);
        } else {
            log.info(`Admin user already exists: ${normalizedEmail}`);
        }
    } catch (error) {
        log.error('Failed to seed admin user:', error);
    }
}

function getPronounceableSentences(cleanTextContent) {
    return splitIntoPronounceable(cleanTextContent)
        .filter((item) => item.pronounceable)
        .map((item) => item.text);
}

async function getChapterSentences(reader, chapterId) {
    const rawContent = await reader.getChapterContent(chapterId);
    const cleanTextContent = reader.cleanHtmlContent(rawContent);
    return getPronounceableSentences(cleanTextContent);
}

async function enqueueSentences(queueKey, payloads) {
    if (!redisReady || payloads.length === 0) {
        return 0;
    }

    await redisClient.rPush(queueKey, payloads);
    return payloads.length;
}

async function clearBookQueues(bookId) {
    if (!redisReady) {
        return;
    }

    const encodedBookId = encodeBookId(bookId);
    await redisClient.del(`${PREFETCH_QUEUE_PREFIX}${encodedBookId}`, `${CHAPTER_QUEUE_PREFIX}${encodedBookId}`);
    await redisClient.sRem(QUEUE_BOOK_SET_KEY, encodedBookId);
}

async function markBookQueued(bookId) {
    if (!redisReady) {
        return;
    }

    await redisClient.sAdd(QUEUE_BOOK_SET_KEY, encodeBookId(bookId));
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processQueueItem(job) {
    if (!job || !job.sentence) {
        return;
    }

    const cacheKey = getTtsCacheKey(job);
    const existing = await getCachedAudio(cacheKey);
    if (existing) {
        return;
    }

    const lockKey = getTtsLockKey(job);
    const token = crypto.randomUUID();
    const lockResult = await redisClient.set(lockKey, token, { NX: true, EX: TTS_LOCK_TTL_SECONDS });
    if (!lockResult) {
        return;
    }

    try {
        const ttsResponse = await fetch(`${TTS_SERVICE_URL}/v1/audio/speech`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: job.model || 'supertonic',
                input: job.sentence,
                voice: job.voice,
                response_format: 'wav',
                speed: job.speed || 1.0
            })
        });

        if (!ttsResponse.ok) {
            throw new Error(`TTS server error: ${ttsResponse.status} - ${ttsResponse.statusText}`);
        }

        const audioBuffer = Buffer.from(await ttsResponse.arrayBuffer());
        if (audioBuffer.length === 0) {
            throw new Error('TTS server returned empty audio');
        }

        await setCachedAudio(cacheKey, audioBuffer);
    } catch (error) {
        log.error('TTS queue job failed:', error);
    } finally {
        await releaseLock(lockKey, token);
    }
}

async function startTtsQueueWorker() {
    if (ttsQueueWorkerStarted || !redisReady) {
        return;
    }

    ttsQueueWorkerStarted = true;
    log.info('Starting Redis-backed TTS queue worker');

    while (true) {
        try {
            const activeBooks = await redisClient.sMembers(QUEUE_BOOK_SET_KEY);
            if (!activeBooks.length) {
                await sleep(500);
                continue;
            }

            const prefetchKeys = activeBooks.map((bookId) => `${PREFETCH_QUEUE_PREFIX}${bookId}`);
            const chapterKeys = activeBooks.map((bookId) => `${CHAPTER_QUEUE_PREFIX}${bookId}`);
            const queueKeys = [...prefetchKeys, ...chapterKeys];

            const result = await redisClient.blPop(queueKeys, 1);
            if (!result) {
                continue;
            }

            const payload = Array.isArray(result) ? result[1] : result.element;
            if (!payload) {
                continue;
            }
            const job = JSON.parse(payload);
            await processQueueItem(job);
        } catch (error) {
            log.error('TTS queue worker error:', error);
            await sleep(500);
        }
    }
}

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

const loginRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: {
        error: 'Too many login attempts. Please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        return ipKeyGenerator(req) + ':' + (req.get('User-Agent') || '').substring(0, 50);
    },
    skipSuccessfulRequests: true,
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

// Store active EPUB readers
const epubReaders = new Map();

// =============================================================================
// MIDDLEWARE SETUP
// =============================================================================

function requireAuth(req, res, next) {
    if (!req.session || !req.session.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
    }

    next();
}

app.post('/api/auth/login', loginRateLimit, async (req, res) => {
    const { email, password } = req.body || {};
    const normalizedEmail = normalizeEmail(email);

    if (!validateEmail(normalizedEmail) || typeof password !== 'string') {
        return res.status(400).json({ error: 'Invalid email or password' });
    }

    try {
        const user = await authStore.getUserByEmail(normalizedEmail);
        if (!user || !user.is_active) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const passwordMatches = await verifyPassword(password, user.password_hash);
        if (!passwordMatches) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        await regenerateSession(req);
        req.session.user = getSessionUser(user);
        await authStore.updateLastLogin(user.id);

        return res.json({ user: req.session.user });
    } catch (error) {
        log.error('Login failed:', error);
        return res.status(500).json({ error: 'Login failed' });
    }
});

app.post('/api/auth/logout', async (req, res) => {
    try {
        if (req.session) {
            await destroySession(req);
        }

        res.clearCookie(SESSION_COOKIE_NAME);
        return res.json({ ok: true });
    } catch (error) {
        log.error('Logout failed:', error);
        return res.status(500).json({ error: 'Logout failed' });
    }
});

app.get('/api/auth/me', (req, res) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    return res.json({ user: req.session.user });
});

app.use('/api', (req, res, next) => {
    if (req.path.startsWith('/auth')) {
        next();
        return;
    }

    requireAuth(req, res, next);
});


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
        // When useTempFiles is true, prioritize reading from temp file even if data buffer exists (but may be empty)
        if (tempFilePath) {
            try {
                fileBuffer = await fsPromises.readFile(tempFilePath);
            } catch (readError) {
                return res.status(400).json({ error: 'Could not read uploaded file from temp location' });
            }
        } else if (uploadedFile.data && uploadedFile.data.length > 0) {
            fileBuffer = uploadedFile.data;
        } else {
            return res.status(400).json({ error: 'Could not read uploaded file' });
        }

        // SECURITY: Comprehensive file validation
        const validation = await validateFileUpload(fileBuffer, uploadedFile.name, {
            dataDir: DATA_DIR,
            userId: req.user ? String(req.user.id) : 'anonymous',
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
        const ttsUrl = new URL(`${TTS_SERVICE_URL}/v1/audio/voices`);
        if (typeof req.query.model === 'string' && req.query.model) {
            ttsUrl.searchParams.set('model', req.query.model);
        }

        const ttsResponse = await fetch(ttsUrl);

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
 * Enqueue sentences for current and next chapter (drops existing queues for this book)
 */
app.post('/api/tts/queue/chapter', async (req, res) => {
    try {
        if (!redisReady) {
            return res.status(503).json({ error: 'Redis is unavailable' });
        }

        const { bookId, chapterId, model, voice, speed } = req.body;
        if (!bookId || !chapterId || !voice) {
            return res.status(400).json({ error: 'Missing required fields: bookId, chapterId, and voice are required' });
        }

        const filename = validateFilename(bookId, DATA_DIR);
        const filePath = createSecurePath(DATA_DIR, filename);

        if (!validateFileAccess(filePath, DATA_DIR)) {
            return res.status(404).json({ error: 'Book not found' });
        }

        const reader = await getEpubReader(filePath);
        const chapters = reader.getChapterList();
        let currentIndex = chapters.findIndex((chapter) => chapter.id === chapterId);
        if (currentIndex === -1) {
            currentIndex = chapters.findIndex((chapter) => String(chapter.order) === String(chapterId));
        }

        if (currentIndex === -1) {
            return res.status(404).json({ error: 'Chapter not found' });
        }

        await clearBookQueues(bookId);

        const currentChapter = chapters[currentIndex];
        const nextChapter = chapters[currentIndex + 1] || null;
        const basePayload = {
            bookId,
            model: model || 'supertonic',
            voice,
            speed: speed || 1.0
        };

        const currentSentences = await getChapterSentences(reader, currentChapter.id);
        const currentPayloads = currentSentences.map((sentence) => JSON.stringify({
            ...basePayload,
            chapterId: currentChapter.id,
            sentence
        }));

        let nextPayloads = [];
        if (nextChapter) {
            const nextSentences = await getChapterSentences(reader, nextChapter.id);
            nextPayloads = nextSentences.map((sentence) => JSON.stringify({
                ...basePayload,
                chapterId: nextChapter.id,
                sentence
            }));
        }

        const queueKey = getChapterQueueKey(bookId);
        const queuedCount = await enqueueSentences(queueKey, [...currentPayloads, ...nextPayloads]);
        await markBookQueued(bookId);

        res.json({
            queued: queuedCount,
            currentChapterSentences: currentPayloads.length,
            nextChapterSentences: nextPayloads.length,
            nextChapterId: nextChapter ? nextChapter.id : null
        });
    } catch (error) {
        log.error('Error enqueueing chapter TTS jobs:', error);
        res.status(500).json({ error: 'Failed to enqueue chapter sentences' });
    }
});

/**
 * Enqueue prefetch sentences for current chapter (highest priority)
 */
app.post('/api/tts/queue/prefetch', async (req, res) => {
    try {
        if (!redisReady) {
            return res.status(503).json({ error: 'Redis is unavailable' });
        }

        const { bookId, chapterId, startIndex, model, voice, speed } = req.body;
        if (!bookId || !chapterId || !voice) {
            return res.status(400).json({ error: 'Missing required fields: bookId, chapterId, and voice are required' });
        }

        const filename = validateFilename(bookId, DATA_DIR);
        const filePath = createSecurePath(DATA_DIR, filename);

        if (!validateFileAccess(filePath, DATA_DIR)) {
            return res.status(404).json({ error: 'Book not found' });
        }

        const reader = await getEpubReader(filePath);
        const sentences = await getChapterSentences(reader, chapterId);
        const normalizedStartIndex = Number.isInteger(startIndex) ? startIndex : Number.parseInt(startIndex || '0', 10);
        const safeStartIndex = Number.isNaN(normalizedStartIndex) ? -1 : normalizedStartIndex;
        const sliceStart = Math.max(0, safeStartIndex + 1);
        const sliceEnd = sliceStart + TTS_PREFETCH_COUNT;
        const slice = sentences.slice(sliceStart, sliceEnd);

        const basePayload = {
            bookId,
            model: model || 'supertonic',
            voice,
            speed: speed || 1.0
        };

        const payloads = slice.map((sentence) => JSON.stringify({
            ...basePayload,
            chapterId,
            sentence
        }));

        const queueKey = getPrefetchQueueKey(bookId);
        const queuedCount = await enqueueSentences(queueKey, payloads);
        await markBookQueued(bookId);

        res.json({
            queued: queuedCount,
            startIndex: safeStartIndex,
            prefetchCount: TTS_PREFETCH_COUNT
        });
    } catch (error) {
        log.error('Error enqueueing prefetch TTS jobs:', error);
        res.status(500).json({ error: 'Failed to enqueue prefetch sentences' });
    }
});

/**
 * Proxy endpoint for TTS requests with caching
 */
app.post('/api/tts/speech', async (req, res) => {
    try {
        const { model, input, voice, response_format, speed, bookId } = req.body;

        // Validate required fields
        if (!input || !voice) {
            return res.status(400).json({
                error: 'Missing required fields: input and voice are required'
            });
        }

        const cacheKey = getTtsCacheKey({
            bookId: bookId || 'unknown',
            model,
            voice,
            speed,
            sentence: input
        });

        const cachedAudio = await getCachedAudio(cacheKey);
        if (cachedAudio) {
            res.set({
                'Content-Type': 'audio/wav',
                'Content-Disposition': 'attachment; filename="speech.wav"',
                'X-TTS-Cache': 'HIT'
            });
            return res.send(cachedAudio);
        }

        const ttsResponse = await fetch(`${TTS_SERVICE_URL}/v1/audio/speech`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model || 'supertonic',
                input,
                voice,
                response_format: response_format || 'wav',
                speed: speed || 1.0
            })
        });

        if (!ttsResponse.ok) {
            throw new Error(`TTS server error: ${ttsResponse.status} - ${ttsResponse.statusText}`);
        }

        const audioBuffer = Buffer.from(await ttsResponse.arrayBuffer());
        if (audioBuffer.length === 0) {
            throw new Error('TTS server returned empty response body');
        }

        await setCachedAudio(cacheKey, audioBuffer);

        res.set({
            'Content-Type': 'audio/wav',
            'Content-Disposition': 'attachment; filename="speech.wav"',
            'X-TTS-Cache': 'MISS'
        });
        res.send(audioBuffer);

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
app.get('/api/tts/cache/stats', async (req, res) => {
    try {
        if (!redisReady) {
            return res.status(503).json({ error: 'Redis is unavailable' });
        }

        const keys = await redisClient.dbSize();
        res.json({
            keys,
            ttlSeconds: TTS_CACHE_TTL_SECONDS
        });
    } catch (error) {
        log.error('Error getting cache stats:', error);
        res.status(500).json({ error: 'Failed to get cache statistics' });
    }
});

/**
 * Clear TTS cache
 */
app.delete('/api/tts/cache', async (req, res) => {
    try {
        if (!redisReady) {
            return res.status(503).json({ error: 'Redis is unavailable' });
        }

        let cursor = '0';
        let deleted = 0;

        do {
            const result = await redisClient.scan(cursor, {
                MATCH: `${TTS_CACHE_KEY_PREFIX}*`,
                COUNT: 200
            });
            cursor = result.cursor;
            if (result.keys.length > 0) {
                deleted += await redisClient.del(result.keys);
            }
        } while (cursor !== '0');

        res.json({ message: 'TTS cache cleared successfully', deleted });
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
async function startServer() {
    await fsPromises.mkdir(DATA_DIR, { recursive: true });
    await authStore.init();
    await seedAdminUser();

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
        log.info(`TTS Cache enabled with Redis TTL ${TTS_CACHE_TTL_SECONDS}s`);
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
}

startServer().catch((error) => {
    log.error('Failed to start server:', error);
    process.exit(1);
});

module.exports = app;
