import { useState, useEffect, useMemo, useCallback } from 'react';

export const useVoices = () => {
  const [voices, setVoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
  const fetchVoices = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/tts/voices');
      if (!response.ok) {
        throw new Error(`Failed to fetch voices: ${response.status}`);
      }
      
      const voicesData = await response.json();
      setVoices(voicesData);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching voices:', err);
      
      // Fallback to hardcoded voices if API fails
      setVoices([
        { name: 'af_heart', language: 'en', gender: 'female', description: 'American Female Heart' },
        { name: 'am_adam', language: 'en', gender: 'male', description: 'American Male Adam' },
        { name: 'bf_emma', language: 'en', gender: 'female', description: 'British Female Emma' },
        { name: 'bm_lewis', language: 'en', gender: 'male', description: 'British Male Lewis' },
      ]);
    } finally {
      setLoading(false);
    }
  };

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
      // Prefer 'af_heart' if available, otherwise use first voice
      const preferred = processedVoices.find(v => v.name === 'af_heart');
      return preferred ? preferred.name : processedVoices[0].name;
    }
    return 'af_heart'; // Fallback
  };

  useEffect(() => {
    fetchVoices();
  }, []);

  return {
    voices: processedVoices,
    groupedVoices,
    loading,
    error,
    refetch: fetchVoices,
    getDefaultVoice
  };
};