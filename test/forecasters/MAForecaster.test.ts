import { MAForecaster } from '../../lib/forecasters/MAForecaster';
import { TimeSeries, MAParams } from '../../lib/types';
import { mean } from '../../lib/utils/math';

describe('MAForecaster', () => {
  let timeSeries: TimeSeries;
  const testSeriesData = [10, 12, 11, 13, 12]; // Mean = 11.6

  beforeEach(() => {
    timeSeries = {
      data: testSeriesData.map((x, i) => ({ t: i + 1, x })),
      timeUnit: 'seconds',
      tickDuration: 1,
    };
  });

  test('should instantiate with default parameters', () => {
    const forecaster = new MAForecaster(timeSeries);
    expect(forecaster.name).toBe('MA Forecaster');
    // @ts-ignore
    expect(forecaster.params.q).toBe(1);
  });

  test('should instantiate with provided parameters', () => {
    const params: Partial<MAParams> = { q: 2, coefficients: [0.6, 0.3], errors: [0.1, -0.2] };
    const forecaster = new MAForecaster(timeSeries, params);
    // @ts-ignore
    expect(forecaster.params.q).toBe(2);
    // @ts-ignore
    expect(forecaster.coefficients).toEqual([0.6, 0.3]);
    // @ts-ignore
    expect(forecaster.errors).toEqual([0.1, -0.2]); // errors are stored as provided
  });

  test('should forecast with known coefficients and past errors (MA1: X_t = mu + e_t + 0.5*e_{t-1})', () => {
    const seriesMean = mean(testSeriesData); // 11.6
    const pastErrors = [0.4]; // e_{t-1} = 0.4 (chronological: last error is most recent)
                               // predictMA expects [e_t-1, e_t-2, ...], so this becomes [0.4]

    // MAForecaster internally handles past errors. We provide them via params for this test.
    // The `errors` param in MAForecaster constructor is for initial errors [..., e_t-2, e_t-1]
    const params: Partial<MAParams> = { q: 1, coefficients: [0.5], errors: pastErrors };
    const forecaster = new MAForecaster(timeSeries, params);

    // @ts-ignore (accessing seriesMean for verification)
    expect(forecaster.seriesMean).toBeCloseTo(seriesMean);

    const forecasts = forecaster.forecast(6, 1); // Forecast for t=6

    // Forecast = seriesMean + (coeff1 * error_t-1)
    // error_t-1 is the last element in forecaster.errors which is `pastErrors` here.
    // predictMA receives errors in order [e_t-1, e_t-2,...]
    // In MAForecaster, `this.errors` stores [..., e_t-2, e_t-1].
    // `updateAndGetPastErrors` returns `this.errors.slice(-q).reverse()`
    // So for q=1, it takes last error (0.4) and reverses it to [0.4] for predictMA.
    const expectedForecast = seriesMean + (0.5 * pastErrors[0]); // 11.6 + 0.5 * 0.4 = 11.6 + 0.2 = 11.8
    expect(forecasts.length).toBe(1);
    expect(forecasts[0]).toBeCloseTo(expectedForecast);
  });

  test('should forecast with known coefficients (MA2 model: X_t = mu + e_t + 0.6*e_{t-1} + 0.3*e_{t-2})', () => {
    const seriesMean = mean(testSeriesData); // 11.6
    // errors are e_{t-2}, e_{t-1}
    const pastErrors = [0.2, -0.1]; // e_{t-2}=0.2, e_{t-1}=-0.1
                                   // predictMA expects [e_t-1, e_t-2, ...], so this becomes [-0.1, 0.2]

    const params: Partial<MAParams> = { q: 2, coefficients: [0.6, 0.3], errors: pastErrors };
    const forecaster = new MAForecaster(timeSeries, params);
    const forecasts = forecaster.forecast(6, 1);

    // Forecast = seriesMean + (coeff1 * e_{t-1} + coeff2 * e_{t-2})
    // = 11.6 + (0.6 * -0.1 + 0.3 * 0.2) = 11.6 + (-0.06 + 0.06) = 11.6
    const expectedForecast = seriesMean + (0.6 * pastErrors[1] + 0.3 * pastErrors[0]);
    expect(forecasts.length).toBe(1);
    expect(forecasts[0]).toBeCloseTo(expectedForecast);

    // Test multi-step forecast: next error (e_t) is 0.
    // Forecast_t+2 = seriesMean + (coeff1 * 0 + coeff2 * e_{t-1})
    //              = 11.6 + (0.6 * 0 + 0.3 * -0.1) = 11.6 - 0.03 = 11.57
    const multiStepForecasts = forecaster.forecast(6, 2);
    const expectedForecast2 = seriesMean + (0.6 * 0 + 0.3 * pastErrors[1]);
    expect(multiStepForecasts.length).toBe(2);
    expect(multiStepForecasts[0]).toBeCloseTo(expectedForecast);
    expect(multiStepForecasts[1]).toBeCloseTo(expectedForecast2);
  });

  test('should predict the mean if q=0', () => {
    const params: Partial<MAParams> = { q: 0 };
    const forecaster = new MAForecaster(timeSeries, params);
    const forecasts = forecaster.forecast(6, 3);
    const seriesMean = mean(testSeriesData);
    expect(forecasts).toEqual([seriesMean, seriesMean, seriesMean]);
  });

  test('should update parameters', () => {
    const forecaster = new MAForecaster(timeSeries, { q: 1, coefficients: [0.5] });
    // @ts-ignore
    expect(forecaster.params.q).toBe(1);
    // @ts-ignore
    expect(forecaster.coefficients).toEqual([0.5]);

    forecaster.updateParams({ q: 2, coefficients: [0.4, 0.2], errors: [0.1,0.1] });
    // @ts-ignore
    expect(forecaster.params.q).toBe(2);
    // @ts-ignore
    expect(forecaster.coefficients).toEqual([0.4, 0.2]);
    // @ts-ignore
    expect(forecaster.errors.length).toBe(2); // errors are initialized
  });

  test('should update time series and re-calculate mean, re-estimate coeffs if not provided', () => {
    // Using default q=1, no coeffs provided, so they will be estimated (placeholder)
    const forecaster = new MAForecaster(timeSeries);
    // @ts-ignore
    const initialMean = forecaster.seriesMean;
    // @ts-ignore
    const initialCoeffs = [...forecaster.coefficients]; // Default estimated coeffs [0.1]

    const newSeriesData = [1, 2, 3, 1, 2]; // Mean = 1.8
    const newTimeSeries: TimeSeries = {
      data: newSeriesData.map((x, i) => ({ t: i + 1, x })),
      timeUnit: 's', tickDuration: 1
    };
    forecaster.updateTimeSeries(newTimeSeries);

    // @ts-ignore
    expect(forecaster.seriesMean).toBeCloseTo(mean(newSeriesData));
    // @ts-ignore
    expect(forecaster.seriesMean).not.toBeCloseTo(initialMean);
    // @ts-ignore (Coefficients should be re-estimated, but since it's a placeholder, it might be the same [0.1])
    // A better test would mock estimateMACoefficients or use a scenario where it changes.
    // For now, just check it's still length q.
    // @ts-ignore
    expect(forecaster.coefficients.length).toBe(forecaster.params.q);
  });

  test('error history should be updated when new data point arrives', () => {
    // Setup: MA(1) model, X_t = mu + e_t + 0.5*e_{t-1}.
    // Initial error e_0 = 0.2. Series data starts 10, 12. mu = 11 (simplified for this test).
    const simpleSeriesData = [10, 12]; // mu around 11
    const simpleTS: TimeSeries = {
        data: simpleSeriesData.map((x,i)=>({t:i+1, x})),
        timeUnit:'s', tickDuration:1
    };
    const params: Partial<MAParams> = { q: 1, coefficients: [0.5], errors: [0.2] }; // e_{t-1}=0.2
    const forecaster = new MAForecaster(simpleTS, params);
    // @ts-ignore
    // forecaster.seriesMean = 11; // DO NOT force mean if updateTimeSeries is called after, as it will be recalculated.

    // Initial state of forecaster after constructor with simpleTS (data: [10,12], mean=11)
    // and params (q:1, coeffs:[0.5], errors:[0.2]):
    // seriesMean = 11.
    // initialize() is called. errors gets padded to [0.2] if q=1.
    // estimateCoefficients is NOT called if params.coefficients is provided. So coeffs are [0.5].
    // The initial `this.errors` in constructor becomes `[0.2]`.
    // `initialize` is called. `this.seriesMean` becomes `mean([10,12]) = 11`.
    // `this.errors` (length 1) is not less than `this.params.q` (1), so it remains `[0.2]`.
    // This `[0.2]` is e_1 (error for data point 10).

    // When X_2 (value 12) was effectively processed (e.g. if series grew one by one, or by an update pass):
    // To calculate error for X_2 (value 12):
    //   `lastForecast` (for X_2, based on e_1): `predictMA([0.2], [0.5]) = 0.1`.
    //   `newError` (e_2): `(X_2 - seriesMean_of_X1X2) - lastForecast = (12 - 11) - 0.1 = 0.9`.
    // So, if `updateTimeSeries` was run on `simpleTS` itself, `forecaster.errors` would become `[0.9]`.
    // The constructor effectively does this if we consider `initialize` and error setup.
    // Let's refine: the `params.errors` are past errors *before* the series given to constructor.
    // So, `errors:[0.2]` means e_{t-1}=0.2 when the series `[10,12]` starts.
    // `initialize()` will calculate `seriesMean=11`.
    // `updateAndGetPastErrors` is NOT called by `initialize` to back-fill errors from the provided series.
    // This is a subtle point: MAForecaster's `errors` are more like externally known past noise.
    // If we want errors to be residuals of the provided series, that's a different setup.
    // The current `MAForecaster` `updateTimeSeries` updates errors for *newly added* points.

    // Let's re-evaluate the test's setup for clarity.
    // We want to test the error update mechanism.
    // 1. Create MA forecaster with first two points [10,12]. `seriesMean` will be 11.
    //    Provide initial error `e_0 = 0.2` (error for a hypothetical point before 10).
    //    The forecaster's `errors` array will be `[0.2]`.
    // 2. Call `updateTimeSeries` with a new point, 13. (Series becomes [10,12,13]).
    //    `updateTimeSeries` will first update `seriesMean` to `mean([10,12,13]) = 11.666...`
    //    Then it will try to calculate the error for the new point `13`.
    //    To do this, it calls `updateAndGetPastErrors(13)`.
    //    Inside `updateAndGetPastErrors(13)`:
    //      `lastForecast = calculateForecastForErrorUpdate()`. This uses current `this.errors` ([0.2])
    //                     `= predictMA([0.2], [0.5]) = 0.1`.
    //      `newError = (13 - newSeriesMean) - lastForecast = (13 - 11.666...) - 0.1`
    //                 `= 1.333... - 0.1 = 1.2333...`
    //      `this.errors` becomes `[1.2333...]` (as q=1).

    const updatedTimeSeries: TimeSeries = {
        data: [...simpleSeriesData, {t:3, x:13}].map((x,i)=>({t:i+1,x})), // [10,12,13]
        timeUnit: 's', tickDuration: 1
    };
    forecaster.updateTimeSeries(updatedTimeSeries);
    // @ts-ignore
    const currentMean = forecaster.seriesMean;
    // @ts-ignore
    const currentErrors = forecaster.errors;
    // console.log(`[Test MA Error History] Mean: ${currentMean}, Errors: ${JSON.stringify(currentErrors)}`);

    // After this: seriesMean = 11.666...
    // The error calculated and stored corresponds to the point x=13.
    // Error e_at_t=13 = (13 - 11.666...) - (0.5 * error_before_13)
    // error_before_13 was the initial 0.2.
    // So, e_at_t=13 = (13 - 11.666...) - (0.5 * 0.2) = 1.333... - 0.1 = 1.2333...

    // @ts-ignore
    expect(forecaster.errors.length).toBe(1);
    // @ts-ignore
    expect(forecaster.errors[0]).toBeCloseTo(1.2333333333333334);
  });

  test('should correctly initialize errors if params.errors is shorter than q', () => {
    const params: Partial<MAParams> = { q: 3, coefficients: [0.1,0.1,0.1], errors: [0.5] };
    const forecaster = new MAForecaster(timeSeries, params);
    // @ts-ignore
    expect(forecaster.errors.length).toBe(3);
    // @ts-ignore
    expect(forecaster.errors).toEqual([0, 0, 0.5]); // Padded with 0s at the beginning
  });

});
