import { SignalType } from '@lib/types';
import { SineWaveParams } from '@lib/generators/SineGenerator';
import { BrownianMotionParams } from '@lib/generators/BrownianMotionGenerator';
import { LaggedGradientParams } from '@lib/forecasters/LaggedGradientForecaster';

export interface GeneratorParams {
  sine: Partial<SineWaveParams>;
  brownian: Partial<BrownianMotionParams>;
}

export interface ForecasterParams {
  laggedGradient: Partial<LaggedGradientParams>;
}

interface ControlPanelProps {
  signalType: SignalType;
  onSignalTypeChange: (type: SignalType) => void;
  isPlaying: boolean;
  onPlayPause: () => void;
  playbackSpeed: number;
  onPlaybackSpeedChange: (speed: number) => void;
  currentTime: number;
  generatorParams: GeneratorParams;
  onGeneratorParamsChange: (type: SignalType, params: Partial<SineWaveParams> | Partial<BrownianMotionParams>) => void;
  forecasterParams: ForecasterParams;
  onForecasterParamsChange: (params: Partial<LaggedGradientParams>) => void;
}

export function ControlPanel({
  signalType,
  onSignalTypeChange,
  isPlaying,
  onPlayPause,
  playbackSpeed,
  onPlaybackSpeedChange,
  currentTime,
  generatorParams,
  onGeneratorParamsChange,
  forecasterParams,
  onForecasterParamsChange,
}: ControlPanelProps) {
  const speedOptions = [0.5, 1, 2, 4, 8];

  const handleSineParamChange = (param: keyof SineWaveParams, value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      onGeneratorParamsChange('sine', { ...generatorParams.sine, [param]: numValue });
    }
  };

  const handleBrownianParamChange = (param: keyof BrownianMotionParams, value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      onGeneratorParamsChange('brownian', { ...generatorParams.brownian, [param]: numValue });
    }
  };

  const handleLaggedGradientParamChange = (param: keyof LaggedGradientParams, value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      onForecasterParamsChange({ ...forecasterParams.laggedGradient, [param]: numValue });
    }
  };

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

      {signalType === 'sine' && (
        <div className="control-section">
          <h4>Sine Wave Parameters</h4>
          <div className="param-group">
            <label>Amplitude:</label>
            <input
              type="number"
              step="0.1"
              value={generatorParams.sine.amplitude}
              onInput={(e) => handleSineParamChange('amplitude', (e.target as HTMLInputElement).value)}
            />
          </div>
          <div className="param-group">
            <label>Frequency (Hz):</label>
            <input
              type="number"
              step="0.1"
              value={generatorParams.sine.frequency}
              onInput={(e) => handleSineParamChange('frequency', (e.target as HTMLInputElement).value)}
            />
          </div>
          <div className="param-group">
            <label>Phase (rad):</label>
            <input
              type="number"
              step="0.1"
              value={generatorParams.sine.phase}
              onInput={(e) => handleSineParamChange('phase', (e.target as HTMLInputElement).value)}
            />
          </div>
          <div className="param-group">
            <label>Offset:</label>
            <input
              type="number"
              step="0.1"
              value={generatorParams.sine.offset}
              onInput={(e) => handleSineParamChange('offset', (e.target as HTMLInputElement).value)}
            />
          </div>
        </div>
      )}

      {signalType === 'brownian' && (
        <div className="control-section">
          <h4>Brownian Motion Parameters</h4>
          <div className="param-group">
            <label>Volatility:</label>
            <input
              type="number"
              step="0.01"
              value={generatorParams.brownian.volatility}
              onInput={(e) => handleBrownianParamChange('volatility', (e.target as HTMLInputElement).value)}
            />
          </div>
          <div className="param-group">
            <label>Drift:</label>
            <input
              type="number"
              step="0.01"
              value={generatorParams.brownian.drift}
              onInput={(e) => handleBrownianParamChange('drift', (e.target as HTMLInputElement).value)}
            />
          </div>
           <div className="param-group">
            <label>Initial Value:</label>
            <input
              type="number"
              step="0.1"
              value={generatorParams.brownian.initialValue}
              onInput={(e) => handleBrownianParamChange('initialValue', (e.target as HTMLInputElement).value)}
            />
          </div>
        </div>
      )}

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
        <h4>Forecaster: Lagged Gradient</h4>
        <div className="param-group">
          <label>Lookback Period:</label>
          <input
            type="number"
            step="1"
            min="1"
            value={forecasterParams.laggedGradient.lookbackPeriod}
            onInput={(e) => handleLaggedGradientParamChange('lookbackPeriod', (e.target as HTMLInputElement).value)}
          />
        </div>
        <div className="param-group">
          <label>Smoothing Factor:</label>
          <input
            type="number"
            step="0.05"
            min="0"
            max="1"
            value={forecasterParams.laggedGradient.smoothingFactor}
            onInput={(e) => handleLaggedGradientParamChange('smoothingFactor', (e.target as HTMLInputElement).value)}
          />
        </div>
      </div>

      <div className="control-section">
        <h3>Status</h3>
        <div className="status-info">
          <div>Time: {currentTime.toFixed(2)}s</div>
          <div>Rate: 50 ticks/sec</div>
        </div>
      </div>
    </div>
  );
}