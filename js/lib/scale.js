/* Minimal scales and tick generation. */

export function linear(domain, range) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = (d1 - d0) || 1;
  const s = (v) => r0 + ((v - d0) * (r1 - r0)) / span;
  s.invert = (p) => d0 + ((p - r0) * span) / ((r1 - r0) || 1);
  s.domain = domain;
  s.range = range;
  s.ticks = (n = 6) => ticks(d0, d1, n);
  s.kind = "linear";
  return s;
}

export function log(domain, range) {
  const [d0, d1] = domain.map((v) => Math.log10(Math.max(v, 1e-9)));
  const [r0, r1] = range;
  const span = (d1 - d0) || 1;
  const s = (v) =>
    r0 + ((Math.log10(Math.max(v, 1e-9)) - d0) * (r1 - r0)) / span;
  s.invert = (p) => 10 ** (d0 + ((p - r0) * span) / ((r1 - r0) || 1));
  s.domain = domain;
  s.range = range;
  s.ticks = () => logTicks(10 ** d0, 10 ** d1);
  s.kind = "log";
  return s;
}

/** Nice round ticks covering [a, b]. */
export function ticks(a, b, n = 6) {
  if (!isFinite(a) || !isFinite(b) || a === b) return [a];
  const raw = (b - a) / Math.max(1, n);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm >= 7 ? 10 : norm >= 3 ? 5 : norm >= 1.5 ? 2 : 1)
    * mag;
  const out = [];
  for (let v = Math.ceil(a / step) * step; v <= b + step * 1e-9;
    v += step) {
    out.push(Math.abs(v) < step * 1e-9 ? 0 : Number(v.toFixed(10)));
  }
  return out;
}

export function logTicks(a, b) {
  const out = [];
  const lo = Math.floor(Math.log10(a));
  const hi = Math.ceil(Math.log10(b));
  for (let e = lo; e <= hi; e += 1) {
    for (const m of [1, 2, 5]) {
      const v = m * 10 ** e;
      if (v >= a * 0.999 && v <= b * 1.001) out.push(v);
    }
  }
  return out.length > 1 ? out : [a, b];
}

/** Data extent with optional accessor, ignoring non-finite values. */
export function extent(values, acc = (d) => d) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    const x = acc(v);
    if (x === null || x === undefined || Number.isNaN(x)) continue;
    if (x < lo) lo = x;
    if (x > hi) hi = x;
  }
  return lo === Infinity ? [0, 1] : [lo, hi];
}

/** Pad an extent by a fraction of its span. */
export function pad([lo, hi], frac = 0.05) {
  const span = (hi - lo) || Math.abs(hi) || 1;
  return [lo - span * frac, hi + span * frac];
}

/** Pad a log extent multiplicatively. */
export function padLog([lo, hi], frac = 0.12) {
  const f = 10 ** (Math.log10(hi / lo) * frac);
  return [lo / f, hi * f];
}
