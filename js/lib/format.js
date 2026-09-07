/* Number formatting in the manuscript's house style: no leading zero
   on decimals, no plus signs, p values reported to three decimals
   with a floor, significance marks in the usual convention. */

export function stripZero(s) {
  return String(s).replace(/(^|[\s(=\[\-])0\./g, "$1.");
}

/** Fixed decimals, leading zero removed. */
export function num(v, d = 2) {
  if (v === null || v === undefined || Number.isNaN(v)) return "n/a";
  return stripZero(Number(v).toFixed(d));
}

/** Thousands separators for counts. */
export function count(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return "n/a";
  return Math.round(v).toLocaleString("en-US");
}

/** Hours, with days in parentheses once the value gets long. */
export function hours(v, withDays = true) {
  if (v === null || v === undefined || Number.isNaN(v)) return "n/a";
  const h = Number(v);
  const s = h >= 100 ? h.toFixed(0) : h.toFixed(1);
  if (withDays && h >= 48) {
    return `${stripZero(s)} h (${(h / 24).toFixed(1)} days)`;
  }
  return `${stripZero(s)} h`;
}

export function pct(v, d = 1) {
  if (v === null || v === undefined || Number.isNaN(v)) return "n/a";
  return `${stripZero((v * 100).toFixed(d))}%`;
}

/** A log residual as a plain-language speed ratio. */
export function ratio(logResid, d = 1) {
  if (logResid === null || logResid === undefined
    || Number.isNaN(logResid)) return "n/a";
  const r = Math.exp(logResid);
  const speed = r >= 1 ? r : 1 / r;
  if (speed < 1.05) return "as predicted";
  return `${stripZero(speed.toFixed(d))}x ${r >= 1 ? "slower" : "faster"}`;
}

export function pval(p) {
  if (p === null || p === undefined || Number.isNaN(p)) return "";
  if (p < 0.001) return "p < .001";
  return `p = ${stripZero(p.toFixed(3))}`;
}

export function stars(p) {
  if (p === null || p === undefined || Number.isNaN(p)) return "";
  if (p < 0.001) return "***";
  if (p < 0.01) return "**";
  if (p < 0.05) return "*";
  if (p < 0.1) return "†";
  return "";
}

/** Compact axis tick labels. */
export function tick(v) {
  const a = Math.abs(v);
  if (a >= 1e6) return stripZero((v / 1e6).toFixed(1)) + "M";
  if (a >= 1e4) return Math.round(v / 1e3) + "k";
  if (a >= 1000) return count(v);
  if (a >= 10) return String(Math.round(v * 10) / 10);
  if (a === 0) return "0";
  return stripZero(String(Math.round(v * 1000) / 1000));
}

export function dateLabel(iso) {
  const d = new Date(iso.replace(" ", "T") + "Z");
  const month = d.toLocaleString("en-US", {
    month: "short", timeZone: "UTC",
  });
  return `${month} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
