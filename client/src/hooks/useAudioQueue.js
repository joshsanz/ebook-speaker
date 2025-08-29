import { useRef, useCallback } from 'react';
import { generateAudioForSentence, cleanupAudioUrls } from '../utils/audioUtils';
import { splitIntoSentences } from '../utils/textProcessing';
import { TTS_CONFIG } from '../constants/tts';
import logger from '../utils/logger';

/**
 * Custom hook for managing audio queue generation and playback
 * @returns {Object} Audio queue management functions and state
 */
export const useAudioQueue = () => {
  const audioQueueRef = useRef([]);
  const sentencesRef = useRef([]);
  const currentVoiceRef = useRef('');
  const currentSpeedRef = useRef(TTS_CONFIG.DEFAULT_SPEED);
  const abortControllerRef = useRef(null);

  /**
   * Generates audio queue for all sentences
   * @param {string|string[]} textOrSentences - Text to process OR pre-processed sentences array
   * @param {string} voice - Voice identifier
   * @param {number} speed - Playback speed
   * @param {Function} setIsLoadingAudio - Loading state setter
   * @param {Function} setTotalAudioCount - Total count setter
   * @returns {Promise<string[]>} Array of audio URLs
   */
  const generateAudioQueue = useCallback(async (textOrSentences, voice, speed, setIsLoadingAudio, setTotalAudioCount) => {
    // Support both raw text (legacy) and pre-processed sentences (new)
    const sentences = Array.isArray(textOrSentences) 
      ? textOrSentences 
      : splitIntoSentences(textOrSentences);

    if (sentences.length === 0) {
      return [];
    }

    // Store sentences and current settings for later regeneration
    sentencesRef.current = sentences;
    currentVoiceRef.current = voice;
    currentSpeedRef.current = speed;

    const audioUrls = [];
    setIsLoadingAudio(true);

    try {
      abortControllerRef.current = new AbortController();
      const initialBatch = Math.min(TTS_CONFIG.INITIAL_BATCH_SIZE, sentences.length);

      // Generate initial batch
      for (let i = 0; i < initialBatch; i++) {
        if (abortControllerRef.current?.signal.aborted) {
          break;
        }

        const audioUrl = await generateAudioForSentence(
          sentences[i], 
          voice, 
          speed, 
          abortControllerRef.current.signal
        );
        audioUrls.push(audioUrl);
      }

      if (audioUrls.length > 0) {
        audioQueueRef.current = [...audioUrls];
        setTotalAudioCount(sentences.length);
        setIsLoadingAudio(false);

        // Generate remaining sentences in background
        if (sentences.length > initialBatch) {
          generateRemainingAudio(sentences, voice, speed, initialBatch);
        }

        return audioUrls;
      }

      return [];
    } catch (error) {
      setIsLoadingAudio(false);
      throw error;
    }
  }, []);

  /**
   * Generates remaining audio in background
   * @param {string[]} sentences - All sentences
   * @param {string} voice - Voice identifier
   * @param {number} speed - Playback speed
   * @param {number} startIndex - Index to start from
   */
  const generateRemainingAudio = useCallback(async (sentences, voice, speed, startIndex) => {
    setTimeout(async () => {
      for (let i = startIndex; i < sentences.length; i++) {
        if (abortControllerRef.current?.signal.aborted) {
          break;
        }

        try {
          logger.debug(`Generating audio for sentence ${i + 1}/${sentences.length}`);
          const audioUrl = await generateAudioForSentence(
            sentences[i], 
            voice, 
            speed, 
            abortControllerRef.current.signal
          );
          audioQueueRef.current.push(audioUrl);
          logger.debug(`Added audio ${i} to queue. Queue length: ${audioQueueRef.current.length}`);
        } catch (error) {
          if (error.name === 'AbortError') {
            logger.info(`Audio generation cancelled for sentence ${i + 1}`);
            break;
          } else {
            logger.error(`Failed to generate audio for sentence ${i + 1}:`, error);
          }
        }
      }
    }, TTS_CONFIG.GENERATION_DELAY);
  }, []);

  /**
   * Regenerates remaining audio queue with new settings
   * @param {number} currentIndex - Current audio index
   * @param {string} newVoice - New voice identifier
   * @param {number} newSpeed - New playback speed
   * @param {boolean} isSpeaking - Current speaking state
   */
  const regenerateRemainingQueue = useCallback(async (currentIndex, newVoice, newSpeed, isSpeaking) => {
    if (!sentencesRef.current.length || !isSpeaking) {
      return;
    }

    // Update current settings
    currentVoiceRef.current = newVoice;
    currentSpeedRef.current = newSpeed;

    const nextAudioIndex = currentIndex + 1;
    if (nextAudioIndex >= sentencesRef.current.length) {
      return;
    }

    const remainingSentences = sentencesRef.current.slice(nextAudioIndex);
    
    // Keep current and previous audio
    const currentAndPreviousAudio = audioQueueRef.current.slice(0, nextAudioIndex);
    audioQueueRef.current = currentAndPreviousAudio;

    // Generate new audio for remaining sentences
    try {
      for (let i = 0; i < remainingSentences.length; i++) {
        const sentenceIndex = nextAudioIndex + i;

        if (abortControllerRef.current?.signal.aborted) {
          break;
        }

        try {
          logger.debug(`Regenerating audio for sentence ${sentenceIndex + 1}/${sentencesRef.current.length} with new settings`);
          const audioUrl = await generateAudioForSentence(
            remainingSentences[i], 
            newVoice, 
            newSpeed, 
            abortControllerRef.current.signal
          );

          audioQueueRef.current[sentenceIndex] = audioUrl;
          logger.debug(`Regenerated audio ${sentenceIndex}. Queue length: ${audioQueueRef.current.length}`);
        } catch (error) {
          if (error.name === 'AbortError') {
            logger.info(`Audio regeneration cancelled for sentence ${sentenceIndex + 1}`);
            break;
          } else {
            logger.error(`Failed to regenerate audio for sentence ${sentenceIndex + 1}:`, error);
          }
        }
      }
    } catch (error) {
      logger.error('Error regenerating audio queue:', error);
    }
  }, []);

  /**
   * Clears audio queue and resets state
   */
  const clearAudioQueue = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    cleanupAudioUrls(audioQueueRef.current);
    audioQueueRef.current = [];
    sentencesRef.current = [];
    currentVoiceRef.current = '';
    currentSpeedRef.current = TTS_CONFIG.DEFAULT_SPEED;
  }, []);

  /**
   * Gets current sentences array
   * @returns {string[]} Current sentences
   */
  const getCurrentSentences = useCallback(() => {
    return sentencesRef.current;
  }, []);

  /**
   * Gets audio URL at specific index
   * @param {number} index - Audio index
   * @returns {string|null} Audio URL or null
   */
  const getAudioAtIndex = useCallback((index) => {
    return audioQueueRef.current[index] || null;
  }, []);

  /**
   * Gets current queue length
   * @returns {number} Queue length
   */
  const getQueueLength = useCallback(() => {
    return audioQueueRef.current.length;
  }, []);

  return {
    generateAudioQueue,
    regenerateRemainingQueue,
    clearAudioQueue,
    getCurrentSentences,
    getAudioAtIndex,
    getQueueLength,
    currentVoiceRef,
    currentSpeedRef
  };
};