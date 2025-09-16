import { useCallback, useRef } from 'react';
import logger from '../utils/logger';

/**
 * Custom hook for managing sentence highlighting during TTS playback
 * @returns {Object} Highlighting control functions
 */
export const useSentenceHighlighting = () => {
  const currentHighlightedElement = useRef(null);

  /**
   * Clears the current sentence highlight
   */
  const clearHighlight = useCallback(() => {
    if (currentHighlightedElement.current) {
      currentHighlightedElement.current.classList.remove('sentence-highlight');
      currentHighlightedElement.current = null;
    }
  }, []);

  /**
   * Highlights a sentence by index
   * @param {number} index - Sentence index to highlight
   */
  const highlightSentence = useCallback((index) => {
    // Skip if trying to highlight the same sentence that's already highlighted
    if (currentHighlightedElement.current &&
        currentHighlightedElement.current.getAttribute('data-sentence-index') === String(index)) {
      return;
    }

    // Clear previous highlight
    clearHighlight();

    // Find and highlight the new sentence
    const sentenceElement = document.querySelector(`[data-sentence-index="${index}"]`);

    if (sentenceElement) {
      sentenceElement.classList.add('sentence-highlight');
      currentHighlightedElement.current = sentenceElement;


      // Scroll into view occasionally to avoid performance issues
      if (index % 5 === 0) {
        sentenceElement.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'nearest'
        });
      }
    } else {
      logger.warn(`[useSentenceHighlighting] Could not find element for sentence index ${index}`);

    }
  }, [clearHighlight]);

  /**
   * Clears all sentence highlights (cleanup function)
   */
  const clearAllHighlights = useCallback(() => {
    const highlightedElements = document.querySelectorAll('.sentence-highlight');
    highlightedElements.forEach(element => {
      element.classList.remove('sentence-highlight');
    });
    currentHighlightedElement.current = null;
  }, []);

  return {
    highlightSentence,
    clearHighlight,
    clearAllHighlights
  };
};