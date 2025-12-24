const test = require('node:test');
const assert = require('node:assert/strict');

const {
    splitIntoSentences,
    splitIntoPronounceable,
    isPronounceableText,
    processForTTSAndHighlighting
} = require('../shared/textProcessing');

test('splitIntoSentences handles punctuation and newlines', () => {
    const text = 'Hello world! How are you?\nNew line without punctuation';
    const sentences = splitIntoSentences(text);
    assert.deepEqual(sentences, [
        'Hello world!',
        'How are you?',
        'New line without punctuation'
    ]);
});

test('isPronounceableText filters out decorative content', () => {
    assert.equal(isPronounceableText('***'), false);
    assert.equal(isPronounceableText(' --- '), false);
    assert.equal(isPronounceableText('IV'), true);
    assert.equal(isPronounceableText('42'), true);
});

test('splitIntoPronounceable preserves indices and flags pronounceable sentences', () => {
    const text = 'Real words. !!! ...';
    const result = splitIntoPronounceable(text);
    assert.equal(result.length, 3);
    assert.equal(result[0].pronounceable, true);
    assert.equal(result[1].pronounceable, false);
    assert.equal(result[2].pronounceable, false);
    assert.equal(result[0].originalIndex, 0);
});

test('processForTTSAndHighlighting returns pronounceable sentences only', () => {
    const html = '<p>Hello world!</p><p>***</p>';
    const cleanText = 'Hello world!\n***';
    const result = processForTTSAndHighlighting(html, cleanText);
    assert.equal(result.pronounceableSentences.length, 1);
    assert.ok(result.pronounceableSentences[0].includes('Hello world'));
    assert.ok(result.sentences.includes('***'));
});
