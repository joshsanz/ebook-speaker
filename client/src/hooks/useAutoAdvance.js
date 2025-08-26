import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocalStorage } from './useLocalStorage';
import { STORAGE_KEYS } from '../constants/bookReader';
import logger from '../utils/logger';

/**
 * Custom hook for auto-advance functionality
 * @param {string} filename - Current book filename
 * @param {Array} chapters - Array of chapters
 * @param {Object} currentChapter - Current chapter object
 * @returns {Object} Auto-advance state and functions
 */
export const useAutoAdvance = (filename, chapters, currentChapter) => {
  const navigate = useNavigate();
  const [autoAdvanceEnabled, setAutoAdvanceEnabled] = useLocalStorage(
    STORAGE_KEYS.AUTO_ADVANCE, 
    false, 
    (value) => JSON.parse(value)
  );
  const [shouldAutoAdvance, setShouldAutoAdvance] = useState(false);
  const [autoStartTTS, setAutoStartTTS] = useState(false);

  // Auto-advance callback function
  const handleAutoAdvance = useCallback(() => {
    if (autoAdvanceEnabled && chapters.length > 0 && currentChapter) {
      // Get current chapter index inline to avoid dependency issues
      let currentIndex = chapters.findIndex(ch => ch.id === currentChapter.id);
      if (currentIndex === -1) {
        // Fallback to order-based lookup
        currentIndex = chapters.findIndex(ch => ch.order === currentChapter.order);
      }

      if (currentIndex >= 0 && currentIndex < chapters.length - 1) {
        logger.info('Auto-advancing to next chapter');
        // Set flags for navigation and auto-start
        setShouldAutoAdvance(true);
        setAutoStartTTS(true); // Persistent flag that survives navigation
      }
    }
  }, [autoAdvanceEnabled, chapters, currentChapter]);

  // Handle auto-advance navigation in useEffect to avoid render-time navigation
  useEffect(() => {
    if (shouldAutoAdvance && currentChapter) {
      let currentIndex = chapters.findIndex(ch => ch.id === currentChapter.id);
      if (currentIndex === -1) {
        // Fallback to order-based lookup
        currentIndex = chapters.findIndex(ch => ch.order === currentChapter.order);
      }

      if (currentIndex >= 0 && currentIndex < chapters.length - 1) {
        navigate(`/book/${encodeURIComponent(filename)}/chapter/${chapters[currentIndex + 1].id}`);
      }
      setShouldAutoAdvance(false); // Reset the flag
    }
  }, [shouldAutoAdvance, currentChapter, chapters, filename, navigate]);

  const toggleAutoAdvance = useCallback(() => {
    setAutoAdvanceEnabled(!autoAdvanceEnabled);
  }, [autoAdvanceEnabled, setAutoAdvanceEnabled]);

  return {
    autoAdvanceEnabled,
    autoStartTTS,
    setAutoStartTTS,
    handleAutoAdvance,
    toggleAutoAdvance
  };
};