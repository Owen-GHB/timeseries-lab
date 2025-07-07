import { BrownianMotionGenerator, BrownianMotionParams } from '../../lib/generators/BrownianMotionGenerator';
import { TimeSeries } from '../../lib/types';
import { mean, variance } from '../../lib/utils/math';

describe('BrownianMotionGenerator', () => {
  const defaultParams: BrownianMotionParams = {
    volatility: 0.1,
    drift: 0.01,
    initialValue: 10,
  };

  it('should be instantiated successfully with default params', () => {
    const generator = new BrownianMotionGenerator();
    expect(generator).toBeInstanceOf(BrownianMotionGenerator);
  });

  it('should be instantiated successfully with custom params', () => {
    const params: BrownianMotionParams = { volatility: 0.2, drift: 0.05, initialValue: 5 };
    const generator = new BrownianMotionGenerator(params);
    // @ts-expect-error access private member for testing
    expect(generator.params).toEqual(params);
    // @ts-expect-error access private member for testing
    expect(generator.currentValue).toBe(params.initialValue);
  });

  it('generate method should produce different values over time', () => {
    const generator = new BrownianMotionGenerator({ initialValue: 0, drift: 0, volatility: 0.1 });
    const val1 = generator.generate(1);
    const val2 = generator.generate(2);
    expect(val1).not.toBe(0); // initialValue is 0, but first step should change it
    expect(val2).not.toBe(val1);
  });

  it('generate method should return current value if t <= lastT', () => {
    const generator = new BrownianMotionGenerator({ initialValue: 50 });
    const val1 = generator.generate(1);
    const val2 = generator.generate(0.5); // Time goes back or stays same
    const val3 = generator.generate(1);   // Time stays same
    expect(val2).toBe(val1);
    expect(val3).toBe(val1);
  });

  it('generateSeries method should produce a TimeSeries output', () => {
    const generator = new BrownianMotionGenerator(defaultParams);
    const series = generator.generateSeries(0, 10, 1);
    expect(series).toHaveProperty('data');
    expect(series).toHaveProperty('tickDuration', 1);
    expect(series.data.length).toBe(11); // 0 to 10 inclusive
    expect(series.data[0].t).toBe(0);
    expect(series.data[0].x).toBe(defaultParams.initialValue); // First point after reset
  });

  it('generateSeries should start from initialValue', () => {
    const initialValue = 100;
    const generator = new BrownianMotionGenerator({ initialValue });
    const series = generator.generateSeries(0, 5, 1);
    expect(series.data[0].x).toBe(initialValue);
  });

  it('reset method should reset currentValue and lastT', () => {
    const generator = new BrownianMotionGenerator(defaultParams);
    generator.generate(5); // advance time and change current value
    generator.reset();
    // @ts-expect-error access private member for testing
    expect(generator.currentValue).toBe(defaultParams.initialValue);
    // @ts-expect-error access private member for testing
    expect(generator.lastT).toBe(0);
  });

  it('reset method should reset to a new initialValue if provided', () => {
    const generator = new BrownianMotionGenerator(defaultParams);
    generator.generate(5);
    const newInitial = 55;
    generator.reset(newInitial);
    // @ts-expect-error access private member for testing
    expect(generator.currentValue).toBe(newInitial);
    // @ts-expect-error access private member for testing
    expect(generator.lastT).toBe(0);
  });

  it('updateParams method should update parameters', () => {
    const generator = new BrownianMotionGenerator();
    const newParams: Partial<BrownianMotionParams> = { volatility: 0.5, drift: 0.1 };
    generator.updateParams(newParams);
    // @ts-expect-error access private member for testing
    expect(generator.params.volatility).toBe(newParams.volatility);
    // @ts-expect-error access private member for testing
    expect(generator.params.drift).toBe(newParams.drift);
  });

  describe('Statistical Properties (approximate)', () => {
    const nSamples = 500; // Number of steps in the generated series
    const step = 0.1; // Time step
    const tolerance = 0.25; // Tolerance for statistical checks (BM is stochastic)

    it('should have mean close to expected for zero drift', () => {
      // With zero drift, the expected value of B(t) is B(0)
      // E[X_t] = X_0 + drift * t
      const initialValue = 0;
      const drift = 0;
      const generator = new BrownianMotionGenerator({ initialValue, drift, volatility: 0.1 });
      const series = generator.generateSeries(0, nSamples * step, step);
      const values = series.data.map(p => p.x);
      const seriesMean = mean(values);
      // The mean of the process X_t itself is X_0 + drift*t.
      // The mean of a *sample path* up to T can deviate.
      // Here we check the mean of the *final values* of many paths, or the mean of one long path.
      // For a single path, the mean of values will be affected by the path itself.
      // Expected value of X_T is initialValue + drift * T
      // For drift = 0, E[X_T] = initialValue. The average value of the path is harder to pin down without more math.
      // Let's test the final value against its expectation.
      const finalValue = values[values.length -1];
      const expectedFinalValue = initialValue + drift * (nSamples*step);
      // This is a single sample, so it can deviate. We'd need many paths to test E[finalValue].
      // Instead, let's check the average of the steps (increments).
      // E[dX_t] = drift * dt.
      const increments = [];
      for(let i=1; i< values.length; i++) {
        increments.push(values[i] - values[i-1]);
      }
      const meanIncrement = mean(increments);
      const expectedMeanIncrement = drift * step;
      expect(meanIncrement).toBeCloseTo(expectedMeanIncrement, 1); // loose tolerance due to randomness
    });

    it('should have mean increment close to drift * dt', () => {
        const initialValue = 10;
        const drift = 0.05;
        const volatility = 0.2;
        const generator = new BrownianMotionGenerator({ initialValue, drift, volatility });
        const series = generator.generateSeries(0, nSamples * step, step);
        const values = series.data.map(p => p.x);
        const increments = [];
        for(let i=1; i< values.length; i++) {
          increments.push(values[i] - values[i-1]);
        }
        const meanIncrement = mean(increments);
        const expectedMeanIncrement = drift * step;
        // For a large number of samples, the mean of these increments should approach drift * dt
        expect(meanIncrement).toBeCloseTo(expectedMeanIncrement, 2); // Check within a reasonable range
    });


    it('variance of increments should be close to volatility^2 * dt', () => {
      // Var(dX_t) = Var(drift*dt + vol*dW_t) = vol^2 * Var(dW_t) = vol^2 * dt
      const drift = 0.01;
      const volatility = 0.15;
      const generator = new BrownianMotionGenerator({ initialValue: 0, drift, volatility });
      const series = generator.generateSeries(0, nSamples * step, step);
      const values = series.data.map(p => p.x);

      const increments: number[] = [];
      for (let i = 1; i < values.length; i++) {
        increments.push(values[i] - values[i-1]);
      }

      const varianceIncrements = variance(increments, true); // Population variance
      const expectedVarianceIncrements = Math.pow(volatility, 2) * step;

      // Check if the calculated variance is within a certain percentage of the expected value
      // This is a stochastic test, so it might fail occasionally.
      // A larger nSamples would give more stability.
      expect(varianceIncrements).toBeGreaterThan(expectedVarianceIncrements * (1-tolerance*2)); // Lower bound
      expect(varianceIncrements).toBeLessThan(expectedVarianceIncrements * (1+tolerance*2));    // Upper bound
    });
  });
});
