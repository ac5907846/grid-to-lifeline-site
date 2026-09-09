/* The two curves of the paper's Fig. 1, drawn from the record: the
   grid's outage share and the lifeline's disruption in event time for
   one storm (or all nine), with the four constructs read off the
   curves and their measured values beside them. Every number is the
   paper's; what the record cannot show is listed as such. */

import { el, svg, clear, segmented } from "../lib/dom.js";
import { figure, axisX, axisY, linePath } from "../lib/chart.js";
import { linear } from "../lib/scale.js";
import * as fmt from "../lib/format.js";
import { INK, MUTED, NAVY, WINE, GRAY, RULE, GRID, LIGHT } from "../lib/palette.js";
import * as tip from "../lib/tooltip.js";

const W = 960;
const H = 400;
const T0 = -2;
const T1 = 14;
const ALL = "all";

const LIFELINES = [
  { key: "sewer", label: "Wastewater", color: NAVY,
    axis: "Sewer releases that day, excess over the county baseline" },
  { key: "cell", label: "Cellular", color: WINE,
    axis: "Cell sites out of service (% of sites reported)" },
];

function wilsonBadge(p, n) {
  if (!n) return { cls: "none", text: "no stated ends" };
  if (n < 20) return { cls: "weak", text: `only ${n} stated ends` };
  return { cls: "ok", text: `${n} stated ends` };
}

function sigBadge(lo, hi, nullValue, p) {
  if (lo === null || hi === null) return { cls: "none", text: "not estimated" };
  const excl = lo > nullValue || hi < nullValue;
  const ptxt = p === undefined || p === null ? "" : `, ${fmt.pval(p)}`;
  return excl ? { cls: "ok", text: `detectable (95% interval excludes ${nullValue}${ptxt})` }
    : { cls: "weak", text: `not detectable (interval covers ${nullValue}${ptxt})` };
}

export function twoCurves(host, app) {
  const meta = app.meta;
  const dose = app.dose;
  const rec = app.recovery;
  const adapt = app.adaptation;
  const q = new URLSearchParams(location.search);
  const state = { storm: meta.order.includes(q.get("storm")) || q.get("storm") === ALL ? q.get("storm") : "ian",
    lifeline: q.get("lifeline") === "cell" ? "cell" : "sewer" };

  const controls = el("div.tc-controls");
  const stage = el("div.tc-stage");
  const chartHost = el("div.tc-chart");
  const cards = el("div.tc-cards");
  const limits = el("div.tc-limits");
  stage.append(chartHost, cards);
  clear(host).append(controls, stage, limits);

  const stormItems = [{ key: ALL, label: "All nine", color: GRAY }].concat(
    meta.order.map((k) => ({ key: k, label: `${meta.storms[k].label} ${meta.storms[k].year}`,
      color: meta.storms[k].color })));
  const stormSeg = segmented(stormItems, state.storm, (k) => { state.storm = k; draw(); }, { storms: true });
  const lifeSeg = segmented(LIFELINES.map((l) => ({ key: l.key, label: l.label, color: l.color })),
    state.lifeline, (k) => { state.lifeline = k; draw(); });
  controls.append(
    el("div.tc-ctl", {}, [el("span.tc-lbl", { text: "Storm" }), stormSeg]),
    el("div.tc-ctl", {}, [el("span.tc-lbl", { text: "Dependent lifeline" }), lifeSeg]),
  );

  // ---------------------------------------------------------------- data
  async function series(stormKey) {
    const keys = stormKey === ALL ? meta.order : [stormKey];
    const days = await Promise.all(keys.map((k) => app.days(k)));
    const t = [];
    for (let v = T0; v <= T1; v++) t.push(v);
    const up = t.map(() => []);
    const dn = t.map(() => []);
    const cellT = new Map();
    for (const d of days) {
      const f = d.frames.ia_counties;
      d.t.forEach((tv, i) => {
        const j = tv - T0;
        if (j < 0 || j >= t.length) return;
        if (f.share[i] !== null) up[j].push(f.share[i]);
        if (f.excess[i] !== null) dn[j].push(Math.max(f.excess[i], 0));
      });
      const c = d.cell_total;
      if (c && c.t) {
        c.t.forEach((tv, i) => {
          if (tv < T0 || tv > T1 || !c.served[i]) return;
          const share = c.out[i] / (c.max_served || c.served[i]);
          if (!cellT.has(tv)) cellT.set(tv, []);
          cellT.get(tv).push(share);
        });
      }
    }
    const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
    const sum = (a) => (a.length ? a.reduce((s, v) => s + v, 0) : null);
    return {
      t,
      up: up.map(mean),
      sewer: dn.map(stormKey === ALL ? sum : sum),
      cell: t.map((tv) => (cellT.has(tv) ? mean(cellT.get(tv)) : null)),
      cellDays: [...cellT.keys()].sort((a, b) => a - b).length,
    };
  }

  function recoveryDay(values, t, peakIdx, level = 0.1) {
    const peak = values[peakIdx];
    if (peak === null || peak <= 0) return null;
    for (let i = peakIdx; i < values.length; i++) {
      if (values[i] !== null && values[i] < level * peak) return t[i];
    }
    return null;
  }

  function argmax(values) {
    let best = -1;
    let idx = null;
    values.forEach((v, i) => { if (v !== null && v > best) { best = v; idx = i; } });
    return idx;
  }

  // ---------------------------------------------------------------- facts
  function facts(stormKey, lifeline) {
    const s = stormKey === ALL ? null : meta.storms[stormKey];
    const name = s ? s.name : "all nine storms";
    const out = { name };

    // propagation
    if (lifeline === "sewer") {
      const pooled = dose.model_A.find((m) => m.dose === "lx");
      const two = dose.summary.two_doses;
      out.propagation = {
        headline: `IRR ${fmt.num(pooled.irr)} (${fmt.num(pooled.irr_lo)} to ${fmt.num(pooled.irr_hi)}) per log unit of customer-hours per customer, outage alone; ${fmt.num(two.irr_outage_with_rain)} with rainfall in the model`,
        badge: sigBadge(pooled.irr_lo, pooled.irr_hi, 1, pooled.p),
        rows: [],
      };
      if (s) {
        const ss = dose.storm_slopes.find((r) => r.key === stormKey);
        if (ss) {
          out.propagation.rows.push(`${name}: slope ${fmt.num(ss.slope)} (${fmt.num(ss.lo)} to ${fmt.num(ss.hi)}) against the pooled ${fmt.num(ss.pooled_slope)}, ${ss.windows_with_release} of ${ss.n_windows} county-windows with a release`);
          out.propagation.stormBadge = sigBadge(ss.lo, ss.hi, 0, ss.p);
        }
        out.propagation.rows.push(`${fmt.count(s.n_sewer)} releases in the window, ${fmt.count(Math.round(s.excess))} above the county baselines, ${fmt.count(s.n_power)} naming a loss of power`);
      } else {
        out.propagation.rows.push("Wind, surge and housing damage add no detectable information once the outage dose and rainfall are in the model (seven storms with hazard data)");
      }
    } else {
      const pooled = dose.cell_models.find((m) => m.model === "P0 pooled");
      out.propagation = {
        headline: `OR ${fmt.num(pooled.or)} (${fmt.num(pooled.or_lo)} to ${fmt.num(pooled.or_hi)}) of a cell site being out per log unit of customer-hours per customer, county and storm fixed effects`,
        badge: sigBadge(pooled.or_lo, pooled.or_hi, 1, pooled.p),
        rows: [],
      };
      if (s) {
        const ss = dose.cell_models.find((m) => m.model === "A2 storm slopes" && m.term === s.name);
        if (ss) {
          out.propagation.rows.push(`${name}: OR ${fmt.num(ss.or, 1)} (${fmt.num(ss.or_lo, 1)} to ${fmt.num(ss.or_hi, 1)})`);
          out.propagation.stormBadge = sigBadge(ss.or_lo, ss.or_hi, 1, ss.p);
        }
        const cs = (dose.cell_summary.cause_split || []).find((r) => r.storm === s.name);
        if (cs && cs.power_share_of_out !== null && cs.power_share_of_out !== undefined) {
          out.propagation.rows.push(`On the peak report day the FCC attributed ${fmt.pct(cs.power_share_of_out, 0)} of the ${fmt.count(cs.sites_out)} sites out to lost power`);
        } else if (s.year < 2020) {
          out.propagation.rows.push("No cause split: the FCC reported causes only from Sally 2020 on");
        }
      }
    }

    // buffering
    if (lifeline === "sewer") {
      const rows = rec.wet_well.filter((r) => (stormKey === ALL || r.storm === stormKey) && r.first_release_t !== null);
      const onset = rows.filter((r) => r.buffer_days === 0).length;
      const n = rows.length;
      out.buffering = {
        headline: n ? `${fmt.pct(onset / n, 0)} of the ${n} county-storms that released did so on the day their outage began` : "no county-storm reached the outage-onset threshold",
        badge: n >= 10 ? { cls: "ok", text: `${n} county-storms` } : { cls: "weak", text: `only ${n} county-storms` },
        rows: ["Release dates are recorded by day, so a buffer shorter than one day is not observable; the first recorded release in a county is not the endurance of any one lift station"],
      };
      if (stormKey === ALL) {
        const lag0 = dose.lag.find((r) => r.lag === 0);
        out.buffering.rows.unshift(`County-day model: same-day dose IRR ${fmt.num(lag0.irr)} (${fmt.num(lag0.irr_lo)} to ${fmt.num(lag0.irr_hi)}); the same-day and next-day terms carry ${fmt.pct(dose.summary.model_C.share_lag_0_1, 0)} of the summed lag response`);
      }
    } else {
      const b = dose.cell_summary.buffering;
      out.buffering = {
        headline: `Same-day dose OR ${fmt.num(b.same_day_or)} against previous-day OR ${fmt.num(b.previous_day_or)}: the response does not carry into the next report day`,
        badge: { cls: "ok", text: "pooled, all reporting county-days" },
        rows: [`Sites on backup power today predict sites out for lack of power tomorrow (Spearman ${fmt.num(b.spearman_backup_today_vs_out_power_tomorrow)}): batteries buy hours, not days`,
          "Reports are daily and the reporting area shrinks as the storm passes, so a buffer within the day is not observable"],
      };
    }

    // recovery autonomy
    if (lifeline === "sewer") {
      const row = rec.end_cause.find((r) => (stormKey === ALL ? r.window === "All storm windows" : r.key === stormKey || r.window === (s && s.name)));
      const leads = rec.lead.filter((r) => (stormKey === ALL || r.window === stormKey) && r.end_class === "operator" && r.lead_days !== null);
      const med = leads.length ? median(leads.map((r) => r.lead_days)) : null;
      const before = leads.length ? leads.filter((r) => r.lead_days > 0).length / leads.length : null;
      out.recovery = {
        headline: row ? `${fmt.pct(row.autonomy_among_stated, 0)} of the ${row.stated_n} power-caused releases with a stated end name an operator action (broad rule, ${fmt.pct(row.autonomy_lo, 0)} to ${fmt.pct(row.autonomy_hi, 0)}); ${fmt.pct(row.autonomy_strict_among_stated, 0)} name equipment that kept the station pumping (strict rule)` : "no power-caused releases in this window",
        badge: wilsonBadge(row ? row.autonomy_among_stated : null, row ? row.stated_n : 0),
        rows: [],
      };
      if (row) out.recovery.rows.push(`${fmt.pct(row.unstated_share, 0)} of the ${row.n} power-caused releases do not say how they ended`);
      if (med !== null) out.recovery.rows.push(`Operator-ended releases finished a median ${fmt.num(med, 0)} days before county restoration (${fmt.pct(before, 0)} before it; n = ${leads.length})`);
      out.recovery.rows.push("An early end proves the operator acted only where the narrative says so: the county milestone cannot tell a feeder restored early from a generator");
    } else {
      const row = rec.cell_lead_summary.find((r) => (stormKey === ALL ? false : r.storm === s.name));
      if (stormKey === ALL) {
        const all = rec.cell_lead.filter((r) => r.lead_half_days !== null);
        const med = median(all.map((r) => r.lead_half_days));
        const first = all.filter((r) => r.lead_half_days > 0).length / all.length;
        out.recovery = {
          headline: `Cell sites reach half-recovery a median ${fmt.num(med, 1)} days before the grid; cells first in ${fmt.pct(first, 0)} of ${all.length} county-storms`,
          badge: { cls: "ok", text: `${all.length} county-storms with a cell peak of at least 10%` }, rows: [],
        };
      } else if (row && row.county_storms) {
        out.recovery = {
          headline: `${name}: median lead ${row.median_lead_half === 0 ? "0" : fmt.num(row.median_lead_half, 1)} days, cells before the grid in ${fmt.pct(row.share_cell_first_half, 0)} of ${fmt.count(row.county_storms)} county-storms`,
          badge: row.county_storms >= 10 ? { cls: "ok", text: `${fmt.count(row.county_storms)} county-storms` } : { cls: "weak", text: `only ${fmt.count(row.county_storms)} county-storms` }, rows: [],
        };
      } else {
        out.recovery = { headline: "no county-storm with a cell peak of at least 10%", badge: { cls: "none", text: "not measurable" }, rows: [] };
      }
      out.recovery.rows.push("The record does not say what brought a site back (generator, refuelling, a restored feeder), so cellular recovery autonomy is timing only");
    }

    // adaptation
    if (lifeline === "sewer") {
      const era = s ? dose.era.find((r) => r.era === s.era) : null;
      const mb = dose.summary.model_B_era;
      const noRain = dose.summary.model_B_era_without_rain;
      out.adaptation = {
        headline: `Era slopes ${dose.era.map((r) => fmt.num(r.slope)).join(" / ")} (2017-18 / 2020-23 / 2024) with rainfall held fixed; equal-slope test ${fmt.pval(mb.p)}; 2024 minus 2017-18 = ${fmt.num(mb.difference_2024_minus_2017)} (${fmt.num(mb.lo)} to ${fmt.num(mb.hi)})`,
        badge: mb.p < 0.05 ? { cls: "ok", text: "slopes differ" } : { cls: "weak", text: `no detectable change across eras (${fmt.pval(mb.p)}); without the rainfall term ${fmt.pval(noRain.p)}` },
        rows: [],
      };
      if (era) out.adaptation.rows.push(`${name} belongs to the ${era.era} era: slope ${fmt.num(era.slope)} (${fmt.num(era.lo)} to ${fmt.num(era.hi)})`);
      const pairs = adapt.pair_tests.filter((p) => stormKey === ALL || p.pair.includes(s.label));
      for (const p of pairs.slice(0, stormKey === ALL ? 4 : 3)) {
        const ptxt = p.wilcoxon_p_rate === null || Number.isNaN(p.wilcoxon_p_rate) ? "too few pairs to test" : `Wilcoxon ${fmt.pval(p.wilcoxon_p_rate)}`;
        out.adaptation.rows.push(`${p.pair}: ${p.counties} counties struck twice, median second-to-first release ratio ${fmt.num(p.median_ratio_second_over_first)}, ${ptxt}`);
      }
      const eras = rec.summary.autonomy_by_era_same_counties;
      out.adaptation.rows.push(`Operator share among stated ends by era, same counties: broad ${eras.map((e) => fmt.pct(e.autonomy_broad, 0)).join(" / ")}, strict ${eras.map((e) => fmt.pct(e.autonomy_strict, 0)).join(" / ")}: the rise appears only under the broad rule`);
    } else {
      const eras = dose.cell_models.filter((m) => m.model === "A1 era slopes");
      const a = dose.cell_summary.adaptation;
      out.adaptation = {
        headline: `Era odds ratios ${eras.map((r) => fmt.num(r.or, 1)).join(" / ")} (2017-18 / 2020-23 / 2024); 2024 against 2017-18 Wald ${fmt.pval(a.p)}`,
        badge: { cls: "weak", text: "detectable, but the reporting roster and area differ by storm (DIRS became mandatory only in February 2025)" },
        rows: ["A rising odds ratio here can be a changing set of carriers and counties as much as a changing network"],
      };
    }
    return out;
  }

  function median(a) {
    const b = [...a].sort((x, y) => x - y);
    const n = b.length;
    return n ? (n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2) : null;
  }

  // ---------------------------------------------------------------- draw
  async function draw() {
    const life = LIFELINES.find((l) => l.key === state.lifeline);
    const ser = await series(state.storm);
    const fx = facts(state.storm, state.lifeline);
    const down = ser[state.lifeline];
    const haveDown = down.some((v) => v !== null && v > 0);

    const f = figure(chartHost, { width: W, height: H, margin: { top: 30, right: 70, bottom: 60, left: 62 },
      label: `Grid outage and ${life.label.toLowerCase()} disruption, ${fx.name}` });
    const x = linear([T0, T1], [0, f.w]);
    const upMax = Math.max(0.05, ...ser.up.filter((v) => v !== null));
    const dnMax = Math.max(1e-9, ...down.filter((v) => v !== null));
    const yUp = linear([0, upMax * 1.15], [f.h, 0]);
    const yDn = linear([0, dnMax * 1.15], [f.h, 0]);

    // upstream area and line
    const pts = ser.t.map((tv, i) => ({ t: tv, v: ser.up[i] }));
    let area = "";
    pts.forEach((p, i) => {
      if (p.v === null) return;
      area += `${area ? "L" : "M"}${x(p.t).toFixed(1)},${yUp(p.v).toFixed(1)}`;
    });
    const firstX = x(pts.find((p) => p.v !== null)?.t ?? T0);
    const lastX = x([...pts].reverse().find((p) => p.v !== null)?.t ?? T1);
    f.add(svg("path", { d: `${area}L${lastX},${f.h}L${firstX},${f.h}Z`, fill: LIGHT, opacity: 0.55 }));
    f.add(svg("path", { d: linePath(pts, (p) => x(p.t), (p) => (p.v === null ? null : yUp(p.v))),
      fill: "none", stroke: GRAY, "stroke-width": 3 }));

    // downstream line
    const dpts = ser.t.map((tv, i) => ({ t: tv, v: down[i] }));
    if (haveDown) {
      f.add(svg("path", { d: linePath(dpts, (p) => x(p.t), (p) => (p.v === null ? null : yDn(p.v))),
        fill: "none", stroke: life.color, "stroke-width": 3, "stroke-linejoin": "round" }));
      if (state.lifeline === "cell") {
        for (const p of dpts) {
          if (p.v === null) continue;
          f.add(svg("circle", { cx: x(p.t), cy: yDn(p.v), r: 4, fill: "#fff", stroke: life.color, "stroke-width": 2 }));
        }
      }
    }

    // landfall
    f.add(svg("line", { x1: x(0), x2: x(0), y1: 0, y2: f.h, stroke: INK, "stroke-width": 1, "stroke-dasharray": "2 3" }));
    f.add(svg("text", { transform: `translate(${x(0) - 5},${f.h - 8}) rotate(-90)`, "text-anchor": "start", "font-size": 12,
      fill: MUTED, "font-style": "italic", text: "landfall, the grid fails" }));

    axisX(f, x, { values: [-2, 0, 2, 4, 6, 8, 10, 12, 14], format: (v) => String(v) });
    axisY(f, yUp, { n: 5, format: (v) => fmt.pct(v, 0) });
    f.add(svg("text", { x: -f.h / 2, y: -46, transform: "rotate(-90)", "text-anchor": "middle", "font-size": 11.5, fill: GRAY,
      text: "Customers without power, declared counties" }));
    f.add(svg("text", { x: f.w / 2, y: f.h + 40, "text-anchor": "middle", "font-size": 11.5, fill: INK, text: "Days since landfall" }));
    // right axis for the lifeline
    const gR = svg("g", { transform: `translate(${f.w},0)` });
    for (const v of yDn.ticks(4)) {
      if (v > dnMax * 1.15) continue;
      gR.appendChild(svg("line", { x1: 0, x2: 4, y1: yDn(v), y2: yDn(v), stroke: RULE }));
      gR.appendChild(svg("text", { x: 8, y: yDn(v) + 4, "font-size": 11, fill: life.color,
        text: state.lifeline === "cell" ? fmt.pct(v, 0) : fmt.count(Math.round(v)) }));
    }
    f.add(gR);
    f.add(svg("text", { x: f.h / 2, y: -f.w - 58, transform: "rotate(90)", "text-anchor": "middle", "font-size": 11.5, fill: life.color,
      text: life.axis }));

    // the geometry of the constructs on the curves
    if (haveDown) {
      const pi = argmax(down);
      const px = x(ser.t[pi]);
      // propagation: the downstream peak
      f.add(svg("line", { x1: px, x2: px, y1: yDn(down[pi]), y2: f.h, stroke: life.color, "stroke-width": 1.2 }));
      f.add(svg("text", { x: px + 6, y: yDn(down[pi]) - 6, "font-size": 13, fill: life.color, "font-weight": 600, text: "Propagation" }));
      // buffering: landfall to the first downstream rise
      const first = dpts.find((p) => p.t >= 0 && p.v !== null && p.v > 0.15 * dnMax);
      if (first) {
        const y0 = 12;
        f.add(svg("path", { d: `M${x(0)},${y0 + 6}V${y0}H${x(first.t)}V${y0 + 6}`, fill: "none", stroke: INK, "stroke-width": 1 }));
        f.add(svg("text", { x: (x(0) + x(first.t)) / 2 + (first.t === 0 ? 40 : 0), y: y0 - 3, "text-anchor": "middle", "font-size": 13, fill: INK, "font-weight": 600,
          text: first.t === 0 ? "Buffering: none within the day" : `Buffering: ${first.t} day${first.t > 1 ? "s" : ""}` }));
      }
      // recovery autonomy: downstream back to 10% of its peak against the grid
      const upPeak = argmax(ser.up);
      const rDn = recoveryDay(down, ser.t, pi);
      const rUp = recoveryDay(ser.up, ser.t, upPeak);
      if (rDn !== null) {
        f.add(svg("line", { x1: x(rDn), x2: x(rDn), y1: f.h - 8, y2: f.h, stroke: life.color, "stroke-width": 1.5 }));
      }
      if (rUp !== null) {
        f.add(svg("line", { x1: x(rUp), x2: x(rUp), y1: f.h - 8, y2: f.h, stroke: GRAY, "stroke-width": 1.5 }));
      }
      const lastT = [...dpts].reverse().find((p) => p.v !== null)?.t;
      const lab = rDn !== null && rUp !== null
        ? `Recovery autonomy: ${life.label.toLowerCase()} back to a tenth of its peak on day ${rDn}, the grid on day ${rUp}`
        : rDn !== null ? `Recovery: ${life.label.toLowerCase()} back to a tenth of its peak on day ${rDn}; the grid had not reached a tenth of its peak by day ${T1}`
          : state.lifeline === "cell" && lastT !== undefined && lastT < T1
            ? `FCC reporting ended on day ${lastT}, before the sites fell to a tenth of their peak${rUp !== null ? `; the grid reached a tenth of its peak on day ${rUp}` : ""}`
            : `Neither curve fell to a tenth of its peak by day ${T1}`;
      f.add(svg("text", { x: f.w / 2, y: f.h + 54, "text-anchor": "middle", "font-size": 13, fill: INK, "font-weight": 600, text: lab }));
    } else {
      f.add(svg("text", { x: f.w / 2, y: f.h / 2, "text-anchor": "middle", "font-size": 13, fill: MUTED,
        text: state.lifeline === "cell" ? "No FCC DIRS table covers this storm's counties in the window" : "No excess releases in the window" }));
    }

    // hover
    const hit = svg("rect", { x: 0, y: 0, width: f.w, height: f.h, fill: "transparent" });
    hit.addEventListener("mousemove", (ev) => {
      const r = f.root.getBoundingClientRect();
      const tv = Math.round(T0 + ((ev.clientX - r.left) / r.width * W - f.m.left) / f.w * (T1 - T0));
      const i = tv - T0;
      if (i < 0 || i >= ser.t.length) { tip.hide(); return; }
      const rows = [["Customers without power", ser.up[i] === null ? "no record" : fmt.pct(ser.up[i], 1)]];
      if (state.lifeline === "sewer") rows.push(["Excess sewer releases that day", down[i] === null ? "no record" : fmt.count(Math.round(down[i]))]);
      else rows.push(["Cell sites out", down[i] === null ? "no report that day" : fmt.pct(down[i], 1)]);
      tip.show(ev, { title: `Day ${tv}${tv === 0 ? " (landfall)" : ""}`, rows });
    });
    hit.addEventListener("mouseleave", tip.hide);
    f.add(hit);

    renderCards(fx);
    renderLimits(state.lifeline);
  }

  function badge(b) {
    return el(`span.tc-badge.${b.cls}`, { text: b.text });
  }

  function renderCards(fx) {
    clear(cards);
    const items = [
      ["Propagation", "How much of the grid's failure reaches the lifeline?", fx.propagation],
      ["Buffering", "How long does it hold before the first recorded disruption?", fx.buffering],
      ["Recovery autonomy", "Does it come back before the grid, and by what means?", fx.recovery],
      ["Adaptation", "Has any of this changed across the storms?", fx.adaptation],
    ];
    for (const [title, q, d] of items) {
      const card = el("article.tc-card", {}, [
        el("h3", { text: title }),
        el("p.tc-q", { text: q }),
        el("p.tc-head", { text: d.headline }),
        el("p.tc-badges", {}, [badge(d.badge), d.stormBadge ? badge(d.stormBadge) : null]),
        el("ul", {}, d.rows.map((r) => el("li", { text: r }))),
      ]);
      cards.appendChild(card);
    }
  }

  function renderLimits(lifeline) {
    clear(limits);
    const common = [
      "Buffers shorter than a day: release dates and cell reports are daily, so the curves cannot show a station holding for six hours",
      "Feeder-level restoration: county outage shares cannot tell a lift station whose feeder came back early from one kept running by a generator; only the narratives can",
      "When mitigation equipment went into service: the grant record dates approval and closeout, not installation",
      "Harm: neither a release count nor a share of sites out measures gallons reaching water or people without coverage",
      `Silent county-windows: ${dose.summary.model_D.n_silent_windows} heavily exposed windows filed almost nothing where about ${fmt.count(Math.round(dose.summary.model_D.predicted_total))} releases were expected (${fmt.count(Math.round(dose.summary.model_D.predicted_lo))} to ${fmt.count(Math.round(dose.summary.model_D.predicted_hi))}); the curves show what was filed`,
    ];
    const cell = [
      "Cause and backup-power splits exist only from Sally 2020; Irma and Michael show sites out without a cause",
      "Reporting was voluntary and the reporting area shrinks as a storm passes, so a county can leave the table before its sites recover",
    ];
    limits.append(
      el("h3", { text: "What these curves cannot show" }),
      el("ul", {}, (lifeline === "cell" ? common.concat(cell) : common).map((r) => el("li", { text: r }))),
    );
  }

  draw();
}
