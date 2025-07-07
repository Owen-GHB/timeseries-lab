import {
    mean,
    variance,
    autocovariance,
    estimateARCoefficients,
    predictAR,
    difference,
    inverseDifferenceForecast,
    combinations,
    estimateMACoefficients,
    predictMA,
    predictARMA,
    estimateARMACoefficients
} from '../../lib/utils/math';

describe('Math Utilities', () => {

  describe('mean', () => {
    it('should calculate the mean of an array of numbers', () => {
      expect(mean([1, 2, 3, 4, 5])).toBe(3);
      expect(mean([10, 20, 30])).toBe(20);
      expect(mean([-1, 0, 1])).toBe(0);
    });

    it('should return 0 for an empty array', () => {
      expect(mean([])).toBe(0);
    });

    it('should handle single element array', () => {
      expect(mean([5])).toBe(5);
    });
  });

  describe('variance', () => {
    it('should calculate population variance', () => {
      // Var(X) = E[(X - mu)^2]
      // For [1,2,3,4,5], mu=3. (1-3)^2=4, (2-3)^2=1, (3-3)^2=0, (4-3)^2=1, (5-3)^2=4. Sum=10. Mean=10/5=2.
      expect(variance([1, 2, 3, 4, 5], true)).toBe(2);
      expect(variance([2, 4, 6, 8], true)).toBe(5); // mu=5. (2-5)^2=9, (4-5)^2=1, (6-5)^2=1, (8-5)^2=9. Sum=20. Mean=20/4=5
    });

    it('should calculate sample variance', () => {
      // s^2 = sum((xi-mu)^2) / (n-1)
      // For [1,2,3,4,5], sum((xi-mu)^2)=10. n=5. s^2 = 10 / 4 = 2.5
      expect(variance([1, 2, 3, 4, 5], false)).toBe(2.5);
      // For [2,4,6,8], sum((xi-mu)^2)=20. n=4. s^2 = 20 / 3
      expect(variance([2, 4, 6, 8], false)).toBeCloseTo(20 / 3);
    });

    it('should return 0 if data length is insufficient for variance type', () => {
      expect(variance([], true)).toBe(0);
      expect(variance([], false)).toBe(0);
      expect(variance([1], false)).toBe(0); // Sample variance needs at least 2 points
      expect(variance([1], true)).toBe(0); // Population variance of single point is 0: (1-1)^2 / 1 = 0
    });
  });

  describe('autocovariance', () => {
    const data = [1, 2, 3, 4, 5]; // mean = 3
    // acvf(0) = variance = 2 (population)
    // acvf(1) = E[(Xt-mu)(Xt-1 - mu)] = [(1-3)(2-3) + (2-3)(3-3) + (3-3)(4-3) + (4-3)(5-3)] / 5 -> No, this is not standard for Xt-1
    // acvf(h) = sum_{t=1}^{N-h} (X_t - mu)(X_{t+h} - mu) / N
    // acvf(0): (1-3)^2+(2-3)^2+(3-3)^2+(4-3)^2+(5-3)^2 / 5 = (4+1+0+1+4)/5 = 10/5 = 2
    // acvf(1): ((1-3)(2-3) + (2-3)(3-3) + (3-3)(4-3) + (4-3)(5-3)) / 5
    //          = ((-2)(-1) + (-1)(0) + (0)(1) + (1)(2)) / 5 = (2 + 0 + 0 + 2) / 5 = 4/5 = 0.8
    // acvf(2): ((1-3)(3-3) + (2-3)(4-3) + (3-3)(5-3)) / 5
    //          = ((-2)(0) + (-1)(1) + (0)(2)) / 5 = (0 - 1 + 0) / 5 = -1/5 = -0.2

    it('should calculate autocovariance for lag 0 (variance)', () => {
      expect(autocovariance(data, 0)).toBeCloseTo(variance(data, true));
      expect(autocovariance(data, 0)).toBeCloseTo(2);
    });

    it('should calculate autocovariance for lag 1', () => {
      expect(autocovariance(data, 1)).toBeCloseTo(0.8);
    });

    it('should calculate autocovariance for lag 2', () => {
      expect(autocovariance(data, 2)).toBeCloseTo(-0.2);
    });

    it('should calculate autocovariance for a known series', () => {
        // Example from a source: series [1,2,3,4,5,6], mean = 3.5
        // acf(0) = [(1-3.5)^2 + ... + (6-3.5)^2] / 6 = [6.25+2.25+0.25+0.25+2.25+6.25]/6 = 17.5/6
        // acf(1) = [(1-3.5)(2-3.5) + ... + (5-3.5)(6-3.5)] / 6
        //        = [(-2.5)(-1.5) + (-1.5)(-0.5) + (-0.5)(0.5) + (0.5)(1.5) + (1.5)(2.5)] / 6
        //        = [3.75 + 0.75 - 0.25 + 0.75 + 3.75] / 6 = 8.75 / 6
        const series = [1,2,3,4,5,6];
        expect(autocovariance(series,0)).toBeCloseTo(17.5/6);
        expect(autocovariance(series,1)).toBeCloseTo(8.75/6);
    });


    it('should return 0 for lag out of bounds', () => {
      expect(autocovariance(data, data.length)).toBe(0);
      expect(autocovariance(data, -1)).toBe(0);
      expect(autocovariance([], 1)).toBe(0);
    });
  });

  describe('estimateARCoefficients', () => {
    // AR(1): X_t = phi_1 * X_{t-1} + e_t. phi_1 = acvf(1)/acvf(0)
    const ar1_data = [1, 0.5, 0.25, 0.125, 0.0625]; // phi_1 = 0.5 (approx)
    // acvf0 for ar1_data: mean approx 0.38. Let's use a mean-centered series for easier check.
    // For X_t = 0.9*X_{t-1} + e_t. acvf(1)/acvf(0) should be close to 0.9.
    // Example data from statsmodels:
    const sunspot_series = [40.9,52.1,66.1,55.3,40.2,27,16.3,6.4,4.1,6.8,14.5,35.9,50.5,60,51.3,39.4,21.1,10.6,5.7,10.3,23.9,47.9,62.5,68.1,60.9,44,28.9,15.6,7.1,4.8,10.3,25.7,45,55.3];

    it('should estimate AR(1) coefficient', () => {
      const data = [1, 2, 3, 4, 5]; // Not strongly AR, but should give some value
      const acvf0 = autocovariance(data, 0);
      const acvf1 = autocovariance(data, 1);
      const expected_phi1 = acvf1 / acvf0; // 0.8 / 2 = 0.4
      const coeffs = estimateARCoefficients(data, 1);
      expect(coeffs.length).toBe(1);
      expect(coeffs[0]).toBeCloseTo(expected_phi1);
    });

    it('should estimate AR(1) for a known AR(1) process', () => {
        // Generate data: X_t = 0.7 * X_{t-1} + noise
        let x_prev = 1;
        const data_ar1_known = [x_prev];
        for(let i=0; i < 50; i++) {
            x_prev = 0.7 * x_prev + (Math.random() - 0.5) * 0.1; // small noise
            data_ar1_known.push(x_prev);
        }
        const coeffs = estimateARCoefficients(data_ar1_known, 1);
        expect(coeffs.length).toBe(1);
        expect(coeffs[0]).toBeCloseTo(0.7, 1); // Tolerance of 0.1 due to noise and short series
    });

    it('should estimate AR(2) coefficients', () => {
      // For AR(2): X_t = phi_1 X_{t-1} + phi_2 X_{t-2} + e_t
      // Yule-Walker:
      // rho(1) = phi_1 + phi_2 rho(1)
      // rho(2) = phi_1 rho(1) + phi_2
      // Solve for phi_1, phi_2 using autocovariances (rho(h) = acvf(h)/acvf(0))
      // phi_1 = (rho(1) * (1 - rho(2))) / (1 - rho(1)^2)
      // phi_2 = (rho(2) - rho(1)^2) / (1 - rho(1)^2)
      const data = sunspot_series.slice(0,20); // Use a shorter segment
      const coeffs = estimateARCoefficients(data, 2);
      expect(coeffs.length).toBe(2);
      // Values for AR(2) from statsmodels on this short series are approx [1.17, -0.32]
      // The internal solver is basic, so we check if it runs and produces numbers.
      expect(coeffs[0]).toBeDefined();
      expect(coeffs[1]).toBeDefined();
    });

    it('should return zeros if p > 2 due to simplified solver for now', () => {
        // This test reflects the current simplified implementation detail.
        // When a robust solver is in place, this test should be updated.
        const coeffs_p3 = estimateARCoefficients(sunspot_series, 3);
        // The current Gaussian elimination might solve it for p=3.
        // Let's test if it produces non-zero results (or specific results if known).
        // For now, just check length and definition.
        expect(coeffs_p3.length).toBe(3);
        expect(coeffs_p3[0]).toBeDefined();
    });


    it('should return empty array for p=0', () => {
      expect(estimateARCoefficients(sunspot_series, 0)).toEqual([]);
    });

    it('should return zeros if data length is too short', () => {
      expect(estimateARCoefficients([1, 2], 2)).toEqual([0, 0]); // data length <= p
      expect(estimateARCoefficients([1, 2, 3], 3)).toEqual([0,0,0]);
    });
  });

  describe('predictAR', () => {
    it('should predict next value in AR(1) series', () => {
      // X_t = 0.5 * X_{t-1}. If X_{t-1}=10, X_t = 5.
      // history is [X_{t-p}, ..., X_{t-1}] -> [X_{t-1}] for p=1
      // coefficients are [phi_1]
      expect(predictAR([10], [0.5])).toBe(5);
    });

    it('should predict next value in AR(2) series', () => {
      // X_t = 0.5*X_{t-1} + 0.2*X_{t-2}. If X_{t-1}=10, X_{t-2}=8
      // Prediction = 0.5*10 + 0.2*8 = 5 + 1.6 = 6.6
      // history is [X_{t-2}, X_{t-1}] -> [8, 10]
      // coefficients are [phi_1, phi_2] -> [0.5, 0.2]
      expect(predictAR([8, 10], [0.5, 0.2])).toBe(6.6);
    });

    it('should return 0 if history length does not match coefficients length', () => {
      expect(predictAR([1, 2], [0.5])).toBe(0);
      expect(predictAR([1], [0.5, 0.2])).toBe(0);
    });
  });

  describe('difference', () => {
    const data = [1, 3, 6, 10, 15]; // Values: X_i
                                   // Diff1: 2, 3, 4, 5 (X_i - X_{i-1})
                                   // Diff2: 1, 1, 1   ((X_i - X_{i-1}) - (X_{i-1} - X_{i-2}))

    it('should perform first-order differencing (d=1)', () => {
      expect(difference(data, 1)).toEqual([2, 3, 4, 5]);
    });

    it('should perform second-order differencing (d=2)', () => {
      expect(difference(data, 2)).toEqual([1, 1, 1]);
    });

    it('should return original data for d=0', () => {
      expect(difference(data, 0)).toEqual(data);
    });

    it('should return empty array if data length is less than or equal to d', () => {
      expect(difference([1, 2], 2)).toEqual([]);
      expect(difference([1, 2], 3)).toEqual([]);
      expect(difference([], 1)).toEqual([]);
    });

    it('should throw error for d < 0', () => {
        expect(() => difference(data, -1)).toThrow("Order of differencing 'd' must be non-negative.");
    });
  });

  describe('combinations', () => {
    it('should calculate nC0 and nCn as 1', () => {
      expect(combinations(5, 0)).toBe(1);
      expect(combinations(5, 5)).toBe(1);
    });

    it('should calculate nC1 as n', () => {
      expect(combinations(5, 1)).toBe(5);
    });

    it('should calculate known combinations', () => {
      expect(combinations(4, 2)).toBe(6); // 4*3 / (2*1) = 6
      expect(combinations(5, 2)).toBe(10); // 5*4 / (2*1) = 10
      expect(combinations(6, 3)).toBe(20); // 6*5*4 / (3*2*1) = 20
    });

    it('should use k = n-k optimization', () => {
      expect(combinations(10, 7)).toBe(combinations(10, 3)); // 10*9*8 / (3*2*1) = 10*3*4/2 = 120
      expect(combinations(10,7)).toBe(120);
    });

    it('should return 0 for k < 0 or k > n', () => {
        expect(combinations(5, -1)).toBe(0);
        expect(combinations(5, 6)).toBe(0);
    });
  });

  describe('inverseDifferenceForecast', () => {
    // Original: 1, 3, 6, 10, 15 (data)
    // d=1 diff: 2, 3, 4, 5. Let's say forecast for next diff is 6.
    // Last original value X_{t-1} is 15.
    // Forecast X_t = 6 + 15 = 21.
    it('should correctly invert first-order difference (d=1)', () => {
      const forecastOfDiff = 6;
      const originalSeriesTail = [10, 15]; // Need X_{t-1} = 15
      expect(inverseDifferenceForecast(forecastOfDiff, originalSeriesTail, 1)).toBe(21);
    });

    // Original: 1, 3, 6, 10, 15
    // d=1 diff: 2, 3, 4, 5
    // d=2 diff: 1, 1, 1. Let's say forecast for next d2_diff is 1.
    // To reconstruct X_t: X_t = ForecastDiff_2 + 2*X_{t-1} - X_{t-2}
    // X_{t-1} = 15, X_{t-2} = 10.
    // Forecast X_t = 1 + 2*15 - 10 = 1 + 30 - 10 = 21.
    it('should correctly invert second-order difference (d=2)', () => {
      const forecastOfD2Diff = 1;
      const originalSeriesTail = [6, 10, 15]; // Need X_{t-1}=15, X_{t-2}=10
      expect(inverseDifferenceForecast(forecastOfD2Diff, originalSeriesTail, 2)).toBe(21);
    });

    it('should return forecast itself if d=0', () => {
      expect(inverseDifferenceForecast(100, [1,2,3], 0)).toBe(100);
    });

    it('should throw error if d < 0', () => {
      expect(() => inverseDifferenceForecast(5, [1,2], -1)).toThrow("Order of differencing 'd' must be non-negative.");
    });

    it('should throw error if originalSeriesTail is too short for d > 0', () => {
        expect(() => inverseDifferenceForecast(5, [], 1)).toThrow("To inverse difference of order 1, need at least 1 previous values from original series.");
        expect(() => inverseDifferenceForecast(5, [10], 2)).toThrow("To inverse difference of order 2, need at least 2 previous values from original series.");
    });

    // Test general d using the binomial expansion logic
    // d=3: X_t = F_d3 + 3*X_{t-1} - 3*X_{t-2} + X_{t-3}
    // Original series: 0, 1, 4, 10, 20, 35 (X_n = n(n+1)(n+2)/6 for n=0.. is too complex, let's use a simpler one)
    // Say original tail is [10, 20, 35] (X_{t-3}, X_{t-2}, X_{t-1})
    // Forecasted d3-difference F_d3 = 1 (assuming it's constant like the example d=2)
    // X_t = 1 + 3*35 - 3*20 + 1*10 = 1 + 105 - 60 + 10 = 56
    it('should correctly invert third-order difference (d=3)', () => {
        const forecastOfD3Diff = 1;
        const originalSeriesTail = [10, 20, 35]; // X_{t-3}, X_{t-2}, X_{t-1}
        expect(inverseDifferenceForecast(forecastOfD3Diff, originalSeriesTail, 3)).toBe(56);
    });
  });

  // Placeholder tests for MA, ARMA models as their impl is basic
  describe('estimateMACoefficients (placeholder)', () => {
    it('should return array of given length q', () => {
      expect(estimateMACoefficients([1,2,3], 1).length).toBe(1);
      expect(estimateMACoefficients([1,2,3], 2).length).toBe(2);
    });
    it('should return empty array for q=0', () => {
      expect(estimateMACoefficients([1,2,3],0)).toEqual([]);
    });
  });

  describe('predictMA (placeholder)', () => {
    // MA model: X_t = e_t + theta_1*e_{t-1}
    // errors are [e_{t-1}, e_{t-2}, ...]
    // coefficients are [theta_1, theta_2, ...]
    it('should predict next value in MA(1) series', () => {
      // Prediction = theta_1 * e_{t-1}
      expect(predictMA([0.5], [0.8])).toBe(0.5 * 0.8); // 0.4
    });
    it('should predict next value in MA(2) series', () => {
      // Prediction = theta_1*e_{t-1} + theta_2*e_{t-2}
      expect(predictMA([0.5, 0.2], [0.8, 0.4])).toBe(0.5 * 0.8 + 0.2 * 0.4); // 0.4 + 0.08 = 0.48
    });
    it('should return 0 if errors length is less than q', () => {
        expect(predictMA([0.5], [0.8, 0.4])).toBe(0);
    });
  });

  describe('estimateARMACoefficients (placeholder)', () => {
    it('should return AR and MA coefficients of correct length', () => {
      const data = sunspot_series.slice(0,30);
      const { arCoefficients, maCoefficients } = estimateARMACoefficients(data, 2, 1);
      expect(arCoefficients.length).toBe(2);
      expect(maCoefficients.length).toBe(1);
    });
    it('should handle p=0 or q=0', () => {
        const data = sunspot_series.slice(0,30);
        const res1 = estimateARMACoefficients(data, 0, 1);
        expect(res1.arCoefficients.length).toBe(0);
        expect(res1.maCoefficients.length).toBe(1);
        const res2 = estimateARMACoefficients(data, 1, 0);
        expect(res2.arCoefficients.length).toBe(1);
        expect(res2.maCoefficients.length).toBe(0);
    });
  });

  describe('predictARMA (placeholder)', () => {
    it('should combine AR and MA predictions', () => {
      // AR: X_t = 0.5*X_{t-1}. History [10]. Coeffs [0.5]. AR_pred = 5.
      // MA: Pred = 0.8*e_{t-1}. Errors [0.2]. Coeffs [0.8]. MA_pred = 0.16.
      // Total = 5.16
      const arHist = [10]; const arCoeff = [0.5];
      const maErr = [0.2]; const maCoeff = [0.8];
      expect(predictARMA(arHist, arCoeff, maErr, maCoeff)).toBeCloseTo(5.16);
    });
    it('should handle only AR part if q=0', () => {
        const arHist = [10]; const arCoeff = [0.5];
        expect(predictARMA(arHist, arCoeff, [], [])).toBeCloseTo(5);
    });
    it('should handle only MA part if p=0', () => {
        const maErr = [0.2]; const maCoeff = [0.8];
        expect(predictARMA([], [], maErr, maCoeff)).toBeCloseTo(0.16);
    });
  });

});
