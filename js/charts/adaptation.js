/* Adaptation: the slopes by storm and era for both lifelines, the
   same county struck twice, and the mitigation lag with a date
   scrubber over the HMGP pipeline. */

import { el, svg, clear, control, segmented, select, slider, checkbox } from "../lib/dom.js";
import { figure, axisX, axisY, linePath } from "../lib/chart.js";
import { linear, log as logScale } from "../lib/scale.js";
import { table, legend } from "../lib/bars.js";
import { median } from "../lib/stats.js";
import * as fmt from "../lib/format.js";
import { INK, MUTED, NAVY, PINK, GREEN, GRAY, LIGHT, sequential } from "../lib/palette.js";
import * as tip from "../lib/tooltip.js";

const W = 900;

export function adaptationChart(host, app) {
  const meta = app.meta;
  const A = app.adaptation;
  const D = app.dose;
  const state = { lifeline: "sewer", pair: A.pair_tests.slice().sort((a, b) => b.counties - a.counties)[0].pair, minH: 6, month: null, silentOut: false };

  const slopeBar = el("div.controls");
  const slopeHost = el("div.figure");
  const pairBar = el("div.controls");
  const pairHost = el("div.figure");
  const pairSide = el("div.sidecard");
  const lagBar = el("div.controls");
  const lagHost = el("div.figure");
  const lagSide = el("div.sidecard");
  const capHost = el("p.caption");
  clear(host).append(
    el("h4.algo", { text: "A. Has the slope moved? Storm-specific and era-specific slopes with 95 percent intervals" }), slopeBar, slopeHost,
    el("h4.algo", { text: "B. The same county struck twice: sewer releases per million customer-hours in the first and second strike" }), pairBar,
    el("div.panelgrid", {}, [pairHost, pairSide]),
    el("h4.algo", { text: "C. The mitigation lag: HMGP generator, utility and sewer protective projects by the hurricane that funded them" }), lagBar,
    el("div.panelgrid", {}, [lagHost, lagSide]),
    capHost);

  // A. slopes
  slopeBar.appendChild(control("Lifeline", segmented([{ key: "sewer", label: "Wastewater (slope, log scale of counts)" }, { key: "cell", label: "Cellular (odds ratio)" }], state.lifeline, (v) => { state.lifeline = v; drawSlopes(); })));
  function drawSlopes() {
    let rows;
    let ref;
    let isLog;
    let xlab;
    if (state.lifeline === "sewer") {
      rows = D.storm_slopes.map((r) => ({ label: r.storm, v: r.slope, lo: r.lo, hi: r.hi, key: r.key, kind: "storm", p: r.p }))
        .concat(D.era.map((r) => ({ label: `Era ${r.era}`, v: r.slope, lo: r.lo, hi: r.hi, kind: "era", p: r.p })));
      ref = D.model_A[0].coef; isLog = false; xlab = "Slope per log unit of customer-hours per customer (pooled slope dashed)";
    } else {
      const st = D.cell_models.filter((r) => r.model.startsWith("A2")).map((r) => ({ label: r.term, v: r.or, lo: r.or_lo, hi: r.or_hi, kind: "storm", p: r.p, key: Object.keys(meta.storms).find((k) => r.term.startsWith(meta.storms[k].label)) }));
      const er = D.cell_models.filter((r) => r.model.startsWith("A1")).map((r) => ({ label: `Era ${r.term.replace("era ", "")}`, v: r.or, lo: r.or_lo, hi: r.or_hi, kind: "era", p: r.p }));
      rows = st.concat(er);
      ref = D.cell_models[0].or; isLog = true; xlab = "Odds ratio per log unit of dose (pooled dashed)";
    }
    const f = figure(slopeHost, { width: W, height: 30 * rows.length + 60, label: "Slopes", margin: { top: 10, right: 150, bottom: 44, left: 130 } });
    const lo = Math.min(...rows.map((r) => r.lo));
    const hi = Math.max(...rows.map((r) => r.hi));
    const x = isLog ? logScale([Math.max(0.3, lo * 0.9), hi * 1.1], [0, f.w]) : linear([Math.min(-1, lo) - 0.2, hi + 0.2], [0, f.w]);
    axisX(f, x, { label: xlab, grid: true, n: 6, format: fmt.tick });
    f.add(svg("line", { x1: x(ref), x2: x(ref), y1: 0, y2: f.h, stroke: INK, "stroke-dasharray": "4 3" }));
    f.add(svg("line", { x1: x(isLog ? 1 : 0), x2: x(isLog ? 1 : 0), y1: 0, y2: f.h, stroke: MUTED, "stroke-width": 0.8 }));
    rows.forEach((r, i) => {
      const cy = (i + 0.5) * 30;
      const col = r.kind === "era" ? PINK : (r.key ? app.color(r.key) : NAVY);
      f.add(svg("line", { x1: x(Math.max(x.domain[0], r.lo)), x2: x(Math.min(x.domain[1], r.hi)), y1: cy, y2: cy, stroke: col, "stroke-width": 1.6 }));
      const dot = f.add(svg("circle", { cx: x(r.v), cy, r: 5.5, fill: col }));
      f.add(svg("text", { x: -10, y: cy + 4, "text-anchor": "end", "font-size": 11.5, fill: INK, "font-weight": r.kind === "era" ? 600 : 400, text: r.label }));
      f.add(svg("text", { x: f.w + 10, y: cy + 4, "font-size": 11, fill: MUTED, text: `${fmt.num(r.v, 2)} (${fmt.num(r.lo, 2)} to ${fmt.num(r.hi, 2)})` }));
      dot.addEventListener("mousemove", (ev) => tip.show(ev, { title: r.label, rows: [["Estimate", fmt.num(r.v, 3)], ["95% interval", `${fmt.num(r.lo, 2)} to ${fmt.num(r.hi, 2)}`], ["p", fmt.pval(r.p)]] }));
      dot.addEventListener("mouseleave", tip.hide);
    });
    const s = D.summary;
    const note = state.lifeline === "sewer"
      ? `Equal storm slopes: likelihood ratio ${fmt.num(s.model_B.lr_equal_slopes, 2)} on ${s.model_B.df} df, ${fmt.pval(s.model_B.p)}; equal era slopes ${fmt.pval(s.model_B_era.p)} with rain held fixed, ${fmt.pval(s.model_B_era_without_rain.p)} without the rain term (slopes ${s.model_B_era_without_rain.slopes.map((v) => fmt.num(v, 2)).join(" / ")}).`
      : `2024 against 2017 to 2018: Wald ${fmt.num(D.cell_summary.adaptation.era_wald_2024_vs_2017_stat, 1)}, ${fmt.pval(D.cell_summary.adaptation.p)}; DIRS reporting became mandatory for wireless providers in 2024, so a fuller roster reports more outages.`;
    slopeHost.appendChild(el("p.note", { text: note }));
  }

  // B. pairs
  const pairItems = A.pair_tests.map((r) => ({ key: r.pair, label: `${r.pair} (${r.counties} counties, ${r.days_apart} days apart)` }));
  pairBar.appendChild(control("Storm pair", select(pairItems, state.pair, (v) => { state.pair = v; drawPairs(); })));
  pairBar.appendChild(control("Minimum customer-hours per customer in both strikes", slider({ min: 0, max: 48, step: 1, value: state.minH, format: (v) => `<strong>${v}</strong> h` }, (v) => { state.minH = v; drawPairs(); }), { grow: true }));
  pairBar.appendChild(control("", checkbox("exclude silent windows", state.silentOut, (v) => { state.silentOut = v; drawPairs(); })));
  function drawPairs() {
    const rows = A.pairs.filter((r) => r.pair === state.pair && r.h1 >= state.minH && r.h2 >= state.minH && (!state.silentOut || (!r.silent1 && !r.silent2)))
      .sort((a, b) => (b.rate1 + b.rate2) - (a.rate1 + a.rate2));
    const f = figure(pairHost, { width: 620, height: Math.max(160, 22 * rows.length + 60), label: "Repeat strike", margin: { top: 10, right: 20, bottom: 44, left: 110 } });
    const mx = Math.max(1, ...rows.map((r) => Math.max(r.rate1, r.rate2)));
    const x = linear([0, mx * 1.08], [0, f.w]);
    axisX(f, x, { label: "Sewer releases per million customer-hours", grid: true });
    const first = rows[0] ? rows[0].first : "";
    const second = rows[0] ? rows[0].second : "";
    rows.forEach((r, i) => {
      const cy = (i + 0.5) * 22;
      f.add(svg("line", { x1: x(r.rate1), x2: x(r.rate2), y1: cy, y2: cy, stroke: LIGHT, "stroke-width": 2.5 }));
      const d1 = f.add(svg("circle", { cx: x(r.rate1), cy, r: 5, fill: app.color(first) }));
      const d2 = f.add(svg("circle", { cx: x(r.rate2), cy, r: 5, fill: app.color(second) }));
      f.add(svg("text", { x: -8, y: cy + 4, "text-anchor": "end", "font-size": 11, fill: INK, text: r.county + ((r.silent1 || r.silent2) ? " *" : "") }));
      for (const [d, which] of [[d1, 1], [d2, 2]]) {
        d.addEventListener("mousemove", (ev) => tip.show(ev, { title: `${r.county}, ${app.name(which === 1 ? first : second)}`,
          rows: [["Customer-hours per customer", fmt.num(which === 1 ? r.h1 : r.h2, 1)], ["Releases", fmt.count(which === 1 ? r.n1 : r.n2)], ["Per million customer-hours", fmt.num(which === 1 ? r.rate1 : r.rate2, 2)]],
          note: (which === 1 ? r.silent1 : r.silent2) ? "Silent window." : "" }));
        d.addEventListener("mouseleave", tip.hide);
      }
    });
    if (rows.length) pairHost.appendChild(legend([{ label: app.name(first), color: app.color(first) }, { label: app.name(second), color: app.color(second) }, { label: "* silent in one strike", color: "#fff" }]));
    clear(pairSide);
    const ratios = rows.filter((r) => r.rate1 > 0 && r.rate2 > 0).map((r) => r.rate2 / r.rate1);
    const lower = rows.filter((r) => r.rate2 < r.rate1).length;
    const t = A.pair_tests.find((r) => r.pair === state.pair);
    pairSide.append(el("h4", { text: "On screen" }));
    pairSide.append(el("div.big", { text: ratios.length ? `${fmt.num(median(ratios), 2)}x` : "n/a" }));
    pairSide.append(el("p", { text: `median ratio of the second strike to the first among the ${ratios.length} counties with releases in both; ${lower} of ${rows.length} counties lower in the second strike.` }));
    pairSide.append(el("h4", { text: "The paper's test" }));
    pairSide.append(el("p", { text: `${t.counties} counties with at least a quarter customer-day in both windows: median ratio ${fmt.num(t.median_ratio_second_over_first, 2)}, ${fmt.pct(t.share_counties_lower_second, 0)} lower in the second, Wilcoxon ${t.wilcoxon_p_rate === null ? "n/a" : fmt.pval(t.wilcoxon_p_rate)}.` }));
  }

  // C. mitigation lag
  const months = A.curves.irma.month;
  const lagSlider = slider({ min: 0, max: months.length - 1, step: 1, value: months.length - 1, format: (i) => `<strong>${months[i].slice(0, 7)}</strong>` }, (i) => { state.month = i; drawLag(); });
  lagBar.appendChild(control("As of month", lagSlider, { grow: true }));
  const landfallBtns = el("div.control-row");
  for (const k of meta.order) {
    landfallBtns.appendChild(el("button.btn-quiet", { type: "button", text: `${meta.storms[k].label} landfall`, style: { borderColor: meta.storms[k].color }, onclick: () => {
      const lf = meta.storms[k].landfall.slice(0, 7);
      let i = months.findIndex((m) => m.slice(0, 7) >= lf);
      if (i < 0) i = months.length - 1;
      state.month = i; lagSlider.input.value = i; lagSlider.output.innerHTML = `<strong>${months[i].slice(0, 7)}</strong>`; drawLag();
    } }));
  }
  lagBar.appendChild(control("Jump to", landfallBtns));
  function drawLag() {
    const i = state.month === null ? months.length - 1 : state.month;
    const f = figure(lagHost, { width: 620, height: 360, label: "Mitigation pipeline", margin: { top: 12, right: 20, bottom: 44, left: 60 } });
    const t0 = new Date("2017-01-01").getTime();
    const t1 = new Date("2026-09-01").getTime();
    const x = linear([t0, t1], [0, f.w]);
    const maxY = Math.max(...Object.values(A.curves).map((c) => Math.max(...c.approved))) * 1.1;
    const y = linear([0, maxY], [f.h, 0]);
    axisY(f, y, { label: "Projects" });
    axisX(f, x, { label: "Calendar year", values: [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026].map((yy) => new Date(`${yy}-01-01`).getTime()), format: (v) => String(new Date(v).getUTCFullYear()), grid: true });
    for (const k of meta.order) {
      const lf = new Date(meta.storms[k].landfall.replace(" ", "T")).getTime();
      f.add(svg("line", { x1: x(lf), x2: x(lf), y1: 0, y2: f.h, stroke: MUTED, "stroke-width": 0.6, "stroke-dasharray": "2 3" }));
    }
    const cut = new Date(months[i]).getTime();
    for (const [k, c] of Object.entries(A.curves)) {
      const col = app.color(k);
      const main = ["irma", "michael", "ian"].includes(k);
      const pts = c.month.map((m, j) => ({ t: new Date(m).getTime(), a: c.approved[j], cl: c.closed[j] })).filter((p) => p.t <= cut);
      f.add(svg("path", { d: linePath(pts, (p) => x(p.t), (p) => y(p.a)), fill: "none", stroke: col, "stroke-width": main ? 1.2 : 0.7, "stroke-dasharray": "5 3", opacity: main ? 1 : 0.6 }));
      f.add(svg("path", { d: linePath(pts, (p) => x(p.t), (p) => y(p.cl)), fill: "none", stroke: col, "stroke-width": main ? 2.2 : 1, opacity: main ? 1 : 0.6 }));
      const last = pts[pts.length - 1];
      const dy = { irma: -6, michael: -8, ian: 14 }[k] || -6;
      if (last && main) f.add(svg("text", { x: x(last.t) - 4, y: y(last.cl) + dy, "text-anchor": "end", "font-size": 11, fill: col, text: `${meta.storms[k].label}: ${last.cl} of ${c.projects} closed` }));
    }
    f.add(svg("line", { x1: x(cut), x2: x(cut), y1: 0, y2: f.h, stroke: PINK, "stroke-width": 1.5 }));
    f.add(svg("text", { x: x(cut) - 4, y: 12, "text-anchor": "end", "font-size": 11, fill: PINK, text: months[i].slice(0, 7) }));
    lagHost.appendChild(legend([{ label: "Closed (work done and paid)", color: INK, kind: "swatch" }, { label: "Approved (dashed)", color: GRAY, kind: "swatch" }]));
    clear(lagSide);
    lagSide.append(el("h4", { text: `Share of each disaster's projects closed by ${months[i].slice(0, 7)}` }));
    const rows = meta.order.filter((k) => A.curves[k]).map((k) => [k, A.curves[k]]).map(([k, c]) => ({ storm: app.name(k), projects: c.projects, approved: c.approved[i], closed: c.closed[i], share: c.projects ? c.closed[i] / c.projects : 0, musd: c.closed_fed_musd[i] }))
      .filter((r) => r.projects > 0);
    table(lagSide, [
      { key: "storm", label: "Funded from", num: false }, { key: "projects", label: "Projects" }, { key: "approved", label: "Approved" },
      { key: "closed", label: "Closed" }, { key: "share", label: "Share closed", fmt: (v) => fmt.pct(v, 0) }, { key: "musd", label: "Closed, M USD", fmt: (v) => fmt.num(v, 1) },
    ], rows);
    const lee = A.summary.lee_after_ian;
    lagSide.append(el("p", { text: `Lee County's ${lee.projects} projects funded from Ian (${lee.subrecipients.filter((s) => /Cape|Fort|Lee \(/.test(s)).join(", ")}): ${lee.closed} closed, ${lee.pending} pending in 2026.` }));
    const ms = A.model_stock.find((r) => r.model === "A + stock" && r.term === "lstock");
    lagSide.append(el("p", { text: `Model A with the county's closed stock before the storm: IRR ${fmt.num(ms.irr, 2)} (${fmt.num(ms.irr_lo, 2)} to ${fmt.num(ms.irr_hi, 2)}), ${fmt.pval(ms.p)}: the completed money does not change the slope.` }));
  }

  capHost.innerHTML = "<b>A fall is suggested, not established.</b> With rain held fixed the sewer's 2024 slope is about half its 2017 to 2018 value, but the fall rests on Milton alone (Helene and Debby sit at the 2017 level), the equal-slope tests do not reject, it disappears without the rain term, and the same counties struck twice show no fall in release rates; the cell network's slope has risen. The generator and utility projects FEMA funds after a hurricane close a median five years later: half of Irma's were done by Milton, seven years on, and none of Ian's. Drag the month to see what was in place at each landfall.";

  drawSlopes();
  drawPairs();
  drawLag();
}
