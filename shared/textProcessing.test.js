/**
 * Unit tests for text processing utilities
 * Run with: node shared/textProcessing.test.js
 */

const { 
  splitIntoSentences, 
  addSentenceSpans, 
  isPronounceableText,
  splitIntoPronounceable,
  processForTTSAndHighlighting,
  TEXT_CONFIG,
  TEST_CASES 
} = require('./textProcessing.js');

/**
 * Simple test runner
 */
class TestRunner {
  constructor() {
    this.passed = 0;
    this.failed = 0;
    this.tests = [];
  }

  test(name, testFn) {
    try {
      testFn();
      console.log(`✅ ${name}`);
      this.passed++;
    } catch (error) {
      console.log(`❌ ${name}: ${error.message}`);
      this.failed++;
    }
    this.tests.push(name);
  }

  assert(condition, message) {
    if (!condition) {
      throw new Error(message || 'Assertion failed');
    }
  }

  assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(message || `Expected "${expected}" but got "${actual}"`);
    }
  }

  assertArrayEqual(actual, expected, message) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(message || `Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
    }
  }

  summary() {
    console.log(`\n📊 Test Summary:`);
    console.log(`✅ Passed: ${this.passed}`);
    console.log(`❌ Failed: ${this.failed}`);
    console.log(`📋 Total: ${this.tests.length}`);
    return this.failed === 0;
  }
}

// Create test runner instance
const test = new TestRunner();

// Test sentence splitting
test.test('splitIntoSentences - simple sentences', () => {
  const text = 'First sentence. Second sentence! Third sentence?';
  const result = splitIntoSentences(text);
  test.assertArrayEqual(result, ['First sentence.', 'Second sentence!', 'Third sentence?']);
});

test.test('splitIntoSentences - newline separation', () => {
  const text = 'CHAPTER ONE\n\nFirst paragraph.\nSecond line.';
  const result = splitIntoSentences(text);
  test.assertArrayEqual(result, ['CHAPTER ONE', 'First paragraph.', 'Second line.']);
});

test.test('splitIntoSentences - character list', () => {
  const text = 'SENATE\nPaula Myo—Investigator, Senate Security\nJustine Burnelli—Earth Socialite–now Senator';
  const result = splitIntoSentences(text);
  test.assertArrayEqual(result, [
    'SENATE',
    'Paula Myo—Investigator, Senate Security',
    'Justine Burnelli—Earth Socialite–now Senator'
  ]);
});

test.test('splitIntoSentences - empty and whitespace', () => {
  test.assertArrayEqual(splitIntoSentences(''), []);
  test.assertArrayEqual(splitIntoSentences('   '), []);
  test.assertArrayEqual(splitIntoSentences(null), []);
  test.assertArrayEqual(splitIntoSentences(undefined), []);
});

test.test('splitIntoSentences - mixed punctuation and newlines', () => {
  const text = 'Title\n\nFirst sentence. Second sentence!\nThird line\nFourth sentence?';
  const result = splitIntoSentences(text);
  test.assertArrayEqual(result, [
    'Title',
    'First sentence.',
    'Second sentence!',
    'Third line',
    'Fourth sentence?'
  ]);
});

// Test sentence span creation
test.test('addSentenceSpans - simple HTML', () => {
  const html = '<p>First sentence. Second sentence.</p>';
  const text = 'First sentence. Second sentence.';
  const result = addSentenceSpans(html, text);
  
  // Should contain both sentence spans
  test.assert(result.includes('data-sentence-index="0"'), 'Should contain sentence 0 span');
  test.assert(result.includes('data-sentence-index="1"'), 'Should contain sentence 1 span');
});

test.test('addSentenceSpans - title without punctuation', () => {
  const html = '<h1>CHAPTER ONE</h1>';
  const text = 'CHAPTER ONE';
  const result = addSentenceSpans(html, text);
  
  test.assert(result.includes('data-sentence-index="0"'), 'Should contain sentence 0 span for title');
  test.assert(result.includes('CHAPTER ONE'), 'Should preserve original text');
});

test.test('addSentenceSpans - formatted text with bold', () => {
  const html = '<p><span class="bold">R</span>ight from the start.</p>';
  const text = 'Right from the start.';
  const result = addSentenceSpans(html, text);
  
  test.assert(result.includes('data-sentence-index="0"'), 'Should handle formatted text');
});

test.test('addSentenceSpans - character list', () => {
  const html = `
    <div>SENATE</div>
    <p>Paula Myo—Investigator, Senate Security</p>
    <p>Justine Burnelli—Earth Socialite–now Senator</p>
  `;
  const text = 'SENATE\nPaula Myo—Investigator, Senate Security\nJustine Burnelli—Earth Socialite–now Senator';
  const result = addSentenceSpans(html, text);
  
  test.assert(result.includes('data-sentence-index="0"'), 'Should contain sentence 0 (SENATE)');
  test.assert(result.includes('data-sentence-index="1"'), 'Should contain sentence 1 (Paula Myo)');
  test.assert(result.includes('data-sentence-index="2"'), 'Should contain sentence 2 (Justine)');
});

// Test edge cases
test.test('addSentenceSpans - empty input', () => {
  test.assertEqual(addSentenceSpans('', ''), '');
  test.assertEqual(addSentenceSpans('<p></p>', ''), '<p></p>');
});

test.test('addSentenceSpans - no matches possible', () => {
  const html = '<p>Some HTML content</p>';
  const text = 'Completely different text content';
  const result = addSentenceSpans(html, text);
  
  // Should return original HTML if no matches found
  test.assertEqual(result, html);
});

// Run all test cases from TEST_CASES
test.test('TEST_CASES - all simple sentences split correctly', () => {
  TEST_CASES.SIMPLE.forEach(sentence => {
    const result = splitIntoSentences(sentence);
    test.assert(result.length >= 1, `Should split "${sentence}" into at least 1 part`);
  });
});

test.test('TEST_CASES - all titles handled', () => {
  TEST_CASES.TITLES.forEach(title => {
    const result = splitIntoSentences(title);
    test.assertEqual(result.length, 1, `Title "${title}" should be one sentence`);
    test.assertEqual(result[0], title, `Title should be preserved exactly`);
  });
});

test.test('TEST_CASES - character names handled', () => {
  TEST_CASES.CHARACTERS.forEach(character => {
    const result = splitIntoSentences(character);
    test.assertEqual(result.length, 1, `Character "${character}" should be one sentence`);
    test.assertEqual(result[0], character, `Character name should be preserved exactly`);
  });
});

// Test pronounceable text detection
test.test('isPronounceableText - pronounceable content', () => {
  TEST_CASES.PRONOUNCEABLE.forEach(text => {
    test.assert(isPronounceableText(text), `"${text}" should be pronounceable`);
  });
});

test.test('isPronounceableText - non-pronounceable content', () => {
  TEST_CASES.NON_PRONOUNCEABLE.forEach(text => {
    test.assert(!isPronounceableText(text), `"${text}" should be non-pronounceable`);
  });
});

test.test('isPronounceableText - edge cases', () => {
  // These should be pronounceable
  test.assert(isPronounceableText('A'), 'Single letter should be pronounceable');
  test.assert(isPronounceableText('42'), 'Numbers should be pronounceable');
  test.assert(isPronounceableText('www.test.com'), 'URLs should be pronounceable');
  test.assert(isPronounceableText('CHAPTER'), 'All caps should be pronounceable');
  
  // These should not be pronounceable
  test.assert(!isPronounceableText('***'), 'Triple asterisks should not be pronounceable');
  test.assert(!isPronounceableText('---'), 'Triple dashes should not be pronounceable');
  test.assert(!isPronounceableText(''), 'Empty string should not be pronounceable');
  test.assert(!isPronounceableText('   '), 'Whitespace should not be pronounceable');
});

test.test('splitIntoPronounceable - mixed content', () => {
  const text = 'CHAPTER ONE\n***\nThis is a sentence.\n---\nAnother sentence.';
  const result = splitIntoPronounceable(text);
  
  test.assertEqual(result.length, 5, 'Should return all sentences with metadata');
  test.assert(result[0].pronounceable, 'CHAPTER ONE should be pronounceable');
  test.assert(!result[1].pronounceable, '*** should not be pronounceable');
  test.assert(result[2].pronounceable, 'Regular sentence should be pronounceable');
  test.assert(!result[3].pronounceable, '--- should not be pronounceable');
  test.assert(result[4].pronounceable, 'Another sentence should be pronounceable');
  
  // Check original indices are preserved
  test.assertEqual(result[0].originalIndex, 0, 'First item should have index 0');
  test.assertEqual(result[4].originalIndex, 4, 'Last item should have index 4');
});

// Test the main TTS and highlighting processing function
test.test('processForTTSAndHighlighting - mixed pronounceable/non-pronounceable content', () => {
  const htmlContent = '<div>CHAPTER ONE</div><p>***</p><p>This is a sentence.</p><p>---</p><p>Another sentence.</p>';
  const cleanText = 'CHAPTER ONE\n***\nThis is a sentence.\n---\nAnother sentence.';
  
  const result = processForTTSAndHighlighting(htmlContent, cleanText);
  
  // Should have processed HTML with spans for pronounceable content only
  test.assert(result.htmlContent.includes('data-sentence-index="0"'), 'Should have span 0 for CHAPTER ONE');
  test.assert(result.htmlContent.includes('data-sentence-index="1"'), 'Should have span 1 for first sentence');
  test.assert(result.htmlContent.includes('data-sentence-index="2"'), 'Should have span 2 for second sentence');
  test.assert(!result.htmlContent.includes('data-sentence-index="3"'), 'Should not have span 3 (skipped non-pronounceable)');
  test.assert(!result.htmlContent.includes('data-sentence-index="4"'), 'Should not have span 4 (skipped non-pronounceable)');
  
  // Should have all original sentences
  test.assertEqual(result.sentences.length, 5, 'Should have all 5 original sentences');
  
  // Should have only pronounceable sentences for TTS
  test.assertEqual(result.pronounceableSentences.length, 3, 'Should have 3 pronounceable sentences');
  test.assertArrayEqual(result.pronounceableSentences, [
    'CHAPTER ONE',
    'This is a sentence.',
    'Another sentence.'
  ], 'Should contain only pronounceable sentences');
  
  // Should have detailed metadata
  test.assertEqual(result.sentenceData.length, 5, 'Should have metadata for all sentences');
  test.assert(result.sentenceData[0].pronounceable, 'CHAPTER ONE should be marked pronounceable');
  test.assert(!result.sentenceData[1].pronounceable, '*** should be marked non-pronounceable');
});

test.test('processForTTSAndHighlighting - perfect TTS/highlighting alignment', () => {
  const htmlContent = '<p>First sentence.</p><p>***</p><p>Second sentence.</p><p>---</p><p>Third sentence.</p>';
  const cleanText = 'First sentence.\n***\nSecond sentence.\n---\nThird sentence.';
  
  const result = processForTTSAndHighlighting(htmlContent, cleanText);
  
  // TTS sentences and span indices should align perfectly
  test.assertEqual(result.pronounceableSentences.length, 3, 'Should have 3 TTS sentences');
  
  // Span 0 → TTS sentence 0, Span 1 → TTS sentence 1, Span 2 → TTS sentence 2
  test.assertEqual(result.pronounceableSentences[0], 'First sentence.');
  test.assertEqual(result.pronounceableSentences[1], 'Second sentence.');
  test.assertEqual(result.pronounceableSentences[2], 'Third sentence.');
  
  // HTML should have spans 0, 1, 2 (skipping non-pronounceable content)
  test.assert(result.htmlContent.includes('data-sentence-index="0"'), 'Should have span 0');
  test.assert(result.htmlContent.includes('data-sentence-index="1"'), 'Should have span 1');
  test.assert(result.htmlContent.includes('data-sentence-index="2"'), 'Should have span 2');
});

test.test('processForTTSAndHighlighting - empty content', () => {
  const result = processForTTSAndHighlighting('', '');
  
  test.assertEqual(result.htmlContent, '', 'Should return empty HTML');
  test.assertEqual(result.sentences.length, 0, 'Should have no sentences');
  test.assertEqual(result.pronounceableSentences.length, 0, 'Should have no pronounceable sentences');
});

test.test('processForTTSAndHighlighting - all non-pronounceable content', () => {
  const htmlContent = '<div>***</div><div>---</div><div>« ^ »</div>';
  const cleanText = '***\n---\n« ^ »';
  
  const result = processForTTSAndHighlighting(htmlContent, cleanText);
  
  test.assertEqual(result.sentences.length, 3, 'Should have 3 original sentences');
  test.assertEqual(result.pronounceableSentences.length, 0, 'Should have no pronounceable sentences for TTS');
  test.assert(!result.htmlContent.includes('data-sentence-index'), 'Should have no sentence spans');
});

// Performance test
test.test('Performance - large text handling', () => {
  const largeText = 'This is a test sentence. '.repeat(1000);
  const start = Date.now();
  const result = splitIntoSentences(largeText);
  const end = Date.now();
  
  test.assert(end - start < 100, 'Should process large text quickly (< 100ms)');
  test.assertEqual(result.length, 1000, 'Should split large text correctly');
});

// Run all tests and display summary
console.log('🧪 Running Text Processing Tests\n');
const success = test.summary();

if (success) {
  console.log('\n🎉 All tests passed!');
  process.exit(0);
} else {
  console.log('\n💥 Some tests failed!');
  process.exit(1);
}