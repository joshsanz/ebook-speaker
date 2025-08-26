import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import logger from '../utils/logger';

/**
 * Custom hook for chapter navigation logic
 * @param {string} filename - Current book filename
 * @param {Array} chapters - Array of chapters
 * @param {Object} currentChapter - Current chapter object
 * @param {Function} stopSpeaking - Function to stop TTS
 * @param {Function} executeCleanup - Cleanup function
 * @returns {Object} Navigation functions and utilities
 */
export const useChapterNavigation = (filename, chapters, currentChapter, stopSpeaking, executeCleanup) => {
  const navigate = useNavigate();

  const getCurrentChapterIndex = useCallback(() => {
    if (!currentChapter || !chapters.length) return -1;

    // First try to find by exact ID match
    let index = chapters.findIndex(ch => ch.id === currentChapter.id);

    // If not found, try to find by order number as fallback
    if (index === -1) {
      logger.warn(`Chapter ID ${currentChapter.id} not found in chapters list, trying order fallback`);
      index = chapters.findIndex(ch => ch.order === currentChapter.order);
    }

    // If still not found, log warning and return -1
    if (index === -1) {
      logger.error(`Could not find current chapter ${currentChapter.title} (ID: ${currentChapter.id}) in chapters list`);
      logger.debug('Available chapters:', chapters.map(ch => `${ch.order}: ${ch.title} (ID: ${ch.id})`));
    }

    return index;
  }, [currentChapter, chapters]);

  const goBackToTOC = useCallback(() => {
    // Stop speaking first, then execute other cleanup
    stopSpeaking();
    executeCleanup();

    // Force navigation by using replace to ensure clean state
    navigate(`/book/${encodeURIComponent(filename)}`, { replace: true });
  }, [navigate, filename, stopSpeaking, executeCleanup]);

  const goToPreviousChapter = useCallback(() => {
    const currentIndex = getCurrentChapterIndex();
    if (currentIndex > 0) {
      stopSpeaking();
      executeCleanup();
      navigate(`/book/${encodeURIComponent(filename)}/chapter/${chapters[currentIndex - 1].id}`);
    }
  }, [getCurrentChapterIndex, navigate, filename, chapters, stopSpeaking, executeCleanup]);

  const goToNextChapter = useCallback(() => {
    const currentIndex = getCurrentChapterIndex();
    if (currentIndex < chapters.length - 1) {
      stopSpeaking();
      executeCleanup();
      navigate(`/book/${encodeURIComponent(filename)}/chapter/${chapters[currentIndex + 1].id}`);
    }
  }, [getCurrentChapterIndex, navigate, filename, chapters, stopSpeaking, executeCleanup]);

  const handleInternalLinkClick = useCallback((event) => {
    const link = event.target.closest('a[data-internal-link="true"]');
    if (!link) return;

    event.preventDefault();

    const chapterId = link.getAttribute('data-chapter-id');
    const fragment = link.getAttribute('data-fragment');

    if (chapterId) {
      // Stop current speech before navigating
      stopSpeaking();
      executeCleanup();

      // Navigate to the new chapter
      const newPath = `/book/${encodeURIComponent(filename)}/chapter/${chapterId}`;

      // Handle fragment navigation after React router navigation completes
      if (fragment) {
        navigate(newPath);
        // Use setTimeout to wait for navigation and DOM update
        setTimeout(() => {
          const targetElement = document.getElementById(fragment);
          if (targetElement) {
            targetElement.scrollIntoView({
              behavior: 'smooth',
              block: 'start'
            });
          }
        }, 100);
      } else {
        navigate(newPath);
      }
    }
  }, [navigate, filename, stopSpeaking, executeCleanup]);

  return {
    getCurrentChapterIndex,
    goBackToTOC,
    goToPreviousChapter,
    goToNextChapter,
    handleInternalLinkClick
  };
};