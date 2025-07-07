import { ARIMAForecaster } from '../../lib/forecasters/ARIMAForecaster';
import { TimeSeries, ARIMAParams } from '../../lib/types';
import { difference, mean } from '../../lib/utils/math'; // For verifying differencing

describe('ARIMAForecaster', () => {
  let timeSeries: TimeSeries;
  // Non-stationary series (e.g., a ramp: 1, 2, 3, 4, 5, 6)
  // First difference: 1, 1, 1, 1, 1 (stationary)
  const rampData = [1, 2, 3, 4, 5, 6];

  beforeEach(() => {
    timeSeries = {
      data: rampData.map((x, i) => ({ t: i + 1, x })),
      timeUnit: 'seconds',
      tickDuration: 1,
    };
  });

  test('should instantiate with default parameters (p=0, d=0, q=0)', () => {
    const forecaster = new ARIMAForecaster(timeSeries);
    expect(forecaster.name).toBe('ARIMA Forecaster');
    // @ts-ignore
    expect(forecaster.params.p).toBe(0);
    // @ts-ignore
    expect(forecaster.params.d).toBe(0);
    // @ts-ignore
    expect(forecaster.params.q).toBe(0);
  });

  test('should instantiate with provided parameters', () => {
    const params: Partial<ARIMAParams> = { p: 1, d: 1, q: 0, arCoefficients: [0.5] };
    const forecaster = new ARIMAForecaster(timeSeries, params);
    // @ts-ignore
    expect(forecaster.params.p).toBe(1);
    // @ts-ignore
    expect(forecaster.params.d).toBe(1);
    // @ts-ignore
    expect(forecaster.params.q).toBe(0);
    // Check if ARMA forecaster got the AR param
    // @ts-ignore
    expect(forecaster.armaForecaster.params.p).toBe(1);
    // @ts-ignore
    expect(forecaster.armaForecaster.arCoefficients).toEqual([0.5]);
  });

  test('should difference the series when d=1 for ARIMA(0,1,0) (Random Walk Forecast)', () => {
    // ARIMA(0,1,0) means differenced series is white noise (mean 0 if no constant).
    // Forecast for differenced series is 0.
    // Inverse difference: X_t = X_{t-1} + forecast_diff = X_{t-1} + 0 = X_{t-1}
    // So, it should predict the last observed value.
    const params: Partial<ARIMAParams> = { p: 0, d: 1, q: 0 };
    const forecaster = new ARIMAForecaster(timeSeries, params);

    // @ts-ignore Check differenced series (armaForecaster works on this)
    const differencedTsData = forecaster.differencedTimeSeries.data.map(dp => dp.x);
    const expectedDifferenced = difference(rampData, 1); // [1, 1, 1, 1, 1]
    expect(differencedTsData).toEqual(expectedDifferenced);

    // @ts-ignore ARMA model should be (0,0) on differenced series
    expect(forecaster.armaForecaster.params.p).toBe(0);
    // @ts-ignore
    expect(forecaster.armaForecaster.params.q).toBe(0);

    const forecasts = forecaster.forecast(timeSeries.data.length + 1, 2);
    const lastValue = rampData[rampData.length - 1]; // 6
    const meanOfDiff = mean(expectedDifferenced); // Should be 1 for [1,1,1,1,1]
    expect(forecasts.length).toBe(2);
    // For ARIMA(0,1,0), forecast is LastValue + mean(differenced_series)
    expect(forecasts[0]).toBeCloseTo(lastValue + meanOfDiff);
    // Next step is previous forecast + mean(differenced_series) again
    expect(forecasts[1]).toBeCloseTo(lastValue + meanOfDiff + meanOfDiff);
  });

  test('should forecast for ARIMA(1,1,0) with known AR coeff on differenced series', () => {
    // Series: 1, 2, 3, 4, 5, 6 (rampData)
    // Differenced: 1, 1, 1, 1, 1 (length 5)
    // AR(1) on differenced series with phi=0.5. Mean of diff series is 1.
    // Centered diff series for ARMA: 0, 0, 0, 0, 0
    // AR(1) forecast for centered diff series: 0.5 * 0 = 0.
    // ARMA forecast (on diff series): mean_diff + AR_forecast_centered = 1 + 0 = 1.

    // Inverse difference:
    // Forecast_t+1 = LastOriginalValue + Forecast_ARMA_on_Diff
    //              = 6 + 1 = 7
    // Forecast_t+2 = Forecast_t+1 + Forecast_ARMA_on_Diff (assuming ARMA keeps forecasting 1 for diff series)
    //              = 7 + 1 = 8
    const params: Partial<ARIMAParams> = { p: 1, d: 1, q: 0, arCoefficients: [0.5] };
    const forecaster = new ARIMAForecaster(timeSeries, params);

    // @ts-ignore
    const diffSeriesMean = forecaster.armaForecaster.seriesMean; // Should be mean of [1,1,1,1,1], which is 1.
    expect(diffSeriesMean).toBeCloseTo(1.0);

    const forecasts = forecaster.forecast(timeSeries.data.length + 1, 2);

    const lastOriginalValue = rampData[rampData.length - 1]; // 6
    const expectedForecast1 = lastOriginalValue + (diffSeriesMean + 0.5 * (1 - diffSeriesMean)); // (1-diffSeriesMean is last centered diff value)
                                                                                                // = 6 + (1 + 0.5 * (1-1)) = 6 + 1 = 7
    const expectedForecast2 = expectedForecast1 + (diffSeriesMean + 0.5 * ( (expectedForecast1-lastOriginalValue) - diffSeriesMean)); // (expectedForecast1-lastOriginalValue) is the predicted diff value
                                                                                                // = 7 + (1 + 0.5 * (1-1)) = 7 + 1 = 8
    expect(forecasts[0]).toBeCloseTo(7);
    expect(forecasts[1]).toBeCloseTo(8);
  });


  test('should behave like ARMA if d=0', () => {
    // ARIMA(1,0,1) is ARMA(1,1)
    const armaParams: Partial<ARIMAParams> = {
      p: 1, d: 0, q: 1,
      arCoefficients: [0.7], maCoefficients: [0.3], errors: [0.1]
    };
    const forecaster = new ARIMAForecaster(timeSeries, armaParams);
    // @ts-ignore
    expect(forecaster.params.d).toBe(0);
    // @ts-ignore
    expect(forecaster.differencedTimeSeries.data.map(d=>d.x)).toEqual(rampData); // No differencing
    // @ts-ignore
    expect(forecaster.armaForecaster).not.toBeNull();
    // @ts-ignore
    expect(forecaster.armaForecaster.params.p).toBe(1);
    // @ts-ignore
    expect(forecaster.armaForecaster.params.q).toBe(1);

    // Forecast should match an ARMA(1,1) model directly on rampData
    // ARMA: X_t = mu + phi(X_{t-1}-mu) + theta*e_{t-1} + e_t
    // rampData mean = 3.5. Last value = 6. Last error (given) = 0.1
    // Centered last value = 6 - 3.5 = 2.5
    // Forecast_centered = 0.7 * 2.5 + 0.3 * 0.1 = 1.75 + 0.03 = 1.78
    // Forecast = 3.5 + 1.78 = 5.28
    // This depends on ARMAForecaster's internal mean and error handling.
    // The armaForecaster within ARIMA will calculate its own mean for rampData.
    const seriesMean = mean(rampData); // 3.5
    const lastVal = rampData[rampData.length - 1]; // 6
    const errorVal = 0.1;
    const expectedArmaForecast = seriesMean + 0.7*(lastVal - seriesMean) + 0.3*errorVal;

    const forecasts = forecaster.forecast(timeSeries.data.length + 1, 1);
    expect(forecasts[0]).toBeCloseTo(expectedArmaForecast);
  });

  test('should update parameters, especially d, and re-initialize Arma part', () => {
    const forecaster = new ARIMAForecaster(timeSeries, { p: 0, d: 0, q: 0 }); // Starts as ARMA(0,0)
    // @ts-ignore
    expect(forecaster.params.d).toBe(0);
    // @ts-ignore
    let armaP = forecaster.armaForecaster.params.p;
    expect(armaP).toBe(0);

    forecaster.updateParams({ d: 1, p:1, arCoefficients:[0.5] }); // Change to ARIMA(1,1,0)
    // @ts-ignore
    expect(forecaster.params.d).toBe(1);
    // @ts-ignore
    expect(forecaster.differencedTimeSeries.data.length).toBe(rampData.length - 1);
    // @ts-ignore
    armaP = forecaster.armaForecaster.params.p;
    expect(armaP).toBe(1); // ARMA model should now be AR(1)
  });

  test('should handle insufficient data for differencing', () => {
    const shortTimeSeries: TimeSeries = {
      data: [{ t: 1, x: 100 }], // Only one point
      timeUnit: 's', tickDuration: 1
    };
    // Try ARIMA(0,1,0) - needs d=1, so at least 2 points.
    const forecaster = new ARIMAForecaster(shortTimeSeries, { p: 0, d: 1, q: 0 });
    // @ts-ignore
    expect(forecaster.armaForecaster).toBeNull(); // Should not initialize ARMA part
    // @ts-ignore
    expect(forecaster.differencedTimeSeries.data.length).toBe(0);

    const forecasts = forecaster.forecast(2, 1);
    // Should forecast mean of original series (or 0 if series was empty)
    expect(forecasts[0]).toBe(100);
  });

  test('should update time series and re-difference, update ARMA', () => {
    const forecaster = new ARIMAForecaster(timeSeries, { p:0, d:1, q:0 }); // ARIMA(0,1,0)
    // @ts-ignore
    const initialDiffLength = forecaster.differencedTimeSeries.data.length; // 5

    const newRamp = [1,2,3,4,5,6,7,8]; // Longer series
    const newTimeSeries: TimeSeries = {
        data: newRamp.map((x,i)=>({t:i+1, x})),
        timeUnit: 's', tickDuration: 1
    };
    forecaster.updateTimeSeries(newTimeSeries);
    // @ts-ignore
    expect(forecaster.timeSeries.data.length).toBe(newRamp.length);
    // @ts-ignore
    expect(forecaster.differencedTimeSeries.data.length).toBe(newRamp.length - 1); // 7
    // @ts-ignore
    expect(forecaster.differencedTimeSeries.data.length).not.toBe(initialDiffLength);
    // @ts-ignore Check if ARMA was updated (e.g. its internal series mean might change)
    // This is harder to check directly without more mocks or specific scenarios.
    // But the differenced series it holds should be new.
  });

  test('forecast with d=2 ARIMA(0,2,0)', () => {
    // Series: 1, 2, 3, 4, 5, 6
    // d1: 1, 1, 1, 1, 1
    // d2: 0, 0, 0, 0 (mean 0)
    // Forecast for d2 series = 0.
    // Inverse d2: F_d1_t = Last_d1 + F_d2_t = 1 + 0 = 1.
    // Inverse d1: F_X_t = Last_X + F_d1_t = 6 + 1 = 7.
    // Next step:
    // F_d1_{t+1} = F_d1_t (which was 1) + F_d2_{t+1} (which is 0) = 1 + 0 = 1.
    // F_X_{t+1} = F_X_t (which was 7) + F_d1_{t+1} (which is 1) = 7 + 1 = 8.
    const params: Partial<ARIMAParams> = { p: 0, d: 2, q: 0 };
    const forecaster = new ARIMAForecaster(timeSeries, params);

    const forecasts = forecaster.forecast(timeSeries.data.length + 1, 2);
    expect(forecasts[0]).toBeCloseTo(7);
    expect(forecasts[1]).toBeCloseTo(8);
  });

});
