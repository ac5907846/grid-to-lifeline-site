/* The resilience signature: four constructs by two lifelines, every
   cell a live miniature of the evidence behind the number, with the
   nine storms as a filter strip on top. */

import { el, svg, clear } from "../lib/dom.js";
import { figure, axisX, axisY } from "../lib/chart.js";
import { linear, log as logScale, extent, pad, padLog } from "../lib/scale.js";
import { bins } from "../lib/bars.js";
import * as fmt from "../lib/format.js";
import { INK, MUTED, NAVY, PINK, GREEN, RULE, END, END_ORDER, LIGHT, GRID } from "../lib/palette.js";
import * as tip from "../lib/tooltip.js";

const MW = 400;
const MH = 210;

export function signatureChart(host, app) {
  const meta = app.meta;
  const order = meta.order;
  const state = { storms: new Set(order) };

  const strip = el("div.stormstrip");
  const grid = el("div.siggrid");
  const capHost = el("p.caption");
  clear(host).append(strip, grid, capHost);

  // storm strip: one card per storm, click to toggle
  function renderStrip() {
    clear(strip);
    for (const k of order) {
      const s = meta.storms[k];
      const on = state.storms.has(k);
      const card = el("button.stormcard", {
        type: "button", "aria-pressed": String(on),
        style: { "--sw": s.color },
        onclick: () => {
          if (on && state.storms.size > 1) state.storms.delete(k);
          else state.storms.add(k);
          renderStrip();
          drawAll();
        },
      }, [
        el("span.sc-name", { text: `${s.label} ${s.year}` }),
        el("span.sc-num", { text: `${fmt.count(s.n_sewer)} releases` }),
        el("span.sc-sub", { text: `${s.cust_hours_m} M customer-hours` }),
        el("span.sc-sub", { text: s.cell_peak_share === null
          ? "no DIRS table" : `${fmt.pct(s.cell_peak_share, 0)} cell sites out at peak` }),
      ]);
      strip.appendChild(card);
    }
    const all = el("button.btn-quiet", { type: "button", text: "All storms", onclick: () => {
      for (const k of order) state.storms.add(k);
      renderStrip(); drawAll();
    } });
    strip.appendChild(all);
  }

  const rows = meta.signature;
  const byConstruct = new Map();
  for (const r of rows) {
    if (!byConstruct.has(r.construct)) byConstruct.set(r.construct, []);
    byConstruct.get(r.construct).push(r);
  }
  const CONSTRUCTS = [
    { key: "Propagation", q: "How much of the grid failure reaches the lifeline?", page: "dose.html" },
    { key: "Buffering", q: "How long does the lifeline withstand the outage?", page: "recovery.html" },
    { key: "Recovery autonomy", q: "Does the lifeline recover before the grid, and by what means?", page: "recovery.html" },
    { key: "Adaptation", q: "Has the dependency weakened across successive storms?", page: "adaptation.html" },
  ];
  const cells = new Map();

  function buildGrid() {
    clear(grid);
    grid.appendChild(el("div.sig-head", {}, [
      el("div", { text: "" }),
      el("div.sig-col", { text: "Wastewater: sewer releases (FDEP notices)" }),
      el("div.sig-col", { text: "Cellular: cell sites out (FCC DIRS)" }),
    ]));
    for (const c of CONSTRUCTS) {
      const metrics = byConstruct.get(c.key) || [];
      const rowEl = el("div.sig-row");
      const label = el("div.sig-label", {}, [
        el("a", { href: c.page, text: c.key }),
        el("p", { text: c.q }),
      ]);
      const ww = el("div.sig-cell");
      const cell = el("div.sig-cell");
      for (const m of metrics) {
        ww.appendChild(el("p.sig-metric", {}, [el("span", { text: m.metric + ": " }), el("b", { text: m.wastewater || "" })]));
        cell.appendChild(el("p.sig-metric", {}, [el("span", { text: m.metric + ": " }), el("b", { text: m.cellular || "" })]));
      }
      const wwFig = el("div.figure.mini");
      const cellFig = el("div.figure.mini");
      ww.appendChild(wwFig);
      cell.appendChild(cellFig);
      rowEl.append(label, ww, cell);
      grid.appendChild(rowEl);
      cells.set(c.key, { ww: wwFig, cell: cellFig });
    }
  }

  const sel = () => app.windows.filter((r) => state.storms.has(r.storm));

  function miniScatter(host, yKey, yLabel, logY) {
    const data = sel().filter((r) => r[yKey] !== null && r[yKey] !== undefined
      && r.cust_hours_per_cust > 0 && (!logY || r[yKey] > 0));
    const f = figure(host, { width: MW, height: MH, label: yLabel,
      margin: { top: 10, right: 12, bottom: 38, left: 52 } });
    if (!data.length) return;
    const x = logScale([0.05, 250], [0, f.w]);
    const ys = data.map((r) => r[yKey]);
    const y = logY ? logScale(padLog([Math.max(0.05, Math.min(...ys)), Math.max(...ys)]), [f.h, 0])
      : linear([0, Math.max(...ys) * 1.05], [f.h, 0]);
    axisY(f, y, { label: yLabel, labelPad: 40, n: 4, format: logY ? fmt.tick : (v) => fmt.tick(v) });
    axisX(f, x, { label: "Customer-hours without power per customer", grid: true,
      values: [0.1, 1, 10, 100], format: fmt.tick });
    for (const r of data) {
      const dot = f.add(svg("circle", {
        cx: x(Math.max(0.05, r.cust_hours_per_cust)), cy: y(r[yKey]), r: 3,
        fill: r.silent ? "none" : app.color(r.storm), stroke: app.color(r.storm),
        "stroke-width": 1, opacity: 0.8,
      }));
      dot.addEventListener("mousemove", (ev) => tip.show(ev, {
        title: `${r.county}, ${app.name(r.storm)}`,
        rows: [["Customer-hours per customer", fmt.num(r.cust_hours_per_cust, 1)],
          [yLabel, fmt.num(r[yKey], 2)],
          ["Sewer releases", fmt.count(r.n_sewer)]],
        note: r.silent ? "Silent window: filed at most one notice." : "",
      }));
      dot.addEventListener("mouseleave", tip.hide);
    }
  }

  function miniBuffer(host) {
    const ww = app.recovery.wet_well.filter((r) => state.storms.has(r.storm) && !r.censored);
    const b = bins(ww, 0, 8, 1, (r) => r.buffer_days);
    const f = figure(host, { width: MW, height: MH, label: "Days to first release",
      margin: { top: 10, right: 12, bottom: 38, left: 52 } });
    const x = linear([0, 8], [0, f.w]);
    const y = linear([0, Math.max(1, ...b.map((d) => d.n)) * 1.1], [f.h, 0]);
    axisY(f, y, { label: "County-storms", labelPad: 40, n: 4 });
    axisX(f, x, { label: "Days from outage onset to first sewer release", values: [0, 1, 2, 3, 4, 5, 6, 7], format: (v) => String(v) });
    for (const d of b) {
      const rect = f.add(svg("rect", { x: x(d.x0) + 2, y: y(d.n), width: x(d.x1) - x(d.x0) - 4,
        height: f.h - y(d.n), fill: d.x0 === 0 ? NAVY : "#9fb0c3" }));
      rect.addEventListener("mousemove", (ev) => tip.show(ev, {
        title: d.x0 === 0 ? "Released on the onset day" : `${d.x0} day${d.x0 > 1 ? "s" : ""} after onset`,
        rows: [["County-storms", fmt.count(d.n)], ["Share", fmt.pct(d.n / (ww.length || 1), 0)]],
      }));
      rect.addEventListener("mouseleave", tip.hide);
    }
    const share = ww.length ? ww.filter((r) => r.buffer_days === 0).length / ww.length : 0;
    f.add(svg("text", { x: f.w, y: 12, "text-anchor": "end", "font-size": 11, fill: INK,
      text: `${fmt.pct(share, 0)} on the onset day (n = ${ww.length})` }));
  }

  function miniCellBuffer(host) {
    const m = app.dose.cell_models.filter((r) => r.model.startsWith("B1"));
    const f = figure(host, { width: MW, height: MH, label: "Cell buffering",
      margin: { top: 10, right: 12, bottom: 38, left: 110 } });
    const x = logScale([0.5, 8], [0, f.w]);
    axisX(f, x, { label: "Odds ratio per log unit of dose", values: [0.5, 1, 2, 4, 8], format: fmt.tick, grid: true });
    f.add(svg("line", { x1: x(1), x2: x(1), y1: 0, y2: f.h, stroke: MUTED, "stroke-dasharray": "3 3" }));
    m.forEach((r, i) => {
      const cy = (i + 0.5) * (f.h / m.length);
      f.add(svg("line", { x1: x(r.or_lo), x2: x(r.or_hi), y1: cy, y2: cy, stroke: INK, "stroke-width": 1.4 }));
      f.add(svg("circle", { cx: x(r.or), cy, r: 5, fill: i === 0 ? NAVY : PINK }));
      f.add(svg("text", { x: -8, y: cy + 4, "text-anchor": "end", "font-size": 11, fill: INK, text: r.term.replace(" dose", "") }));
      f.add(svg("text", { x: x(r.or_hi) + 6, y: cy + 4, "font-size": 11, fill: INK, text: `OR ${fmt.num(r.or, 2)}` }));
    });
    const b = app.dose.cell_summary.buffering;
    f.add(svg("text", { x: 0, y: f.h + 34 - 0, "font-size": 0, text: "" }));
    host.appendChild(el("p.mini-note", { text: `Sites on backup power today predict sites out for power tomorrow: Spearman ${fmt.num(b.spearman_backup_today_vs_out_power_tomorrow, 2)} across ${fmt.count(b.n_county_days_with_backup)} county-days.` }));
  }

  function miniEnd(host) {
    const keys = [...state.storms].map((k) => app.name(k));
    const rows = app.recovery.end_cause.filter((r) => keys.includes(r.window));
    const tot = {};
    for (const c of END_ORDER) tot[c] = rows.reduce((s, r) => s + (r[`${c}_n`] || 0), 0);
    const n = Object.values(tot).reduce((a, b) => a + b, 0);
    const stated = n - tot.unstated;
    const f = figure(host, { width: MW, height: MH, label: "How power-caused releases ended",
      margin: { top: 10, right: 12, bottom: 10, left: 12 } });
    let x0 = 0;
    const barY = 20;
    const barH = 34;
    for (const c of END_ORDER) {
      const w = n ? (tot[c] / n) * f.w : 0;
      const rect = f.add(svg("rect", { x: x0, y: barY, width: w, height: barH, fill: END[c].color, stroke: "#fff" }));
      rect.addEventListener("mousemove", (ev) => tip.show(ev, { title: END[c].label,
        rows: [["Releases", fmt.count(tot[c])], ["Share of all", fmt.pct(tot[c] / (n || 1), 0)],
          ["Share among stated", c === "unstated" ? "" : fmt.pct(tot[c] / (stated || 1), 0)]] }));
      rect.addEventListener("mouseleave", tip.hide);
      x0 += w;
    }
    f.add(svg("text", { x: 0, y: 12, "font-size": 11, fill: INK,
      text: `${fmt.count(n)} power-caused releases in the selected windows` }));
    const auto = stated ? tot.operator / stated : 0;
    f.add(svg("text", { x: 0, y: barY + barH + 22, "font-size": 12, fill: INK, "font-weight": 600,
      text: `Operator-ended: ${fmt.pct(auto, 0)} of the ${fmt.count(stated)} with a stated end` }));
    let ly = barY + barH + 62;
    for (const c of END_ORDER) {
      f.add(svg("rect", { x: 0, y: ly - 9, width: 10, height: 10, fill: END[c].color }));
      f.add(svg("text", { x: 16, y: ly, "font-size": 10.5, fill: INK, text: END[c].label }));
      ly += 16;
    }
    const lead = app.recovery.lead_summary.find((r) => r.end_class === "operator");
    f.add(svg("text", { x: 0, y: barY + barH + 40, "font-size": 11, fill: MUTED,
      text: `Operator-ended releases stopped a median ${fmt.num(lead.median_lead_days, 0)} days before the county was restored` }));
  }

  function miniCellLead(host) {
    const rows = app.recovery.cell_lead.filter((r) => state.storms.has(r.storm) && r.lead_half_days !== null);
    const b = bins(rows, -5, 6, 1, (r) => Math.max(-5, Math.min(5, r.lead_half_days)));
    const f = figure(host, { width: MW, height: MH, label: "Cell recovery lead",
      margin: { top: 10, right: 12, bottom: 38, left: 52 } });
    const x = linear([-5, 6], [0, f.w]);
    const y = linear([0, Math.max(1, ...b.map((d) => d.n)) * 1.1], [f.h, 0]);
    axisY(f, y, { label: "County-storms", labelPad: 40, n: 4 });
    axisX(f, x, { label: "Grid half-recovery day minus cell half-recovery day", values: [-4, -2, 0, 2, 4], format: (v) => String(v) });
    for (const d of b) {
      const rect = f.add(svg("rect", { x: x(d.x0) + 2, y: y(d.n), width: x(d.x1) - x(d.x0) - 4,
        height: f.h - y(d.n), fill: d.x0 > 0 ? NAVY : d.x0 < 0 ? PINK : "#9fb0c3" }));
      rect.addEventListener("mousemove", (ev) => tip.show(ev, {
        title: d.x0 > 0 ? "Cells back before the grid" : d.x0 < 0 ? "Cells back after the grid" : "Same day",
        rows: [["Lead (days)", `${d.x0}`], ["County-storms", fmt.count(d.n)]] }));
      rect.addEventListener("mouseleave", tip.hide);
    }
    const first = rows.filter((r) => r.lead_half_days > 0).length;
    f.add(svg("text", { x: f.w, y: 12, "text-anchor": "end", "font-size": 11, fill: INK,
      text: `cells first in ${fmt.pct(first / (rows.length || 1), 0)} of ${rows.length}` }));
  }

  function miniSlopes(host, rows, valueKey, loKey, hiKey, labelKey, xlab, ref, isLog) {
    const f = figure(host, { width: MW, height: MH, label: xlab,
      margin: { top: 10, right: 12, bottom: 38, left: 110 } });
    const lo = Math.min(...rows.map((r) => r[loKey]));
    const hi = Math.max(...rows.map((r) => r[hiKey]));
    const x = isLog ? logScale([Math.max(0.5, lo * 0.9), hi * 1.1], [0, f.w]) : linear(pad([Math.min(0, lo), hi]), [0, f.w]);
    axisX(f, x, { label: xlab, grid: true, n: 5, format: fmt.tick });
    f.add(svg("line", { x1: x(ref), x2: x(ref), y1: 0, y2: f.h, stroke: MUTED, "stroke-dasharray": "3 3" }));
    rows.forEach((r, i) => {
      const cy = (i + 0.5) * (f.h / rows.length);
      f.add(svg("line", { x1: x(r[loKey]), x2: x(r[hiKey]), y1: cy, y2: cy, stroke: INK, "stroke-width": 1.4 }));
      const dot = f.add(svg("circle", { cx: x(r[valueKey]), cy, r: 5, fill: [NAVY, GREEN, PINK][i % 3] }));
      f.add(svg("text", { x: -8, y: cy + 4, "text-anchor": "end", "font-size": 11, fill: INK, text: r[labelKey] }));
      f.add(svg("text", { x: x(r[hiKey]) + 6, y: cy + 4, "font-size": 11, fill: INK, text: fmt.num(r[valueKey], 2) }));
      dot.addEventListener("mousemove", (ev) => tip.show(ev, { title: r[labelKey],
        rows: [[xlab, fmt.num(r[valueKey], 3)], ["95% interval", `${fmt.num(r[loKey], 2)} to ${fmt.num(r[hiKey], 2)}`]] }));
      dot.addEventListener("mouseleave", tip.hide);
    });
  }

  function drawAll() {
    const c = cells;
    miniScatter(c.get("Propagation").ww, "sewer_per100k", "Releases per 100k customers", false);
    miniScatter(c.get("Propagation").cell, "cell_peak_share", "Peak share of cell sites out", false);
    miniBuffer(c.get("Buffering").ww);
    clear(c.get("Buffering").cell);
    miniCellBuffer(c.get("Buffering").cell);
    miniEnd(c.get("Recovery autonomy").ww);
    miniCellLead(c.get("Recovery autonomy").cell);
    const era = app.dose.era.map((r) => ({ ...r, label: r.era }));
    miniSlopes(c.get("Adaptation").ww, era, "slope", "lo", "hi", "label", "Slope per log unit of dose (sewer)", 0, false);
    const cellEra = app.dose.cell_models.filter((r) => r.model.startsWith("A1")).map((r) => ({ ...r, label: r.term.replace("era ", "") }));
    miniSlopes(c.get("Adaptation").cell, cellEra, "or", "or_lo", "or_hi", "label", "Odds ratio per log unit of dose (cell)", 1, true);
  }

  const h = meta.headline;
  capHost.innerHTML = `<b>Read down the rows.</b> Both lifelines propagate the grid's failure strongly `
    + `(sewer IRR ${fmt.num(h.irr_sewer, 2)}, cell OR ${fmt.num(h.or_cell, 2)} per log unit of customer-hours per customer) `
    + `and on the day; neither has a day of buffer. They part at recovery: sewer operators end `
    + `${fmt.pct(h.autonomy.autonomy_among_stated, 0)} of the power-caused spills with a stated end by their own means, `
    + `a median ${h.autonomy.lead.operator.median_lead_days} days before the county is restored, while cell sites come back `
    + `about a day before the grid. And neither has decoupled: the sewer slope is flat across eras and the cell slope has risen. `
    + `Select storms in the strip to redraw every cell on the subset; the filter does not refit the models, whose estimates are those of the paper.`;

  renderStrip();
  buildGrid();
  drawAll();
}
