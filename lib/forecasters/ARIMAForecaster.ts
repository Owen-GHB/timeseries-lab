import { ForecastModel, TimeSeries, ARIMAParams } from '../types';
import { ARMAForecaster } from './ARMAForecaster'; // Assuming ARMAForecaster is in the same directory
import { difference, inverseDifferenceForecast, mean } from '../utils/math';

export class ARIMAForecaster implements ForecastModel {
  public name = 'ARIMA Forecaster';
  private params: ARIMAParams;
  private timeSeries: TimeSeries;
  private armaForecaster: ARMAForecaster | null = null;
  private differencedTimeSeries: TimeSeries | null = null;
  private originalSeriesTail: number[][] = []; // To store tails for inverse differencing, stores tails of X, dX, d2X ..
  private meanLog: string[] = [];

  constructor(timeSeries: TimeSeries, params: Partial<ARIMAParams> = {}) {
    this.params = {
      p: params.p ?? 0,
      d: params.d ?? 0,
      q: params.q ?? 0,
      arCoefficients: params.arCoefficients,
      maCoefficients: params.maCoefficients,
      errors: params.errors,
    };
    this.timeSeries = timeSeries; // Keep a reference to the original time series
    this.initializeOrUpdateArma();
  }

  private initializeOrUpdateArma(): void {
    this.meanLog.push(`Initializing/Updating ARIMA(${this.params.p},${this.params.d},${this.params.q}).`);
    if (this.timeSeries.data.length === 0 && this.params.d > 0) {
        this.meanLog.push("Original series is empty, cannot difference yet.");
        this.differencedTimeSeries = { data: [], timeUnit: this.timeSeries.timeUnit, tickDuration: this.timeSeries.tickDuration };
        // ARMA cannot be initialized properly without data.
        this.armaForecaster = null;
        return;
    }

    let currentSeriesData = this.timeSeries.data.map(dp => dp.x);
    this.originalSeriesTail = []; // Reset tails

    if (this.params.d > 0) {
        if (this.timeSeries.data.length <= this.params.d) {
            this.meanLog.push(`Not enough data (${this.timeSeries.data.length}) to difference ${this.params.d} time(s). Needs > ${this.params.d}.`);
            this.differencedTimeSeries = { data: [], timeUnit: this.timeSeries.timeUnit, tickDuration: this.timeSeries.tickDuration };
            this.armaForecaster = null; // Cannot proceed
            return;
        }

        // Store tails of original and intermediate differenced series for inverse differencing
        // Tail 0: original series tail (last d values)
        // Tail 1: dX series tail (last d-1 values, if d>1)
        // ...
        // Tail d-1: d^(d-1)X series tail (last 1 value, if d > 0)
        let tempSeriesForTails = [...currentSeriesData];
        for(let i=0; i < this.params.d; i++) {
            // Store the necessary number of elements from the *end* of the current tempSeries.
            // For reconstructing X from dX, we need X_last.
            // For reconstructing X from d2X (via dX), we need dX_last and X_last.
            // So, originalSeriesTail[0] will store last d values of X
            // originalSeriesTail[1] will store last d-1 values of dX etc.
            // This might be more complex; simpler to store just the required values of original series.
            // The current inverseDifferenceForecast needs the tail of the *original* series.
            // Let's keep it simple: store last `d` values of the original series.
            // This might need refinement if the inverse differencing logic becomes more complex.
            // For now, this.originalSeriesTail[0] = last d values of original series.
            // This will be used by inverseDifferenceForecast.
            // Let's try to store the actual values needed for iterative inversion.
            // originalSeriesTail[i] will store the last value of the i-th differenced series
            // originalSeriesTail[0] = last X, originalSeriesTail[1] = last dX, ... originalSeriesTail[d-1] = last d^(d-1)X

            // Simpler: inverseDifferenceForecast needs values from the series *just before* the one being reconstructed.
            // We will need the last value of each differenced series up to d-1, and the last original value.
            // Let's store the full tail of the original series, as this is what the current inverseDifferenceForecast expects.
            // This means `this.originalSeriesTail` will be a single array: the last `d` values of the original series.
            // This is reset and captured here.
        }
        // Capture the tails needed for reconstruction.
        // `originalSeriesTail` will store the last `d` values of the *original* undifferenced series.
        // These are X_{t-1}, X_{t-2}, ..., X_{t-d} if current time is t.
        if(this.params.d > 0) {
            this.originalSeriesTail[0] = currentSeriesData.slice(-this.params.d);
        }


        const differencedValues = difference(currentSeriesData, this.params.d);
        this.meanLog.push(`Differenced series (${this.params.d} times). Original length: ${currentSeriesData.length}, Differenced length: ${differencedValues.length}`);

        // Create a TimeSeries object for the differenced data.
        // Timestamps need to be handled carefully. The differenced series is shorter.
        // The first timestamp of the differenced series corresponds to the (d+1)-th timestamp of the original.
        this.differencedTimeSeries = {
            data: differencedValues.map((val, idx) => ({
                t: this.timeSeries.data[idx + this.params.d].t, // Align time
                x: val,
            })),
            timeUnit: this.timeSeries.timeUnit,
            tickDuration: this.timeSeries.tickDuration,
        };
    } else {
        this.differencedTimeSeries = { ...this.timeSeries }; // No differencing, use original
        this.meanLog.push("No differencing (d=0). Using original series for ARMA part.");
    }

    if (this.differencedTimeSeries && this.differencedTimeSeries.data.length > Math.max(this.params.p, this.params.q)) {
        // Initialize or update ARMA forecaster with the (potentially differenced) series
        if (this.armaForecaster) {
            this.armaForecaster.updateTimeSeries(this.differencedTimeSeries);
            this.armaForecaster.updateParams({ // Pass ARMA specific params
                p: this.params.p,
                q: this.params.q,
                arCoefficients: this.params.arCoefficients,
                maCoefficients: this.params.maCoefficients,
                errors: this.params.errors, // Pass through initial errors if any
            });
            this.meanLog.push("ARMA forecaster updated with new differenced series and params.");
        } else {
            this.armaForecaster = new ARMAForecaster(this.differencedTimeSeries, {
                p: this.params.p,
                q: this.params.q,
                arCoefficients: this.params.arCoefficients,
                maCoefficients: this.params.maCoefficients,
                errors: this.params.errors,
            });
            this.meanLog.push("ARMA forecaster initialized.");
        }
    } else if (this.differencedTimeSeries && this.differencedTimeSeries.data.length > 0) {
        // Enough data for differencing but maybe not for ARMA estimation. ARMA will handle this.
         this.armaForecaster = new ARMAForecaster(this.differencedTimeSeries, {
                p: this.params.p,
                q: this.params.q,
                arCoefficients: this.params.arCoefficients,
                maCoefficients: this.params.maCoefficients,
                errors: this.params.errors,
            });
        this.meanLog.push(`Differenced series is short (length ${this.differencedTimeSeries.data.length}). ARMA forecaster initialized; it may use default coeffs.`);
    }
    else {
        this.armaForecaster = null; // Not enough data after differencing
        this.meanLog.push("Not enough data in differenced series to initialize ARMA forecaster.");
    }
  }

  updateTimeSeries(timeSeries: TimeSeries): void {
    this.timeSeries = timeSeries;
    this.meanLog.push(`ARIMA: Original time series updated. Length: ${this.timeSeries.data.length}`);
    // Re-difference and update/re-initialize ARMA model
    this.initializeOrUpdateArma();
  }

  forecast(t: number, horizon: number): number[] {
    if (!this.armaForecaster || !this.differencedTimeSeries) {
      this.meanLog.push("ARIMA: ARMA model not initialized or no differenced series. Cannot forecast.");
      return new Array(horizon).fill(this.timeSeries.data.length > 0 ? mean(this.timeSeries.data.map(dp=>dp.x)) : 0);
    }
    if (this.differencedTimeSeries.data.length === 0 && (this.params.p > 0 || this.params.q > 0)) {
        this.meanLog.push("ARIMA: Differenced time series is empty. Cannot forecast for ARMA part if p or q > 0.");
        // If d > 0, we can't even reconstruct. If d=0, ARMA would predict its mean (which is mean of original).
        return new Array(horizon).fill(this.timeSeries.data.length > 0 ? mean(this.timeSeries.data.map(dp=>dp.x)) : 0);
    }


    // Forecast on the differenced series
    // The 't' parameter for ARMA's forecast method should correspond to the timeline of the differenced series.
    // If differencedTimeSeries.data is empty, ARMA will handle it (e.g. return its mean / zeros).
    const lastOriginalTime = this.timeSeries.data.length > 0 ? this.timeSeries.data[this.timeSeries.data.length -1].t : t;
    const armaForecasts = this.armaForecaster.forecast(lastOriginalTime, horizon); // t is tricky here, ARMA uses its own series' end.
    this.meanLog.push(`ARIMA: ARMA forecasted on differenced series: ${armaForecasts.map(f=>f.toFixed(2)).join(', ')}`);

    if (this.params.d === 0) {
      this.meanLog.push("ARIMA: d=0, returning ARMA forecasts directly.");
      return armaForecasts; // No differencing, ARMA model is on original data (or its mean removed version)
    }

    // Inverse differencing
    // This requires careful management of the series history.
    const finalForecasts: number[] = [];
    let currentOriginalSeriesTail = [...(this.originalSeriesTail[0] || [])]; // Last d values of original series

    // If original series was too short to form a full tail of length d, pad with last known value or 0.
    const lastKnownOriginalValue = this.timeSeries.data.length > 0 ? this.timeSeries.data[this.timeSeries.data.length-1].x : 0;
    while(currentOriginalSeriesTail.length < this.params.d && this.params.d > 0) {
        currentOriginalSeriesTail.unshift(this.timeSeries.data.length > currentOriginalSeriesTail.length ?
                                          this.timeSeries.data[this.timeSeries.data.length - 1 - currentOriginalSeriesTail.length].x :
                                          lastKnownOriginalValue); // Pad with earlier values or last known
    }


    if (currentOriginalSeriesTail.length < this.params.d && this.params.d > 0) {
        this.meanLog.push(`ARIMA: Warning - original series tail for inverse differencing is shorter (${currentOriginalSeriesTail.length}) than d (${this.params.d}). Results might be inaccurate.`);
        // Pad with the mean of the original series or the last value if desperate
        const padValue = currentOriginalSeriesTail.length > 0 ? currentOriginalSeriesTail[0] : (this.timeSeries.data.length > 0 ? mean(this.timeSeries.data.map(dp=>dp.x)) : 0);
        while(currentOriginalSeriesTail.length < this.params.d) {
            currentOriginalSeriesTail.unshift(padValue);
        }
    }

    this.meanLog.push(`ARIMA: Starting inverse differencing. Initial original tail for reconstruction: ${currentOriginalSeriesTail.map(v=>v.toFixed(2)).join(', ')}`);

    for (let i = 0; i < horizon; i++) {
      const forecastOfDifferenced = armaForecasts[i];
      // `inverseDifferenceForecast` needs the forecast of the d-th differenced series,
      // and the last `d` actual values of the original series *before this forecast point*.
      const reconstructedForecast = inverseDifferenceForecast(forecastOfDifferenced, currentOriginalSeriesTail, this.params.d);
      finalForecasts.push(reconstructedForecast);
      this.meanLog.push(`ARIMA: Step ${i+1}: Diff Forecast=${forecastOfDifferenced.toFixed(2)}, Reconstructed=${reconstructedForecast.toFixed(2)}`);

      // Update the tail for the next step: drop oldest, add new reconstructed forecast
      if (this.params.d > 0) {
        currentOriginalSeriesTail.shift();
        currentOriginalSeriesTail.push(reconstructedForecast);
        this.meanLog.push(`ARIMA: Updated original tail for next step: ${currentOriginalSeriesTail.map(v=>v.toFixed(2)).join(', ')}`);
      }
    }
    this.meanLog.push(`ARIMA: Final reconstructed forecasts: ${finalForecasts.map(f=>f.toFixed(2)).join(', ')}`);
    return finalForecasts;
  }

  updateParams(newParams: Partial<ARIMAParams>): void {
    const needsReInit = newParams.d !== undefined && newParams.d !== this.params.d;
    this.params = { ...this.params, ...newParams };
    this.meanLog.push(`ARIMA: Parameters updated. New (p,d,q): (${this.params.p},${this.params.d},${this.params.q}).`);

    if (needsReInit) {
        // If d changes, the differenced series changes, so ARMA must be rebuilt.
        this.initializeOrUpdateArma();
    } else if (this.armaForecaster) {
        // If d is the same, just update ARMA's params (p, q, coefficients, errors)
        this.armaForecaster.updateParams({
            p: this.params.p,
            q: this.params.q,
            arCoefficients: this.params.arCoefficients,
            maCoefficients: this.params.maCoefficients,
            errors: this.params.errors,
        });
        this.meanLog.push("ARIMA: d unchanged, updated ARMA sub-model parameters.");
    } else {
        // ARMA forecaster doesn't exist (e.g. not enough data initially), try to init now that params changed.
        this.initializeOrUpdateArma();
    }
  }

  getLogs(): string[] {
    // Could also include ARMA logs: return [...this.meanLog, ...(this.armaForecaster?.getLogs() || [])];
    return this.meanLog;
  }
}
