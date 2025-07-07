import { LaggedGradientForecaster } from '../../lib/forecasters/LaggedGradientForecaster';
import { TimeSeries } from '../../lib/types';

describe('LaggedGradientForecaster', () => {
  const sampleTimeSeries: TimeSeries = {
    name: 'Sample',
    data: [
      { t: 0, x: 10 },
      { t: 1, x: 12 },
      { t: 2, x: 15 },
      { t: 3, x: 13 },
      { t: 4, x: 16 },
      { t: 5, x: 18 },
      { t: 6, x: 20 },
      { t: 7, x: 19 },
      { t: 8, x: 22 },
      { t: 9, x: 25 },
    ],
    tickDuration: 1,
  };

  it('should be instantiated successfully with default params', () => {
    const forecaster = new LaggedGradientForecaster(sampleTimeSeries);
    expect(forecaster).toBeInstanceOf(LaggedGradientForecaster);
    expect(forecaster.name).toBe('Lagged Gradient');
  });

  it('should be instantiated successfully with custom params', () => {
    const params = { lookbackPeriod: 5, smoothingFactor: 0.5 };
    const forecaster = new LaggedGradientForecaster(sampleTimeSeries, params);
    expect(forecaster).toBeInstanceOf(LaggedGradientForecaster);
    // @ts-expect-error access private member for testing
    expect(forecaster.params).toEqual(params);
  });

  it('forecast method should execute without errors for empty data', () => {
    const emptyTimeSeries: TimeSeries = { name: 'Empty', data: [], tickDuration: 1 };
    const forecaster = new LaggedGradientForecaster(emptyTimeSeries);
    expect(() => forecaster.forecast(10, 5)).not.toThrow();
    expect(forecaster.forecast(10, 5)).toEqual([0, 0, 0, 0, 0]);
  });

  it('forecast method should execute without errors for single data point', () => {
    const singlePointSeries: TimeSeries = { name: 'Single', data: [{ t: 0, x: 100 }], tickDuration: 1 };
    const forecaster = new LaggedGradientForecaster(singlePointSeries);
    expect(() => forecaster.forecast(1, 3)).not.toThrow();
    const forecastResult = forecaster.forecast(1,3);
    // With a single point, gradient is 0, so forecast should be the last point's x value
    expect(forecastResult).toEqual([100, 100, 100]);
  });

  it('forecast method should execute without errors with sample data', () => {
    const forecaster = new LaggedGradientForecaster(sampleTimeSeries);
    expect(() => forecaster.forecast(10, 5)).not.toThrow();
  });

  it('should update time series correctly', () => {
    const forecaster = new LaggedGradientForecaster(sampleTimeSeries);
    const newTimeSeries: TimeSeries = {
      name: 'New Sample',
      data: [
        { t: 10, x: 30 },
        { t: 11, x: 32 },
      ],
      tickDuration: 1,
    };
    forecaster.updateTimeSeries(newTimeSeries);
    // @ts-expect-error access private member for testing
    expect(forecaster.timeSeries).toEqual(newTimeSeries);
  });

  it('should update params correctly', () => {
    const forecaster = new LaggedGradientForecaster(sampleTimeSeries);
    const newParams = { lookbackPeriod: 3, smoothingFactor: 0.1 };
    forecaster.updateParams(newParams);
    // @ts-expect-error access private member for testing
    expect(forecaster.params).toEqual(newParams);
  });

  it('should produce a somewhat reasonable forecast for a simple trend', () => {
    const trendingTimeSeries: TimeSeries = {
      name: 'Trending',
      data: [
        { t: 0, x: 10 },
        { t: 1, x: 12 },
        { t: 2, x: 14 },
        { t: 3, x: 16 },
        { t: 4, x: 18 },
      ],
      tickDuration: 1,
    };
    const forecaster = new LaggedGradientForecaster(trendingTimeSeries, { lookbackPeriod: 3, smoothingFactor: 0.5 });
    const horizon = 3;
    const forecasts = forecaster.forecast(5, horizon);

    expect(forecasts.length).toBe(horizon);
    // For a simple linear trend x = 2t + 10, the gradient should be ~2.
    // Last point is (4, 18).
    // Forecast for t=5: 18 + 2*(5-4) = 20
    // Forecast for t=6: 18 + 2*(6-4) = 22
    // Forecast for t=7: 18 + 2*(7-4) = 24
    // The smoothed gradient might not be exactly 2, so we check for approximate values.
    expect(forecasts[0]).toBeCloseTo(20, 0);
    expect(forecasts[1]).toBeCloseTo(22, 0);
    expect(forecasts[2]).toBeCloseTo(24, 0);
  });

  it('should return zero gradient and flat forecast if time does not advance', () => {
    const staticTimeSeries: TimeSeries = {
      name: 'StaticTime',
      data: [
        { t: 0, x: 10 },
        { t: 0, x: 12 },
        { t: 0, x: 15 },
      ],
      tickDuration: 1,
    };
    const forecaster = new LaggedGradientForecaster(staticTimeSeries);
    // @ts-expect-error access private member for testing
    expect(forecaster.getSmoothedGradient()).toBe(0);
    const forecasts = forecaster.forecast(1, 3);
    expect(forecasts).toEqual([15, 15, 15]); // last x value
  });

  it('should handle lookbackPeriod larger than data length', () => {
    const shortTimeSeries: TimeSeries = {
      name: 'Short',
      data: [
        { t: 0, x: 10 },
        { t: 1, x: 12 },
      ],
      tickDuration: 1,
    };
    const forecaster = new LaggedGradientForecaster(shortTimeSeries, { lookbackPeriod: 10 });
    expect(() => forecaster.forecast(2, 3)).not.toThrow();
    const forecasts = forecaster.forecast(2,3);
    // Gradient for (0,10) and (1,12) is (12-10)/(1-0) = 2
    // Last point is (1,12)
    // Forecast for t=2: 12 + 2*(2-1) = 14
    // Forecast for t=3: 12 + 2*(3-1) = 16
    // Forecast for t=4: 12 + 2*(4-1) = 18
    expect(forecasts[0]).toBeCloseTo(14,0);
    expect(forecasts[1]).toBeCloseTo(16,0);
    expect(forecasts[2]).toBeCloseTo(18,0);
  });

});
