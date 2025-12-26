/**
 * Static list of available TTS voices for Kokoro and Supertonic models
 * This file maintains a definitive list of all available voices for both TTS engines
 * to ensure consistency across frontend and backend without runtime discovery
 */

/**
 * Supertonic TTS Voices - 10 voices total (5 male, 5 female)
 * All voices are English only
 * Voice naming: M1-M5 (Male), F1-F5 (Female)
 */
export const SUPERTONIC_VOICES = [
  { name: 'M1', language: 'en', gender: 'male', description: 'English Male M1' },
  { name: 'M2', language: 'en', gender: 'male', description: 'English Male M2' },
  { name: 'M3', language: 'en', gender: 'male', description: 'English Male M3' },
  { name: 'M4', language: 'en', gender: 'male', description: 'English Male M4' },
  { name: 'M5', language: 'en', gender: 'male', description: 'English Male M5' },
  { name: 'F1', language: 'en', gender: 'female', description: 'English Female F1' },
  { name: 'F2', language: 'en', gender: 'female', description: 'English Female F2' },
  { name: 'F3', language: 'en', gender: 'female', description: 'English Female F3' },
  { name: 'F4', language: 'en', gender: 'female', description: 'English Female F4' },
  { name: 'F5', language: 'en', gender: 'female', description: 'English Female F5' },
];

/**
 * Kokoro TTS Voices - Multilingual support
 * Voice naming convention: [language_code][gender]_[name]
 * Language codes: a=American, b=British, j=Japanese, k=Korean, z=Chinese, e=Spanish, f=French, g=German, i=Italian, p=Portuguese
 * Gender codes: f=female, m=male
 */
export const KOKORO_VOICES = [
  // American English voices (a + gender)
  { name: 'af_heart', language: 'en', gender: 'female', description: 'American Female Heart' },
  { name: 'af_bella', language: 'en', gender: 'female', description: 'American Female Bella' },
  { name: 'af_nicole', language: 'en', gender: 'female', description: 'American Female Nicole' },
  { name: 'af_sarah', language: 'en', gender: 'female', description: 'American Female Sarah' },
  { name: 'af_amber', language: 'en', gender: 'female', description: 'American Female Amber' },
  { name: 'am_adam', language: 'en', gender: 'male', description: 'American Male Adam' },
  { name: 'am_michael', language: 'en', gender: 'male', description: 'American Male Michael' },
  { name: 'am_john', language: 'en', gender: 'male', description: 'American Male John' },

  // British English voices (b + gender)
  { name: 'bf_emma', language: 'en', gender: 'female', description: 'British Female Emma' },
  { name: 'bf_olivia', language: 'en', gender: 'female', description: 'British Female Olivia' },
  { name: 'bm_lewis', language: 'en', gender: 'male', description: 'British Male Lewis' },
  { name: 'bm_james', language: 'en', gender: 'male', description: 'British Male James' },

  // Japanese voices (j + gender)
  { name: 'jf_nanako', language: 'ja', gender: 'female', description: 'Japanese Female Nanako' },
  { name: 'jf_akari', language: 'ja', gender: 'female', description: 'Japanese Female Akari' },
  { name: 'jm_hayato', language: 'ja', gender: 'male', description: 'Japanese Male Hayato' },
  { name: 'jm_daichi', language: 'ja', gender: 'male', description: 'Japanese Male Daichi' },

  // Korean voices (k + gender)
  { name: 'kf_minji', language: 'ko', gender: 'female', description: 'Korean Female Minji' },
  { name: 'kf_soyeon', language: 'ko', gender: 'female', description: 'Korean Female Soyeon' },
  { name: 'km_junho', language: 'ko', gender: 'male', description: 'Korean Male Junho' },
  { name: 'km_sung', language: 'ko', gender: 'male', description: 'Korean Male Sung' },

  // Chinese voices (z + gender)
  { name: 'zf_xiaoxiao', language: 'zh', gender: 'female', description: 'Chinese Female Xiaoxiao' },
  { name: 'zf_xiaowan', language: 'zh', gender: 'female', description: 'Chinese Female Xiaowan' },
  { name: 'zm_xiaoyu', language: 'zh', gender: 'male', description: 'Chinese Male Xiaoyu' },
  { name: 'zm_yunxi', language: 'zh', gender: 'male', description: 'Chinese Male Yunxi' },

  // Spanish voices (e + gender)
  { name: 'ef_carmen', language: 'es', gender: 'female', description: 'Spanish Female Carmen' },
  { name: 'ef_rosa', language: 'es', gender: 'female', description: 'Spanish Female Rosa' },
  { name: 'em_carlos', language: 'es', gender: 'male', description: 'Spanish Male Carlos' },
  { name: 'em_juan', language: 'es', gender: 'male', description: 'Spanish Male Juan' },

  // French voices (f + gender)
  { name: 'ff_léa', language: 'fr', gender: 'female', description: 'French Female Léa' },
  { name: 'ff_marie', language: 'fr', gender: 'female', description: 'French Female Marie' },
  { name: 'fm_bruno', language: 'fr', gender: 'male', description: 'French Male Bruno' },
  { name: 'fm_jean', language: 'fr', gender: 'male', description: 'French Male Jean' },

  // German voices (g + gender)
  { name: 'gf_anna', language: 'de', gender: 'female', description: 'German Female Anna' },
  { name: 'gf_birgitta', language: 'de', gender: 'female', description: 'German Female Birgitta' },
  { name: 'gm_lars', language: 'de', gender: 'male', description: 'German Male Lars' },
  { name: 'gm_markus', language: 'de', gender: 'male', description: 'German Male Markus' },

  // Italian voices (i + gender)
  { name: 'if_giulia', language: 'it', gender: 'female', description: 'Italian Female Giulia' },
  { name: 'if_paola', language: 'it', gender: 'female', description: 'Italian Female Paola' },
  { name: 'im_marco', language: 'it', gender: 'male', description: 'Italian Male Marco' },
  { name: 'im_stefano', language: 'it', gender: 'male', description: 'Italian Male Stefano' },

  // Portuguese voices (p + gender)
  { name: 'pf_helena', language: 'pt', gender: 'female', description: 'Portuguese Female Helena' },
  { name: 'pf_fernanda', language: 'pt', gender: 'female', description: 'Portuguese Female Fernanda' },
  { name: 'pm_paulo', language: 'pt', gender: 'male', description: 'Portuguese Male Paulo' },
  { name: 'pm_sergio', language: 'pt', gender: 'male', description: 'Portuguese Male Sergio' },
];

/**
 * Get voices by model name
 * @param {string} model - Model name ('kokoro' or 'supertonic')
 * @returns {Array} Array of voice objects for the specified model
 */
export const getVoicesByModel = (model) => {
  if (model === 'supertonic') {
    return SUPERTONIC_VOICES;
  } else if (model === 'kokoro') {
    return KOKORO_VOICES;
  }
  return [];
};

/**
 * Get voice by name and model
 * @param {string} voiceName - The voice name (e.g., 'af_heart', 'M1')
 * @param {string} model - Model name ('kokoro' or 'supertonic')
 * @returns {Object|null} Voice object or null if not found
 */
export const getVoiceByName = (voiceName, model) => {
  const voices = getVoicesByModel(model);
  return voices.find(v => v.name === voiceName) || null;
};

/**
 * Get default voice for a model
 * @param {string} model - Model name ('kokoro' or 'supertonic')
 * @returns {string} Default voice name
 */
export const getDefaultVoice = (model) => {
  if (model === 'supertonic') {
    return 'M1';
  }
  return 'af_heart'; // Default to Kokoro American Female Heart
};

/**
 * Get voice names only (useful for validation)
 * @param {string} model - Model name ('kokoro' or 'supertonic')
 * @returns {Array} Array of voice names
 */
export const getVoiceNames = (model) => {
  return getVoicesByModel(model).map(v => v.name);
};

/**
 * Check if a voice name is valid for a given model
 * @param {string} voiceName - Voice name to validate
 * @param {string} model - Model name ('kokoro' or 'supertonic')
 * @returns {boolean} True if voice is valid for the model
 */
export const isValidVoice = (voiceName, model) => {
  return getVoiceNames(model).includes(voiceName);
};
