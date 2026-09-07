/* Buffering and recovery autonomy: how power-caused releases ended,
   how far ahead of the county's restoration they ended, how long the
   wet wells bought, and how the cell network's recovery sits against
   the grid's. Every summary is recomputed on the selected storms. */

import { el, svg, clear, control, segmented, chips, checkbox } from "../lib/dom.js";
import { figure, axisX, axisY } from "../lib/chart.js";
import { linear } from "../lib/scale.js";
import { bins, legend, table } from "../lib/bars.js";
import { median } from "../lib/stats.js";
import * as fmt from "../lib/format.js";
import { INK, MUTED, NAVY, PINK, GREEN, END, END_ORDER, LIGHT } from "../lib/palette.js";
import * as tip from "../lib/tooltip.js";

const W = 900;

export function recoveryChart(host, app) {
  const meta = app.meta;
  const R = app.recovery;
  const state = { storms: new Set(meta.order), classes: new Set(["operator", "grid", "repair", "unstated"]), measure: "lead", stated: false };

  const bar = el("div.controls");
  const endHost = el("div.figure");
  const leadHost = el("div.figure");
  const leadLeg = el("div");
  const bufHost = el("div.figure");
  const cellHost = el("div.figure");
  const capHost = el("p.caption");
  clear(host).append(bar,
    el("h4.algo", { text: "A. How the power-caused sewer releases ended, by storm window (from the notice narrative)" }), endHost,
    el("h4.algo", { text: "B. Recovery lead: county restoration day minus release end day (positive = ended before the county was restored)" }), leadHost, leadLeg,
    el("h4.algo", { text: "C. Buffering: days from the county's outage onset to its first sewer release" }), bufHost,
    el("h4.algo", { text: "D. The cell network: grid half-recovery day minus cell half-recovery day (positive = cells back first)" }), cellHost,
    capHost);

  bar.appendChild(control("Storms", chips(meta.order.map((k) => ({ key: k, label: meta.storms[k].label, color: meta.storms[k].color })), state.storms, () => drawAll(), { min: 1 })));
  bar.appendChild(control("End classes in B", chips(END_ORDER.map((k) => ({ key: k, label: END[k].label.split(":")[0], color: END[k].color })), state.classes, () => drawLead(), { min: 1 })));
  bar.appendChild(control("B shows", segmented([{ key: "lead", label: "Lead in days" }, { key: "share", label: "County share out at the end" }], state.measure, (v) => { state.measure = v; drawLead(); })));
  bar.appendChild(control("", checkbox("A: shares among stated ends only", state.stated, (v) => { state.stated = v; drawEnd(); })));

  const names = () => [...meta.order].filter((k) => state.storms.has(k)).map((k) => app.name(k));

  function drawEnd() {
    const rows = R.end_cause.filter((r) => names().includes(r.window) || r.window.toLowerCase() === "baseline");
    const f = figure(endHost, { width: W, height: 40 + rows.length * 30, label: "End classes", margin: { top: 8, right: 165, bottom: 40, left: 110 } });
    const x = linear([0, 1], [0, f.w]);
    axisX(f, x, { label: state.stated ? "Share among releases with a stated end" : "Share of power-caused releases", format: (v) => fmt.pct(v, 0), values: [0, 0.25, 0.5, 0.75, 1] });
    rows.forEach((r, i) => {
      const y0 = i * 30 + 4;
      const classes = state.stated ? END_ORDER.filter((c) => c !== "unstated") : END_ORDER;
      const total = state.stated ? r.stated_n : r.n;
      let cx = 0;
      for (const c of classes) {
        const v = r[`${c}_n`] || 0;
        const w = total ? (v / total) * f.w : 0;
        const rect = f.add(svg("rect", { x: cx, y: y0, width: w, height: 22, fill: END[c].color, stroke: "#fff", "stroke-width": 0.6 }));
        rect.addEventListener("mousemove", (ev) => tip.show(ev, { title: `${r.window}: ${END[c].label}`, rows: [["Releases", fmt.count(v)], ["Share", fmt.pct(total ? v / total : 0, 0)]] }));
        rect.addEventListener("mouseleave", tip.hide);
        cx += w;
      }
      f.add(svg("text", { x: -8, y: y0 + 15, "text-anchor": "end", "font-size": 11, fill: INK, text: r.window }));
      f.add(svg("text", { x: f.w + 8, y: y0 + 15, "font-size": 11, fill: MUTED,
        text: `n = ${fmt.count(r.n)}; autonomy ${r.autonomy_among_stated === null ? "n/a" : fmt.pct(r.autonomy_among_stated, 0)}` }));
    });
    endHost.appendChild(legend(END_ORDER.map((c) => ({ label: END[c].label, color: END[c].color, kind: "swatch" }))));
  }

  function drawLead() {
    const keys = new Set([...state.storms]);
    const rows = R.lead.filter((r) => keys.has(r.window) && state.classes.has(r.end_class));
    const useLead = state.measure === "lead";
    const val = (r) => (useLead ? r.lead_days : r.share_out_at_end);
    const data = rows.filter((r) => val(r) !== null);
    const f = figure(leadHost, { width: W, height: 300, label: "Recovery lead", margin: { top: 12, right: 20, bottom: 44, left: 60 } });
    const lo = useLead ? -8 : 0;
    const hi = useLead ? 15 : 1;
    const w = useLead ? 1 : 0.1;
    const x = linear([lo, hi], [0, f.w]);
    const groups = END_ORDER.filter((c) => state.classes.has(c));
    const stacks = groups.map((c) => bins(data.filter((r) => r.end_class === c), lo, hi, w, (r) => Math.max(lo, Math.min(hi - 1e-9, val(r)))));
    const nb = stacks[0] ? stacks[0].length : 0;
    let maxN = 1;
    for (let i = 0; i < nb; i += 1) maxN = Math.max(maxN, stacks.reduce((s, st) => s + st[i].n, 0));
    const y = linear([0, maxN * 1.1], [f.h, 0]);
    axisY(f, y, { label: "Releases" });
    axisX(f, x, { label: useLead ? "Days between release end and county restoration" : "Share of the county's customers still out on the end day", grid: true, format: useLead ? (v) => String(v) : (v) => fmt.pct(v, 0) });
    for (let i = 0; i < nb; i += 1) {
      let base = 0;
      groups.forEach((c, gi) => {
        const b = stacks[gi][i];
        if (!b.n) return;
        const rect = f.add(svg("rect", { x: x(b.x0) + 1, y: y(base + b.n), width: Math.max(1, x(b.x1) - x(b.x0) - 2), height: y(base) - y(base + b.n), fill: END[c].color, stroke: "#fff", "stroke-width": 0.5 }));
        rect.addEventListener("mousemove", (ev) => tip.show(ev, { title: END[c].label, rows: [[useLead ? "Lead (days)" : "Share out at end", useLead ? `${b.x0}` : `${fmt.pct(b.x0, 0)} to ${fmt.pct(b.x1, 0)}`], ["Releases", fmt.count(b.n)]] }));
        rect.addEventListener("mouseleave", tip.hide);
        base += b.n;
      });
    }
    if (useLead) f.add(svg("line", { x1: x(0), x2: x(0), y1: 0, y2: f.h, stroke: MUTED, "stroke-dasharray": "3 3" }));
    // live summary per class
    clear(leadLeg);
    const cols = [
      { key: "cls", label: "End class", num: false }, { key: "n", label: "Releases" },
      { key: "med", label: useLead ? "Median lead (days)" : "Median share out at end", fmt: (v) => (useLead ? fmt.num(v, 0) : fmt.pct(v, 0)) },
      { key: "before", label: "Ended before restoration", fmt: (v) => fmt.pct(v, 0) },
      { key: "dur", label: "Mean duration (days)", fmt: (v) => fmt.num(v, 1) },
    ];
    const summary = groups.map((c) => {
      const g = data.filter((r) => r.end_class === c);
      return { cls: END[c].label, n: g.length, med: median(g.map(val)), before: g.length ? g.filter((r) => r.lead_days > 0).length / g.length : 0,
        dur: g.length ? g.reduce((s, r) => s + (r.duration_days || 0), 0) / g.length : 0 };
    });
    table(leadLeg, cols, summary);
  }

  function drawBuffer() {
    const ww = R.wet_well.filter((r) => state.storms.has(r.storm));
    const obs = ww.filter((r) => !r.censored);
    const b = bins(obs, 0, 14, 1, (r) => Math.min(13, r.buffer_days));
    const f = figure(bufHost, { width: W, height: 260, label: "Wet-well clock", margin: { top: 12, right: 20, bottom: 44, left: 60 } });
    const x = linear([0, 14], [0, f.w]);
    const y = linear([0, Math.max(1, ...b.map((d) => d.n)) * 1.1], [f.h, 0]);
    axisY(f, y, { label: "County-storms" });
    axisX(f, x, { label: "Days from outage onset (first day with a quarter of customers out) to the first release", values: [0, 2, 4, 6, 8, 10, 12], format: (v) => String(v) });
    for (const d of b) {
      const rect = f.add(svg("rect", { x: x(d.x0) + 2, y: y(d.n), width: x(d.x1) - x(d.x0) - 4, height: f.h - y(d.n), fill: d.x0 === 0 ? NAVY : "#9fb0c3" }));
      rect.addEventListener("mousemove", (ev) => tip.show(ev, { title: `${d.x0} day${d.x0 === 1 ? "" : "s"} after onset`, rows: [["County-storms", fmt.count(d.n)], ["Counties", d.items.slice(0, 6).map((r) => meta.counties[r.county_fips]).join(", ") + (d.items.length > 6 ? ", ..." : "")]] }));
      rect.addEventListener("mouseleave", tip.hide);
    }
    const share = obs.length ? obs.filter((r) => r.buffer_days === 0).length / obs.length : 0;
    f.add(svg("text", { x: f.w, y: 14, "text-anchor": "end", "font-size": 12, fill: INK,
      text: `${fmt.pct(share, 0)} of ${obs.length} county-storms released on the onset day; ${ww.length - obs.length} with an onset never released in the window` }));
  }

  function drawCell() {
    const rows = R.cell_lead.filter((r) => state.storms.has(r.storm) && r.lead_half_days !== null);
    const b = bins(rows, -6, 7, 1, (r) => Math.max(-6, Math.min(6, r.lead_half_days)));
    const f = figure(cellHost, { width: W, height: 260, label: "Cell recovery lead", margin: { top: 12, right: 20, bottom: 44, left: 60 } });
    const x = linear([-6, 7], [0, f.w]);
    const y = linear([0, Math.max(1, ...b.map((d) => d.n)) * 1.1], [f.h, 0]);
    axisY(f, y, { label: "County-storms" });
    axisX(f, x, { label: "Grid half-recovery day minus cell half-recovery day (county-storms with a cell peak of at least 10 percent)", values: [-6, -4, -2, 0, 2, 4, 6], format: (v) => String(v), grid: true });
    for (const d of b) {
      const rect = f.add(svg("rect", { x: x(d.x0) + 2, y: y(d.n), width: x(d.x1) - x(d.x0) - 4, height: f.h - y(d.n), fill: d.x0 > 0 ? NAVY : d.x0 < 0 ? PINK : "#9fb0c3" }));
      rect.addEventListener("mousemove", (ev) => tip.show(ev, { title: d.x0 > 0 ? "Cells back before the grid" : d.x0 < 0 ? "Cells back after the grid" : "Same day",
        rows: [["Lead (days)", `${d.x0}`], ["County-storms", fmt.count(d.n)], ["Counties", d.items.slice(0, 6).map((r) => `${meta.counties[r.county_fips]} (${meta.storms[r.storm].label})`).join(", ") + (d.items.length > 6 ? ", ..." : "")]] }));
      rect.addEventListener("mouseleave", tip.hide);
    }
    const first = rows.filter((r) => r.lead_half_days > 0).length;
    const same = rows.filter((r) => r.lead_half_days === 0).length;
    f.add(svg("text", { x: f.w, y: 14, "text-anchor": "end", "font-size": 12, fill: INK,
      text: `cells first in ${fmt.pct(first / (rows.length || 1), 0)}, same day ${fmt.pct(same / (rows.length || 1), 0)}, grid first ${fmt.pct((rows.length - first - same) / (rows.length || 1), 0)}; median lead ${fmt.num(median(rows.map((r) => r.lead_half_days)), 1)} days (n = ${rows.length})` }));
  }

  function drawAll() { drawEnd(); drawLead(); drawBuffer(); drawCell(); }

  const s = R.summary;
  capHost.innerHTML = `<b>The operator ends the spill; the grid ends the cell outage.</b> Where a notice says how a power-caused release ended, ${fmt.pct(s.autonomy_among_stated, 0)} name a generator, a bypass pump or a truck and ${fmt.pct(s.end_class_shares.grid / (1 - s.end_class_shares.unstated), 0)} name power restored; the operator-ended releases stopped a median ${s.lead.operator.median_lead_days} days before the county was restored, with ${fmt.pct(s.lead.operator.share_out_at_end, 0)} of its customers still dark. The grid-ended releases ended with ${fmt.pct(s.lead.grid.share_out_at_end, 0)} still out, which is a feeder returning while the county stays dark and the reason the end must be read from the narrative. Neither lifeline has a day of buffer.`;

  drawAll();
}
