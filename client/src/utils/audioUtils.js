import { TTS_CONFIG, TTS_ERRORS } from '../constants/tts';
import logger from './logger';

/**
 * Generates audio for a single sentence via TTS API
 * @param {string} text - Text to convert to speech
 * @param {string} voice - Voice identifier
 * @param {number} speed - Playback speed
 * @param {string} model - TTS model identifier
 * @param {string} bookId - Book identifier for cache keying
 * @param {AbortSignal} signal - Abort controller signal
 * @returns {Promise<string>} Audio blob URL
 */
export const generateAudioForSentence = async (
  text,
  voice,
  speed = TTS_CONFIG.DEFAULT_SPEED,
  model = TTS_CONFIG.DEFAULT_MODEL,
  bookId,
  signal
) => {
  try {
    const response = await fetch('/api/tts/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        input: text,
        voice: voice,
        response_format: TTS_CONFIG.DEFAULT_FORMAT,
        speed: speed,
        bookId: bookId || undefined
      }),
      signal
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      
      if (response.status === 503) {
        throw new Error(TTS_ERRORS.SERVICE_RESTARTING);
      }
      
      throw new Error(`TTS API error: ${response.status} - ${errorData.message || response.statusText}`);
    }

    const audioBlob = await response.blob();
    
    if (audioBlob.size === 0) {
      throw new Error(TTS_ERRORS.EMPTY_RESPONSE);
    }

    return URL.createObjectURL(audioBlob);
  } catch (error) {
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error(TTS_ERRORS.CONNECTION_ERROR);
    }
    throw error;
  }
};

/**
 * Safely plays audio element with error handling
 * @param {HTMLAudioElement} audioElement - Audio element to play
 * @param {string} audioUrl - URL of audio to play
 * @param {number} index - Audio index for logging
 * @returns {Promise<boolean>} Success status
 */
export const playAudio = async (audioElement, audioUrl, index) => {
  if (!audioElement || !audioUrl) {
    return false;
  }

  try {
    // Pause current playback
    if (audioElement.readyState > 0 && !audioElement.paused) {
      audioElement.pause();
    }
    
    // Load new audio
    audioElement.src = audioUrl;
    audioElement.currentTime = 0;
    audioElement.load();

    // Wait for audio to be ready and play
    await waitForAudioReady(audioElement);
    await audioElement.play();
    
    logger.debug(`Successfully playing audio ${index}`);
    return true;
  } catch (error) {
    logger.error(`Error playing audio ${index}:`, error);
    return false;
  }
};

/**
 * Waits for audio element to be ready for playback
 * @param {HTMLAudioElement} audioElement - Audio element to check
 * @param {number} maxAttempts - Maximum number of attempts
 * @returns {Promise<boolean>} Ready status
 */
const waitForAudioReady = (audioElement, maxAttempts = 20) => {
  return new Promise((resolve) => {
    let attempts = 0;
    
    const checkReady = () => {
      if (audioElement.readyState >= TTS_CONFIG.AUDIO_READY_STATE || attempts >= maxAttempts) {
        resolve(audioElement.readyState >= TTS_CONFIG.AUDIO_READY_STATE);
      } else {
        attempts++;
        setTimeout(checkReady, TTS_CONFIG.PLAY_RETRY_DELAY);
      }
    };
    
    checkReady();
  });
};

/**
 * Cleans up audio URLs by revoking object URLs
 * @param {string[]} audioUrls - Array of audio URLs to clean up
 */
export const cleanupAudioUrls = (audioUrls) => {
  audioUrls.forEach(url => {
    try {
      URL.revokeObjectURL(url);
    } catch (error) {
      // Ignore errors from already revoked URLs
    }
  });
};

/**
 * Resets audio element to initial state
 * @param {HTMLAudioElement} audioElement - Audio element to reset
 */
export const resetAudioElement = (audioElement) => {
  if (audioElement) {
    audioElement.pause();
    audioElement.currentTime = 0;
  }
};
