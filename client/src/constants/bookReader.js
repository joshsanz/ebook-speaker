// BookReader constants
export const STORAGE_KEYS = {
  SELECTED_VOICE: 'ebook-speaker-selected-voice',
  SELECTED_SPEED: 'ebook-speaker-selected-speed',
  SELECTED_MODEL: 'ebook-speaker-selected-model',
  AUTO_ADVANCE: 'ebook-speaker-auto-advance'
};

export const DEFAULT_VALUES = {
  VOICE: 'af_heart',
  SPEED: 1.0,
  MODEL: 'kokoro',
  AUTO_START_DELAY: 1000
};

export const ERROR_MESSAGES = {
  NO_TEXT_CONTENT: 'No text content available for speech',
  SPEECH_CANCELLED: 'Speech generation was cancelled',
  TTS_SERVER_ERROR: 'TTS server error. Make sure the TTS server is running on port 5005.',
  SPEECH_FAILED: 'Speech generation failed'
};
