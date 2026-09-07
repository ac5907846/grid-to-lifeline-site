/* The small amount of statistics the page recomputes live: ordinary
   least squares for the county explorer and the movable breakpoint,
   plus the summaries behind the parity and detectability panels.
   Everything here reproduces a quantity that also exists in the
   analysis outputs, so the two can be checked against each other. */

export const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);

export function sd(a) {
  if (a.length < 2) return NaN;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0)
    / (a.length - 1));
}

export function median(a) {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
}

export function corr(xs, ys) {
  const n = xs.length;
  if (n < 3) return NaN;
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  return sxy / Math.sqrt(sxx * syy);
}

/** OLS by Gaussian elimination on the normal equations.
    X is an array of rows (including the intercept column). */
export function ols(X, y) {
  const k = X[0].length;
  const n = X.length;
  const A = Array.from({ length: k }, () => new Float64Array(k + 1));
  for (let i = 0; i < n; i += 1) {
    for (let a = 0; a < k; a += 1) {
      for (let b = 0; b < k; b += 1) A[a][b] += X[i][a] * X[i][b];
      A[a][k] += X[i][a] * y[i];
    }
  }
  for (let c = 0; c < k; c += 1) {
    let piv = c;
    for (let r = c + 1; r < k; r += 1) {
      if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    }
    if (Math.abs(A[piv][c]) < 1e-12) return null;
    [A[c], A[piv]] = [A[piv], A[c]];
    const d = A[c][c];
    for (let b = c; b <= k; b += 1) A[c][b] /= d;
    for (let r = 0; r < k; r += 1) {
      if (r === c) continue;
      const f = A[r][c];
      if (!f) continue;
      for (let b = c; b <= k; b += 1) A[r][b] -= f * A[c][b];
    }
  }
  const beta = Array.from({ length: k }, (_, i) => A[i][k]);
  const my = mean(y);
  let sse = 0;
  let sst = 0;
  for (let i = 0; i < n; i += 1) {
    let fit = 0;
    for (let a = 0; a < k; a += 1) fit += X[i][a] * beta[a];
    sse += (y[i] - fit) ** 2;
    sst += (y[i] - my) ** 2;
  }
  return { beta, sse, sst, r2: 1 - sse / (sst || 1), n };
}

/** Two-segment fit y = b0 + b1 x + b2 max(0, x - knot). */
export function segmented(xs, ys, knot) {
  const X = xs.map((x) => [1, x, Math.max(0, x - knot)]);
  const fit = ols(X, ys);
  if (!fit) return null;
  return {
    ...fit,
    knot,
    slopeBefore: fit.beta[1],
    slopeAfter: fit.beta[1] + fit.beta[2],
    slopeChange: fit.beta[2],
    predict: (x) => fit.beta[0] + fit.beta[1] * x
      + fit.beta[2] * Math.max(0, x - knot),
  };
}

/** Geometric summary of a set of ratios, with a 95% interval
    on the log scale (the scale the ratios are symmetric on). */
export function ratioSummary(ratios) {
  const logs = ratios.filter((v) => v > 0).map(Math.log);
  const n = logs.length;
  if (n < 2) return null;
  const m = mean(logs);
  const se = sd(logs) / Math.sqrt(n);
  return {
    n,
    median: Math.exp(median(logs)),
    geoMean: Math.exp(m),
    lo: Math.exp(m - 1.96 * se),
    hi: Math.exp(m + 1.96 * se),
    improved: ratios.filter((v) => v > 1).length,
    excludesParity: Math.exp(m - 1.96 * se) > 1
      || Math.exp(m + 1.96 * se) < 1,
  };
}
