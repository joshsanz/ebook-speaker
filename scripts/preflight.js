#!/usr/bin/env node
/**
 * Preflight harness to validate the stack before committing:
 * - Starts Redis via docker compose
 * - Launches TTS (FastAPI), Express server, and Vite client on test ports
 * - Runs connectivity checks, upload + chapter navigation, TTS proxy/cache/queues
 * - Cleans up processes and Redis keys on exit
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { setTimeout: delay } = require('timers/promises');
const { createClient } = require('redis');

const ROOT_DIR = path.resolve(__dirname, '..');
const CLIENT_DIR = path.join(ROOT_DIR, 'client');
const TTS_DIR = path.join(ROOT_DIR, 'tts');
const SAMPLE_EPUB = path.join(ROOT_DIR, 'data', 'Excession - Iain M. Banks.epub');

const CONFIG = {
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
    serverPort: Number(process.env.PREFLIGHT_SERVER_PORT || 3101),
    clientPort: Number(process.env.PREFLIGHT_CLIENT_PORT || 3100),
    ttsPort: Number(process.env.PREFLIGHT_TTS_PORT || 5005),
    ttsModel: process.env.TTS_DEFAULT_MODEL || 'supertonic',
    voice: process.env.PREFLIGHT_TTS_VOICE || 'af_heart',
    sentence: 'Hello world! This is a preflight TTS connectivity test.',
    queueWaitMs: Number(process.env.PREFLIGHT_QUEUE_WAIT_MS || 5000),
    readinessTimeoutMs: Number(process.env.PREFLIGHT_READY_MS || 20000),
    requestTimeoutMs: Number(process.env.PREFLIGHT_REQUEST_MS || 15000)
};

const processes = [];
let redisClient;

function logStep(message) {
    process.stdout.write(`\n==> ${message}\n`);
}

function spawnProcess(command, args, options = {}) {
    const proc = spawn(command, args, {
        stdio: 'inherit',
        env: { ...process.env, ...options.env },
        cwd: options.cwd || ROOT_DIR,
        shell: false
    });
    processes.push(proc);
    return proc;
}

async function runCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const proc = spawn(command, args, {
            stdio: options.stdio || 'pipe',
            env: { ...process.env, ...options.env },
            cwd: options.cwd || ROOT_DIR,
            shell: false
        });
        let stdout = '';
        let stderr = '';
        proc.stdout?.on('data', (data) => { stdout += data.toString(); });
        proc.stderr?.on('data', (data) => { stderr += data.toString(); });
        proc.on('error', reject);
        proc.on('close', (code) => {
            if (code === 0) {
                return resolve({ stdout, stderr, code });
            }
            const error = new Error(`${command} ${args.join(' ')} exited with code ${code}`);
            error.stdout = stdout;
            error.stderr = stderr;
            error.code = code;
            reject(error);
        });
    });
}

async function waitForHttp(url, { timeoutMs, expectStatus = 200 } = {}) {
    const start = Date.now();
    while (Date.now() - start < (timeoutMs || CONFIG.readinessTimeoutMs)) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), CONFIG.requestTimeoutMs);
        try {
            const res = await fetch(url, { signal: controller.signal });
            if (res.status === expectStatus) {
                clearTimeout(timer);
                return res;
            }
        } catch (error) {
            // swallow and retry until timeout
        }
        clearTimeout(timer);
        await delay(500);
    }
    throw new Error(`Timeout waiting for ${url}`);
}

async function ensureDockerRedis() {
    logStep('Ensuring Redis is up via docker compose');
    await runCommand('docker', ['compose', 'up', '-d', 'redis'], { stdio: 'inherit' });
}

async function connectRedis() {
    logStep(`Connecting to Redis at ${CONFIG.redisUrl}`);
    const client = createClient({ url: CONFIG.redisUrl });
    client.on('error', (err) => {
        console.error('Redis error:', err.message);
    });
    await client.connect();
    return client;
}

async function clearTtsKeys() {
    if (!redisClient?.isOpen) {
        return;
    }
    const patterns = ['tts:*', 'queue:tts:*', 'lock:tts:*'];
    for (const pattern of patterns) {
        const keys = [];
        for await (const key of redisClient.scanIterator({ MATCH: pattern })) {
            keys.push(key);
        }
        if (keys.length > 0) {
            await redisClient.del(keys);
        }
    }
}

async function buildClient() {
    logStep('Building client');
    await runCommand('npm', ['run', 'build'], { cwd: ROOT_DIR, stdio: 'inherit' });
}

async function startTts() {
    logStep('Starting TTS service');
    spawnProcess('python', [
        '-m',
        'uvicorn',
        'main:app',
        '--host',
        '0.0.0.0',
        '--port',
        String(CONFIG.ttsPort)
    ], { cwd: TTS_DIR });
    await waitForHttp(`http://localhost:${CONFIG.ttsPort}/health`);
}

async function startServer() {
    logStep('Starting Express server');
    spawnProcess('node', ['server.js'], {
        env: {
            NODE_ENV: 'test',
            PORT: CONFIG.serverPort,
            TTS_SERVICE_URL: `http://localhost:${CONFIG.ttsPort}`,
            REDIS_URL: CONFIG.redisUrl
        }
    });
    await waitForHttp(`http://localhost:${CONFIG.serverPort}/health`);
}

async function startClient() {
    logStep('Starting Vite client');
    spawnProcess('npm', ['start', '--', '--port', String(CONFIG.clientPort), '--host', '0.0.0.0', '--strictPort'], {
        cwd: CLIENT_DIR,
        env: { PORT: CONFIG.clientPort, BROWSER: 'none' }
    });
    await waitForHttp(`http://localhost:${CONFIG.clientPort}`);
}

async function testTtsDirect() {
    logStep('Testing TTS service directly');
    const payload = {
        model: CONFIG.ttsModel,
        input: CONFIG.sentence,
        voice: CONFIG.voice,
        response_format: 'wav',
        speed: 1.0
    };
    const res = await fetch(`http://localhost:${CONFIG.ttsPort}/v1/audio/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!res.ok) {
        throw new Error(`TTS direct call failed: ${res.status}`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (!buffer.length) {
        throw new Error('TTS direct call returned empty body');
    }
}

async function testServerTtsProxy(bookId) {
    logStep('Testing server TTS proxy + cache');
    const payload = {
        model: CONFIG.ttsModel,
        input: CONFIG.sentence,
        voice: CONFIG.voice,
        response_format: 'wav',
        speed: 1.0,
        bookId: bookId || 'preflight'
    };
    const first = await fetch(`http://localhost:${CONFIG.serverPort}/api/tts/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!first.ok) {
        throw new Error(`Server TTS proxy failed (miss): ${first.status}`);
    }
    const missBuffer = Buffer.from(await first.arrayBuffer());
    if (!missBuffer.length) {
        throw new Error('Server TTS miss returned empty body');
    }
    const cacheHeader = first.headers.get('x-tts-cache');
    if (cacheHeader && cacheHeader.toUpperCase() !== 'MISS') {
        throw new Error(`Unexpected cache header on miss: ${cacheHeader}`);
    }
    const second = await fetch(`http://localhost:${CONFIG.serverPort}/api/tts/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!second.ok) {
        throw new Error(`Server TTS proxy failed (hit): ${second.status}`);
    }
    const hitHeader = (second.headers.get('x-tts-cache') || '').toUpperCase();
    if (hitHeader !== 'HIT') {
        throw new Error(`Expected cache HIT but got ${hitHeader || 'missing'}`);
    }
}

async function uploadSampleBook() {
    if (!fs.existsSync(SAMPLE_EPUB)) {
        throw new Error(`Sample EPUB not found at ${SAMPLE_EPUB}`);
    }
    logStep('Uploading sample EPUB');
    const buffer = await fs.promises.readFile(SAMPLE_EPUB);
    const form = new FormData();
    const blob = new Blob([buffer], { type: 'application/epub+zip' });
    form.append('file', blob, path.basename(SAMPLE_EPUB));
    const res = await fetch(`http://localhost:${CONFIG.serverPort}/api/books`, {
        method: 'POST',
        body: form
    });
    if (!res.ok) {
        throw new Error(`Upload failed: ${res.status}`);
    }
    const json = await res.json();
    return json.book.filename;
}

async function getChapters(bookId) {
    logStep('Fetching chapters');
    const res = await fetch(`http://localhost:${CONFIG.serverPort}/api/books/${encodeURIComponent(bookId)}/chapters`);
    if (!res.ok) {
        throw new Error(`Failed to fetch chapters: ${res.status}`);
    }
    const chapters = await res.json();
    if (!Array.isArray(chapters) || chapters.length === 0) {
        throw new Error('No chapters returned from API');
    }
    return chapters;
}

async function enqueueQueues(bookId, chapterId) {
    logStep('Enqueueing chapter queue');
    const chapterRes = await fetch(`http://localhost:${CONFIG.serverPort}/api/tts/queue/chapter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            bookId,
            chapterId,
            voice: CONFIG.voice,
            model: CONFIG.ttsModel,
            speed: 1.0
        })
    });
    if (!chapterRes.ok) {
        throw new Error(`Chapter enqueue failed: ${chapterRes.status}`);
    }
    logStep('Enqueueing prefetch queue');
    const prefetchRes = await fetch(`http://localhost:${CONFIG.serverPort}/api/tts/queue/prefetch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            bookId,
            chapterId,
            startIndex: 0,
            voice: CONFIG.voice,
            model: CONFIG.ttsModel,
            speed: 1.0
        })
    });
    if (!prefetchRes.ok) {
        throw new Error(`Prefetch enqueue failed: ${prefetchRes.status}`);
    }
}

async function assertRedisQueues(bookId) {
    logStep('Validating Redis queues + cache');
    const chapterKey = `queue:tts:chapter:${encodeURIComponent(bookId)}`;
    const prefetchKey = `queue:tts:prefetch:${encodeURIComponent(bookId)}`;
    const bookSet = await redisClient.sMembers('queue:tts:books');
    if (!bookSet.includes(bookId)) {
        throw new Error('Book ID not recorded in queue:tts:books');
    }
    const chapterLen = await redisClient.lLen(chapterKey);
    const prefetchLen = await redisClient.lLen(prefetchKey);
    if (chapterLen === 0) {
        throw new Error('Chapter queue is empty after enqueue');
    }
    if (prefetchLen === 0) {
        throw new Error('Prefetch queue is empty after enqueue');
    }
    await delay(CONFIG.queueWaitMs);
    const drainedChapterLen = await redisClient.lLen(chapterKey);
    const drainedPrefetchLen = await redisClient.lLen(prefetchKey);
    if (drainedChapterLen >= chapterLen && drainedPrefetchLen >= prefetchLen) {
        throw new Error('Queues did not drain; worker may be stalled');
    }
    const cacheKeys = [];
    for await (const key of redisClient.scanIterator({ MATCH: 'tts:*', COUNT: 50 })) {
        cacheKeys.push(key);
        if (cacheKeys.length >= 5) break;
    }
    if (cacheKeys.length === 0) {
        throw new Error('No cache keys created after queue processing');
    }
}

async function deleteBook(bookId) {
    logStep('Deleting uploaded book');
    await fetch(`http://localhost:${CONFIG.serverPort}/api/books/${encodeURIComponent(bookId)}`, {
        method: 'DELETE'
    });
}

async function shutdown() {
    logStep('Shutting down processes and cleaning Redis keys');
    await clearTtsKeys();
    if (redisClient?.isOpen) {
        await redisClient.quit();
    }
    for (const proc of processes) {
        if (!proc.killed) {
            proc.kill('SIGTERM');
        }
    }
}

async function main() {
    const start = Date.now();
    try {
        await ensureDockerRedis();
        redisClient = await connectRedis();
        await clearTtsKeys();
        await buildClient();
        await startTts();
        await startServer();
        await startClient();
        await waitForHttp(`http://localhost:${CONFIG.clientPort}/api/books`, { timeoutMs: CONFIG.requestTimeoutMs });
        await testTtsDirect();
        await testServerTtsProxy();
        const bookId = await uploadSampleBook();
        const chapters = await getChapters(bookId);
        const chapterId = chapters[0].id || chapters[0].order;
        await enqueueQueues(bookId, chapterId);
        await assertRedisQueues(bookId);
        await deleteBook(bookId);
        logStep(`Preflight completed in ${Math.round((Date.now() - start) / 1000)}s`);
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Preflight failed:', error.message);
        if (error.stdout) {
            console.error(error.stdout);
        }
        if (error.stderr) {
            console.error(error.stderr);
        }
        process.exitCode = 1;
    } finally {
        await shutdown();
    }
}

main();
