import { ForecastModel, TimeSeries } from '../types';

export interface LaggedGradientParams {
  lookbackPeriod: number; // number of points to look back
  smoothingFactor: number; // 0-1, higher = more smoothing
}

export class LaggedGradientForecaster implements ForecastModel {
  public name = 'Lagged Gradient';
  private params: LaggedGradientParams;
  private timeSeries: TimeSeries;

  constructor(timeSeries: TimeSeries, params: Partial<LaggedGradientParams> = {}) {
    this.timeSeries = timeSeries;
    this.params = {
      lookbackPeriod: params.lookbackPeriod ?? 10,
      smoothingFactor: params.smoothingFactor ?? 0.3,
    };
  }

  updateTimeSeries(timeSeries: TimeSeries): void {
    this.timeSeries = timeSeries;
  }

  private calculateGradient(startIdx: number, endIdx: number): number {
    if (startIdx >= endIdx || endIdx >= this.timeSeries.data.length) {
      return 0;
    }

    const startPoint = this.timeSeries.data[startIdx];
    const endPoint = this.timeSeries.data[endIdx];
    
    const dt = endPoint.t - startPoint.t;
    const dx = endPoint.x - startPoint.x;
    
    return dt !== 0 ? dx / dt : 0;
  }

  private getSmoothedGradient(): number {
    const { data } = this.timeSeries;
    const { lookbackPeriod, smoothingFactor } = this.params;
    
    if (data.length < 2) return 0;

    const endIdx = data.length - 1;
    const startIdx = Math.max(0, endIdx - lookbackPeriod);
    
    // Calculate multiple gradients and smooth them
    const gradients: number[] = [];
    const windowSize = Math.min(3, endIdx - startIdx);
    
    for (let i = 0; i < windowSize; i++) {
      const segmentStart = startIdx + i;
      const segmentEnd = endIdx - (windowSize - 1 - i);
      if (segmentStart < segmentEnd) {
        gradients.push(this.calculateGradient(segmentStart, segmentEnd));
      }
    }

    if (gradients.length === 0) return 0;

    // Exponential smoothing
    let smoothedGradient = gradients[0];
    for (let i = 1; i < gradients.length; i++) {
      smoothedGradient = smoothingFactor * gradients[i] + (1 - smoothingFactor) * smoothedGradient;
    }

    return smoothedGradient;
  }

  forecast(t: number, horizon: number): number[] {
    const { data } = this.timeSeries;
    
    if (data.length === 0) {
      return new Array(horizon).fill(0);
    }

    const lastPoint = data[data.length - 1];
    const gradient = this.getSmoothedGradient();
    const forecasts: number[] = [];

    for (let i = 1; i <= horizon; i++) {
      // t is the time of the first forecast point.
      // For i=1, futureT should be t. For i=2, futureT should be t + tickDuration, etc.
      const futureT = t + ((i - 1) * this.timeSeries.tickDuration);
      const dt = futureT - lastPoint.t;
      const forecastValue = lastPoint.x + (gradient * dt);
      forecasts.push(forecastValue);
    }

    return forecasts;
  }

  updateParams(newParams: Partial<LaggedGradientParams>): void {
    this.params = { ...this.params, ...newParams };
  }
}