import { SignalGenerator, TimeSeries, TimePoint } from '../types';

export interface BufferConfig {
  bufferAheadSeconds: number; // how many seconds ahead to buffer
  bufferBehindSeconds: number; // how many seconds behind to keep
  tickDuration: number; // seconds between data points
}

export class SignalBuffer {
  private timeSeries: TimeSeries;
  private generator: SignalGenerator;
  private config: BufferConfig;
  private lastGeneratedT: number;

  constructor(generator: SignalGenerator, config: Partial<BufferConfig> = {}) {
    this.generator = generator;
    this.config = {
      bufferAheadSeconds: config.bufferAheadSeconds ?? 5,
      bufferBehindSeconds: config.bufferBehindSeconds ?? 10,
      tickDuration: config.tickDuration ?? 0.02, // 20ms = 0.02s
    };
    
    this.timeSeries = {
      data: [],
      timeUnit: 's',
      tickDuration: this.config.tickDuration
    };
    
    this.lastGeneratedT = 0;
  }

  getTimeSeries(): TimeSeries {
    return this.timeSeries;
  }

  update(currentTime: number): void {
    // Generate data ahead if needed
    const targetAheadT = currentTime + this.config.bufferAheadSeconds;
    
    if (this.lastGeneratedT < targetAheadT) {
      const startT = Math.max(this.lastGeneratedT, currentTime - this.config.tickDuration);
      this.generateAndAppend(startT, targetAheadT);
    }

    // Clean up old data
    const cutoffT = currentTime - this.config.bufferBehindSeconds;
    this.trimOldData(cutoffT);
  }

  private generateAndAppend(startT: number, endT: number): void {
    const newData: TimePoint[] = [];
    
    for (let t = startT; t <= endT; t += this.config.tickDuration) {
      // Avoid duplicate time points
      const existingPoint = this.timeSeries.data.find(p => Math.abs(p.t - t) < this.config.tickDuration / 2);
      if (!existingPoint) {
        newData.push({
          t,
          x: this.generator.generate(t)
        });
      }
    }

    // Append and sort
    this.timeSeries.data.push(...newData);
    this.timeSeries.data.sort((a, b) => a.t - b.t);
    
    this.lastGeneratedT = endT;
  }

  private trimOldData(cutoffT: number): void {
    this.timeSeries.data = this.timeSeries.data.filter(point => point.t >= cutoffT);
  }

  getVisibleData(startT: number, endT: number): TimePoint[] {
    return this.timeSeries.data.filter(point => point.t >= startT && point.t <= endT);
  }

  reset(): void {
    this.timeSeries.data = [];
    this.lastGeneratedT = 0;
  }

  updateConfig(newConfig: Partial<BufferConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.timeSeries.tickDuration = this.config.tickDuration;
  }
}