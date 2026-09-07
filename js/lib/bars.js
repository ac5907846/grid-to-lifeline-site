/* Small reusable drawing helpers used by several charts: a histogram
   binner, a stacked horizontal bar, and a legend row. */

import { el, svg } from "./dom.js";

/** Bin numeric values into [lo, hi) bins of width w; returns
    [{x0, x1, n, items}]. */
export function bins(values, lo, hi, w, acc = (d) => d) {
  const out = [];
  for (let x = lo; x < hi; x += w) out.push({ x0: x, x1: x + w, n: 0, items: [] });
  for (const v of values) {
    const x = acc(v);
    if (x === null || x === undefined || Number.isNaN(x)) continue;
    const i = Math.min(out.length - 1, Math.max(0, Math.floor((x - lo) / w)));
    out[i].n += 1;
    out[i].items.push(v);
  }
  return out;
}

/** Legend row from [{label, color, kind}] (kind: "dot" | "swatch"). */
export function legend(items) {
  const row = el("div.legend");
  for (const it of items) {
    row.appendChild(el("span.item", {}, [
      el("span." + (it.kind || "dot"), { style: { background: it.color } }),
      it.label,
    ]));
  }
  return row;
}

/** Horizontal stacked bar segments into group g. parts: [{value, color,
    key}], total scales to width w. Returns the segment nodes. */
export function stackedBar(g, parts, x0, y, w, h, total, onHover) {
  let x = x0;
  const nodes = [];
  for (const p of parts) {
    const width = total > 0 ? (p.value / total) * w : 0;
    const rect = svg("rect", {
      x, y, width: Math.max(0, width), height: h, fill: p.color,
      stroke: "#fff", "stroke-width": 0.6,
    });
    if (onHover) {
      rect.addEventListener("mousemove", (ev) => onHover(ev, p));
      rect.addEventListener("mouseleave", () => onHover(null, p));
    }
    g.appendChild(rect);
    nodes.push(rect);
    x += width;
  }
  return nodes;
}

/** Simple data table into a host: columns [{key, label, fmt, num}]. */
export function table(host, columns, rows, opts = {}) {
  const t = el("table.dtable" + (opts.text ? ".text" : ""));
  const thead = el("thead", {}, [el("tr", {}, columns.map((c) =>
    el("th", { text: c.label })))]);
  const tbody = el("tbody");
  for (const r of rows) {
    const tr = el("tr", {}, columns.map((c) => {
      const v = c.fmt ? c.fmt(r[c.key], r) : r[c.key];
      const td = el("td" + (c.num === false ? "" : ".num"));
      if (v instanceof Node) td.appendChild(v);
      else td.textContent = v === null || v === undefined ? "" : String(v);
      return td;
    }));
    if (opts.onRow) tr.addEventListener("click", () => opts.onRow(r, tr));
    tbody.appendChild(tr);
  }
  t.append(thead, tbody);
  host.appendChild(el("div.tablewrap", {}, [t]));
  return t;
}
