import { useState, useEffect, useMemo, useCallback } from 'react';
import { TTS_CONFIG } from '../constants/tts';
import logger from '../utils/logger';

export const useVoices = (model = TTS_CONFIG.DEFAULT_MODEL) => {
  const [voices, setVoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const modelToUse = model || TTS_CONFIG.DEFAULT_MODEL;

  // Memoized emoji mappings to prevent re-creation on every render
  const languageEmojis = useMemo(() => ({
    'en': '🇺🇸', // Default to US flag for English
    'ja': '🇯🇵',
    'ko': '🇰🇷',
    'zh': '🇨🇳',
    'es': '🇪🇸',
    'fr': '🇫🇷',
    'de': '🇩🇪',
    'it': '🇮🇹',
    'pt': '🇵🇹'
  }), []);

  const genderEmojis = useMemo(() => ({
    'male': '🧔‍♂️',
    'female': '👩',
    'unknown': '👤'
  }), []);

  // Special handling for American vs British English
  const getLanguageEmoji = useCallback((voiceName, language) => {
    if (language === 'en') {
      // Check if it's British English based on voice name prefix
      // British voices start with 'b' (like 'bf_' for British female, 'bm_' for British male)
      if (voiceName.startsWith('b')) {
        return '🇬🇧';
      }
      // American voices start with 'a' (like 'af_' for American female, 'am_' for American male)
      return '🇺🇸'; // Default to American for 'a' prefix and others
    }
    return languageEmojis[language] || '🌐';
  }, [languageEmojis]);

  // Process voices to add emoji display names
  const processedVoices = useMemo(() => {
    return voices.map(voice => {
      const langEmoji = getLanguageEmoji(voice.name, voice.language);
      const genderEmoji = genderEmojis[voice.gender] || '👤';
      
      // Extract the actual name part after the underscore and capitalize it
      const nameParts = voice.name.split('_');
      const actualName = nameParts.length > 1 
        ? nameParts[1].charAt(0).toUpperCase() + nameParts[1].slice(1)
        : voice.name.charAt(0).toUpperCase() + voice.name.slice(1);
      
      // Create a friendly display name
      const displayName = `${langEmoji} ${genderEmoji} ${actualName}`;
      
      return {
        ...voice,
        displayName,
        actualName,
        languageEmoji: langEmoji,
        genderEmoji: genderEmoji
      };
    });
  }, [voices, genderEmojis, getLanguageEmoji]);

  // Fetch voices from API
  const fetchVoices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/tts/voices?model=${encodeURIComponent(modelToUse)}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch voices: ${response.status}`);
      }
      
      const voicesData = await response.json();
      setVoices(voicesData);
    } catch (err) {
      setError(err.message);
      logger.error('Error fetching voices:', err);
      
      // Fallback to hardcoded voices if API fails
      logger.warn('Using fallback voices due to API error');
      if (modelToUse === 'supertonic') {
        setVoices([
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
        ]);
      } else {
        setVoices([
          { name: 'af_heart', language: 'en', gender: 'female', description: 'American Female Heart' },
          { name: 'am_adam', language: 'en', gender: 'male', description: 'American Male Adam' },
          { name: 'bf_emma', language: 'en', gender: 'female', description: 'British Female Emma' },
          { name: 'bm_lewis', language: 'en', gender: 'male', description: 'British Male Lewis' },
        ]);
      }
    } finally {
      setLoading(false);
    }
  }, [modelToUse]);

  // Group voices by language for organized display
  const groupedVoices = useMemo(() => {
    const groups = {};
    processedVoices.forEach(voice => {
      // Create more specific grouping for English variants
      let langKey = voice.language;
      if (voice.language === 'en') {
        // Separate American and British English
        langKey = voice.name.startsWith('b') ? 'en-GB' : 'en-US';
      }
      
      if (!groups[langKey]) {
        groups[langKey] = [];
      }
      groups[langKey].push(voice);
    });
    
    // Sort voices within each language group
    Object.keys(groups).forEach(lang => {
      groups[lang].sort((a, b) => {
        // Sort by gender (female first), then by name
        if (a.gender !== b.gender) {
          return a.gender === 'female' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
    });
    
    return groups;
  }, [processedVoices]);

  // Get default voice (first available voice or fallback)
  const getDefaultVoice = () => {
    if (processedVoices.length > 0) {
      const preferredName = modelToUse === 'supertonic' ? 'F1' : 'af_heart';
      const preferred = processedVoices.find(v => v.name === preferredName);
      return preferred ? preferred.name : processedVoices[0].name;
    }
    return modelToUse === 'supertonic' ? 'F1' : 'af_heart';
  };

  useEffect(() => {
    fetchVoices();
  }, [fetchVoices]);

  return {
    voices: processedVoices,
    groupedVoices,
    loading,
    error,
    refetch: fetchVoices,
    getDefaultVoice
  };
};
