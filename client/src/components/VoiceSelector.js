import React from 'react';
import './VoiceSelector.css';

const VoiceSelector = ({ 
  voices, 
  groupedVoices, 
  selectedVoice, 
  onVoiceChange, 
  disabled = false,
  loading = false,
  error = null 
}) => {
  if (loading) {
    return (
      <div className="voice-selection">
        <label htmlFor="voice-select">Voice:</label>
        <select disabled className="voice-dropdown loading">
          <option>Loading voices...</option>
        </select>
      </div>
    );
  }

  if (error) {
    return (
      <div className="voice-selection">
        <label htmlFor="voice-select">Voice:</label>
        <select disabled className="voice-dropdown error">
          <option>Error loading voices: {error}</option>
        </select>
      </div>
    );
  }

  if (voices.length === 0) {
    return (
      <div className="voice-selection">
        <label htmlFor="voice-select">Voice:</label>
        <select disabled className="voice-dropdown error">
          <option>No voices available</option>
        </select>
      </div>
    );
  }

  return (
    <div className="voice-selection">
      <label htmlFor="voice-select">Voice:</label>
      <select
        id="voice-select"
        value={selectedVoice}
        onChange={(e) => onVoiceChange(e.target.value)}
        disabled={disabled}
        className="voice-dropdown"
      >
        {Object.keys(groupedVoices).length > 1 ? (
          // If we have multiple languages, group them
          Object.entries(groupedVoices).map(([language, langVoices]) => {
            // Create friendly labels for language groups
            let groupLabel = language.toUpperCase();
            if (language === 'en-US') {
              groupLabel = 'AMERICAN ENGLISH';
            } else if (language === 'en-GB') {
              groupLabel = 'BRITISH ENGLISH';
            }
            
            return (
              <optgroup 
                key={language} 
                label={`${langVoices[0]?.languageEmoji || '🌐'} ${groupLabel}`}
              >
                {langVoices.map((voice) => (
                  <option key={voice.name} value={voice.name}>
                    {voice.genderEmoji} {voice.actualName}
                  </option>
                ))}
              </optgroup>
            );
          })
        ) : (
          // If only one language, show flat list with emojis
          voices.map((voice) => (
            <option key={voice.name} value={voice.name}>
              {voice.displayName}
            </option>
          ))
        )}
      </select>
    </div>
  );
};

export default VoiceSelector;