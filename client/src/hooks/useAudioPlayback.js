import { useRef, useCallback } from 'react';
import { playAudio, resetAudioElement } from '../utils/audioUtils';
import { TTS_CONFIG } from '../constants/tts';
import logger from '../utils/logger';

/**
 * Custom hook for managing audio playback state and navigation
 * @param {Function} getAudioAtIndex - Function to get audio URL by index
 * @param {Function} getQueueLength - Function to get queue length
 * @returns {Object} Audio playback management functions and refs
 */
export const useAudioPlayback = (getAudioAtIndex, getQueueLength) => {
  const audioRef = useRef(null);
  const isProcessingEndRef = useRef(false);
  const isNavigatingRef = useRef(false);

  /**
   * Plays audio at specific index
   * @param {number} index - Audio index to play
   * @param {boolean} isPaused - Current pause state
   * @returns {Promise<boolean>} Success status
   */
  const playAudioAtIndex = useCallback(async (index, isPaused = false) => {
    const audioUrl = getAudioAtIndex(index);
    
    if (!audioUrl || !audioRef.current || isPaused) {
      return false;
    }

    return await playAudio(audioRef.current, audioUrl, index);
  }, [getAudioAtIndex]);

  /**
   * Navigates to specific audio index with playback
   * @param {number} targetIndex - Target audio index
   * @param {boolean} isPaused - Current pause state
   * @param {Function} setCurrentAudioIndex - Index setter function
   */
  const navigateToIndex = useCallback(async (targetIndex, isPaused, setCurrentAudioIndex) => {
    if (isNavigatingRef.current || targetIndex < 0 || targetIndex >= getQueueLength()) {
      return;
    }

    isNavigatingRef.current = true;

    setCurrentAudioIndex(targetIndex);

    // Small delay to allow state update
    setTimeout(async () => {
      const success = await playAudioAtIndex(targetIndex, isPaused);
      
      if (!success) {
        logger.warn(`Failed to navigate to audio ${targetIndex}`);
      }
      
      isNavigatingRef.current = false;
    }, TTS_CONFIG.NAVIGATION_DELAY);
  }, [getQueueLength, playAudioAtIndex]);

  /**
   * Handles audio ended event with proper sequencing
   * @param {number} currentIndex - Current audio index
   * @param {number} totalCount - Total audio count
   * @param {boolean} isPaused - Current pause state
   * @param {Function} setCurrentAudioIndex - Index setter
   * @param {Function} setIsSpeaking - Speaking state setter
   * @param {Function} setTotalAudioCount - Total count setter
   * @param {Function} onAutoAdvance - Auto advance callback
   * @param {Function} clearQueue - Queue clear function
   * @param {Object} abortController - Abort controller ref
   */
  const handleAudioEnded = useCallback((
    currentIndex, 
    totalCount, 
    isPaused, 
    setCurrentAudioIndex, 
    setIsSpeaking, 
    setTotalAudioCount,
    onAutoAdvance,
    clearQueue,
    abortController
  ) => {
    logger.info(`[useAudioPlayback] Audio ended for index ${currentIndex}, total: ${totalCount}`);
    
    // Prevent multiple simultaneous calls
    if (isProcessingEndRef.current || isNavigatingRef.current) {
      logger.info(`[useAudioPlayback] Already processing or navigating, ignoring duplicate call`);
      return;
    }

    isProcessingEndRef.current = true;

    // Use requestAnimationFrame to ensure proper timing and avoid blocking
    requestAnimationFrame(() => {
      const nextIndex = currentIndex + 1;
      logger.info(`[useAudioPlayback] Moving from index ${currentIndex} to ${nextIndex}`);

      if (nextIndex < totalCount) {
        logger.info(`[useAudioPlayback] Setting currentAudioIndex to ${nextIndex}`);
        setCurrentAudioIndex(nextIndex);
        waitForNextAudio(nextIndex, totalCount, isPaused, setIsSpeaking);
      } else {
        // Playback finished
        logger.info(`[useAudioPlayback] Playback finished at index ${currentIndex}`);
        finishPlayback(setIsSpeaking, setTotalAudioCount, clearQueue, onAutoAdvance, abortController);
      }

      // Reset processing flag
      setTimeout(() => {
        isProcessingEndRef.current = false;
      }, TTS_CONFIG.PROCESSING_RESET_DELAY);
    });
  }, []);

  /**
   * Waits for next audio to be available and plays it
   * @param {number} nextIndex - Next audio index
   * @param {number} totalCount - Total audio count
   * @param {boolean} isPaused - Current pause state
   * @param {Function} setIsSpeaking - Speaking state setter
   */
  const waitForNextAudio = useCallback((nextIndex, totalCount, isPaused, setIsSpeaking) => {
    const checkAndPlay = async () => {
      const audioUrl = getAudioAtIndex(nextIndex);
      
      if (audioUrl) {
        // Audio is ready, play it
        setTimeout(async () => {
          if (!isNavigatingRef.current) {
            const success = await playAudioAtIndex(nextIndex, isPaused);
            if (!success && nextIndex + 1 < totalCount) {
              // Try next audio if this one failed
              waitForNextAudio(nextIndex + 1, totalCount, isPaused, setIsSpeaking);
            }
          }
        }, TTS_CONFIG.AUDIO_READY_DELAY);
      } else if (nextIndex < totalCount) {
        // Audio still being generated, wait for it
        logger.debug(`Waiting for audio ${nextIndex} to be generated...`);
        setTimeout(checkAndPlay, TTS_CONFIG.WAIT_FOR_NEXT_DELAY);
      } else {
        // No more audio available
        setIsSpeaking(false);
      }
    };

    checkAndPlay();
  }, [getAudioAtIndex, playAudioAtIndex]);

  /**
   * Finishes playback and cleans up
   * @param {Function} setIsSpeaking - Speaking state setter
   * @param {Function} setTotalAudioCount - Total count setter
   * @param {Function} clearQueue - Queue clear function
   * @param {Function} onAutoAdvance - Auto advance callback
   * @param {Object} abortController - Abort controller ref
   */
  const finishPlayback = useCallback((setIsSpeaking, setTotalAudioCount, clearQueue, onAutoAdvance, abortController) => {
    logger.info('Playback finished');
    
    setIsSpeaking(false);
    setTotalAudioCount(0);
    clearQueue();

    // Call auto-advance if playback finished naturally
    if (!abortController.current?.signal.aborted && onAutoAdvance) {
      logger.info('Calling auto-advance callback');
      onAutoAdvance();
    }
  }, []);

  /**
   * Stops current audio playback
   */
  const stopCurrentAudio = useCallback(() => {
    resetAudioElement(audioRef.current);
    isProcessingEndRef.current = false;
    isNavigatingRef.current = false;
  }, []);

  return {
    audioRef,
    playAudioAtIndex,
    navigateToIndex,
    handleAudioEnded,
    stopCurrentAudio,
    isProcessingEndRef,
    isNavigatingRef
  };
};