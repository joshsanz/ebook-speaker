import React from 'react';
import VoiceSelector from './VoiceSelector.jsx';
import SpeedSelector from './SpeedSelector.jsx';

/**
 * Floating audio controls component
 */
const FloatingControls = ({
  controlsHidden,
  setControlsHidden,
  autoAdvanceEnabled,
  handleAutoAdvanceToggle,
  voices,
  groupedVoices,
  selectedVoice,
  handleVoiceSelectionChange,
  voicesLoading,
  voicesError,
  selectedSpeed,
  handleSpeedSelectionChange,
  isLoadingAudio,
  isSpeaking,
  isPaused,
  currentAudioIndex,
  totalAudioCount,
  handleSpeakClick,
  rewind,
  fastForward,
  stopSpeaking
}) => {
  return (
    <div className={`floating-controls ${controlsHidden ? 'hidden' : ''}`}>
      <div className="floating-controls-content">
        <button
          onClick={() => setControlsHidden(!controlsHidden)}
          className="toggle-controls-button"
          title={controlsHidden ? 'Show controls' : 'Hide controls'}
        >
          {controlsHidden ? '👁️' : '🙈'}
        </button>

        <button
          onClick={handleAutoAdvanceToggle}
          className={`auto-advance-button ${autoAdvanceEnabled ? 'enabled' : 'disabled'}`}
          title={autoAdvanceEnabled ? 'Auto-advance is ON' : 'Auto-advance is OFF'}
        >
          Auto-Advance: {autoAdvanceEnabled ? 'ON' : 'OFF'}
        </button>

        <VoiceSelector
          voices={voices}
          groupedVoices={groupedVoices}
          selectedVoice={selectedVoice}
          onVoiceChange={handleVoiceSelectionChange}
          disabled={isLoadingAudio}
          loading={voicesLoading}
          error={voicesError}
        />

        <SpeedSelector
          selectedSpeed={selectedSpeed}
          onSpeedChange={handleSpeedSelectionChange}
          disabled={isLoadingAudio}
        />

        <div className="controls-spacer"></div>

        <div className="playback-controls-group">
          {isSpeaking && (
            <button
              onClick={rewind}
              disabled={currentAudioIndex === 0}
              className="control-button rewind-button"
              title="Previous sentence"
            >
              ⏮️
            </button>
          )}

          <button
            onClick={handleSpeakClick}
            disabled={isLoadingAudio}
            className={`speak-button ${isSpeaking ? 'speaking' : ''} ${isLoadingAudio ? 'loading' : ''} ${isPaused ? 'paused' : ''}`}
          >
            {isLoadingAudio ? '⏳ Loading...' :
             isSpeaking ? (isPaused ? '▶️ Resume' : '⏸️ Pause') :
             '🔊 Speak'}
          </button>

          {isSpeaking && (
            <button
              onClick={fastForward}
              disabled={currentAudioIndex >= totalAudioCount - 1}
              className="control-button fast-forward-button"
              title="Next sentence"
            >
              ⏭️
            </button>
          )}

          {(isSpeaking || isLoadingAudio) && (
            <button onClick={stopSpeaking} className="stop-button">
              ⏹️ Stop
            </button>
          )}

          {isSpeaking && totalAudioCount > 0 && (
            <div className="audio-progress">
              {currentAudioIndex + 1} / {totalAudioCount}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FloatingControls;