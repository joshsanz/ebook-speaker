const test = require('node:test');
const assert = require('node:assert/strict');

const { sanitizeEpubHtml, analyzeHtmlSecurity } = require('../utils/htmlSanitizer');

test('sanitizeEpubHtml removes script tags and dangerous URLs', () => {
    const raw = '<p>Safe</p><script>alert(1)</script><a href="javascript:evil()">x</a>';
    const sanitized = sanitizeEpubHtml(raw);
    assert.equal(sanitized.includes('<script'), false);
    assert.equal(sanitized.includes('javascript:'), false);
    assert.ok(sanitized.includes('Safe'));
});

test('sanitizeEpubHtml strict mode keeps only basic tags', () => {
    const raw = '<div><p>Ok</p><em>Italic</em><img src="http://example.com/x.png" /></div>';
    const sanitized = sanitizeEpubHtml(raw, true);
    assert.ok(!sanitized.includes('<img'));
    assert.ok(sanitized.includes('<p>Ok</p>'));
    assert.ok(sanitized.includes('<em>Italic</em>'));
});

test('analyzeHtmlSecurity flags scripts and event handlers', () => {
    const raw = '<p onclick="run()">Click</p><script>hack()</script>';
    const analysis = analyzeHtmlSecurity(raw);
    assert.equal(analysis.safe, false);
    const warningTypes = analysis.warnings.map((w) => w.type);
    assert.ok(warningTypes.includes('Script tags'));
    assert.ok(warningTypes.includes('Event handlers'));
});
