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
const readline = require('readline');

const ROOT_DIR = path.resolve(__dirname, '..');
const CLIENT_DIR = path.join(ROOT_DIR, 'client');
const TTS_DIR = path.join(ROOT_DIR, 'tts');
const SAMPLE_EPUB = path.join(ROOT_DIR, 'data', 'Excession - Iain M. Banks.epub');

function getDefaultVoice(model) {
    return model === 'supertonic' ? 'M1' : 'af_heart';
}

const defaultTtsModel = process.env.TTS_DEFAULT_MODEL || 'supertonic';
const defaultVoice = process.env.PREFLIGHT_TTS_VOICE || getDefaultVoice(defaultTtsModel);

const CONFIG = {
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
    serverPort: Number(process.env.PREFLIGHT_SERVER_PORT || 3001),
    clientPort: Number(process.env.PREFLIGHT_CLIENT_PORT || 3100),
    ttsPort: Number(process.env.PREFLIGHT_TTS_PORT || 5005),
    ttsModel: defaultTtsModel,
    voice: defaultVoice,
    sentence: 'Hello world! This is a preflight TTS connectivity test.',
    queueWaitMs: Number(process.env.PREFLIGHT_QUEUE_WAIT_MS || 5000),
    readinessTimeoutMs: Number(process.env.PREFLIGHT_READY_MS || 20000),
    requestTimeoutMs: Number(process.env.PREFLIGHT_REQUEST_MS || 15000)
};

const processes = [];
let redisClient;
let redisStartedByPreflight = false;

function logStep(message) {
    process.stdout.write(`\n==> ${message}\n`);
}

const AUTO_KILL = process.argv.includes('--kill');

function spawnProcess(command, args, options = {}) {
    const proc = spawn(command, args, {
        stdio: 'inherit',
        env: { ...process.env, ...options.env },
        cwd: options.cwd || ROOT_DIR,
        shell: false,
        detached: true
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
    let wasRunning = false;
    try {
        const status = await runCommand('docker', ['compose', 'ps', '-q', 'redis']);
        wasRunning = Boolean(status.stdout.trim());
    } catch {
        // Ignore; we'll attempt to start below
    }
    await runCommand('docker', ['compose', 'up', '-d', 'redis'], { stdio: 'inherit' });
    redisStartedByPreflight = !wasRunning;
}

async function findListeningPids(port) {
    try {
        const result = await runCommand('lsof', ['-i', `:${port}`, '-sTCP:LISTEN', '-n', '-P', '-t']);
        return result.stdout.split('\n').filter(Boolean).map((pid) => Number(pid.trim())).filter(Boolean);
    } catch (error) {
        // lsof exits non-zero when nothing is listening; only rethrow if a different error occurs
        if (error.code !== 1) {
            console.warn(`Warning: failed to check port ${port} usage: ${error.message}`);
        }
        return [];
    }
}

async function describePids(pids) {
    const descriptions = [];
    for (const pid of pids) {
        try {
            const result = await runCommand('ps', ['-p', String(pid), '-o', 'pid=', '-o', 'command=']);
            const line = result.stdout.split('\n').find(Boolean);
            if (line) {
                descriptions.push(line.trim());
            }
        } catch {
            descriptions.push(`${pid} (unable to describe)`);
        }
    }
    return descriptions;
}

async function promptYesNo(question) {
    if (AUTO_KILL) {
        return true;
    }
    if (!process.stdin.isTTY) {
        return false;
    }
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    const answer = await new Promise((resolve) => rl.question(`${question} [y/N]: `, resolve));
    rl.close();
    return answer.trim().toLowerCase().startsWith('y');
}

async function ensurePortAvailable(port, label) {
    const pids = await findListeningPids(port);
    if (pids.length === 0) {
        return;
    }

    const descriptions = await describePids(pids);
    const list = descriptions.join('\n  ');
    console.warn(`Port ${port} (${label}) is in use by:\n  ${list}`);

    const shouldKill = await promptYesNo(`Kill process(es) on port ${port}?${AUTO_KILL ? ' (--kill enabled)' : ''}`);
    if (!shouldKill) {
        throw new Error(`Port ${port} is busy. Please free it and rerun preflight.`);
    }

    for (const pid of pids) {
        try {
            process.kill(pid, 'SIGTERM');
        } catch (error) {
            console.warn(`Failed to kill PID ${pid}: ${error.message}`);
        }
    }

    // give processes a moment to exit, then re-check
    await delay(2000);
    const remaining = await findListeningPids(port);
    if (remaining.length) {
        throw new Error(`Failed to free port ${port}; remaining PIDs: ${remaining.join(', ')}`);
    }
}

async function stopComposeServices() {
    logStep('Stopping docker-compose services that might hold ports (server, tts-service)');
    try {
        await runCommand('docker', ['compose', 'stop', 'server', 'tts-service'], { stdio: 'inherit' });
    } catch (error) {
        console.warn('Warning: docker compose stop failed (continuing):', error.message);
    }
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
            startIndex: -1, // request prefetch from the very first sentence to avoid empty slices
            voice: CONFIG.voice,
            model: CONFIG.ttsModel,
            speed: 1.0
        })
    });
    if (!prefetchRes.ok) {
        throw new Error(`Prefetch enqueue failed: ${prefetchRes.status}`);
    }
    const chapterJson = await chapterRes.json();
    const prefetchJson = await prefetchRes.json();
    logStep(`Queues enqueued (chapter: ${chapterJson?.queued || 0}, prefetch: ${prefetchJson?.queued || 0})`);
    return {
        chapterQueued: chapterJson?.queued || 0,
        prefetchQueued: prefetchJson?.queued || 0
    };
}

async function assertRedisQueues(bookId, queuedCounts = { chapterQueued: 0, prefetchQueued: 0 }) {
    logStep('Validating Redis queues + cache');
    const chapterKey = `queue:tts:chapter:${encodeURIComponent(bookId)}`;
    const prefetchKey = `queue:tts:prefetch:${encodeURIComponent(bookId)}`;
    const bookSet = await redisClient.sMembers('queue:tts:books');
    const encodedBookId = encodeURIComponent(bookId);
    if (!bookSet.includes(bookId) && !bookSet.includes(encodedBookId)) {
        const presentBooks = bookSet.length ? bookSet.join(', ') : 'none';
        throw new Error(`Book ID not recorded in queue:tts:books (found: ${presentBooks})`);
    }
    const chapterLen = await redisClient.lLen(chapterKey);
    const prefetchLen = await redisClient.lLen(prefetchKey);
    const initialChapterLen = Math.max(chapterLen, queuedCounts.chapterQueued || 0);
    const initialPrefetchLen = Math.max(prefetchLen, queuedCounts.prefetchQueued || 0);
    if (initialChapterLen === 0) {
        throw new Error('Chapter queue is empty after enqueue');
    }
    if (initialPrefetchLen === 0) {
        throw new Error('Prefetch queue is empty after enqueue');
    }
    const timeoutMs = 5 * 60 * 1000;
    const start = Date.now();
    let prefetchCleared = initialPrefetchLen === 0;
    while (true) {
        const [currentChapterLen, currentPrefetchLen] = await Promise.all([
            redisClient.lLen(chapterKey),
            redisClient.lLen(prefetchKey)
        ]);
        process.stdout.write(`Queue lengths - prefetch: ${currentPrefetchLen}, chapter: ${currentChapterLen}\n`);
        if (!prefetchCleared) {
            if (currentChapterLen < initialChapterLen && currentPrefetchLen > 0) {
                throw new Error(`Chapter queue started draining before prefetch finished (prefetch=${currentPrefetchLen}, chapter=${currentChapterLen})`);
            }
            if (currentPrefetchLen === 0) {
                prefetchCleared = true;
                logStep('Prefetch queue drained; monitoring chapter queue');
            }
        } else {
            if (currentPrefetchLen > 0) {
                throw new Error('Prefetch queue repopulated after draining');
            }
            if (currentChapterLen < initialChapterLen) {
                logStep('Chapter queue began draining after prefetch completed');
                break;
            }
        }
        if (Date.now() - start > timeoutMs) {
            throw new Error(`Queue drain timed out after 300s (prefetch=${currentPrefetchLen}, chapter=${currentChapterLen})`);
        }
        await delay(1000);
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
    const killProc = (proc, signal) => {
        if (proc.killed || !proc.pid) {
            return;
        }
        try {
            // try process group first
            process.kill(-proc.pid, signal);
        } catch {
            try {
                process.kill(proc.pid, signal);
            } catch {
                // ignore
            }
        }
    };
    for (const proc of processes) {
        killProc(proc, 'SIGTERM');
    }
    // give processes a moment to exit, then force kill if needed
    await delay(1500);
    for (const proc of processes) {
        killProc(proc, 'SIGKILL');
    }
    if (redisStartedByPreflight) {
        try {
            logStep('Stopping docker-compose Redis started by preflight');
            await runCommand('docker', ['compose', 'stop', 'redis'], { stdio: 'inherit' });
        } catch (error) {
            console.warn('Warning: failed to stop Redis container:', error.message);
        }
    }
}

async function main() {
    const start = Date.now();
    let exitCode = 1;
    try {
        await stopComposeServices();
        logStep('Waiting for ports to free (10s)');
        await delay(10_000);
        await ensurePortAvailable(CONFIG.serverPort, 'Express server');
        await ensurePortAvailable(CONFIG.clientPort, 'Vite client');
        await ensurePortAvailable(CONFIG.ttsPort, 'TTS service');
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
        const preferredChapterIndex = 4; // start at chapter 5 to avoid sparsely populated early sections
        const selectedChapter = chapters[Math.min(preferredChapterIndex, chapters.length - 1)];
        const chapterId = selectedChapter.id || selectedChapter.order;
        const queuedCounts = await enqueueQueues(bookId, chapterId);
        await assertRedisQueues(bookId, queuedCounts);
        await deleteBook(bookId);
        logStep(`Preflight completed in ${Math.round((Date.now() - start) / 1000)}s`);
        exitCode = 0;
    } catch (error) {
        console.error('\n❌ Preflight failed:', error.message);
        if (error.stdout) {
            console.error(error.stdout);
        }
        if (error.stderr) {
            console.error(error.stderr);
        }
        exitCode = 1;
    } finally {
        await shutdown();
        process.exit(exitCode);
    }
}

main();
