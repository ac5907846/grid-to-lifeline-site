/* Dose-response: the county-windows of both lifelines against the
   same outage dose, with the paper's fitted curve for the sewer, a
   live least-squares fit on whatever is on screen, and the model
   tables beside it. */

import { el, svg, clear, control, segmented, select, chips, checkbox } from "../lib/dom.js";
import { figure, axisX, axisY, linePath } from "../lib/chart.js";
import { linear, log as logScale, extent, pad, padLog } from "../lib/scale.js";
import { corr, ols } from "../lib/stats.js";
import { table } from "../lib/bars.js";
import * as fmt from "../lib/format.js";
import { INK, MUTED, NAVY, PINK, GREEN, GRAY } from "../lib/palette.js";
import * as tip from "../lib/tooltip.js";

const W = 660;
const H = 470;

const Y = {
  sewer: [
    { key: "sewer_per100k", label: "Sewer releases per 100,000 customers", log: false },
    { key: "excess_per100k", label: "Excess releases per 100,000 customers", log: false },
    { key: "rate_per_mch", label: "Releases per million customer-hours", log: true },
    { key: "n_sewer", label: "Sewer releases (count)", log: false },
  ],
  cell: [
    { key: "cell_peak_share", label: "Peak share of cell sites out", log: false },
    { key: "cell_site_days_out_per_site", label: "Cell site-days out per site", log: false },
    { key: "cell_power_share", label: "Share of cell outages due to power", log: false },
  ],
};
const X = [
  { key: "cust_hours_per_cust", label: "Customer-hours without power per customer", log: true },
  { key: "peak_share", label: "Peak share of customers out", log: false },
  { key: "h_gt50", label: "Hours above half of customers out", log: false },
  { key: "prcp_mm", label: "Rain in the window (mm)", log: false },
];

export function doseChart(host, app) {
  const meta = app.meta;
  const state = { lifeline: "sewer", y: "sewer_per100k", x: "cust_hours_per_cust", storms: new Set(meta.order),
    logX: true, logY: false, curve: true, fit: true, silent: true, era: "all" };

  const bar = el("div.controls");
  const figHost = el("div.figure");
  const side = el("div.sidecard");
  const tables = el("div");
  const capHost = el("p.caption");
  clear(host).append(bar, el("div.panelgrid", {}, [figHost, side]), tables, capHost);

  function buildBar() {
    clear(bar);
    bar.appendChild(control("Lifeline", segmented([{ key: "sewer", label: "Wastewater" }, { key: "cell", label: "Cellular" }], state.lifeline, (v) => {
      state.lifeline = v; state.y = Y[v][0].key; state.logY = Y[v][0].log; buildBar(); draw();
    })));
    bar.appendChild(control("Vertical axis", select(Y[state.lifeline].map((d) => ({ key: d.key, label: d.label })), state.y, (v) => {
      state.y = v; state.logY = Y[state.lifeline].find((d) => d.key === v).log; buildBar(); draw();
    })));
    bar.appendChild(control("Dose", select(X.map((d) => ({ key: d.key, label: d.label })), state.x, (v) => {
      state.x = v; state.logX = X.find((d) => d.key === v).log; buildBar(); draw();
    })));
    bar.appendChild(control("Storms", chips(meta.order.map((k) => ({ key: k, label: meta.storms[k].label, color: meta.storms[k].color })), state.storms, () => draw(), { min: 1 })));
    bar.appendChild(control("Era", segmented([{ key: "all", label: "All" }, { key: "2017-2018", label: "2017 to 2018" }, { key: "2020-2023", label: "2020 to 2023" }, { key: "2024", label: "2024" }], state.era, (v) => { state.era = v; draw(); })));
    bar.appendChild(control("Options", el("div.control-row", {}, [
      checkbox("log x", state.logX, (v) => { state.logX = v; draw(); }),
      checkbox("log y", state.logY, (v) => { state.logY = v; draw(); }),
      checkbox("paper's fitted curve", state.curve, (v) => { state.curve = v; draw(); }),
      checkbox("least-squares line on screen", state.fit, (v) => { state.fit = v; draw(); }),
      checkbox("include silent windows", state.silent, (v) => { state.silent = v; draw(); }),
    ])));
  }

  function rows() {
    return app.windows.filter((r) => state.storms.has(r.storm)
      && (state.era === "all" || r.era === state.era)
      && (state.silent || !r.silent)
      && r[state.x] !== null && r[state.y] !== null && r[state.y] !== undefined
      && (!state.logX || r[state.x] > 0) && (!state.logY || r[state.y] > 0));
  }

  function draw() {
    const data = rows();
    const f = figure(figHost, { width: W, height: H, label: "Dose-response", margin: { top: 18, right: 20, bottom: 58, left: 70 } });
    const xl = X.find((d) => d.key === state.x).label;
    const yl = Y[state.lifeline].find((d) => d.key === state.y).label;
    if (data.length < 3) { figHost.appendChild(el("p.loading", { text: "Not enough county-windows." })); return; }
    const xs = data.map((r) => r[state.x]);
    const ys = data.map((r) => r[state.y]);
    const xdom = state.logX ? padLog([Math.max(0.03, Math.min(...xs)), Math.max(...xs)]) : pad(extent(xs));
    const x = state.logX ? logScale(xdom, [0, f.w]) : linear(xdom, [0, f.w]);
    const y = state.logY ? logScale(padLog(extent(ys)), [f.h, 0]) : linear(pad([0, Math.max(...ys)]), [f.h, 0]);
    axisY(f, y, { label: yl });
    axisX(f, x, { label: xl, grid: true });

    if (state.curve && state.lifeline === "sewer" && state.x === "cust_hours_per_cust" && state.y === "sewer_per100k") {
      const c = app.dose.curve.filter((p) => p.chpc > 0 || !state.logX);
      f.add(svg("path", { d: linePath(c, (p) => x(Math.max(0.03, p.chpc)), (p) => y(p.hi)) + linePath([...c].reverse(), (p) => x(Math.max(0.03, p.chpc)), (p) => y(p.lo)).replace(/^M/, "L") + "Z",
        fill: NAVY, "fill-opacity": 0.1, stroke: "none" }));
      f.add(svg("path", { d: linePath(c, (p) => x(Math.max(0.03, p.chpc)), (p) => y(p.pred)), fill: "none", stroke: NAVY, "stroke-width": 2, "stroke-dasharray": "6 3" }));
      const h = meta.headline;
      f.add(svg("text", { x: f.w - 4, y: 30, "text-anchor": "end", "font-size": 11.5, fill: NAVY,
        text: `Model A: IRR ${fmt.num(h.irr_sewer, 2)} (${fmt.num(h.irr_lo, 2)} to ${fmt.num(h.irr_hi, 2)}) per log unit, county and storm fixed effects` }));
    }
    for (const r of data) {
      const dot = f.add(svg("circle", { cx: x(r[state.x]), cy: y(r[state.y]), r: r.silent ? 5 : 3.6,
        fill: r.silent ? "none" : app.color(r.storm), stroke: app.color(r.storm), "stroke-width": r.silent ? 1.6 : 0.6, opacity: 0.8 }));
      dot.addEventListener("mousemove", (ev) => tip.show(ev, { title: `${r.county}, ${app.name(r.storm)}`,
        rows: [[xl, fmt.num(r[state.x], 2)], [yl, fmt.num(r[state.y], 2)], ["Sewer releases", fmt.count(r.n_sewer)],
          ["Cell sites out at peak", r.cell_peak_share === null ? "no table" : fmt.pct(r.cell_peak_share, 0)], ["Customers", fmt.count(r.mcc)]],
        note: r.silent ? "Silent window (open marker)." : "" }));
      dot.addEventListener("mouseleave", tip.hide);
    }
    const tx = state.logX ? xs.map(Math.log10) : xs;
    const ty = state.logY ? ys.map(Math.log10) : ys;
    const rr = corr(tx, ty);
    if (state.fit) {
      const fit = ols(tx.map((v) => [1, v]), ty);
      if (fit) {
        const [a, b] = fit.beta;
        const x0 = Math.min(...tx);
        const x1 = Math.max(...tx);
        const px = (v) => x(state.logX ? 10 ** v : v);
        const py = (v) => y(state.logY ? 10 ** v : v);
        f.add(svg("line", { x1: px(x0), y1: py(a + b * x0), x2: px(x1), y2: py(a + b * x1), stroke: PINK, "stroke-width": 1.8, opacity: 0.9 }));
        f.add(svg("text", { x: 6, y: 14, "font-size": 11.5, fill: INK,
          text: `On screen: n = ${data.length}, r = ${fmt.num(rr, 2)}, least-squares slope ${fmt.num(b, 3)}${state.logX && state.logY ? " (log-log elasticity)" : ""}` }));
      }
    }
    renderSide(data);
  }

  function renderSide(data) {
    clear(side);
    const h = meta.headline;
    if (state.lifeline === "sewer") {
      side.append(el("h4", { text: "The paper's estimate" }));
      side.append(el("div.big", { text: `IRR ${fmt.num(h.irr_sewer, 2)}` }));
      side.append(el("p", { text: `per log unit of customer-hours per customer: a ${fmt.pct(2 ** Math.log(h.irr_sewer) / 1 - 1, 0)} rise in sewer releases per doubling of the dose; elasticity ${fmt.num(h.elasticity_24h, 2)} at one customer-day. Beside rain the outage is ${fmt.num(h.irr_outage_with_rain, 2)} and rain ${fmt.num(h.irr_rain_with_outage, 2)}, independent channels.` }));
      side.append(el("p", { text: `${fmt.count(h.n_windows)} county-windows, negative binomial with county and storm fixed effects, dispersion ${fmt.num(h.alpha, 2)}, county-clustered errors. Silent windows pull the slope down: without them it is ${fmt.num(h.silent.irr_without_silent, 2)}.` }));
    } else {
      const cs = app.dose.cell_summary;
      side.append(el("h4", { text: "The paper's estimate" }));
      side.append(el("div.big", { text: `OR ${fmt.num(h.or_cell, 2)}` }));
      side.append(el("p", { text: `odds of a cell site being out per log unit of the same dose (${fmt.num(h.or_cell_ci[0], 2)} to ${fmt.num(h.or_cell_ci[1], 2)}); across ${cs.propagation.n} county-storms the site-days out per site correlate with customer-hours per customer at ${fmt.num(cs.propagation.county_window_spearman_sitedays_vs_custhours, 2)}.` }));
      side.append(el("p", { text: `Binomial GLM on sites out of sites served, ${fmt.count(cs.panel.county_days)} county-days, county and storm fixed effects. Previous-day dose OR ${fmt.num(cs.buffering.previous_day_or, 2)}: no buffer the daily data can see.` }));
    }
    const n = data.length;
    const silent = data.filter((r) => r.silent).length;
    side.append(el("p", { text: `On screen: ${n} county-windows, ${silent} silent.` }));
  }

  function renderTables() {
    clear(tables);
    const d = app.dose;
    const ci = (r, lo = "irr_lo", hi = "irr_hi") => `${fmt.num(r[lo], 2)} to ${fmt.num(r[hi], 2)}`;
    const block = (title, cols, rows) => {
      tables.appendChild(el("h4.algo", { text: title }));
      table(tables, cols, rows);
    };
    block("Sewer, Model A: one dose at a time (negative binomial, county and storm fixed effects)", [
      { key: "term", label: "Dose", num: false }, { key: "irr", label: "IRR", fmt: (v) => fmt.num(v, 2) },
      { key: "ci", label: "95% CI", fmt: (_, r) => ci(r) }, { key: "p", label: "p", fmt: (v) => fmt.pval(v) },
      { key: "llf", label: "Log-likelihood", fmt: (v) => fmt.num(v, 1) }], d.model_A);
    block("Sewer, two doses: outage and rain", [
      { key: "model", label: "Model", num: false }, { key: "term", label: "Term", num: false }, { key: "irr", label: "IRR", fmt: (v) => fmt.num(v, 2) },
      { key: "ci", label: "95% CI", fmt: (_, r) => ci(r) }, { key: "p", label: "p", fmt: (v) => fmt.pval(v) },
      { key: "llf", label: "Log-likelihood", fmt: (v) => fmt.num(v, 1) }], d.two_doses);
    block("Sewer, storm-specific slopes (Model B)", [
      { key: "storm", label: "Storm", num: false }, { key: "windows_with_release", label: "Windows with a release" },
      { key: "slope", label: "Slope", fmt: (v) => fmt.num(v, 2) }, { key: "ci", label: "95% CI", fmt: (_, r) => `${fmt.num(r.lo, 2)} to ${fmt.num(r.hi, 2)}` },
      { key: "p", label: "p", fmt: (v) => fmt.pval(v) }], d.storm_slopes);
    block("Sewer, wind or wire: nested models on the seven storms with track exposure", [
      { key: "model", label: "Model", num: false }, { key: "term", label: "Term", num: false }, { key: "irr", label: "IRR", fmt: (v) => fmt.num(v, 2) },
      { key: "ci", label: "95% CI", fmt: (_, r) => ci(r) }, { key: "p", label: "p", fmt: (v) => fmt.pval(v) }], d.mediation);
    block("Cellular: binomial models on cell sites out", [
      { key: "model", label: "Model", num: false }, { key: "term", label: "Term", num: false }, { key: "or", label: "OR", fmt: (v) => fmt.num(v, 2) },
      { key: "ci", label: "95% CI", fmt: (_, r) => ci(r, "or_lo", "or_hi") }, { key: "p", label: "p", fmt: (v) => fmt.pval(v) }], d.cell_models);
  }

  capHost.innerHTML = "<b>The hazard travels by wire.</b> Sewer releases rise about 60 percent per doubling of a county's customer-hours without power; the odds of a cell site being out rise 2.6-fold. Wind, surge and housing damage add nothing once the outage is in (the nested models below). The least-squares line is recomputed on whatever is on screen and is a reading aid, not the paper's estimate; the dashed curve and the tables are.";

  buildBar();
  draw();
  renderTables();
}
