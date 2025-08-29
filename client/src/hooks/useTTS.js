import { useState, useCallback, useEffect } from 'react';
import { useAudioQueue } from './useAudioQueue';
import { useAudioPlayback } from './useAudioPlayback';
import { TTS_CONFIG, TTS_ERRORS } from '../constants/tts';
import logger from '../utils/logger';

/**
 * Custom hook for Text-to-Speech functionality
 * @param {Function} onAutoAdvance - Callback for auto-advance functionality
 * @returns {Object} TTS state and control functions
 */
export const useTTS = (onAutoAdvance) => {
  // State management
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [currentAudioIndex, setCurrentAudioIndex] = useState(0);
  const [totalAudioCount, setTotalAudioCount] = useState(0);

  // Custom hooks for queue and playback management
  const {
    generateAudioQueue,
    regenerateRemainingQueue,
    clearAudioQueue,
    getCurrentSentences,
    getAudioAtIndex,
    getQueueLength,
    currentVoiceRef,
    currentSpeedRef
  } = useAudioQueue();

  const {
    audioRef,
    playAudioAtIndex,
    navigateToIndex,
    handleAudioEnded: handleAudioEndedCore,
    stopCurrentAudio
  } = useAudioPlayback(getAudioAtIndex, getQueueLength);

  /**
   * Handles audio ended event by delegating to core handler
   */
  const handleAudioEnded = useCallback(() => {
    handleAudioEndedCore(
      currentAudioIndex,
      totalAudioCount,
      isPaused,
      setCurrentAudioIndex,
      setIsSpeaking,
      setTotalAudioCount,
      onAutoAdvance,
      clearAudioQueue,
      { current: null } // placeholder for abort controller
    );
  }, [currentAudioIndex, totalAudioCount, isPaused, onAutoAdvance, handleAudioEndedCore, clearAudioQueue]);

  /**
   * Starts TTS playback for given text or pre-processed sentences
   * @param {string|string[]} textOrSentences - Text to speak OR pre-processed sentences array
   * @param {string} voice - Voice identifier
   * @param {number} speed - Playback speed
   */
  const speakText = useCallback(async (textOrSentences, voice = TTS_CONFIG.DEFAULT_VOICE, speed = TTS_CONFIG.DEFAULT_SPEED) => {
    if (isSpeaking) {
      stopSpeaking();
      return;
    }

    // Validate input - support both text and sentences array
    const hasContent = Array.isArray(textOrSentences) 
      ? textOrSentences.length > 0 
      : textOrSentences && textOrSentences.trim();
      
    if (!hasContent) {
      throw new Error(TTS_ERRORS.NO_TEXT_CONTENT);
    }

    try {
      logger.info(`[useTTS] Starting TTS playback - setting isSpeaking=true, currentAudioIndex=0`);
      setIsSpeaking(true);
      setCurrentAudioIndex(0);

      const audioUrls = await generateAudioQueue(textOrSentences, voice, speed, setIsLoadingAudio, setTotalAudioCount);
      logger.info(`[useTTS] Generated ${audioUrls.length} audio URLs`);

      if (audioUrls.length > 0) {
        // Start playing first audio after a short delay
        setTimeout(async () => {
          logger.info(`[useTTS] Starting initial audio playback at index 0`);
          const success = await playAudioAtIndex(0, isPaused);
          if (!success) {
            logger.error('Failed to start initial audio playback');
            setIsSpeaking(false);
            setIsLoadingAudio(false);
          } else {
            logger.info(`[useTTS] Initial audio playback started successfully`);
          }
        }, TTS_CONFIG.AUDIO_READY_DELAY);
      } else {
        logger.warn(`[useTTS] No audio URLs generated, setting isSpeaking=false`);
        setIsSpeaking(false);
      }
    } catch (error) {
      setIsSpeaking(false);
      setIsLoadingAudio(false);
      throw error;
    }
  }, [isSpeaking, generateAudioQueue, playAudioAtIndex, isPaused]);

  /**
   * Pauses current TTS playback
   */
  const pauseSpeaking = useCallback(() => {
    if (audioRef.current && isSpeaking && !isPaused) {
      audioRef.current.pause();
      setIsPaused(true);
    }
  }, [isSpeaking, isPaused]);

  /**
   * Resumes paused TTS playback
   */
  const resumeSpeaking = useCallback(() => {
    if (audioRef.current && isSpeaking && isPaused) {
      audioRef.current.play().catch(error => {
        logger.error('Error resuming audio:', error);
      });
      setIsPaused(false);
    }
  }, [isSpeaking, isPaused]);

  /**
   * Fast-forwards to next sentence
   */
  const fastForward = useCallback(() => {
    if (isSpeaking && currentAudioIndex < totalAudioCount - 1) {
      navigateToIndex(currentAudioIndex + 1, isPaused, setCurrentAudioIndex);
    }
  }, [isSpeaking, currentAudioIndex, totalAudioCount, isPaused, navigateToIndex]);

  /**
   * Rewinds to previous sentence
   */
  const rewind = useCallback(() => {
    if (isSpeaking && currentAudioIndex > 0) {
      navigateToIndex(currentAudioIndex - 1, isPaused, setCurrentAudioIndex);
    }
  }, [isSpeaking, currentAudioIndex, isPaused, navigateToIndex]);

  /**
   * Stops current TTS playback completely
   */
  const stopSpeaking = useCallback(() => {
    stopCurrentAudio();
    clearAudioQueue();
    
    // Reset all state
    setTotalAudioCount(0);
    setCurrentAudioIndex(0);
    setIsSpeaking(false);
    setIsPaused(false);
    setIsLoadingAudio(false);
  }, [stopCurrentAudio, clearAudioQueue]);

  /**
   * Handles speed changes during playback
   * @param {number} newSpeed - New playback speed
   */
  const handleSpeedChange = useCallback(async (newSpeed) => {
    if (!isSpeaking) {
      currentSpeedRef.current = newSpeed;
      return;
    }

    await regenerateRemainingQueue(currentAudioIndex, currentVoiceRef.current, newSpeed, isSpeaking);
  }, [isSpeaking, currentAudioIndex, regenerateRemainingQueue]);

  /**
   * Handles voice changes during playback
   * @param {string} newVoice - New voice identifier
   */
  const handleVoiceChange = useCallback(async (newVoice) => {
    if (!isSpeaking) {
      currentVoiceRef.current = newVoice;
      return;
    }

    await regenerateRemainingQueue(currentAudioIndex, newVoice, currentSpeedRef.current, isSpeaking);
  }, [isSpeaking, currentAudioIndex, regenerateRemainingQueue]);

  /**
   * Gets current sentences being processed
   * @returns {string[]} Array of sentences
   */
  const getCurrentSentencesForHighlighting = useCallback(() => {
    return getCurrentSentences();
  }, [getCurrentSentences]);

  // Cleanup effect
  useEffect(() => {
    return () => {
      clearAudioQueue();
    };
  }, [clearAudioQueue]);

  return {
    // State
    isSpeaking,
    isPaused,
    isLoadingAudio,
    totalAudioCount,
    currentAudioIndex,
    audioRef,
    
    // Control functions
    speakText,
    pauseSpeaking,
    resumeSpeaking,
    fastForward,
    rewind,
    stopSpeaking,
    handleAudioEnded,
    handleSpeedChange,
    handleVoiceChange,
    
    // Additional utilities for highlighting
    getCurrentSentencesForHighlighting
  };
};