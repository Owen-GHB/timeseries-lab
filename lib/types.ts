export interface TimePoint {
  t: number;
  x: number;
}

export interface TimeSeries {
  data: TimePoint[];
  timeUnit: string; // 'ms', 's', 'min', etc.
  tickDuration: number; // duration of each tick in timeUnit
  
  // TODO: add interpolation methods
  // interpolate(t: number): number;
  // slice(startT: number, endT: number): TimeSeries;
}

export interface SignalGenerator {
  generate(t: number): number;
  generateSeries(startT: number, endT: number, step: number): TimeSeries;
}

export interface ForecastModel {
  forecast(t: number, horizon: number): number[];
  name: string;
  updateTimeSeries(timeSeries: TimeSeries): void;
  updateParams(newParams: any): void; // Consider using a more specific type if possible
}

export interface ARParams {
  p: number; // Order of the autoregressive part
  coefficients?: number[]; // Optional pre-defined coefficients
}

export interface MAParams {
  q: number; // Order of the moving average part
  coefficients?: number[]; // Optional pre-defined coefficients
  errors?: number[]; // Past errors, needed for MA model
}

export interface ARMAParams extends ARParams, MAParams {}

export interface ARIMAParams extends ARMAParams {
  d: number; // Degree of differencing
}

export type SignalType = 'sine' | 'brownian';

export interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;
  playbackSpeed: number; // 1x, 2x, etc.
  tickRate: number; // milliseconds between ticks
}