/* Storm maps: one storm at a time, county fill from any window
   quantity, circles for the releases, open circles for the silent
   windows, the track and the landfall. Hover for the numbers, click
   to pin a county and see its nine-storm record. */

import { el, svg, clear, control, segmented, select, checkbox } from "../lib/dom.js";
import { figure } from "../lib/chart.js";
import { boundsOf, centroid, pathOf, projector, trackPath } from "../lib/geo.js";
import { table } from "../lib/bars.js";
import * as fmt from "../lib/format.js";
import { INK, LAND, MUTED, NODATA, PINK, NAVY, GREEN, sequential, sequentialGreen, diverging } from "../lib/palette.js";
import * as tip from "../lib/tooltip.js";

const MW = 640;
const MH = 600;

const FILLS = {
  cust_hours_per_cust: { label: "Customer-hours without power per customer", max: 100, ramp: sequential, fmt: (v) => fmt.num(v, 1) },
  peak_share: { label: "Peak share of customers out", max: 1, ramp: sequential, fmt: (v) => fmt.pct(v, 0) },
  prcp_mm: { label: "Rain in the window (mm)", max: 300, ramp: sequentialGreen, fmt: (v) => fmt.num(v, 0) },
  cell_peak_share: { label: "Peak share of cell sites out", max: 0.6, ramp: sequential, fmt: (v) => fmt.pct(v, 0) },
  cell_power_share: { label: "Share of cell outages due to power", max: 1, ramp: sequential, fmt: (v) => fmt.pct(v, 0) },
  silence_index: { label: "Silence index: log observed over fitted (navy fewer, wine more)", max: 2, ramp: (t) => diverging(t), div: true, fmt: (v) => fmt.num(v, 2) },
  pa_fed_per_cust: { label: "PA emergency work reimbursed per customer (USD)", max: 5, ramp: sequential, fmt: (v) => `$${fmt.num(v, 2)}` },
  closed_before: { label: "Mitigation projects closed before the storm", max: 15, ramp: sequentialGreen, fmt: (v) => fmt.count(v) },
  propensity: { label: "Cascade propensity (county effect vs median)", max: 6, ramp: sequential, fmt: (v) => `${fmt.num(v, 1)}x` },
};
const CIRCLES = {
  n_sewer: "Sewer releases in the window",
  excess_sewer: "Excess releases over baseline",
  n_power: "Releases naming lost power",
  none: "No circles",
};

export function stormMap(host, app) {
  const meta = app.meta;
  const state = { storm: "ian", fill: "cust_hours_per_cust", circle: "n_sewer", silent: true, track: true, pinned: null };

  const bar = el("div.controls");
  const figHost = el("div.figure");
  const legendHost = el("div", { style: { marginTop: ".6rem" } });
  const side = el("div.sidecard");
  const capHost = el("p.caption");
  clear(host).append(bar, el("div.panelgrid", {}, [el("div", {}, [figHost, legendHost]), side]), capHost);

  bar.appendChild(control("Storm", segmented(meta.order.map((k) => ({
    key: k, label: `${meta.storms[k].label} ${meta.storms[k].year}`, color: meta.storms[k].color,
  })), state.storm, (v) => { state.storm = v; draw(); renderSide(); }), { storms: true }));
  bar.appendChild(control("County fill", select(Object.entries(FILLS).map(([k, v]) => ({ key: k, label: v.label })), state.fill, (v) => { state.fill = v; draw(); })));
  bar.appendChild(control("Circles", select(Object.entries(CIRCLES).map(([k, v]) => ({ key: k, label: v })), state.circle, (v) => { state.circle = v; draw(); })));
  bar.appendChild(control("", el("div.control-row", {}, [
    checkbox("Silent windows (open circles, expected count)", state.silent, (v) => { state.silent = v; draw(); }),
    checkbox("Track and landfall", state.track, (v) => { state.track = v; draw(); }),
  ])));

  const project = projector(pad2(boundsOf(app.geo.counties)), MW, MH, 10);
  function pad2([a, b, c, d]) {
    const px = (b - a) * 0.04;
    const py = (d - c) * 0.04;
    return [a - px, b + px, c - py, d + py];
  }
  const centers = new Map(app.geo.counties.map((c) => [c.fips, project(...centroid(c.rings))]));

  function fillColor(w) {
    const spec = FILLS[state.fill];
    const v = w ? w[state.fill] : null;
    if (v === null || v === undefined) return NODATA;
    if (spec.div) return spec.ramp((Math.max(-spec.max, Math.min(spec.max, v)) + spec.max) / (2 * spec.max));
    return spec.ramp(Math.min(1, Math.max(0, v) / spec.max));
  }

  function draw() {
    const f = figure(figHost, { width: MW, height: MH, label: "Storm map", margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    f.add(svg("path", { d: pathOf(app.geo.context.rings, project), fill: LAND, stroke: "#fff", "stroke-width": 0.6 }));
    for (const c of app.geo.counties) {
      const w = app.window(c.fips, state.storm);
      const p = f.add(svg("path", { d: pathOf(c.rings, project), fill: fillColor(w), stroke: "#fff",
        "stroke-width": 0.6, style: { cursor: "pointer" } }));
      if (w && w.ia) {
        f.add(svg("path", { d: pathOf(c.rings, project), fill: "none", stroke: INK, "stroke-width": 0.5, "pointer-events": "none", opacity: 0.6 }));
      }
      p.addEventListener("mousemove", (ev) => tip.show(ev, { title: `${c.name} County`, rows: rowsFor(w),
        note: w && w.silent ? `Silent window: filed ${w.n_sewer} against about ${fmt.num(w.predicted, 0)} expected.` : "Select to pin this county." }));
      p.addEventListener("mouseleave", tip.hide);
      p.addEventListener("click", () => { state.pinned = state.pinned === c.fips ? null : c.fips; draw(); renderSide(); });
      if (state.pinned === c.fips) {
        f.add(svg("path", { d: pathOf(c.rings, project), fill: "none", stroke: INK, "stroke-width": 2.2, "pointer-events": "none" }));
      }
    }
    if (state.circle !== "none") {
      for (const c of app.geo.counties) {
        const w = app.window(c.fips, state.storm);
        if (!w) continue;
        const v = w[state.circle];
        const [cx, cy] = centers.get(c.fips);
        if (v > 0) {
          f.add(svg("circle", { cx, cy, r: 2.5 + 2.4 * Math.sqrt(v), fill: PINK, "fill-opacity": 0.5, stroke: PINK, "stroke-width": 1, "pointer-events": "none" }));
        }
        if (state.silent && w.silent && w.predicted) {
          f.add(svg("circle", { cx, cy, r: 2.5 + 2.4 * Math.sqrt(w.predicted), fill: "none", stroke: INK, "stroke-width": 1.4, "stroke-dasharray": "3 2", "pointer-events": "none" }));
        }
      }
    }
    if (state.track) {
      const trk = app.geo.tracks[state.storm];
      if (trk) {
        const keep = trk.lon.map((_, k) => k).filter((k) => trk.lon[k] > -92 && trk.lon[k] < -76 && trk.lat[k] > 21 && trk.lat[k] < 34);
        if (keep.length > 1) {
          const d = trackPath(keep.map((k) => trk.lon[k]), keep.map((k) => trk.lat[k]), project);
          f.add(svg("path", { d, fill: "none", stroke: "#fff", "stroke-width": 5, opacity: 0.85, "pointer-events": "none" }));
          f.add(svg("path", { d, fill: "none", stroke: app.color(state.storm), "stroke-width": 2, "pointer-events": "none" }));
        }
        if (trk.landfall) {
          const [lx, ly] = project(trk.landfall[0], trk.landfall[1]);
          f.add(svg("circle", { cx: lx, cy: ly, r: 6, fill: "none", stroke: app.color(state.storm), "stroke-width": 2.2 }));
          f.add(svg("circle", { cx: lx, cy: ly, r: 1.8, fill: app.color(state.storm) }));
        }
      }
    }
    drawLegend();
  }

  function rowsFor(w) {
    if (!w) return [["No window", ""]];
    return [
      ["Customer-hours per customer", fmt.num(w.cust_hours_per_cust, 1)],
      ["Peak customers out", fmt.pct(w.peak_share, 0)],
      ["Rain in the window", `${fmt.num(w.prcp_mm, 0)} mm`],
      ["Sewer releases", `${fmt.count(w.n_sewer)} (${fmt.num(w.excess_sewer, 1)} excess)`],
      ["Naming lost power", fmt.count(w.n_power)],
      ["Cell sites out at peak", w.cell_peak_share === null ? "no table" : fmt.pct(w.cell_peak_share, 0)],
      ["Model-fitted releases", w.fitted === null ? "" : fmt.num(w.fitted, 1)],
    ];
  }

  function drawLegend() {
    const spec = FILLS[state.fill];
    const w = 320;
    const h = 40;
    const s = svg("svg", { viewBox: `0 0 ${w} ${h}`, width: w, height: h, style: { maxWidth: "100%" } });
    const defs = svg("defs");
    const grad = svg("linearGradient", { id: "fillgrad", x1: 0, x2: 1 });
    for (let i = 0; i <= 10; i += 1) {
      grad.appendChild(svg("stop", { offset: `${i * 10}%`, "stop-color": spec.ramp(i / 10) }));
    }
    defs.appendChild(grad);
    s.appendChild(defs);
    s.appendChild(svg("rect", { x: 0, y: 4, width: w, height: 10, fill: "url(#fillgrad)" }));
    const lo = spec.div ? -spec.max : 0;
    for (const t of [0, 0.5, 1]) {
      const v = lo + t * (spec.max - lo);
      s.appendChild(svg("text", { x: t * w, y: 26, "text-anchor": t === 0 ? "start" : t === 1 ? "end" : "middle", "font-size": 10, fill: MUTED,
        text: spec.fmt(v) + (t === 1 && !spec.div ? "+" : "") }));
    }
    s.appendChild(svg("text", { x: 0, y: 38, "font-size": 10, fill: MUTED, text: spec.label }));
    clear(legendHost).appendChild(s);
    legendHost.appendChild(el("p.note", { style: { marginTop: ".3rem" },
      text: "Thin black outline: county with a federal Individual Assistance declaration. Pink circles scale with the chosen count; dashed open circles are the silent windows scaled by the model's expected count." }));
  }

  function renderSide() {
    clear(side);
    if (!state.pinned) {
      const s = meta.storms[state.storm];
      side.append(el("h4", { text: app.name(state.storm) }));
      const dl = el("dl");
      const add = (k, v) => dl.append(el("dt", { text: k }), el("dd", { text: v }));
      add("Landfall", `${fmt.dateLabel(s.landfall)}, ${s.vmax} kt`);
      add("Declared counties (IA)", fmt.count(s.ia_counties));
      add("Customer-hours of outage", `${s.cust_hours_m} million`);
      add("Median county rain", `${s.rain_median_mm} mm`);
      add("Sewer releases in the window", `${fmt.count(s.n_sewer)} (${fmt.count(s.excess)} above baseline)`);
      add("Naming lost power", fmt.count(s.n_power));
      add("Cell sites out at peak (best county)", s.cell_peak_share === null ? "no DIRS table" : fmt.pct(s.cell_peak_share, 0));
      if (s.silent) add("Silent windows", s.silent);
      side.append(dl, el("p", { text: "Select a county to see its record across all nine storms." }));
      return;
    }
    const name = meta.counties[state.pinned];
    side.append(el("h4", { text: `${name} County across the nine storms` }));
    const rows = meta.order.map((k) => app.window(state.pinned, k)).filter(Boolean);
    table(side, [
      { key: "storm", label: "Storm", fmt: (v) => meta.storms[v].label, num: false },
      { key: "cust_hours_per_cust", label: "Cust-h / cust", fmt: (v) => fmt.num(v, 1) },
      { key: "prcp_mm", label: "Rain mm", fmt: (v) => fmt.num(v, 0) },
      { key: "n_sewer", label: "Releases", fmt: (v, r) => `${fmt.count(v)}${r.silent ? " (silent)" : ""}` },
      { key: "n_power", label: "Power", fmt: (v) => fmt.count(v) },
      { key: "cell_peak_share", label: "Cells out", fmt: (v) => (v === null ? "" : fmt.pct(v, 0)) },
    ], rows);
    const w = rows[0];
    side.append(el("p", { text: `Files about ${fmt.num(w.sewer_per_year_all, 0)} sewer notices a year; ${fmt.count(w.mcc)} electricity customers`
      + (w.propensity ? `; cascade propensity ${fmt.num(w.propensity, 1)} times the median county.` : ".") }));
    side.append(el("p", {}, [el("a", { href: `county.html?fips=${state.pinned}`, text: "Open in the county explorer" })]));
  }

  capHost.innerHTML = "<b>Where the grid went down, the sewers overflowed.</b> The fill is the outage dose and the circles the releases; switch the fill to rain, to the cell network, to the silence index or to the reimbursed emergency work to see each layer against the same storm. The dashed open circles are the county-windows that filed almost nothing during the longest outages, drawn at the size the model expected.";

  draw();
  renderSide();
}
