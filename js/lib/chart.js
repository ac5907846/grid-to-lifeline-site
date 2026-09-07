/* Figure frame and axes. Charts draw into a fixed user-unit canvas
   and the SVG scales to its container, so everything stays crisp and
   the layout math stays readable. */

import { svg, clear } from "./dom.js";
import { GRID, MUTED, RULE } from "./palette.js";
import { tick as fmtTick } from "./format.js";

const DEF_M = { top: 16, right: 18, bottom: 42, left: 58 };

export function figure(host, opts = {}) {
  const width = opts.width ?? 900;
  const height = opts.height ?? 520;
  const m = { ...DEF_M, ...(opts.margin || {}) };
  const root = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": opts.label || "chart",
    preserveAspectRatio: "xMidYMid meet",
  });
  const plot = svg("g", { transform: `translate(${m.left},${m.top})` });
  root.appendChild(plot);
  clear(host).appendChild(root);
  return {
    root,
    plot,
    width,
    height,
    m,
    w: width - m.left - m.right,
    h: height - m.top - m.bottom,
    add: (node) => { plot.appendChild(node); return node; },
    addRoot: (node) => { root.appendChild(node); return node; },
  };
}

export function axisX(f, x, opts = {}) {
  const y = opts.y ?? f.h;
  const values = opts.values ?? x.ticks(opts.n ?? 6);
  const fmt = opts.format ?? fmtTick;
  const g = svg("g", { class: "axis-x" });
  if (opts.line !== false) {
    g.appendChild(svg("line", {
      x1: 0, x2: f.w, y1: y, y2: y, stroke: RULE, "stroke-width": 1,
    }));
  }
  for (const v of values) {
    const px = x(v);
    if (px < -1 || px > f.w + 1) continue;
    if (opts.grid) {
      g.appendChild(svg("line", {
        x1: px, x2: px, y1: 0, y2: y, stroke: GRID, "stroke-width": 1,
      }));
    }
    g.appendChild(svg("line", {
      x1: px, x2: px, y1: y, y2: y + 4, stroke: RULE,
    }));
    g.appendChild(svg("text", {
      x: px, y: y + 16, "text-anchor": "middle", "font-size": 11,
      fill: MUTED, text: fmt(v),
    }));
  }
  if (opts.label) {
    g.appendChild(svg("text", {
      x: f.w / 2, y: y + 34, "text-anchor": "middle", "font-size": 11.5,
      fill: MUTED, text: opts.label,
    }));
  }
  f.plot.appendChild(g);
  return g;
}

export function axisY(f, y, opts = {}) {
  const x0 = opts.x ?? 0;
  const values = opts.values ?? y.ticks(opts.n ?? 5);
  const fmt = opts.format ?? fmtTick;
  const g = svg("g", { class: "axis-y" });
  for (const v of values) {
    const py = y(v);
    if (py < -1 || py > f.h + 1) continue;
    if (opts.grid !== false) {
      g.appendChild(svg("line", {
        x1: x0, x2: f.w, y1: py, y2: py, stroke: GRID,
        "stroke-width": 1,
      }));
    }
    g.appendChild(svg("text", {
      x: x0 - 8, y: py + 3.5, "text-anchor": "end", "font-size": 11,
      fill: MUTED, text: fmt(v),
    }));
  }
  if (opts.label) {
    g.appendChild(svg("text", {
      transform: `translate(${x0 - (opts.labelPad ?? 44)},${f.h / 2}) `
        + "rotate(-90)",
      "text-anchor": "middle", "font-size": 11.5, fill: MUTED,
      text: opts.label,
    }));
  }
  f.plot.appendChild(g);
  return g;
}

/** Path data for a polyline, skipping null values. */
export function linePath(points, xAcc, yAcc) {
  let d = "";
  let pen = false;
  for (const p of points) {
    const px = xAcc(p);
    const py = yAcc(p);
    if (px === null || py === null || Number.isNaN(px)
      || Number.isNaN(py)) { pen = false; continue; }
    d += `${pen ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`;
    pen = true;
  }
  return d;
}

/** Horizontal or vertical reference line with an optional label. */
export function refLine(f, opts) {
  const g = svg("g");
  const { x1, x2, y1, y2 } = opts;
  g.appendChild(svg("line", {
    x1, x2, y1, y2,
    stroke: opts.stroke ?? MUTED,
    "stroke-width": opts.width ?? 1,
    "stroke-dasharray": opts.dash || null,
  }));
  if (opts.label) {
    g.appendChild(svg("text", {
      x: opts.labelX ?? x2, y: opts.labelY ?? y2,
      "text-anchor": opts.anchor ?? "start",
      "font-size": opts.size ?? 10.5, fill: opts.stroke ?? MUTED,
      text: opts.label,
    }));
  }
  f.plot.appendChild(g);
  return g;
}

/** White halo behind text drawn over dense marks. */
export function haloText(attrs) {
  const g = svg("g");
  g.appendChild(svg("text", {
    ...attrs, stroke: "#fff", "stroke-width": 3,
    "stroke-linejoin": "round", "paint-order": "stroke",
  }));
  return g;
}
