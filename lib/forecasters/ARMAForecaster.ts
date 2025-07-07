import { ForecastModel, TimeSeries, ARMAParams } from '../types';
import {
    estimateARCoefficients, predictAR,
    estimateMACoefficients, predictMA,
    estimateARMACoefficients, // Full ARMA estimation is complex
    mean
} from '../utils/math';

export class ARMAForecaster implements ForecastModel {
  public name = 'ARMA Forecaster';
  private params: ARMAParams;
  private timeSeries: TimeSeries;

  private arCoefficients: number[];
  private maCoefficients: number[];

  private errors: number[]; // Stores past errors for the MA component
  private seriesMean: number;
  private meanLog: string[] = [];

  constructor(timeSeries: TimeSeries, params: Partial<ARMAParams> = {}) {
    this.timeSeries = timeSeries;
    this.params = {
      p: params.p ?? 0, // Default AR order
      q: params.q ?? 0, // Default MA order
      coefficients: params.coefficients, // Combined AR and MA coeffs if provided this way
      arCoefficients: params.arCoefficients, // Specific AR coeffs
      maCoefficients: params.maCoefficients, // Specific MA coeffs
      errors: params.errors,
    };
    this.seriesMean = 0;
    this.arCoefficients = this.params.arCoefficients ?? [];
    this.maCoefficients = this.params.maCoefficients ?? [];
    this.errors = this.params.errors ?? [];

    if (this.timeSeries.data.length > 0) {
        this.initialize();
    }
  }

  private initialize(): void {
    this.seriesMean = mean(this.timeSeries.data.map(dp => dp.x));
    const centeredSeries = this.timeSeries.data.map(dp => dp.x - this.seriesMean);

    // Coefficient Estimation
    if (this.params.arCoefficients && this.params.maCoefficients) {
        this.arCoefficients = this.params.arCoefficients;
        this.maCoefficients = this.params.maCoefficients;
        this.meanLog.push(`Using provided AR(${this.params.p}) and MA(${this.params.q}) coefficients.`);
    } else if (this.params.coefficients) { // Generic coefficients (e.g. from a combined estimation)
        // Assuming first p are AR, next q are MA. This needs clear API definition if used.
        // This is a common way some libraries return combined coefficients.
        if (this.params.coefficients.length >= this.params.p + this.params.q) {
            this.arCoefficients = this.params.coefficients.slice(0, this.params.p);
            this.maCoefficients = this.params.coefficients.slice(this.params.p, this.params.p + this.params.q);
            this.meanLog.push(`Using combined coefficients array for AR(${this.params.p}) and MA(${this.params.q}).`);
        } else {
            this.meanLog.push(`WARNING: Combined coefficients array length is insufficient. Falling back.`);
            this.estimateLocalCoefficients(centeredSeries);
        }
    }
    else { // Estimate coefficients if not fully provided
        this.estimateLocalCoefficients(centeredSeries);
    }

    // Initialize MA errors
    if (this.errors.length < this.params.q && this.params.q > 0) {
        const initialErrors = new Array(this.params.q - this.errors.length).fill(0);
        this.errors = [...initialErrors, ...this.errors]; // Pad at the beginning
        this.meanLog.push(`Initialized/padded MA errors to length ${this.params.q}.`);
    }
     // Ensure errors array is correctly sized, truncating if necessary
    if (this.errors.length > this.params.q && this.params.q > 0) {
        this.errors = this.errors.slice(-this.params.q);
    } else if (this.params.q === 0) {
        this.errors = [];
    }
  }

  private estimateLocalCoefficients(centeredSeries: number[]): void {
    if (centeredSeries.length === 0) {
        if (this.params.p > 0) this.arCoefficients = new Array(this.params.p).fill(0);
        if (this.params.q > 0) this.maCoefficients = new Array(this.params.q).fill(0.1);
        this.meanLog.push("No data to estimate coefficients. Using defaults.");
        return;
    }

    // Using a placeholder for true ARMA estimation.
    // True ARMA estimation (e.g., MLE via Kalman filter or conditional sum of squares) is complex.
    // A common approximation is to estimate AR, then MA on residuals, but this is not true ARMA.
    // Using the placeholder `estimateARMACoefficients` which does this approximation.
    const { arCoefficients, maCoefficients } = estimateARMACoefficients(centeredSeries, this.params.p, this.params.q);

    if (!this.params.arCoefficients && this.params.p > 0) {
        this.arCoefficients = arCoefficients;
        this.meanLog.push(`Estimated AR(${this.params.p}) coefficients (part of ARMA): ${this.arCoefficients.join(', ')}`);
    } else if (this.params.p > 0 && this.arCoefficients.length !== this.params.p) {
        // Provided ones were wrong length, fallback.
        this.arCoefficients = arCoefficients;
         this.meanLog.push(`Corrected AR(${this.params.p}) coefficients length (part of ARMA): ${this.arCoefficients.join(', ')}`);
    }


    if (!this.params.maCoefficients && this.params.q > 0) {
        this.maCoefficients = maCoefficients;
        this.meanLog.push(`Estimated MA(${this.params.q}) coefficients (part of ARMA): ${this.maCoefficients.join(', ')} (using placeholder)`);
    } else if (this.params.q > 0 && this.maCoefficients.length !== this.params.q) {
        this.maCoefficients = maCoefficients;
        this.meanLog.push(`Corrected MA(${this.params.q}) coefficients length (part of ARMA): ${this.maCoefficients.join(', ')} (using placeholder)`);
    }


    // Ensure correct lengths if estimation failed or p/q is 0
    if (this.params.p > 0 && this.arCoefficients.length !== this.params.p) {
        this.arCoefficients = new Array(this.params.p).fill(0);
    }
    if (this.params.q > 0 && this.maCoefficients.length !== this.params.q) {
        this.maCoefficients = new Array(this.params.q).fill(0.1);
    }
  }

  // Calculate forecast for a single point (value - mean) using current AR history and MA errors
  // This is used internally for calculating errors or for the first step of a forecast.
  private calculateSingleStepForecast(history: number[], currentMAErrors: number[]): number {
    let arPart = 0;
    if (this.params.p > 0 && this.arCoefficients && this.arCoefficients.length === this.params.p && history.length >= this.params.p) {
        // predictAR expects history as [X_{t-p}, ..., X_{t-1}]
        // Our `history` here is typically the last p values of the (centered) series.
        arPart = predictAR(history.slice(-this.params.p), this.arCoefficients);
    }

    let maPart = 0;
    if (this.params.q > 0 && this.maCoefficients && this.maCoefficients.length === this.params.q && currentMAErrors.length >= this.params.q) {
        // predictMA expects errors as [e_{t-1}, e_{t-2}, ..., e_{t-q}]
        maPart = predictMA(currentMAErrors, this.maCoefficients);
    }
    return arPart + maPart;
  }


  updateTimeSeries(timeSeries: TimeSeries): void {
    const oldLength = this.timeSeries.data.length;
    const oldMean = this.seriesMean;
    this.timeSeries = timeSeries;

    if (this.timeSeries.data.length === 0) {
        this.seriesMean = 0;
        this.errors = new Array(this.params.q).fill(0);
        this.meanLog.push("Time series is empty. Resetting mean and errors.");
        return;
    }

    this.seriesMean = mean(this.timeSeries.data.map(dp => dp.x));
    const centeredSeries = this.timeSeries.data.map(dp => dp.x - this.seriesMean);

    if (this.timeSeries.data.length > oldLength && oldLength > 0 && this.params.q > 0) {
        // New data point(s) arrived. Update MA errors.
        // This requires careful handling as the AR part also influences the forecast.
        const numNewPoints = this.timeSeries.data.length - oldLength;

        for (let i = 0; i < numNewPoints; i++) {
            const pointIndex = oldLength + i;
            if (pointIndex < this.params.p) { // Not enough history for AR part yet
                this.errors.push(centeredSeries[pointIndex]); // Simplistic error: actual - 0 (as AR part is 0)
                if (this.errors.length > this.params.q) this.errors.shift();
                continue;
            }

            // To calculate the error for data[pointIndex], we need a forecast for it
            // made using data *up to* pointIndex-1.
            const historyForAR = centeredSeries.slice(pointIndex - this.params.p, pointIndex);

            // MA errors should be those *before* observing data[pointIndex]
            // `this.errors` should contain [e_{k-q+1}, ..., e_k] where k is related to pointIndex-1
            // The `predictARMA` or `calculateSingleStepForecast` needs errors [e_{t-1}, ..., e_{t-q}]
            // So, the current `this.errors` (if maintained correctly) are suitable.
            const currentMAErrors = this.errors.slice(-this.params.q).reverse(); // Get them in e_t-1, e_t-2 order

            const forecastForErrorCalc = this.calculateSingleStepForecast(historyForAR, currentMAErrors);
            const newError = centeredSeries[pointIndex] - forecastForErrorCalc;

            this.errors.push(newError);
            if (this.errors.length > this.params.q) {
                this.errors.shift();
            }
            this.meanLog.push(`New data. Actual (centered): ${centeredSeries[pointIndex].toFixed(2)}, Forecast: ${forecastForErrorCalc.toFixed(2)}, Error: ${newError.toFixed(2)}`);
        }
    } else if (this.timeSeries.data.length > 0 && (this.arCoefficients.length !== this.params.p || this.maCoefficients.length !== this.params.q) && (!this.params.arCoefficients || !this.params.maCoefficients) ) {
        // Re-initialize if series changes drastically, or first time with data, or coeffs are not set/wrong length
        this.meanLog.push("Re-initializing due to series/parameter change.");
        this.initialize();
    } else if (this.params.q > 0 && this.errors.length < this.params.q) {
        // Pad errors if series was short and now grew, but not enough for full re-init
        const neededErrors = this.params.q - this.errors.length;
        this.errors = [...new Array(neededErrors).fill(0), ...this.errors];
    }
    this.meanLog.push(`Series updated. New length: ${this.timeSeries.data.length}. Mean: ${this.seriesMean.toFixed(2)}`);
  }

  forecast(_t: number, horizon: number): number[] {
    if (this.timeSeries.data.length === 0 && (this.params.p > 0 || this.params.q > 0)) {
        this.meanLog.push("Cannot forecast: time series is empty.");
        return new Array(horizon).fill(0); // Or seriesMean if it was known from elsewhere
    }
    if (this.params.p === 0 && this.params.q === 0) {
      return new Array(horizon).fill(this.seriesMean); // Just predict the mean
    }

    // Ensure coefficients are valid
    if (this.params.p > 0 && (!this.arCoefficients || this.arCoefficients.length !== this.params.p)) {
        this.meanLog.push(`AR coefficient issue (p=${this.params.p}, actual: ${this.arCoefficients?.length}). Re-initializing.`);
        this.initialize(); // Attempt to fix/estimate
        if (!this.arCoefficients || this.arCoefficients.length !== this.params.p) {
             this.meanLog.push(`AR coefficient issue persists. Returning mean forecasts.`);
            return new Array(horizon).fill(this.seriesMean);
        }
    }
    if (this.params.q > 0 && (!this.maCoefficients || this.maCoefficients.length !== this.params.q)) {
        this.meanLog.push(`MA coefficient issue (q=${this.params.q}, actual: ${this.maCoefficients?.length}). Re-initializing.`);
        this.initialize(); // Attempt to fix/estimate
         if (!this.maCoefficients || this.maCoefficients.length !== this.params.q) {
            this.meanLog.push(`MA coefficient issue persists. Returning mean forecasts.`);
            return new Array(horizon).fill(this.seriesMean);
        }
    }

    const centeredSeries = this.timeSeries.data.map(dp => dp.x - this.seriesMean);
    let currentHistory = centeredSeries.slice(-this.params.p); // Last p values for AR part
    // Ensure history has p values, pad with 0 if series is too short (though AR model should handle this)
    while (this.params.p > 0 && currentHistory.length < this.params.p) {
        currentHistory.unshift(0);
    }

    // MA errors should be [e_{t-1}, e_{t-2}, ..., e_{t-q}]
    // `this.errors` stores errors chronologically, so take the last q and reverse.
    let currentMAErrors = this.errors.slice(-this.params.q).reverse();
    while (this.params.q > 0 && currentMAErrors.length < this.params.q) {
        currentMAErrors.push(0); // Pad with 0s if not enough historical errors (e.g. e_t-k = 0)
    }


    const forecasts: number[] = [];

    for (let i = 0; i < horizon; i++) {
      const arPart = this.params.p > 0 ? predictAR(currentHistory, this.arCoefficients) : 0;
      const maPart = this.params.q > 0 ? predictMA(currentMAErrors, this.maCoefficients) : 0;
      const forecastValue = arPart + maPart;
      forecasts.push(forecastValue + this.seriesMean); // Add mean back

      // Update history for AR part for next step
      if (this.params.p > 0) {
        currentHistory.shift();
        currentHistory.push(forecastValue); // Use the new (centered) forecast as if it were actual
      }

      // Update errors for MA part for next step
      // Future errors (for t+1, t+2...) are unknown, so assumed to be 0.
      if (this.params.q > 0) {
        currentMAErrors.pop(); // Remove oldest error
        currentMAErrors.unshift(0); // Add new error (forecast error for future is 0)
      }
    }
    this.meanLog.push(`Forecasted for horizon ${horizon}: ${forecasts.map(f=>f.toFixed(2)).join(', ')}`);
    return forecasts;
  }

  updateParams(newParams: Partial<ARMAParams>): void {
    const oldP = this.params.p;
    const oldQ = this.params.q;

    // Update specific coefficient arrays if provided directly
    if (newParams.arCoefficients !== undefined) this.params.arCoefficients = newParams.arCoefficients;
    if (newParams.maCoefficients !== undefined) this.params.maCoefficients = newParams.maCoefficients;
    if (newParams.coefficients !== undefined) this.params.coefficients = newParams.coefficients;


    this.params = { ...this.params, ...newParams }; // Apply other param changes like p, q

    // If p or q changed, or if coefficients were directly set, a full re-init is safer.
    if ((newParams.p !== undefined && newParams.p !== oldP) ||
        (newParams.q !== undefined && newParams.q !== oldQ) ||
        newParams.arCoefficients !== undefined ||
        newParams.maCoefficients !== undefined ||
        newParams.coefficients !== undefined) {

        this.arCoefficients = this.params.arCoefficients ?? [];
        this.maCoefficients = this.params.maCoefficients ?? [];
        // If only p/q changed but not the direct coeff arrays, these will be empty now,
        // triggering estimation in initialize() if data exists.

        this.errors = this.params.errors ?? this.errors; // Keep old errors if new ones not provided, then adjust in init

        this.meanLog.push(`Parameters updated. New p: ${this.params.p}, New q: ${this.params.q}. Re-initializing.`);
        if (this.timeSeries.data.length > 0) {
            this.initialize();
        } else { // No data, just set defaults for coefficient arrays based on new p/q
            if (this.params.p > 0 && this.arCoefficients.length !== this.params.p) this.arCoefficients = new Array(this.params.p).fill(0);
            if (this.params.q > 0 && this.maCoefficients.length !== this.params.q) this.maCoefficients = new Array(this.params.q).fill(0.1);
            this.errors = new Array(this.params.q).fill(0);
        }
    } else if (newParams.errors !== undefined) { // Only errors changed
        this.errors = newParams.errors;
        while(this.params.q > 0 && this.errors.length < this.params.q) this.errors.unshift(0);
        if(this.params.q > 0 && this.errors.length > this.params.q) this.errors = this.errors.slice(-this.params.q);
        else if (this.params.q === 0) this.errors = [];
         this.meanLog.push(`MA errors updated.`);
    }
  }

  getLogs(): string[] {
    return this.meanLog;
  }
}
