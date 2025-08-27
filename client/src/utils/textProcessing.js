import { TTS_CONFIG, TEXT_PATTERNS } from '../constants/tts';

/**
 * Splits text into manageable sentences for TTS processing
 * @param {string} text - Input text to split
 * @returns {string[]} Array of processed sentences
 */
export const splitIntoSentences = (text) => {
  const sentences = text
    .split(TEXT_PATTERNS.SENTENCE_SPLIT)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  const processedSentences = [];
  
  sentences.forEach((sentence) => {
    if (sentence.length > TTS_CONFIG.MAX_SENTENCE_LENGTH) {
      processingLongSentence(sentence, processedSentences);
    } else {
      processedSentences.push(sentence);
    }
  });

  return processedSentences.filter(s => s.length > 0);
};

/**
 * Processes long sentences by breaking them at major punctuation points
 * @param {string} sentence - Long sentence to process
 * @param {string[]} processedSentences - Array to accumulate processed sentences
 */
const processingLongSentence = (sentence, processedSentences) => {
  const majorBreaks = sentence.split(TEXT_PATTERNS.MAJOR_BREAKS);
  
  majorBreaks.forEach((part, index) => {
    if (index < majorBreaks.length - 1) {
      part += ';';
    }

    if (part.length > TTS_CONFIG.MAX_CHUNK_LENGTH) {
      processLongChunk(part, processedSentences);
    } else {
      processedSentences.push(part.trim());
    }
  });
};

/**
 * Processes long chunks by breaking them at comma points
 * @param {string} part - Long chunk to process
 * @param {string[]} processedSentences - Array to accumulate processed sentences
 */
const processLongChunk = (part, processedSentences) => {
  const commaBreaks = part.split(TEXT_PATTERNS.COMMA_BREAKS);
  let currentChunk = '';

  commaBreaks.forEach((chunk, chunkIndex) => {
    const separator = chunkIndex < commaBreaks.length - 1 ? ', ' : '';
    
    if (currentChunk.length + chunk.length + separator.length <= TTS_CONFIG.MAX_CHUNK_LENGTH) {
      currentChunk += chunk + separator;
    } else {
      if (currentChunk) {
        processedSentences.push(currentChunk.trim());
      }
      currentChunk = chunk + separator;
    }
  });

  if (currentChunk) {
    processedSentences.push(currentChunk.trim());
  }
};