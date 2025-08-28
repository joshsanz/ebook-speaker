import { useCallback, useRef } from 'react';

/**
 * Custom hook for managing sentence highlighting during TTS playback
 * @returns {Object} Highlighting control functions
 */
export const useSentenceHighlighting = () => {
  const currentHighlightedElement = useRef(null);

  /**
   * Highlights a sentence by index
   * @param {number} index - Sentence index to highlight
   */
  const highlightSentence = useCallback((index) => {
    // Clear previous highlight
    clearHighlight();
    
    // Find and highlight the new sentence
    const sentenceElement = document.querySelector(`[data-sentence-index="${index}"]`);
    if (sentenceElement) {
      sentenceElement.classList.add('sentence-highlight');
      currentHighlightedElement.current = sentenceElement;
      
      // Scroll the highlighted sentence into view
      sentenceElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      });
    }
  }, []);

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