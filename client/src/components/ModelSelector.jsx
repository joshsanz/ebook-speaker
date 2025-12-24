import React from 'react';
import { TTS_MODEL_OPTIONS } from '../constants/tts';
import './VoiceSelector.css';

const ModelSelector = ({
  selectedModel,
  onModelChange,
  disabled = false
}) => {
  return (
    <div className="voice-selection">
      <label htmlFor="model-select">Model:</label>
      <select
        id="model-select"
        value={selectedModel}
        onChange={(e) => onModelChange(e.target.value)}
        disabled={disabled}
        className="voice-dropdown"
      >
        {TTS_MODEL_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export default ModelSelector;
