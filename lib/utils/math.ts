// Basic math utilities, including those for AR, MA, ARMA, ARIMA models

/**
 * Calculates the mean of an array of numbers.
 */
export function mean(data: number[]): number {
  if (data.length === 0) return 0;
  return data.reduce((sum, val) => sum + val, 0) / data.length;
}

/**
 * Calculates the variance of an array of numbers.
 * @param data The array of numbers.
 * @param population If true, calculates population variance. Otherwise, sample variance.
 */
export function variance(data: number[], population: boolean = false): number {
  if (data.length < (population ? 1 : 2)) return 0;
  const m = mean(data);
  const sqDiffs = data.map(val => (val - m) ** 2);
  return mean(sqDiffs) * (population ? 1 : data.length / (data.length - 1));
}

/**
 * Calculates the autocovariance of a time series at a given lag.
 * @param data The time series data.
 * @param lag The lag.
 */
export function autocovariance(data: number[], lag: number): number {
  if (lag < 0 || lag >= data.length) {
    // console.warn(`Lag ${lag} is out of bounds for data of length ${data.length}. Returning 0.`);
    return 0;
  }
  const m = mean(data);
  let cov = 0;
  for (let i = 0; i < data.length - lag; i++) {
    cov += (data[i] - m) * (data[i + lag] - m);
  }
  return cov / data.length; // Using data.length for population autocovariance
}


/**
 * Estimates AR coefficients using the Yule-Walker equations.
 * This is a simplified implementation. For robust applications, consider libraries.
 * @param data The time series data (array of numbers).
 * @param p The order of the AR model.
 * @returns An array of AR coefficients [phi_1, phi_2, ..., phi_p].
 */
export function estimateARCoefficients(data: number[], p: number): number[] {
  if (p === 0) return [];
  if (data.length <= p) {
    // console.warn(`Not enough data to estimate AR(${p}) coefficients. Need > ${p} data points. Got ${data.length}. Returning zeros.`);
    return new Array(p).fill(0);
  }

  // Construct the Yule-Walker equations
  // R * phi = r
  // R is a p x p matrix where R[i][j] = autocovariance(data, |i-j|)
  // r is a p x 1 vector where r[i] = autocovariance(data, i+1)
  // phi is the vector of coefficients we want to find

  const R: number[][] = [];
  for (let i = 0; i < p; i++) {
    R[i] = [];
    for (let j = 0; j < p; j++) {
      R[i][j] = autocovariance(data, Math.abs(i - j));
    }
  }

  const r: number[] = [];
  for (let i = 0; i < p; i++) {
    r[i] = autocovariance(data, i + 1);
  }

  // Solve R * phi = r for phi. This requires a linear system solver.
  // For simplicity, if R is singular or near-singular, this will fail or be inaccurate.
  // A proper implementation would use a robust solver (e.g., LU decomposition, QR decomposition).

  // Using a very basic check for a singular matrix (determinant is zero for 2x2)
  // This is not a robust way to check for singularity for larger matrices.
  if (p === 1) {
    if (R[0][0] === 0) return [0];
    return [r[0] / R[0][0]];
  }
  if (p === 2) {
    const det = R[0][0] * R[1][1] - R[0][1] * R[1][0];
    if (det === 0) return [0, 0];
    const phi1 = (r[0] * R[1][1] - r[1] * R[0][1]) / det;
    const phi2 = (r[1] * R[0][0] - r[0] * R[1][0]) / det;
    return [phi1, phi2];
  }

  // For p > 2, this basic solver is insufficient.
  // console.warn(`AR coefficient estimation for p > 2 is not robustly implemented. Returning zeros for p=${p}.`);
  // Fallback for p > 2 or if a robust solver is not available:
  // A simple approach for higher orders if a full solver isn't implemented:
  // Could use ordinary least squares (OLS) if inputs are structured appropriately,
  // but Yule-Walker is standard.
  // As a placeholder, returning zeros.
  // In a real scenario, you'd integrate a math library for matrix operations.
  if (p > 0) {
    // Attempting a more general, but still simplified, approach using OLS idea
    // This is not true Yule-Walker for p > 2 without a proper matrix solver.
    // Let's try to implement a simple version of Gaussian elimination for small p.
    // This is still not a production-ready solver.
    try {
        const augmentedMatrix: number[][] = R.map((row, i) => [...row, r[i]]);

        for (let i = 0; i < p; i++) {
            // Find pivot
            let maxRow = i;
            for (let k = i + 1; k < p; k++) {
                if (Math.abs(augmentedMatrix[k][i]) > Math.abs(augmentedMatrix[maxRow][i])) {
                    maxRow = k;
                }
            }
            [augmentedMatrix[i], augmentedMatrix[maxRow]] = [augmentedMatrix[maxRow], augmentedMatrix[i]];

            // Make pivot 1
            const pivot = augmentedMatrix[i][i];
            if (pivot === 0) { // Singular or near-singular
                 // console.warn(`Matrix is singular at step ${i}, cannot solve Yule-Walker for AR(${p}). Returning zeros.`);
                return new Array(p).fill(0);
            }
            for (let j = i; j < p + 1; j++) {
                augmentedMatrix[i][j] /= pivot;
            }

            // Eliminate other rows
            for (let k = 0; k < p; k++) {
                if (k !== i) {
                    const factor = augmentedMatrix[k][i];
                    for (let j = i; j < p + 1; j++) {
                        augmentedMatrix[k][j] -= factor * augmentedMatrix[i][j];
                    }
                }
            }
        }
        const coefficients = augmentedMatrix.map(row => row[p]);
        return coefficients;
    } catch (error) {
        // console.error("Error solving Yule-Walker equations:", error);
        return new Array(p).fill(0); // Fallback
    }
  }


  return new Array(p).fill(0); // Default fallback
}

/**
 * Predicts the next value in an AR series.
 * @param history The past p values of the series, where history[0] is oldest, history[p-1] is most recent.
 * @param coefficients The AR coefficients [phi_1, ..., phi_p].
 * @returns The predicted next value.
 */
export function predictAR(history: number[], coefficients: number[]): number {
  const p = coefficients.length;
  if (history.length !== p) {
    // console.warn(`History length (${history.length}) must match coefficients length (${p}). Returning 0.`);
    return 0; // Or handle error appropriately
  }
  let prediction = 0;
  for (let i = 0; i < p; i++) {
    // AR model: X_t = c + phi_1*X_{t-1} + ... + phi_p*X_{t-p} + e_t
    // We predict E[X_t | X_{t-1}, ..., X_{t-p}] = c + sum(phi_i * X_{t-i})
    // Assuming mean is zero (or data is mean-centered) for simplicity, so c=0.
    // Coefficients are typically [phi_1, phi_2, ..., phi_p]
    // History should be [X_{t-p}, X_{t-p+1}, ..., X_{t-1}] for standard indexing
    // Or, if history is [X_{t-1}, X_{t-2}, ..., X_{t-p}] (most recent first)
    // then prediction = sum(coefficients[i] * history[i])
    // Let's assume history is [X_{t-1}, X_{t-2}, ..., X_{t-p}] (most recent first)
    // And coefficients are [phi_1, phi_2, ..., phi_p]
    // Then prediction = phi_1*X_{t-1} + phi_2*X_{t-2} + ...
    // The loop should be: coefficients[i] * history[i] if history is ordered X_{t-1}, X_{t-2} etc.
    // If history is X_{t-p}, ..., X_{t-1} (chronological), then prediction = sum(coefficients[i] * history[p-1-i])

    // Let's assume history is chronological: [X_t-p, X_t-p+1, ..., X_t-1]
    // And coefficients are [phi_1, phi_2, ..., phi_p]
    // Prediction = phi_1 * X_{t-1} + phi_2 * X_{t-2} + ... + phi_p * X_{t-p}
    // So, coefficients[0] (phi_1) multiplies history[p-1] (X_{t-1})
    // coefficients[1] (phi_2) multiplies history[p-2] (X_{t-2})
    // ...
    // coefficients[p-1] (phi_p) multiplies history[0] (X_{t-p})
    prediction += coefficients[i] * history[p - 1 - i];
  }
  return prediction;
}

/**
 * Differences a time series.
 * @param data The time series data (array of numbers).
 * @param d The order of differencing.
 * @returns The differenced time series.
 */
export function difference(data: number[], d: number = 1): number[] {
  if (d === 0) return [...data];
  if (d < 0) throw new Error("Order of differencing 'd' must be non-negative.");
  if (data.length <= d) return [];

  let currentData = [...data];
  for (let i = 0; i < d; i++) {
    const differencedOnce: number[] = [];
    for (let j = 1; j < currentData.length; j++) {
      differencedOnce.push(currentData[j] - currentData[j - 1]);
    }
    currentData = differencedOnce;
    if (currentData.length === 0 && i < d -1) { // Not enough data for further differencing
        return [];
    }
  }
  return currentData;
}

/**
 * Inverts differencing for a single forecast value.
 * @param lastOriginalValue The last value of the original (pre-differencing) series.
 * @param lastDifferencedValue The last value of the d-th differenced series (if d > 1, this is complex).
                                 This is actually not directly used here.
 * @param forecastOfDifferencedSeries The forecast made on the differenced series.
 * @param originalSeries The original non-differenced series (or relevant part of it).
 * @param d The order of differencing that was applied.
 * @returns The forecast value, scaled back to the original series' magnitude.
 */
export function inverseDifferenceForecast(
    forecastOfDifferencedSeries: number,
    originalSeriesTail: number[], // e.g., the last d values of the original series before the point of forecast
    d: number
): number {
    if (d === 0) return forecastOfDifferencedSeries;
    if (d < 0) throw new Error("Order of differencing 'd' must be non-negative.");
    if (originalSeriesTail.length < d) {
        throw new Error(`To inverse difference of order ${d}, need at least ${d} previous values from original series.`);
    }

    // Example: Y_t = X_t - X_{t-1} (d=1)
    // We forecasted Y_f. We want X_f.
    // Y_f = X_f - X_{t-1} => X_f = Y_f + X_{t-1}
    // originalSeriesTail should contain [..., X_{t-d}, ..., X_{t-1}]
    // For d=1, we need X_{t-1} which is originalSeriesTail[originalSeriesTail.length-1]

    // Example: Z_t = Y_t - Y_{t-1} where Y_t = X_t - X_{t-1} (d=2)
    // Z_t = (X_t - X_{t-1}) - (X_{t-1} - X_{t-2}) = X_t - 2*X_{t-1} + X_{t-2}
    // We forecasted Z_f. We want X_f.
    // Z_f = X_f - 2*X_{t-1} + X_{t-2} => X_f = Z_f + 2*X_{t-1} - X_{t-2}
    // originalSeriesTail needs X_{t-1} and X_{t-2}.

    // General formula for inverting first difference: X_f = forecast_diff + X_last_original
    // For d=1: X_f = forecastOfDifferencedSeries + originalSeriesTail[d-1] (assuming tail is [X_{t-d} ... X_{t-1}])

    // This simplified version only correctly handles d=1 for single step.
    // A full inverse differencing for multi-step or higher 'd' is more complex as it builds up.
    // For ARIMA, we typically forecast multiple steps on the differenced series,
    // then iteratively inverse difference.

    // For d=1: X_t = diff_X_t + X_{t-1}
    // For d=2: X_t = diff_diff_X_t + 2*X_{t-1} - X_{t-2} (Incorrect: this is X_t from Z_t directly)
    // Correct iterative approach:
    // 1. Forecast diff_X_t_plus_1
    // 2. X_t_plus_1 = diff_X_t_plus_1 + X_t (where X_t is the last known original value)
    // If d=2:
    // 1. Series is Z. Forecast Z_f.
    // 2. Inverse first difference to get Y_f: Y_f = Z_f + Y_{last}
    //    where Y_{last} is the last value of the (once) differenced series.
    // 3. Inverse first difference to get X_f: X_f = Y_f + X_{last}
    //    where X_{last} is the last value of the original series.

    // This function is intended for one-step ahead.
    // `originalSeriesTail` should be the last `d` values of the *original* series.
    // `forecastOfDifferencedSeries` is the forecast of the *d-th differenced* series.

    if (d === 1) {
        return forecastOfDifferencedSeries + originalSeriesTail[originalSeriesTail.length - 1];
    }

    // For d > 1, this simple addition is not enough.
    // The process is iterative: Undiff_d = Forecast_d + LastValue_d-1_series
    // Undiff_d-1 = Undiff_d + LastValue_d-2_series
    // ...
    // Undiff_1 = Undiff_2 + LastValue_original_series
    // This function is too simple for d > 1 without more context or the intermediate differenced series.
    // However, for the way ARIMA model iteratively calls forecast and then inverts:
    // we forecast on Z, get Z_f.
    // then X_f = reconstruct_from_difference(Z_f, previous_X_values, d)
    // Let's assume `originalSeriesTail` provides the necessary values for reconstruction.
    // For d=1, X_f = Z_f + X_{t-1}
    // For d=2, X_f = Z_f + 2*X_{t-1} - X_{t-2}  (This is if Z_f is (X_f - X_{f-1}) - (X_{f-1} - X_{f-2}))
    // (X_f - X_{t-1}) - (X_{t-1} - X_{t-2}) = Z_f
    // X_f - d*X_{t-1} ... this depends on the binomial expansion of (1-L)^d
    // (1-L)X_t => X_t - X_{t-1}
    // (1-L)^2 X_t => (1 - 2L + L^2)X_t = X_t - 2X_{t-1} + X_{t-2}
    // So, if Y_t = (1-L)^d X_t, then X_t = Y_t + sum_{k=1 to d} [ (-1)^(k+1) * C(d,k) * X_{t-k} ] where C is binomial coeff.
    // This is not quite right. It should be: X_t = Y_t + d*X_{t-1} - C(d,2)*X_{t-2} + ...
    // X_t = Y_t - sum_{k=1 to d} [ (-1)^k * C(d,k) * X_{t-k} ]
    // X_t = Y_t + d*X_{t-1} - (d*(d-1)/2)*X_{t-2} + ...

    // The most straightforward way to reconstruct is iteratively.
    // If Y_t = X_t - X_{t-1}, then X_t = Y_t + X_{t-1}.
    // If Z_t = Y_t - Y_{t-1}, then Y_t = Z_t + Y_{t-1}.
    // To reconstruct X_t from Z_t, you need historical values of X to reconstruct historical Y.
    // This function is called for each forecast step.
    // `forecastOfDifferencedSeries` is one new value `d^d X_t / dt^d`
    // `originalSeriesTail` is `X_{t-1}, X_{t-2}, ..., X_{t-d}`

    // Let's use the iterative sum method.
    // `val` starts as the forecasted differenced value.
    // For d=1: val += originalSeriesTail[length-1] (which is X_{t-1})
    // For d=2: first, effectively val_d-1 = val_d + originalSeriesTail_d-1[last]
    //           This means, if originalSeriesTail contains values of X:
    //           diff_X_t = forecast_of_d2X_t + diff_X_{t-1}
    //           X_t = diff_X_t + X_{t-1}
    // This requires storing the tails of all intermediate differenced series.
    // The current signature is insufficient for a general d > 1 iterative reconstruction.
    // We must assume `originalSeriesTail` refers to the *original* series' tail.

    // Reverting to a simpler interpretation: reconstruct step-by-step.
    // If we have X_{t-1}, X_{t-2}, ..., X_{t-d}
    // And we have forecasted d^d X_t (the d-th difference)
    // We want X_t.
    // d=1: (X_t - X_{t-1})_forecast . So X_t = (X_t - X_{t-1})_forecast + X_{t-1}.
    //      Requires originalSeriesTail to have X_{t-1}.
    // d=2: ( (X_t - X_{t-1}) - (X_{t-1} - X_{t-2}) )_forecast. Let this be F.
    //      So, X_t - 2X_{t-1} + X_{t-2} = F
    //      X_t = F + 2X_{t-1} - X_{t-2}.
    //      Requires originalSeriesTail to have X_{t-1}, X_{t-2}.

    let reconstructedValue = forecastOfDifferencedSeries;
    if (d === 1) {
        reconstructedValue += originalSeriesTail[originalSeriesTail.length - 1];
    } else if (d === 2) {
        // X_t = F + 2*X_{t-1} - X_{t-2}
        // originalSeriesTail is [..., X_{t-2}, X_{t-1}] (last d values, chronological)
        reconstructedValue += 2 * originalSeriesTail[originalSeriesTail.length - 1] - originalSeriesTail[originalSeriesTail.length - 2];
    }
    // This pattern uses binomial coefficients: sum_{i=1 to d} (-1)^(i-1) * C(d,i) * X_{t-i}
    // For d > 2, this will need the binomial coefficients C(d,i).
    // C(d,1)=d, C(d,2)=d(d-1)/2, C(d,3)=d(d-1)(d-2)/6 etc.
    // X_t = ForecastDiff_d + d*X_{t-1} - (d(d-1)/2)*X_{t-2} + (d(d-1)(d-2)/6)*X_{t-3} - ...
    else if (d > 0) { // General case for d > 0
        for (let k = 1; k <= d; k++) {
            const binomialCoeff = combinations(d, k);
            const term = binomialCoeff * originalSeriesTail[originalSeriesTail.length - k];
            if (k % 2 === 1) { // Odd k (1, 3, 5...)
                reconstructedValue += term;
            } else { // Even k (2, 4, 6...)
                reconstructedValue -= term;
            }
        }
    }
    return reconstructedValue;
}

/**
 * Calculates combinations (nCr).
 */
export function combinations(n: number, k: number): number {
    if (k < 0 || k > n) {
        return 0;
    }
    if (k === 0 || k === n) {
        return 1;
    }
    if (k > n / 2) {
        k = n - k; // Optimization
    }
    let res = 1;
    for (let i = 1; i <= k; i++) {
        res = res * (n - i + 1) / i;
    }
    return res;
}


// Placeholder for MA coefficient estimation (e.g., Innovations algorithm, Hannan-Rissanen)
export function estimateMACoefficients(data: number[], q: number, errors?: number[]): number[] {
  if (q === 0) return [];
  // Actual MA estimation is non-linear and more complex than AR.
  // Often requires iterative methods.
  // This is a simplified placeholder.
  // console.warn(`MA coefficient estimation for q=${q} is not robustly implemented. Returning zeros.`);
  return new Array(q).fill(0.1); // Placeholder small non-zero values
}

// Placeholder for MA prediction
export function predictMA(errors: number[], coefficients: number[]): number {
  const q = coefficients.length;
  if (errors.length < q) {
    // console.warn(`Not enough past errors to predict MA(${q}). Need ${q}, got ${errors.length}. Returning 0.`);
    return 0;
  }
  let prediction = 0;
  // MA model: X_t = mu + e_t + theta_1*e_{t-1} + ... + theta_q*e_{t-q}
  // We predict E[X_t | e_{t-1}, ..., e_{t-q}] = mu + sum(theta_i * e_{t-i})
  // Assuming mu is handled (e.g. data is mean-centered) or part of error term e_t
  // Errors are typically [e_{t-1}, e_{t-2}, ..., e_{t-q}] (most recent first)
  // Coefficients are [theta_1, ..., theta_q]
  for (let i = 0; i < q; i++) {
    prediction += coefficients[i] * errors[i]; // errors[i] is e_{t-(i+1)}
  }
  return prediction;
}

// Placeholder for ARMA prediction
// ARMA(p,q): X_t = (phi_1*X_{t-1} + ... + phi_p*X_{t-p}) + (e_t + theta_1*e_{t-1} + ... + theta_q*e_{t-q})
// Prediction = AR part + MA part (based on past errors)
export function predictARMA(
    arHistory: number[], arCoefficients: number[],
    maErrors: number[], maCoefficients: number[]
): number {
    const arPrediction = arCoefficients.length > 0 ? predictAR(arHistory, arCoefficients) : 0;
    const maPrediction = maCoefficients.length > 0 ? predictMA(maErrors, maCoefficients) : 0;
    return arPrediction + maPrediction;
}

/**
 * Estimates ARMA coefficients. This is a very complex task, typically iterative.
 * This function is a placeholder and would need a dedicated library for robust implementation.
 * @param data Time series data
 * @param p AR order
 * @param q MA order
 * @returns Object with arCoefficients and maCoefficients
 */
export function estimateARMACoefficients(data: number[], p: number, q: number): { arCoefficients: number[], maCoefficients: number[] } {
    // console.warn(`ARMA(${p},${q}) coefficient estimation is highly complex and not robustly implemented. Using individual AR/MA estimates as placeholders.`);
    // Simplified: estimate AR, then estimate MA on residuals. This is not true ARMA estimation.
    const arCoefficients = p > 0 ? estimateARCoefficients(data, p) : [];

    let residuals = [...data];
    if (p > 0 && arCoefficients.length === p) {
        residuals = data.map((val, idx) => {
            if (idx < p) return 0; // Cannot calculate residual for first p points this way
            const history = data.slice(idx - p, idx);
            const arPrediction = predictAR(history.reverse(), arCoefficients); // predictAR expects history like [X_t-1, ..., X_t-p]
            return val - arPrediction;
        }).slice(p); // Remove initial points where residual calc is not possible
    }

    const maCoefficients = q > 0 ? estimateMACoefficients(residuals, q) : [];

    return { arCoefficients, maCoefficients };
}
