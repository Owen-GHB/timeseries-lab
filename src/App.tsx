import { useState, useEffect, useRef } from 'preact/hooks';
import { CanvasPlotter } from './components/CanvasPlotter';
import { ControlPanel } from './components/ControlPanel';
import { SignalBuffer } from '@lib/utils/SignalBuffer';
import { SineWaveGenerator } from '@lib/generators/SineGenerator';
import { BrownianMotionGenerator } from '@lib/generators/BrownianMotionGenerator';
import { LaggedGradientForecaster } from '@lib/forecasters/LaggedGradientForecaster';
import { SignalType, SignalGenerator } from '@lib/types';
import './App.css';

function App() {
  const [signalType, setSignalType] = useState<SignalType>('brownian');
  const [isPlaying, setIsPlaying] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [data, setData] = useState<any[]>([]);
  const [forecasts, setForecasts] = useState<any[]>([]);

  const bufferRef = useRef<SignalBuffer | null>(null);
  const forecasterRef = useRef<LaggedGradientForecaster | null>(null);
  const intervalRef = useRef<number | null>(null);

  // Initialize signal generators
  const createGenerator = (type: SignalType): SignalGenerator => {
    switch (type) {
      case 'sine':
        return new SineWaveGenerator({
          amplitude: 2,
          frequency: 0.5,
          phase: 0,
          offset: 0
        });
      case 'brownian':
        return new BrownianMotionGenerator({
          volatility: 0.3,
          drift: 0.05,
          initialValue: 0
        });
      default:
        return new BrownianMotionGenerator();
    }
  };

  // Initialize signal buffer and forecaster
  useEffect(() => {
    const generator = createGenerator(signalType);
    bufferRef.current = new SignalBuffer(generator, {
      bufferAheadSeconds: 3,
      bufferBehindSeconds: 10,
      tickDuration: 0.02
    });

    // Initialize with some data
    const initialSeries = generator.generateSeries(0, 2, 0.02);
    forecasterRef.current = new LaggedGradientForecaster(initialSeries, {
      lookbackPeriod: 15,
      smoothingFactor: 0.4
    });

    setCurrentTime(0);
    setData([]);
    setForecasts([]);
  }, [signalType]);

  // Main animation loop
  useEffect(() => {
    if (!isPlaying) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const tickRate = 20; // 20ms = 50 ticks/sec
    intervalRef.current = setInterval(() => {
      setCurrentTime(prevTime => {
        const newTime = prevTime + (0.02 * playbackSpeed);
        
        // Update buffer
        if (bufferRef.current) {
          bufferRef.current.update(newTime);
          const timeSeries = bufferRef.current.getTimeSeries();
          
          // Update forecaster with latest data
          if (forecasterRef.current && timeSeries.data.length > 0) {
            forecasterRef.current.updateTimeSeries(timeSeries);
          }

          // Get visible data for plotting
          const visibleData = bufferRef.current.getVisibleData(
            newTime - 8, // 8 seconds of history
            newTime + 2  // 2 seconds ahead
          );
          setData(visibleData);

          // Generate forecasts every few ticks
          if (Math.floor(newTime * 50) % 5 === 0 && forecasterRef.current) {
            const forecastHorizon = 25; // 25 steps = 0.5 seconds ahead
            const forecastValues = forecasterRef.current.forecast(newTime, forecastHorizon);
            
            setForecasts(prev => {
              const newForecasts = [...prev, {
                t: newTime,
                values: forecastValues
              }];
              
              // Keep only recent forecasts
              return newForecasts.filter(f => f.t >= newTime - 3);
            });
          }
        }

        return newTime;
      });
    }, tickRate / playbackSpeed);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, playbackSpeed]);

  const handleSignalTypeChange = (type: SignalType) => {
    setSignalType(type);
    setForecasts([]); // Clear old forecasts
  };

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handlePlaybackSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>TimeSeries Lab</h1>
        <p>Real-time signal generation with forecasting</p>
      </header>
      
      <div className="app-content">
        <div className="control-pane">
          <ControlPanel
            signalType={signalType}
            onSignalTypeChange={handleSignalTypeChange}
            isPlaying={isPlaying}
            onPlayPause={handlePlayPause}
            playbackSpeed={playbackSpeed}
            onPlaybackSpeedChange={handlePlaybackSpeedChange}
            currentTime={currentTime}
          />
        </div>
        
        <div className="canvas-pane">
          <CanvasPlotter
            data={data}
            forecasts={forecasts}
            currentTime={currentTime}
            width={800}
            height={400}
            timeWindow={8} // 8 seconds visible
            playbackSpeed={playbackSpeed}
          />
        </div>
      </div>
    </div>
  );
}

export default App;