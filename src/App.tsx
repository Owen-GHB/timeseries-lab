import { useState, useEffect, useRef } from 'preact/hooks';
import { CanvasPlotter } from './components/CanvasPlotter';
import { ControlPanel, GeneratorParams, ForecasterParams } from './components/ControlPanel';
import { SignalBuffer } from '@lib/utils/SignalBuffer';
import { SineWaveGenerator, SineWaveParams } from '@lib/generators/SineGenerator';
import { BrownianMotionGenerator, BrownianMotionParams } from '@lib/generators/BrownianMotionGenerator';
import { LaggedGradientForecaster, LaggedGradientParams } from '@lib/forecasters/LaggedGradientForecaster';
import { SignalType, SignalGenerator } from '@lib/types';
import './App.css';

const initialSineParams: Partial<SineWaveParams> = { amplitude: 2, frequency: 0.5, phase: 0, offset: 0 };
const initialBrownianParams: Partial<BrownianMotionParams> = { volatility: 0.3, drift: 0.05, initialValue: 0 };
const initialLaggedGradientParams: Partial<LaggedGradientParams> = { lookbackPeriod: 15, smoothingFactor: 0.4 };

function App() {
  const [signalType, setSignalType] = useState<SignalType>('brownian');
  const [isPlaying, setIsPlaying] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [data, setData] = useState<any[]>([]);
  const [forecasts, setForecasts] = useState<any[]>([]);

  const [generatorParams, setGeneratorParams] = useState<GeneratorParams>({
    sine: initialSineParams,
    brownian: initialBrownianParams,
  });
  const [forecasterParams, setForecasterParams] = useState<ForecasterParams>({
    laggedGradient: initialLaggedGradientParams,
  });

  const bufferRef = useRef<SignalBuffer | null>(null);
  const generatorRef = useRef<SignalGenerator | null>(null);
  const forecasterRef = useRef<LaggedGradientForecaster | null>(null);
  const intervalRef = useRef<number | null>(null);

  // Initialize or update signal generator
  const createOrUpdateGenerator = (type: SignalType, params: Partial<SineWaveParams> | Partial<BrownianMotionParams>): SignalGenerator => {
    if (type === 'sine') {
      const sineGen = new SineWaveGenerator(params as Partial<SineWaveParams>);
      generatorRef.current = sineGen;
      return sineGen;
    } else { // brownian
      const brownianGen = new BrownianMotionGenerator(params as Partial<BrownianMotionParams>);
      // Reset brownian motion internal state if initial value changes
      if (generatorRef.current instanceof BrownianMotionGenerator &&
          (params as BrownianMotionParams).initialValue !== (generatorParams.brownian as BrownianMotionParams).initialValue) {
        brownianGen.reset((params as BrownianMotionParams).initialValue);
      }
      generatorRef.current = brownianGen;
      return brownianGen;
    }
  };

  // Initialize or update signal buffer and forecaster
  useEffect(() => {
    const currentGenParams = signalType === 'sine' ? generatorParams.sine : generatorParams.brownian;
    const generator = createOrUpdateGenerator(signalType, currentGenParams);

    bufferRef.current = new SignalBuffer(generator, {
      bufferAheadSeconds: 3,
      bufferBehindSeconds: 10,
      tickDuration: 0.02
    });

    // Initialize with some data
    const initialSeries = generator.generateSeries(0, 2, 0.02);
    forecasterRef.current = new LaggedGradientForecaster(initialSeries, forecasterParams.laggedGradient);

    setCurrentTime(0);
    setData([]);
    setForecasts([]);
  }, [signalType, generatorParams, forecasterParams]);

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

  const handleGeneratorParamsChange = (
    type: SignalType,
    params: Partial<SineWaveParams> | Partial<BrownianMotionParams>
  ) => {
    setGeneratorParams(prevParams => ({
      ...prevParams,
      [type]: params,
    }));
  };

  const handleForecasterParamsChange = (params: Partial<LaggedGradientParams>) => {
    setForecasterParams(prevParams => ({
      ...prevParams,
      laggedGradient: params,
    }));
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
            generatorParams={generatorParams}
            onGeneratorParamsChange={handleGeneratorParamsChange}
            forecasterParams={forecasterParams}
            onForecasterParamsChange={handleForecasterParamsChange}
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