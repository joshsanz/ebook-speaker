const test = require('node:test');
const assert = require('node:assert/strict');

const {
    validateFileUpload,
    validateEpubFile,
    MAX_FILE_SIZE,
    MIN_FILE_SIZE
} = require('../utils/fileUploadSecurity');

function makeZipBuffer(content = '') {
    const buffer = Buffer.alloc(Math.max(MIN_FILE_SIZE + 10, 2048), 0);
    buffer[0] = 0x50;
    buffer[1] = 0x4b;
    buffer[2] = 0x03;
    buffer[3] = 0x04;
    buffer.write(content, 8, 'utf8');
    buffer.write('mimetype', 64, 'utf8');
    return buffer;
}

test('validateEpubFile rejects unsupported extension', async () => {
    const buffer = makeZipBuffer('dummy');
    const result = await validateEpubFile(buffer, 'bad.txt');
    assert.equal(result.isValid, false);
    assert.ok(result.errors.some((e) => e.includes('Invalid file extension')));
});

test('validateFileUpload flags suspicious content and quarantines in strict mode', async () => {
    const buffer = makeZipBuffer('<script>alert(1)</script>');
    const result = await validateFileUpload(buffer, 'test.epub', {
        dataDir: './data',
        userId: 'test-user',
        strictMode: true
    });
    assert.equal(result.isValid, false);
    assert.equal(result.shouldQuarantine, true);
    assert.ok(result.warnings.some((w) => w.includes('Suspicious content')));
});

test('validateFileUpload enforces maximum size', async () => {
    const oversized = Buffer.alloc(MAX_FILE_SIZE + 1, 0);
    const result = await validateFileUpload(oversized, 'big.epub');
    assert.equal(result.isValid, false);
    assert.ok(result.errors.some((e) => e.includes('File too large')));
});
