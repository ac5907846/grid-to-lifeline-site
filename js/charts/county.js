/* County-window explorer: any variable against any other across the
   603 county-windows, and a county profile that lays one county's
   nine storms side by side. */

import { el, svg, clear, control, select, chips, checkbox } from "../lib/dom.js";
import { figure, axisX, axisY } from "../lib/chart.js";
import { linear, log as logScale, extent, pad, padLog } from "../lib/scale.js";
import { corr, ols } from "../lib/stats.js";
import { table } from "../lib/bars.js";
import * as fmt from "../lib/format.js";
import { INK, MUTED, NAVY, PINK, GREEN, LIGHT } from "../lib/palette.js";
import * as tip from "../lib/tooltip.js";

const W = 660;
const H = 460;

export function countyChart(host, app) {
  const meta = app.meta;
  const byKey = new Map(meta.vars.map((v) => [v.key, v]));
  const params = new URLSearchParams(location.search);
  const state = { x: "cust_hours_per_cust", y: "sewer_per100k", storms: new Set(meta.order), logX: true, logY: false, fit: true,
    county: params.get("fips") || "12071", pinned: null };

  const bar = el("div.controls");
  const figHost = el("div.figure");
  const side = el("div.sidecard");
  const profile = el("div");
  const capHost = el("p.caption");
  clear(host).append(bar, el("div.panelgrid", {}, [figHost, side]), el("h4.algo", { text: "County profile: nine storms side by side" }), profile, capHost);

  const items = meta.vars.map((v) => ({ key: v.key, label: v.label, group: v.group }));
  const countyItems = Object.entries(meta.counties).sort((a, b) => a[1].localeCompare(b[1])).map(([k, v]) => ({ key: k, label: v }));

  function buildBar() {
    clear(bar);
    bar.appendChild(control("Horizontal axis", select(items, state.x, (v) => { state.x = v; state.logX = byKey.get(v).log; buildBar(); draw(); }, meta.groups)));
    bar.appendChild(control("Vertical axis", select(items, state.y, (v) => { state.y = v; state.logY = byKey.get(v).log; buildBar(); draw(); }, meta.groups)));
    bar.appendChild(control("Storms", chips(meta.order.map((k) => ({ key: k, label: meta.storms[k].label, color: meta.storms[k].color })), state.storms, () => draw(), { min: 1 })));
    bar.appendChild(control("County profile", select(countyItems, state.county, (v) => { state.county = v; draw(); drawProfile(); })));
    bar.appendChild(control("Scales", el("div.control-row", {}, [
      checkbox("log x", state.logX, (v) => { state.logX = v; draw(); }),
      checkbox("log y", state.logY, (v) => { state.logY = v; draw(); }),
      checkbox("fit line", state.fit, (v) => { state.fit = v; draw(); }),
    ])));
  }

  function rows() {
    return app.windows.filter((r) => state.storms.has(r.storm)
      && r[state.x] !== null && r[state.x] !== undefined && r[state.y] !== null && r[state.y] !== undefined
      && (!state.logX || r[state.x] > 0) && (!state.logY || r[state.y] > 0));
  }

  function draw() {
    const data = rows();
    const f = figure(figHost, { width: W, height: H, label: "County explorer", margin: { top: 18, right: 20, bottom: 58, left: 70 } });
    if (data.length < 3) { figHost.appendChild(el("p.loading", { text: "Not enough county-windows with both variables." })); return; }
    const xs = data.map((r) => r[state.x]);
    const ys = data.map((r) => r[state.y]);
    const x = state.logX ? logScale(padLog(extent(xs)), [0, f.w]) : linear(pad(extent(xs)), [0, f.w]);
    const y = state.logY ? logScale(padLog(extent(ys)), [f.h, 0]) : linear(pad(extent(ys)), [f.h, 0]);
    axisY(f, y, { label: byKey.get(state.y).label });
    axisX(f, x, { label: byKey.get(state.x).label, grid: true });
    for (const r of data) {
      const mine = r.county_fips === state.county;
      const dot = f.add(svg("circle", { cx: x(r[state.x]), cy: y(r[state.y]), r: mine ? 6 : 3.4, fill: app.color(r.storm), opacity: mine ? 1 : 0.55,
        stroke: mine ? INK : "none", "stroke-width": mine ? 1.4 : 0, style: { cursor: "pointer" } }));
      dot.addEventListener("mousemove", (ev) => tip.show(ev, { title: `${r.county}, ${app.name(r.storm)}`,
        rows: [[byKey.get(state.x).label, fmt.tick(r[state.x])], [byKey.get(state.y).label, fmt.tick(r[state.y])], ["Sewer releases", fmt.count(r.n_sewer)], ["Customers", fmt.count(r.mcc)]],
        note: "Select to open this county's profile." }));
      dot.addEventListener("mouseleave", tip.hide);
      dot.addEventListener("click", () => { state.county = r.county_fips; buildBar(); draw(); drawProfile(); });
    }
    const tx = state.logX ? xs.map(Math.log10) : xs;
    const ty = state.logY ? ys.map(Math.log10) : ys;
    const rr = corr(tx, ty);
    if (state.fit) {
      const fit = ols(tx.map((v) => [1, v]), ty);
      if (fit) {
        const [a, b] = fit.beta;
        const x0 = Math.min(...tx); const x1 = Math.max(...tx);
        const px = (v) => x(state.logX ? 10 ** v : v);
        const py = (v) => y(state.logY ? 10 ** v : v);
        f.add(svg("line", { x1: px(x0), y1: py(a + b * x0), x2: px(x1), y2: py(a + b * x1), stroke: INK, "stroke-width": 1.6, opacity: 0.75 }));
      }
    }
    clear(side);
    side.append(el("h4", { text: "On screen" }));
    side.append(el("div.big", { text: `r = ${fmt.num(rr, 2)}` }));
    side.append(el("p", { text: `${data.length} county-windows, ${state.logX ? "log " : ""}x against ${state.logY ? "log " : ""}y, least squares on the displayed scale. The county chosen for the profile is outlined.` }));
    side.append(el("p", { text: "A dependent system with no propagation would show a flat cloud here; the sewer and the cell network both show a slope in every grid-breaking storm." }));
  }

  function drawProfile() {
    clear(profile);
    const name = meta.counties[state.county];
    const rows = meta.order.map((k) => app.window(state.county, k)).filter(Boolean);
    if (!rows.length) { profile.appendChild(el("p.loading", { text: "No windows for this county." })); return; }
    const w = rows[0];
    profile.appendChild(el("p", { text: `${name} County: ${fmt.count(w.mcc)} electricity customers; files about ${fmt.num(w.sewer_per_year_all, 0)} sewer notices a year`
      + (w.propensity ? `; cascade propensity ${fmt.num(w.propensity, 1)} times the median county (county fixed effect of Model A).` : ".") }));
    // small multiple bars: dose, releases, cells
    const f = figure(el("div.figure"), { width: W + 240, height: 260, label: "Profile", margin: { top: 16, right: 20, bottom: 40, left: 60 } });
    profile.appendChild(f.root.parentNode || f.root);
    const n = rows.length;
    const bw = f.w / n;
    const maxH = Math.max(1, ...rows.map((r) => r.cust_hours_per_cust));
    const maxR = Math.max(1, ...rows.map((r) => r.n_sewer));
    const yH = linear([0, maxH * 1.15], [f.h, 0]);
    const yR = linear([0, maxR * 1.15], [f.h, 0]);
    axisY(f, yH, { label: "Customer-hours per customer (bars)" });
    rows.forEach((r, i) => {
      const x0 = i * bw;
      f.add(svg("rect", { x: x0 + 6, y: yH(r.cust_hours_per_cust), width: bw * 0.45, height: f.h - yH(r.cust_hours_per_cust), fill: app.color(r.storm), opacity: 0.85 }));
      f.add(svg("rect", { x: x0 + 6 + bw * 0.5, y: yR(r.n_sewer), width: bw * 0.35, height: f.h - yR(r.n_sewer), fill: r.silent ? "none" : PINK, stroke: PINK, "stroke-width": 1.2, "stroke-dasharray": r.silent ? "3 2" : null }));
      f.add(svg("text", { x: x0 + bw / 2, y: f.h + 16, "text-anchor": "middle", "font-size": 11, fill: INK, text: meta.storms[r.storm].label }));
      f.add(svg("text", { x: x0 + 6 + bw * 0.675, y: yR(r.n_sewer) - 4, "text-anchor": "middle", "font-size": 10, fill: PINK, text: `${r.n_sewer}${r.silent ? "*" : ""}` }));
      if (r.cell_peak_share !== null) {
        f.add(svg("circle", { cx: x0 + 6 + bw * 0.225, cy: yH(r.cust_hours_per_cust) - 10, r: 3 + 10 * r.cell_peak_share, fill: "none", stroke: INK, "stroke-width": 1.2 }));
      }
    });
    f.add(svg("text", { x: f.w, y: 12, "text-anchor": "end", "font-size": 11, fill: MUTED, text: "pink: sewer releases in the window (dashed: silent); ring: peak share of cell sites out" }));
    table(profile, [
      { key: "storm", label: "Storm", fmt: (v) => meta.storms[v].name, num: false },
      { key: "ia", label: "Declared", fmt: (v) => (v ? "yes" : ""), num: false },
      { key: "cust_hours_per_cust", label: "Cust-h / cust", fmt: (v) => fmt.num(v, 1) },
      { key: "peak_share", label: "Peak out", fmt: (v) => fmt.pct(v, 0) },
      { key: "prcp_mm", label: "Rain mm", fmt: (v) => fmt.num(v, 0) },
      { key: "n_sewer", label: "Releases", fmt: (v, r) => `${fmt.count(v)}${r.silent ? " (silent)" : ""}` },
      { key: "fitted", label: "Model-fitted", fmt: (v) => (v === null ? "" : fmt.num(v, 1)) },
      { key: "n_power", label: "Naming power", fmt: (v) => fmt.count(v) },
      { key: "autonomy", label: "Operator-ended", fmt: (v, r) => (v === null || v === undefined ? "" : `${fmt.pct(v, 0)} of ${r.stated}`) },
      { key: "cell_peak_share", label: "Cells out at peak", fmt: (v) => (v === null ? "" : fmt.pct(v, 0)) },
      { key: "cell_power_share", label: "Cell outages due to power", fmt: (v) => (v === null || v === undefined ? "" : fmt.pct(v, 0)) },
      { key: "pa_fed", label: "PA emergency work (USD)", fmt: (v) => (v ? `$${fmt.count(v)}` : "") },
      { key: "closed_before", label: "Mitigation closed before", fmt: (v) => fmt.count(v) },
    ], rows);
  }

  capHost.innerHTML = "<b>Every county-window, any variable against any other.</b> The outage dose, the rain, the releases, the cell network, the reimbursed emergency work and the mitigation stock are on the same rows; the profile lays one county's nine storms side by side, silent windows dashed.";

  buildBar();
  draw();
  drawProfile();
}
