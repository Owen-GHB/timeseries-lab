import { SignalType } from '@lib/types';

interface ControlPanelProps {
  signalType: SignalType;
  onSignalTypeChange: (type: SignalType) => void;
  isPlaying: boolean;
  onPlayPause: () => void;
  playbackSpeed: number;
  onPlaybackSpeedChange: (speed: number) => void;
  currentTime: number;
}

export function ControlPanel({
  signalType,
  onSignalTypeChange,
  isPlaying,
  onPlayPause,
  playbackSpeed,
  onPlaybackSpeedChange,
  currentTime
}: ControlPanelProps) {
  const speedOptions = [0.5, 1, 2, 4, 8];

  return (
    <div className="control-panel">
      <div className="control-section">
        <h3>Signal Type</h3>
        <div className="radio-group">
          <label>
            <input
              type="radio"
              name="signalType"
              value="sine"
              checked={signalType === 'sine'}
              onChange={() => onSignalTypeChange('sine')}
            />
            Sine Wave
          </label>
          <label>
            <input
              type="radio"
              name="signalType"
              value="brownian"
              checked={signalType === 'brownian'}
              onChange={() => onSignalTypeChange('brownian')}
            />
            Brownian Motion
          </label>
        </div>
      </div>

      <div className="control-section">
        <h3>Playback</h3>
        <button 
          onClick={onPlayPause}
          className={`play-button ${isPlaying ? 'playing' : 'paused'}`}
        >
          {isPlaying ? '⏸️ Pause' : '▶️ Play'}
        </button>
        
        <div className="speed-controls">
          <label>Speed:</label>
          <div className="speed-buttons">
            {speedOptions.map(speed => (
              <button
                key={speed}
                onClick={() => onPlaybackSpeedChange(speed)}
                className={playbackSpeed === speed ? 'active' : ''}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="control-section">
        <h3>Status</h3>
        <div className="status-info">
          <div>Time: {currentTime.toFixed(2)}s</div>
          <div>Rate: 50 ticks/sec</div>
          <div>Forecast: Lagged Gradient</div>
        </div>
      </div>
    </div>
  );
}