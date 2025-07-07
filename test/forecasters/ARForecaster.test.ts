import { ARForecaster } from '../../lib/forecasters/ARForecaster';
import { TimeSeries, ARParams } from '../../lib/types';

describe('ARForecaster', () => {
  let timeSeries: TimeSeries;

  beforeEach(() => {
    // Simple time series: 1, 2, 3, 4, 5
    timeSeries = {
      data: [
        { t: 1, x: 1 },
        { t: 2, x: 2 },
        { t: 3, x: 3 },
        { t: 4, x: 4 },
        { t: 5, x: 5 },
      ],
      timeUnit: 'seconds',
      tickDuration: 1,
    };
  });

  test('should instantiate with default parameters', () => {
    const forecaster = new ARForecaster(timeSeries);
    expect(forecaster.name).toBe('AR Forecaster');
    // Accessing private params for testing, consider a getter if needed for real scenarios
    // @ts-ignore
    expect(forecaster.params.p).toBe(1);
  });

  test('should instantiate with provided parameters', () => {
    const params: Partial<ARParams> = { p: 2, coefficients: [0.5, 0.3] };
    const forecaster = new ARForecaster(timeSeries, params);
     // @ts-ignore
    expect(forecaster.params.p).toBe(2);
     // @ts-ignore
    expect(forecaster.coefficients).toEqual([0.5, 0.3]);
  });

  test('should forecast with known coefficients and history (AR1 model: X_t = 0.8 * X_{t-1})', () => {
    const ar1TimeSeries: TimeSeries = {
        data: [ {t:1, x:10}, {t:2, x:8}, {t:3, x:6.4}, {t:4, x:5.12} ], // Roughly X_t = 0.8 * X_{t-1}
        timeUnit: 's', tickDuration: 1
    };
    const params: Partial<ARParams> = { p: 1, coefficients: [0.8] };
    const forecaster = new ARForecaster(ar1TimeSeries, params);
    const forecasts = forecaster.forecast(5, 2); // Forecast for t=5 and t=6

    // X_5 = 0.8 * X_4 = 0.8 * 5.12 = 4.096
    // X_6 = 0.8 * X_5 = 0.8 * 4.096 = 3.2768
    expect(forecasts.length).toBe(2);
    expect(forecasts[0]).toBeCloseTo(4.096);
    expect(forecasts[1]).toBeCloseTo(3.2768);
  });

  test('should forecast with known coefficients (AR2 model: X_t = 0.5*X_{t-1} + 0.3*X_{t-2})', () => {
    // Series: 1, 2, (0.5*2 + 0.3*1)=1.3, (0.5*1.3 + 0.3*2)=1.25
    const ar2TimeSeries: TimeSeries = {
        data: [ {t:1, x:1}, {t:2, x:2}, {t:3, x:1.3}, {t:4, x:1.25} ],
        timeUnit: 's', tickDuration: 1
    };
    const params: Partial<ARParams> = { p: 2, coefficients: [0.5, 0.3] }; // phi1=0.5, phi2=0.3
    const forecaster = new ARForecaster(ar2TimeSeries, params);
    const forecasts = forecaster.forecast(5, 1);

    // Next value: 0.5 * 1.25 (X_t-1) + 0.3 * 1.3 (X_t-2)
    // = 0.625 + 0.39 = 1.015
    expect(forecasts.length).toBe(1);
    expect(forecasts[0]).toBeCloseTo(1.015);
  });

  test('should return zeros if data length is less than p', () => {
    const shortTimeSeries: TimeSeries = {
      data: [{ t: 1, x: 100 }],
      timeUnit: 's', tickDuration: 1
    };
    const params: Partial<ARParams> = { p: 2, coefficients: [0.5, 0.3] };
    const forecaster = new ARForecaster(shortTimeSeries, params);
    const forecasts = forecaster.forecast(2, 3);
    expect(forecasts).toEqual([0, 0, 0]);
  });

  test('should update parameters and re-estimate coefficients if necessary', () => {
    const forecaster = new ARForecaster(timeSeries, { p: 1 });
     // @ts-ignore
    const initialCoeffs = [...forecaster.coefficients]; // Copy

    forecaster.updateParams({ p: 2 });
     // @ts-ignore
    expect(forecaster.params.p).toBe(2);
    // Coefficients should change or be re-estimated (now based on p=2)
    // This test is a bit weak as estimation is basic, but it should not be the same.
    // If estimation results in [0,0] for p=2 with this data, it's still a change from p=1's potential single coeff.
     // @ts-ignore
    expect(forecaster.coefficients.length).toBe(2);
    // A more robust test would mock estimateARCoefficients or use data where estimation is non-trivial and predictable.
  });

  test('should update time series and re-estimate coefficients', () => {
    const forecaster = new ARForecaster(timeSeries, { p: 1 });
    // @ts-ignore
    const initialCoeffs = [...forecaster.coefficients];

    const newTimeSeries: TimeSeries = {
      data: [...timeSeries.data, { t: 6, x: 6 }, { t: 7, x: 7 }], // Longer series
      timeUnit: 's', tickDuration: 1
    };
    forecaster.updateTimeSeries(newTimeSeries);
     // @ts-ignore
    expect(forecaster.timeSeries.data.length).toBe(7);
    // Coefficients should be re-estimated based on new series.
    // Similar to above, this is a basic check.
    // @ts-ignore
    expect(forecaster.coefficients.length).toBe(1); // p is still 1
  });

  test('should attempt to estimate coefficients if not provided and data is sufficient', () => {
    // Data: 1, 2, 3, 4, 5. For p=1, Yule-Walker should give a coefficient.
    // autocov(0) = variance, autocov(1) = cov(X_t, X_{t-1})
    // phi_1 = autocov(1) / autocov(0)
    const forecaster = new ARForecaster(timeSeries, { p: 1 }); // No coefficients provided
    // @ts-ignore
    expect(forecaster.coefficients.length).toBe(1);
    // For series 1,2,3,4,5 (mean=3):
    // Centered: -2, -1, 0, 1, 2
    // autocov(0) = ( (-2)^2 + (-1)^2 + 0^2 + 1^2 + 2^2 ) / 5 = (4+1+0+1+4)/5 = 10/5 = 2
    // autocov(1) = ( (-2*-1) + (-1*0) + (0*1) + (1*2) ) / 5 = (2+0+0+2)/5 = 4/5 = 0.8
    // So, phi_1 = 0.8 / 2 = 0.4.
    // This depends heavily on the correctness of autocovariance and Yule-Walker solver.
    // @ts-ignore
    expect(forecaster.coefficients[0]).toBeCloseTo(0.4);
  });

   test('should handle coefficient length mismatch if params.coefficients is set after instantiation', () => {
    const forecaster = new ARForecaster(timeSeries, { p: 1 });
    // @ts-ignore
    expect(forecaster.coefficients.length).toBe(1);

    forecaster.updateParams({ p: 2, coefficients: [0.5] }); // p=2, but only one coeff provided
     // @ts-ignore
    expect(forecaster.params.p).toBe(2);
     // @ts-ignore
    expect(forecaster.coefficients).toEqual([0.5]); // Should use provided, even if "wrong" length for p. ARForecaster logic might pad this.
                                                 // Current ARForecaster will use the provided [0.5] and p=2.
                                                 // predictAR will likely fail or misbehave.
                                                 // The forecast logic in ARForecaster has a check:
                                                 // if (this.coefficients.length !== p) { ... return zeros }
    const forecasts = forecaster.forecast(6,1);
    expect(forecasts).toEqual([0]); // Because coeff length 1 != p 2
  });

  test('should forecast correctly after updating p to a smaller value with new coefficients', () => {
    const forecaster = new ARForecaster(timeSeries, { p: 2, coefficients: [0.5, 0.2] });
    forecaster.updateParams({ p: 1, coefficients: [0.9] });
    // @ts-ignore
    expect(forecaster.params.p).toBe(1);
    // @ts-ignore
    expect(forecaster.coefficients).toEqual([0.9]);

    // Last value of timeSeries is 5. Forecast = 0.9 * 5 = 4.5
    const forecasts = forecaster.forecast(6, 1);
    expect(forecasts[0]).toBeCloseTo(4.5);
  });

});
