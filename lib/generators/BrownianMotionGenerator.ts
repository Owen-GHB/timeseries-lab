import { SignalGenerator, TimeSeries, TimePoint } from '../types';

export interface BrownianMotionParams {
  volatility: number; // standard deviation of random steps
  drift: number; // trend component
  initialValue: number;
}

export class BrownianMotionGenerator implements SignalGenerator {
  private params: BrownianMotionParams;
  private currentValue: number;
  private lastT: number;

  constructor(params: Partial<BrownianMotionParams> = {}) {
    this.params = {
      volatility: params.volatility ?? 0.1,
      drift: params.drift ?? 0,
      initialValue: params.initialValue ?? 0,
    };
    this.currentValue = this.params.initialValue;
    this.lastT = 0;
  }

  private gaussianRandom(): number {
    // Box-Muller transform for normal distribution
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  generate(t: number): number {
    const dt = t - this.lastT;
    if (dt <= 0) return this.currentValue;

    const { volatility, drift } = this.params;
    const dW = this.gaussianRandom() * Math.sqrt(dt);
    const driftTerm = drift * dt;
    const diffusionTerm = volatility * dW;

    this.currentValue += driftTerm + diffusionTerm;
    this.lastT = t;

    return this.currentValue;
  }

  generateSeries(startT: number, endT: number, step: number): TimeSeries {
    const data: TimePoint[] = [];
    
    // Reset to start position
    this.currentValue = this.params.initialValue;
    this.lastT = startT;

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

  reset(initialValue?: number): void {
    this.currentValue = initialValue ?? this.params.initialValue;
    this.lastT = 0;
  }

  updateParams(newParams: Partial<BrownianMotionParams>): void {
    this.params = { ...this.params, ...newParams };
  }
}