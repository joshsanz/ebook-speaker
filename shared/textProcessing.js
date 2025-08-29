/**
 * Shared text processing utilities for sentence splitting and manipulation
 * Used by both client and server to ensure consistency
 */

/**
 * Configuration for text processing
 */
const TEXT_CONFIG = {
  // Regex patterns for splitting text into sentences
  SENTENCE_SPLIT_PATTERN: /[.!?]+|\n+/,
  
  // Maximum sentence length before we consider splitting further
  MAX_SENTENCE_LENGTH: 400,
  
  // Patterns for additional splitting of long sentences
  MAJOR_BREAKS: /[;—]\s+/,
  COMMA_BREAKS: /,\s+/
};

/**
 * Split text into sentences using consistent logic
 * @param {string} text - The text to split into sentences
 * @returns {string[]} Array of sentences
 */
function splitIntoSentences(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  // Split by newlines first, then handle punctuation within each line
  const lines = text.split(/\n+/).filter(line => line.trim().length > 0);
  const sentences = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    // Check if line ends with sentence punctuation
    if (/[.!?]$/.test(trimmedLine)) {
      // Split on sentence punctuation but keep the punctuation
      const lineSentences = trimmedLine.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
      sentences.push(...lineSentences);
    } else {
      // No sentence punctuation, treat as single sentence
      sentences.push(trimmedLine);
    }
  }

  return sentences;
}

/**
 * Check if text contains pronounceable content suitable for TTS
 * Only filters out truly decorative/symbolic content
 * @param {string} text - The text to evaluate
 * @returns {boolean} True if text is pronounceable, false if it should be skipped
 */
function isPronounceableText(text) {
  if (!text || typeof text !== 'string') {
    return false;
  }

  const trimmed = text.trim();
  
  // Empty or whitespace-only
  if (trimmed.length === 0) {
    return false;
  }

  // Very short content - only filter if it's purely symbolic
  if (trimmed.length <= 3) {
    // Allow short words, numbers, Roman numerals
    if (/[a-zA-Z0-9]/.test(trimmed)) {
      return true;
    }
    // Filter out pure symbols
    if (/^[^\w\s]*$/.test(trimmed)) {
      return false;
    }
  }

  // Decorative patterns: repeated symbols
  if (/^([^\w\s])\1{2,}$/.test(trimmed)) { // Same symbol repeated 3+ times
    return false;
  }

  // Decorative bullet/symbol patterns with spaces
  if (/^([^\w\s]\s*){3,}$/.test(trimmed)) { // Symbols with spaces repeated 3+ times  
    return false;
  }

  // Pure Unicode symbol sequences (like "« ^ »")
  if (/^[\u00A0-\u00FF\u2000-\u206F\u2070-\u209F\u20A0-\u20CF\u2100-\u214F\u2190-\u21FF\u2200-\u22FF\s]+$/.test(trimmed) && 
      !/[a-zA-Z0-9]/.test(trimmed)) {
    return false;
  }

  // Everything else is pronounceable (including all caps, numbers, URLs, etc.)
  return true;
}

/**
 * Split text into sentences and filter out non-pronounceable ones
 * @param {string} text - The text to split into pronounceable sentences
 * @returns {string[]} Array of pronounceable sentences with original indices preserved
 */
function splitIntoPronounceable(text) {
  const allSentences = splitIntoSentences(text);
  return allSentences.map((sentence, index) => ({
    text: sentence,
    originalIndex: index,
    pronounceable: isPronounceableText(sentence)
  }));
}

/**
 * Process text for TTS and highlighting - single source of truth
 * @param {string} htmlContent - HTML content to process
 * @param {string} cleanText - Clean text version for sentence splitting
 * @returns {Object} Result with HTML content and pronounceable sentences
 */
function processForTTSAndHighlighting(htmlContent, cleanText) {
  // Split text into sentences (all sentences)
  const allSentences = splitIntoSentences(cleanText);
  
  if (allSentences.length === 0) {
    return {
      htmlContent: htmlContent,
      sentences: [],
      pronounceableSentences: []
    };
  }

  // Separate pronounceable from non-pronounceable sentences
  const sentenceData = allSentences.map((sentence, index) => ({
    text: sentence,
    index: index,
    pronounceable: isPronounceableText(sentence)
  }));

  let processedHtml = htmlContent;
  let spanIndex = 0; // Index for spans in HTML (only pronounceable sentences get spans)
  
  // Process each sentence and add spans (only for pronounceable sentences)
  sentenceData.forEach((item) => {
    if (item.text.length === 0) return;
    
    if (item.pronounceable) {
      // Create a regex pattern to match this sentence in the HTML
      const success = addSentenceSpan(processedHtml, item.text, spanIndex);
      if (success.matched) {
        processedHtml = success.html;
      }
      spanIndex++;
    }
    // Non-pronounceable sentences don't get spans, so highlighting will skip them
  });

  // Return only pronounceable sentences for TTS
  const pronounceableSentences = sentenceData
    .filter(item => item.pronounceable)
    .map(item => item.text);

  return {
    htmlContent: processedHtml,
    sentences: allSentences, // All sentences for reference
    pronounceableSentences: pronounceableSentences, // Only these go to TTS
    sentenceData: sentenceData // Full metadata
  };
}

/**
 * Create sentence spans for HTML content (legacy function for compatibility)
 * @param {string} htmlContent - HTML content to process
 * @param {string} cleanText - Clean text version for sentence splitting
 * @returns {string} HTML content with sentence spans added
 */
function addSentenceSpans(htmlContent, cleanText) {
  const result = processForTTSAndHighlighting(htmlContent, cleanText);
  return result.htmlContent;
}

/**
 * Add a single sentence span to HTML content
 * @param {string} htmlContent - HTML content to process
 * @param {string} sentence - The sentence text to find and wrap
 * @param {number} index - The sentence index
 * @returns {Object} Result object with { matched: boolean, html: string }
 */
function addSentenceSpan(htmlContent, sentence, index) {
  // Try different matching strategies
  const strategies = [
    () => matchExactSentence(htmlContent, sentence, index),
    () => matchFlexibleSentence(htmlContent, sentence, index),
    () => matchKeyWords(htmlContent, sentence, index)
  ];

  for (const strategy of strategies) {
    const result = strategy();
    if (result.matched) {
      return result;
    }
  }

  // No match found
  return { matched: false, html: htmlContent };
}

/**
 * Try to match the exact sentence text
 */
function matchExactSentence(htmlContent, sentence, index) {
  // Escape special regex characters
  const escapedSentence = sentence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(escapedSentence, 'i');
  
  if (pattern.test(htmlContent)) {
    const newHtml = htmlContent.replace(pattern, (match) => {
      return `<span data-sentence-index="${index}">${match}</span>`;
    });
    return { matched: true, html: newHtml };
  }
  
  return { matched: false, html: htmlContent };
}

/**
 * Try to match sentence with flexible whitespace and HTML tags
 */
function matchFlexibleSentence(htmlContent, sentence, index) {
  // Split sentence into words and create flexible pattern
  const words = sentence
    .split(/\s+/)
    .filter(w => w.length > 0)
    .map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  if (words.length === 0) {
    return { matched: false, html: htmlContent };
  }

  // For the first word, allow it to be split by HTML tags (like <span class="bold">R</span>ight)
  if (words.length > 0) {
    const firstWord = words[0];
    // Check if the first word might be split by HTML tags
    if (firstWord.length > 1) {
      // Create a pattern that allows the first letter to be in HTML tags
      const firstLetter = firstWord.charAt(0);
      const restOfWord = firstWord.slice(1);
      const flexibleFirstWord = `(?:<[^>]*>)*${firstLetter}(?:<[^>]*>)*${restOfWord}`;
      words[0] = flexibleFirstWord;
    }
  }

  // Create pattern that allows HTML tags and flexible whitespace between words
  const flexiblePattern = words.join('(?:<[^>]*>)*\\s*(?:<[^>]*>)*');
  const pattern = new RegExp(flexiblePattern, 'i');
  
  if (pattern.test(htmlContent)) {
    const newHtml = htmlContent.replace(pattern, (match) => {
      return `<span data-sentence-index="${index}">${match}</span>`;
    });
    return { matched: true, html: newHtml };
  }
  
  return { matched: false, html: htmlContent };
}

/**
 * Try to match using key words from the sentence (fallback)
 */
function matchKeyWords(htmlContent, sentence, index) {
  // For very short sentences or single words, try exact match only
  if (sentence.length < 20 || sentence.split(/\s+/).length <= 2) {
    return matchExactSentence(htmlContent, sentence, index);
  }
  
  // For longer sentences, this would be a more complex fallback
  // For now, we'll skip this to avoid false matches
  return { matched: false, html: htmlContent };
}

/**
 * Test data for unit testing different sentence types
 */
const TEST_CASES = {
  // Simple sentences
  SIMPLE: [
    'This is a simple sentence.',
    'Another sentence here!',
    'Is this a question?'
  ],
  
  // Titles and headers
  TITLES: [
    'CHAPTER ONE',
    'SENATE',
    'PART I'
  ],
  
  // Character names and descriptions
  CHARACTERS: [
    'Paula Myo—Investigator, Senate Security',
    'Justine Burnelli—Earth Socialite–now Senator',
    'Thompson Burnelli—Commonwealth Senator–undergoing re-life'
  ],
  
  // Complex sentences with formatting
  FORMATTED: [
    '<span class="bold">R</span>ight from the start, there was something wrong.',
    'The <em>important</em> thing was to remain calm.',
    'Chapter titles often have <strong>special formatting</strong>.'
  ],
  
  // Edge cases
  EDGE_CASES: [
    '', // Empty string
    '   ', // Whitespace only
    'Single', // Single word
    'Two words', // Two words
    'A very long sentence that goes on and on with multiple clauses and subclauses that might cause issues with regex matching and could potentially break the highlighting system if not handled properly.'
  ],
  
  // Content that should be pronounceable (kept for TTS)
  PRONOUNCEABLE: [
    'CHAPTER ONE', // All caps titles
    'SENATE', // All caps words
    'PART I', // Roman numerals
    'III', // Roman numerals
    '123', // Numbers are pronounceable
    'www.example.com', // Domain names are pronounceable
    'Volume II', // Mixed case with numbers
    'Section A' // Section headers
  ],
  
  // Non-pronounceable decorative content that should be filtered out
  NON_PRONOUNCEABLE: [
    '***', // Decorative asterisks
    '---', // Decorative dashes  
    '• • •', // Bullet point patterns
    '* * *', // Asterisk patterns
    '...', // Ellipsis only
    '————————', // Long decorative dashes
    '~~~~~~~~', // Tilde patterns
    '▪ ▪ ▪', // Square bullet patterns
    '═══════', // Double line patterns
    '« ^ »', // Unicode decorative sequences
    '« »', // Unicode quotes only
    '†', // Dagger symbol
    '‡', // Double dagger  
    '', // Empty
    '   ' // Whitespace only
  ]
};

// CommonJS exports for server (Node.js)
module.exports = {
  TEXT_CONFIG,
  splitIntoSentences,
  isPronounceableText,
  splitIntoPronounceable,
  processForTTSAndHighlighting,
  addSentenceSpans,
  TEST_CASES
};

// ES6 exports for client (browser/Vite)
if (typeof window !== 'undefined') {
  window.TextProcessing = {
    TEXT_CONFIG,
    splitIntoSentences,
    isPronounceableText,
    splitIntoPronounceable,
    processForTTSAndHighlighting,
    addSentenceSpans,
    TEST_CASES
  };
}