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
    const epsilon = this.config.tickDuration / 100; // Small value for float comparisons

    if (this.lastGeneratedT < targetAheadT - epsilon) {
      // Adjust startT to align with tickDuration grid, starting from the next tick if not aligned
      let generationStartT = this.lastGeneratedT > 0 ? this.lastGeneratedT + this.config.tickDuration : currentTime;
      // Ensure we don't generate too far in the past if buffer is empty and currentTime is large
      generationStartT = Math.max(generationStartT, currentTime - this.config.bufferBehindSeconds - this.config.tickDuration);


      // If lastGeneratedT is very close to 0, or if the buffer is empty, start generating from currentTime or alignment.
      if (this.timeSeries.data.length === 0 || Math.abs(this.lastGeneratedT) < epsilon) {
        generationStartT = Math.round(currentTime / this.config.tickDuration) * this.config.tickDuration;
        if (generationStartT > currentTime) {
            generationStartT -= this.config.tickDuration;
        }
         // Ensure generation starts from at least the 'behind' window
        generationStartT = Math.max(generationStartT, currentTime - this.config.bufferBehindSeconds);
      } else {
        // Start from the next tick after lastGeneratedT
        generationStartT = this.lastGeneratedT + this.config.tickDuration;
      }
      // Ensure we don't try to generate for a range that's already covered or invalid
      if (generationStartT < targetAheadT + epsilon) {
         this.generateAndAppend(generationStartT, targetAheadT);
      }
    }

    // Clean up old data
    const cutoffT = currentTime - this.config.bufferBehindSeconds;
    this.trimOldData(cutoffT);
  }

  private generateAndAppend(startT: number, endT: number): void {
    const newData: TimePoint[] = [];
    const epsilon = this.config.tickDuration / 100;

    let currentT = startT;
    // Ensure currentT is aligned to the tick grid
    currentT = Math.round(currentT / this.config.tickDuration) * this.config.tickDuration;
    if (currentT < startT - epsilon) { // If rounding made it too small, advance to next tick
        currentT += this.config.tickDuration;
    }


    while (currentT <= endT + epsilon) {
      const t = parseFloat(currentT.toFixed(5)); // Mitigate floating point errors by fixing precision
      // Avoid duplicate time points
      const existingPointIndex = this.timeSeries.data.findIndex(p => Math.abs(p.t - t) < epsilon);
      if (existingPointIndex === -1) {
        newData.push({
          t,
          x: this.generator.generate(t)
        });
      }
      currentT += this.config.tickDuration;
    }

    if (newData.length > 0) {
        this.timeSeries.data.push(...newData);
        this.timeSeries.data.sort((a, b) => a.t - b.t);
        // Update lastGeneratedT to the t of the last actually generated point in this batch
        this.lastGeneratedT = newData[newData.length - 1].t;
    } else if (currentT > endT + epsilon && this.timeSeries.data.length > 0) {
        // If no new data was generated but we iterated past endT,
        // ensure lastGeneratedT is at least endT if current data already covers it.
        // This handles cases where the buffer is full up to or beyond endT.
        const maxBufferedT = this.timeSeries.data[this.timeSeries.data.length -1].t;
        this.lastGeneratedT = Math.max(this.lastGeneratedT, Math.min(maxBufferedT, endT));
    } else if (this.timeSeries.data.length === 0) {
        this.lastGeneratedT = 0; // Reset if buffer becomes empty
    }
    // If the requested range was small and already covered, lastGeneratedT might need to be endT
    if (startT >= endT - epsilon && this.lastGeneratedT < endT) {
        // Check if data up to endT exists
        if (this.timeSeries.data.some(p => p.t >= endT - epsilon)) {
            this.lastGeneratedT = Math.max(this.lastGeneratedT, endT);
        }
    }

  }

  private trimOldData(cutoffT: number): void {
    const epsilon = this.config.tickDuration / 100;
    this.timeSeries.data = this.timeSeries.data.filter(point => point.t >= cutoffT - epsilon);
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