import { SignalGenerator, TimeSeries, TimePoint } from '../types';

export interface SineWaveParams {
  amplitude: number;
  frequency: number; // Hz
  phase: number; // radians
  offset: number;
}

export class SineWaveGenerator implements SignalGenerator {
  private params: SineWaveParams;

  constructor(params: Partial<SineWaveParams> = {}) {
    this.params = {
      amplitude: params.amplitude ?? 1,
      frequency: params.frequency ?? 0.5,
      phase: params.phase ?? 0,
      offset: params.offset ?? 0,
    };
  }

  generate(t: number): number {
    const { amplitude, frequency, phase, offset } = this.params;
    return amplitude * Math.sin(2 * Math.PI * frequency * t + phase) + offset;
  }

  generateSeries(startT: number, endT: number, step: number): TimeSeries {
    const data: TimePoint[] = [];
    
    for (let t = startT; t <= endT; t += step) {
      data.push({
        t,
        x: this.generate(t)
      });
    }

    return {
      data,
      timeUnit: 's',
      tickDuration: step
    };
  }

  updateParams(newParams: Partial<SineWaveParams>): void {
    this.params = { ...this.params, ...newParams };
  }
}