// TTS configuration constants
export const TTS_CONFIG = {
  // Sentence processing
  MAX_SENTENCE_LENGTH: 400,
  MAX_CHUNK_LENGTH: 300,
  
  // Audio generation
  INITIAL_BATCH_SIZE: 1,
  GENERATION_DELAY: 100,
  
  // Playback timing
  AUDIO_END_DELAY: 10,
  PROCESSING_RESET_DELAY: 200,
  NAVIGATION_DELAY: 10,
  PLAY_RETRY_DELAY: 50,
  AUDIO_READY_DELAY: 100,
  WAIT_FOR_NEXT_DELAY: 100,
  
  // Audio readiness states
  AUDIO_READY_STATE: 2,
  
  // Default TTS settings
  DEFAULT_VOICE: 'mia',
  DEFAULT_SPEED: 1.0,
  DEFAULT_MODEL: 'kokoro',
  DEFAULT_FORMAT: 'wav'
};

// Error messages
export const TTS_ERRORS = {
  NO_TEXT_CONTENT: 'No text content available for speech',
  SERVICE_RESTARTING: 'TTS service is restarting. Please try again in a moment.',
  CONNECTION_ERROR: 'Cannot connect to TTS service. Please check your connection.',
  EMPTY_RESPONSE: 'Received empty audio response'
};

// Import shared text processing configuration
// Note: This will be loaded via window.TextProcessing for browser compatibility
export const TEXT_PATTERNS = {
  SENTENCE_SPLIT: /[.!?]+|\n+/,
  MAJOR_BREAKS: /[;—]\s+/,
  COMMA_BREAKS: /,\s+/
};