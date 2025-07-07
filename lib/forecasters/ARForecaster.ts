import { ForecastModel, TimeSeries, ARParams, TimePoint } from '../types';
import { estimateARCoefficients, predictAR } from '../utils/math'; // Assuming these will be created

export class ARForecaster implements ForecastModel {
  public name = 'AR Forecaster';
  private params: ARParams;
  private timeSeries: TimeSeries;
  private coefficients: number[];
  private meanLog: string[] = []; // For debugging or advanced logging

  constructor(timeSeries: TimeSeries, params: Partial<ARParams> = {}) {
    this.timeSeries = timeSeries;
    this.params = {
      p: params.p ?? 1, // Default order of 1
      coefficients: params.coefficients,
    };
    this.coefficients = this.params.coefficients ?? [];
    if (this.timeSeries.data.length > this.params.p && !this.params.coefficients) {
      this.estimateCoefficients();
    }
  }

  private estimateCoefficients(): void {
    if (this.timeSeries.data.length <= this.params.p) {
      this.meanLog.push(`Not enough data to estimate AR(${this.params.p}) coefficients. Need ${this.params.p + 1}, got ${this.timeSeries.data.length}. Using zeros.`);
      this.coefficients = new Array(this.params.p).fill(0);
      return;
    }
    // Placeholder for actual coefficient estimation (e.g., Yule-Walker)
    // For now, let's assume a simple estimation or use pre-defined ones if available.
    // This would typically involve matrix operations or iterative methods.
    this.coefficients = estimateARCoefficients(this.timeSeries.data.map(dp => dp.x), this.params.p);
    this.meanLog.push(`Estimated AR(${this.params.p}) coefficients: ${this.coefficients.join(', ')}`);
  }

  updateTimeSeries(timeSeries: TimeSeries): void {
    this.timeSeries = timeSeries;
    // Re-estimate coefficients if not provided and enough data is available
    if (this.timeSeries.data.length > this.params.p && !this.params.coefficients) {
      this.estimateCoefficients();
    } else if (this.timeSeries.data.length <= this.params.p && !this.params.coefficients) {
      this.coefficients = new Array(this.params.p).fill(0);
       this.meanLog.push(`Series updated. Not enough data for AR(${this.params.p}). Using zeros.`);
    }
  }

  forecast(t: number, horizon: number): number[] {
    const { data } = this.timeSeries;
    const p = this.params.p;

    if (data.length < p) {
      this.meanLog.push(`Not enough historical data to forecast. Need ${p} points, have ${data.length}. Returning array of zeros.`);
      return new Array(horizon).fill(0);
    }

    if (this.coefficients.length !== p) {
        if (!this.params.coefficients) { // only re-estimate if they weren't provided initially
            this.estimateCoefficients();
        }
        if (this.coefficients.length !== p) { // check again after estimation
             this.meanLog.push(`Coefficient length mismatch. Expected ${p}, got ${this.coefficients.length}. Returning array of zeros.`);
            return new Array(horizon).fill(0);
        }
    }

    const history = data.map(dp => dp.x).slice(-p); // Get the last p values
    const forecasts: number[] = [];

    for (let i = 0; i < horizon; i++) {
      const nextForecast = predictAR(history, this.coefficients);
      forecasts.push(nextForecast);
      history.shift(); // Remove the oldest value
      history.push(nextForecast); // Add the new forecast to history for next step
    }
    this.meanLog.push(`Forecasted for horizon ${horizon}: ${forecasts.join(', ')}`);
    return forecasts;
  }

  updateParams(newParams: Partial<ARParams>): void {
    const oldP = this.params.p;
    this.params = { ...this.params, ...newParams };
    if (newParams.p !== undefined && newParams.p !== oldP || newParams.coefficients !== undefined) {
        this.coefficients = this.params.coefficients ?? [];
        if (this.timeSeries.data.length > this.params.p && !this.params.coefficients) {
            this.estimateCoefficients();
        } else {
            // Ensure coefficients are initialized correctly if p changes or they are directly set
            this.coefficients = this.params.coefficients || new Array(this.params.p).fill(0);
        }
    }
     this.meanLog.push(`Parameters updated. New p: ${this.params.p}`);
  }

  getLogs(): string[] {
    return this.meanLog;
  }
}
