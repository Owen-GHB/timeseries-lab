import { ARMAForecaster } from '../../lib/forecasters/ARMAForecaster';
import { TimeSeries, ARMAParams } from '../../lib/types';
import { mean } from '../../lib/utils/math';

describe('ARMAForecaster', () => {
  let timeSeries: TimeSeries;
  const testSeriesData = [10, 11, 10.5, 11.5, 11]; // Mean approx 10.8

  beforeEach(() => {
    timeSeries = {
      data: testSeriesData.map((x, i) => ({ t: i + 1, x })),
      timeUnit: 'seconds',
      tickDuration: 1,
    };
  });

  test('should instantiate with default parameters (p=0, q=0)', () => {
    const forecaster = new ARMAForecaster(timeSeries);
    expect(forecaster.name).toBe('ARMA Forecaster');
    // @ts-ignore
    expect(forecaster.params.p).toBe(0);
    // @ts-ignore
    expect(forecaster.params.q).toBe(0);
  });

  test('should instantiate with provided parameters', () => {
    const params: Partial<ARMAParams> = {
      p: 1,
      q: 1,
      arCoefficients: [0.7],
      maCoefficients: [0.3],
      errors: [0.1]
    };
    const forecaster = new ARMAForecaster(timeSeries, params);
    // @ts-ignore
    expect(forecaster.params.p).toBe(1);
    // @ts-ignore
    expect(forecaster.params.q).toBe(1);
    // @ts-ignore
    expect(forecaster.arCoefficients).toEqual([0.7]);
    // @ts-ignore
    expect(forecaster.maCoefficients).toEqual([0.3]);
    // @ts-ignore
    expect(forecaster.errors).toEqual([0.1]);
  });

  test('should forecast with ARMA(1,1) model: X_t = 0.7*X_{t-1} + 0.3*e_{t-1} + e_t', () => {
    // Series: ..., X_{t-1} = 12. Error e_{t-1} = 0.2. Series mean = 10.
    // Centered X_{t-1} = 12 - 10 = 2.
    const currentMean = 10;
    const arCoeffs = [0.7];
    const maCoeffs = [0.3];
    const lastError = 0.2; // e_{t-1}
    const lastValue = 12;  // X_{t-1}

    const armaTS: TimeSeries = {
        data: [{t:1,x:9},{t:2,x:11},{t:3,x:lastValue}], // Mean is 10.66, let's force it for testing
        timeUnit:'s', tickDuration:1
    };
    const params: Partial<ARMAParams> = {
      p: 1, q: 1,
      arCoefficients: arCoeffs,
      maCoefficients: maCoeffs,
      errors: [lastError]
    };
    const forecaster = new ARMAForecaster(armaTS, params);
    // @ts-ignore Force mean for predictable test
    forecaster.seriesMean = currentMean;
    // @ts-ignore Ensure errors are set as expected
    forecaster.errors = [lastError];


    const forecasts = forecaster.forecast(4, 1); // Forecast for t=4

    // AR part: arCoeff * (X_{t-1} - mean) = 0.7 * (12 - 10) = 0.7 * 2 = 1.4
    // MA part: maCoeff * e_{t-1} = 0.3 * 0.2 = 0.06
    // Forecast_centered = AR part + MA part = 1.4 + 0.06 = 1.46
    // Forecast_actual = Forecast_centered + mean = 1.46 + 10 = 11.46

    const expectedForecast = currentMean + arCoeffs[0]*(lastValue - currentMean) + maCoeffs[0]*lastError;
    expect(forecasts.length).toBe(1);
    expect(forecasts[0]).toBeCloseTo(expectedForecast);

    // Multi-step: next error e_t = 0. Next X_t for AR is previous forecast.
    // Forecast_t+1_centered = 1.46
    // AR part for t+2: 0.7 * (Forecast_t+1_centered) = 0.7 * 1.46 = 1.022
    // MA part for t+2: 0.3 * (error_t=0) = 0
    // Forecast_t+2_centered = 1.022 + 0 = 1.022
    // Forecast_t+2_actual = 1.022 + 10 = 11.022
    const multiStepForecasts = forecaster.forecast(4, 2);
    const expectedForecast2 = currentMean + arCoeffs[0]* (expectedForecast - currentMean) + maCoeffs[0]*0;
    expect(multiStepForecasts.length).toBe(2);
    expect(multiStepForecasts[0]).toBeCloseTo(expectedForecast);
    expect(multiStepForecasts[1]).toBeCloseTo(expectedForecast2);
  });

  test('should behave like AR model if q=0', () => {
    const arParams: Partial<ARMAParams> = { p: 1, q: 0, arCoefficients: [0.8] };
    const forecaster = new ARMAForecaster(timeSeries, arParams);
    // @ts-ignore (force mean to simplify test if needed, but ARMA handles it)
    // forecaster.seriesMean = mean(testSeriesData);

    const lastVal = testSeriesData[testSeriesData.length - 1]; // 11
    const seriesMeanVal = mean(testSeriesData); // 10.8

    const forecasts = forecaster.forecast(timeSeries.data.length + 1, 1);
    // Expected: seriesMean + 0.8 * (lastVal - seriesMean)
    const expectedArForecast = seriesMeanVal + 0.8 * (lastVal - seriesMeanVal);
    expect(forecasts[0]).toBeCloseTo(expectedArForecast);
  });

  test('should behave like MA model if p=0', () => {
    const maParams: Partial<ARMAParams> = { p: 0, q: 1, maCoefficients: [0.5], errors: [0.3] };
    const forecaster = new ARMAForecaster(timeSeries, maParams);
    // @ts-ignore (force mean if needed)
    // forecaster.seriesMean = mean(testSeriesData);
    // @ts-ignore (ensure errors are set)
    forecaster.errors = [0.3];


    const seriesMeanVal = mean(testSeriesData); // 10.8
    const forecasts = forecaster.forecast(timeSeries.data.length + 1, 1);
    // Expected: seriesMean + 0.5 * error_t-1
    const expectedMaForecast = seriesMeanVal + 0.5 * 0.3;
    expect(forecasts[0]).toBeCloseTo(expectedMaForecast);
  });

  test('should predict the mean if p=0 and q=0', () => {
    const forecaster = new ARMAForecaster(timeSeries, { p: 0, q: 0 });
    const forecasts = forecaster.forecast(timeSeries.data.length + 1, 2);
    const seriesMeanVal = mean(testSeriesData);
    expect(forecasts).toEqual([seriesMeanVal, seriesMeanVal]);
  });

  test('should update parameters', () => {
    const forecaster = new ARMAForecaster(timeSeries, { p: 1, q: 0, arCoefficients: [0.1] });
    // @ts-ignore
    expect(forecaster.params.p).toBe(1);
    // @ts-ignore
    expect(forecaster.params.q).toBe(0);

    forecaster.updateParams({ p: 1, q: 1, arCoefficients: [0.2], maCoefficients: [0.3], errors:[0.05] });
    // @ts-ignore
    expect(forecaster.params.p).toBe(1);
    // @ts-ignore
    expect(forecaster.params.q).toBe(1);
    // @ts-ignore
    expect(forecaster.arCoefficients).toEqual([0.2]);
    // @ts-ignore
    expect(forecaster.maCoefficients).toEqual([0.3]);
     // @ts-ignore
    expect(forecaster.errors.length).toBe(1); // errors are initialized
  });

  test('should update time series and re-estimate/re-initialize', () => {
    const forecaster = new ARMAForecaster(timeSeries, { p: 1, q: 1 }); // Estimate coeffs
    // @ts-ignore
    const initialMean = forecaster.seriesMean;

    const newSeriesData = [1, 2, 1, 2, 1]; // Mean = 1.4
    const newTimeSeries: TimeSeries = {
      data: newSeriesData.map((x, i) => ({ t: i + 1, x })),
      timeUnit: 's', tickDuration: 1
    };
    forecaster.updateTimeSeries(newTimeSeries);

    // @ts-ignore
    expect(forecaster.seriesMean).toBeCloseTo(mean(newSeriesData));
    // @ts-ignore
    expect(forecaster.seriesMean).not.toBeCloseTo(initialMean);
    // Coefficients should be re-estimated (placeholders will be used)
    // @ts-ignore
    expect(forecaster.arCoefficients.length).toBe(1);
    // @ts-ignore
    expect(forecaster.maCoefficients.length).toBe(1);
    // @ts-ignore
    expect(forecaster.errors.length).toBe(1); // errors are initialized to [0] typically
  });

  test('error history should be updated for MA part when new data arrives', () => {
    // ARMA(1,1): X_t = mu + phi*(X_{t-1}-mu) + theta*e_{t-1} + e_t
    // Let mu=10, phi=0.5, theta=0.2
    // X_1=11 (centered=1). Assume e_1=0 for simplicity (or actual residual).
    // X_2=12 (centered=2).
    //   Forecast for X_2 (centered): phi*(X_1-mu) + theta*e_1 = 0.5*(11-10) + 0.2*0 = 0.5
    //   Error e_2 = (X_2-mu) - Forecast_X2_centered = (12-10) - 0.5 = 2 - 0.5 = 1.5
    const simpleTS: TimeSeries = {
      data: [{t:1,x:11}, {t:2,x:12}],
      timeUnit:'s', tickDuration:1
    };
    const params: Partial<ARMAParams> = {p:1, q:1, arCoefficients:[0.5], maCoefficients:[0.2], errors:[0]};
    const forecaster = new ARMAForecaster(simpleTS, params);
    // @ts-ignore
    // forecaster.seriesMean = 10; // DO NOT force mean if updateTimeSeries is called after.
    // @ts-ignore
    // forecaster.errors = [0]; // Initial e_1 = 0. This is set by params.

    // ARMAForecaster constructor with simpleTS ([11,12]) and params (p1,q1,ar0.5,ma0.2,err[0]):
    // 1. seriesMean = mean([11,12]) = 11.5.
    // 2. errors = [0] (from params). arCoeffs=[0.5], maCoeffs=[0.2].

    // Add X_3 = 13.
    const updatedTimeSeries: TimeSeries = {
        data: [...simpleTS.data, {t:3, x:13}], // Series is now [11,12,13]
        timeUnit: 's', tickDuration: 1
    };
    // Call updateTimeSeries. This will:
    // 1. Recalculate seriesMean = mean([11,12,13]) = 12.
    // 2. Iterate for the new point X_3=13 (centered value is 13-12=1).
    //    - AR history for X_3: [X_2_centered] = [12-12] = [0].
    //    - MA errors for X_3: [e_2]. What is e_2? It's the error for X_2 based on old mean (11.5) and e_1 (0).
    //      The `forecaster.errors` before this loop is still `[0]` (the initial e_1).
    //      So currentMAErrors for calculating error of X_3 will be `[0]`.
    //    - Forecast for X_3 (centered): AR([0]) + MA([0]) = (0.5*0) + (0.2*0) = 0.
    //    - newError (e_3) = (X_3_centered) - Forecast_X3_centered = (13-12) - 0 = 1.
    //    - forecaster.errors becomes [1].
    forecaster.updateTimeSeries(updatedTimeSeries);

    // So after X_3=13 is processed, the errors list (for q=1) should contain [1]
    // @ts-ignore
    expect(forecaster.errors.length).toBe(1);
    // @ts-ignore
    expect(forecaster.errors[0]).toBeCloseTo(1.0);
  });

});
