import { ForecastModel, TimeSeries, MAParams, TimePoint } from '../types';
import { estimateMACoefficients, predictMA, mean } from '../utils/math';

export class MAForecaster implements ForecastModel {
  public name = 'MA Forecaster';
  private params: MAParams;
  private timeSeries: TimeSeries;
  private coefficients: number[];
  private errors: number[]; // Stores past errors e_t = x_t - forecast_t
  private seriesMean: number; // MA models often assume a zero mean series, or subtract the mean.
  private meanLog: string[] = [];

  constructor(timeSeries: TimeSeries, params: Partial<MAParams> = {}) {
    this.timeSeries = timeSeries;
    this.params = {
      q: params.q ?? 1, // Default order of 1
      coefficients: params.coefficients,
      errors: params.errors,
    };
    this.seriesMean = 0;
    this.coefficients = this.params.coefficients ?? [];
    this.errors = this.params.errors ?? [];

    if (this.timeSeries.data.length > 0) {
        this.initialize();
    }
  }

  private initialize(): void {
    this.seriesMean = mean(this.timeSeries.data.map(dp => dp.x));
    const centeredSeries = this.timeSeries.data.map(dp => dp.x - this.seriesMean);

    if (!this.params.coefficients && this.params.q > 0 && centeredSeries.length > this.params.q) {
      // MA coefficient estimation is complex. Using placeholder.
      // Actual estimation (e.g., Innovations Algorithm, Hannan-Rissanen) is non-linear.
      this.coefficients = estimateMACoefficients(centeredSeries, this.params.q, this.errors);
      this.meanLog.push(`Estimated MA(${this.params.q}) coefficients: ${this.coefficients.join(', ')} (using placeholder estimation)`);
    } else if (!this.params.coefficients && this.params.q > 0) {
      this.coefficients = new Array(this.params.q).fill(0.1); // Default placeholder
      this.meanLog.push(`Not enough data or no custom estimation for MA(${this.params.q}). Using default coefficients.`);
    }


    // Initialize errors. This is also tricky as errors depend on forecasts.
    // A common approach is to backcast or set initial errors to 0.
    // For simplicity, let's set initial q errors to 0 if not provided.
    if (this.errors.length < this.params.q) {
        const initialErrors = new Array(this.params.q).fill(0);
        // A better approach might be to use residuals from an AR model, or simply mean deviations for first few.
        // For now, just using zeros or provided errors.
        this.errors = [...initialErrors.slice(0, this.params.q - this.errors.length), ...this.errors];
        this.meanLog.push(`Initialized/padded past errors to length ${this.params.q}. Current errors: ${this.errors.join(', ')}`);
    }
     // Pre-populate errors based on historical data if possible (simplistic approach)
     // This would require historical forecasts, which we don't have at initialization.
     // So, this.errors will be mostly what was passed in or zeros.
     // The updateAndGetErrors method will refine this over time.
  }

  private updateAndGetPastErrors(newDataPoint?: number): number[] {
    // This method should be called when new data arrives to update the error history.
    // For forecasting, we use the current state of `this.errors`.
    // If a newDataPoint is provided, it means the series has been updated.
    // We need to calculate the new error term.

    if (newDataPoint !== undefined && this.timeSeries.data.length > 0) {
        const currentSeriesMean = this.seriesMean; // Use the mean consistent with the current series state
        const lastForecast = this.calculateForecastForErrorUpdate();

        const newError = (Number(newDataPoint) - currentSeriesMean) - lastForecast;
        this.errors.push(newError);

        if (this.errors.length > this.params.q && this.params.q > 0) { // Ensure q > 0 before shift
            this.errors.shift();
        }
        this.meanLog.push(`New data point. Last forecast: ${lastForecast.toFixed(2)}, New error: ${newError.toFixed(2)}`);
    }
    // Ensure errors array is of length q, padding with 0 if necessary (e.g. at the very beginning)
    const currentErrorsPadded = [...this.errors];
    while(currentErrorsPadded.length < this.params.q) {
        currentErrorsPadded.unshift(0); // Pad with zeros at the beginning if too short
    }
    return currentErrorsPadded.slice(-this.params.q).reverse(); // MA model uses e_t-1, e_t-2...
  }

  // Helper to make a forecast for the *last known point* to calculate its error
  private calculateForecastForErrorUpdate(): number {
    if (this.coefficients.length === 0 || this.params.q === 0) return 0; // No MA component
    if (this.errors.length < this.params.q) { // Should not happen if errors are pre-initialized
        // console.warn("Not enough prior errors to calculate a forecast for error update accurately.");
        return 0; // Or some other baseline
    }
    // Use errors *before* the current point. If errors are [e1, e2, e3] for q=3,
    // these are e_t-1, e_t-2, e_t-3.
    // Ensure errors passed to predictMA are clean numbers, defensively.
    const pastErrorsForPrediction = this.errors.slice(-this.params.q).reverse().map(e => Number(e) || 0);
    const coeffsForPrediction = this.coefficients.map(c => Number(c) || 0);
    return predictMA(pastErrorsForPrediction, coeffsForPrediction);
  }


  updateTimeSeries(timeSeries: TimeSeries): void {
    const oldLength = this.timeSeries.data.length;
    this.timeSeries = timeSeries;
    this.seriesMean = mean(this.timeSeries.data.map(dp => dp.x)); // Recalculate mean
    const centeredSeries = this.timeSeries.data.map(dp => dp.x - this.seriesMean);

    if (this.timeSeries.data.length > oldLength && oldLength > 0) {
        // New data point(s) arrived. Update errors based on the latest actual value.
        // This loop handles multiple new data points, though typically it's one by one.
        for (let i = oldLength; i < this.timeSeries.data.length; i++) {
            const actualValue = this.timeSeries.data[i].x;
            // The error is actual - (mean + forecast_based_on_previous_errors)
            // updateAndGetPastErrors handles the (actual - mean) part and the forecast part.
            this.updateAndGetPastErrors(actualValue);
        }
    } else if (this.timeSeries.data.length > 0 && (this.coefficients.length !== this.params.q || this.errors.length < this.params.q) ) {
        // Series changed significantly (e.g. reset) or initial setup needed.
        this.initialize(); // Re-initialize if series changes drastically or first time with data
    }
     this.meanLog.push(`Series updated. New length: ${this.timeSeries.data.length}. Mean: ${this.seriesMean.toFixed(2)}`);
  }

  forecast(_t: number, horizon: number): number[] {
    if (this.params.q === 0) {
      return new Array(horizon).fill(this.seriesMean); // Just predict the mean if q=0
    }
    if (this.coefficients.length !== this.params.q) {
        if (!this.params.coefficients) {
            this.initialize(); // Attempt to estimate/set coefficients
        }
        if (this.coefficients.length !== this.params.q) {
            this.meanLog.push(`MA coefficient length mismatch (expected ${this.params.q}, got ${this.coefficients.length}). Returning mean forecasts.`);
            return new Array(horizon).fill(this.seriesMean);
        }
    }

    let currentErrors = this.updateAndGetPastErrors(); // Get latest q errors in order e_t-1, e_t-2, ...
    const forecasts: number[] = [];

    for (let i = 0; i < horizon; i++) {
      // Predict next value: mu + sum(theta_j * e_{t-j})
      // For MA model, future errors e_{t+k} (k>0) are unknown and assumed to be 0 for forecasting.
      const forecastValue = predictMA(currentErrors, this.coefficients);
      forecasts.push(forecastValue + this.seriesMean); // Add mean back

      // Update errors for multi-step ahead forecast:
      // The error for the just forecasted point is 0 (since actual is unknown).
      currentErrors.pop(); // Remove oldest error e_{t-q}
      currentErrors.unshift(0); // Add new error e_t = 0 (because it's a forecast)
    }
    this.meanLog.push(`Forecasted for horizon ${horizon}: ${forecasts.map(f=>f.toFixed(2)).join(', ')}`);
    return forecasts;
  }

  updateParams(newParams: Partial<MAParams>): void {
    const oldQ = this.params.q;
    // Ensure this.params is updated first, so initialize() sees the new coefficient if provided
    this.params = { ...this.params, ...newParams };

    // Re-initialize if q changes
    if (newParams.q !== undefined && newParams.q !== oldQ) {
        // If new coefficients are also provided with new q, initialize should use them.
        // initialize() checks this.params.coefficients.
        // If not provided, it will try to estimate or use defaults.
        this.coefficients = this.params.coefficients ?? [];
        this.errors = this.params.errors ?? [];
        this.initialize();
    } else { // q is same, but other params might have changed
        if (newParams.coefficients !== undefined) {
            this.coefficients = newParams.coefficients;
        }
        if (newParams.errors !== undefined) {
            // Ensure errors are correctly sized for current q
            this.errors = newParams.errors;
            if (this.params.q === 0) {
                this.errors = [];
            } else {
                while(this.errors.length < this.params.q) {
                    this.errors.unshift(0);
                }
                if(this.errors.length > this.params.q) {
                    this.errors = this.errors.slice(-this.params.q);
                }
            }
        } else if (newParams.q !== undefined && newParams.q === 0) {
            // If q is explicitly set to 0 and no new errors are given, clear existing errors.
            this.errors = [];
        }
    }
    this.meanLog.push(`Parameters updated. New q: ${this.params.q}`);
  }

  getLogs(): string[] {
    return this.meanLog;
  }
}
