import React from 'react';
import './SpeedSelector.css';

const SpeedSelector = ({ 
  selectedSpeed = 1.0, 
  onSpeedChange, 
  disabled = false 
}) => {
  // Generate speed options from 0.5 to 2.0 in 0.1 increments
  const speedOptions = [];
  for (let speed = 0.5; speed <= 2.0; speed += 0.1) {
    const roundedSpeed = Math.round(speed * 10) / 10; // Fix floating point precision
    speedOptions.push(roundedSpeed);
  }

  const formatSpeedLabel = (speed) => {
    if (speed === 1.0) return '1.0× (Normal)';
    return `${speed.toFixed(1)}×`;
  };

  return (
    <div className="speed-selection">
      <label htmlFor="speed-select">Speed:</label>
      <select
        id="speed-select"
        value={selectedSpeed}
        onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
        disabled={disabled}
        className="speed-dropdown"
      >
        {speedOptions.map((speed) => (
          <option key={speed} value={speed}>
            {formatSpeedLabel(speed)}
          </option>
        ))}
      </select>
    </div>
  );
};

export default SpeedSelector;