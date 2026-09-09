/* The cascade in event time: for one storm, the daily sewer releases,
   the share of customers without power and the cell sites out, with a
   day scrubber that repaints a county map for that day and a play
   button that runs the storm. */

import { el, svg, clear, control, segmented, checkbox, slider } from "../lib/dom.js";
import { figure, axisX, axisY, linePath } from "../lib/chart.js";
import { linear } from "../lib/scale.js";
import { boundsOf, pathOf, projector, trackPath, centroid } from "../lib/geo.js";
import { legend } from "../lib/bars.js";
import * as fmt from "../lib/format.js";
import { INK, LAND, MUTED, NODATA, NAVY, PINK, GREEN, RULE, sequential, LIGHT } from "../lib/palette.js";
import * as tip from "../lib/tooltip.js";

const W = 640;
const H = 330;
const MW = 420;
const MH = 400;

export function cascadeChart(host, app) {
  const meta = app.meta;
  // deep links: ?storm=milton&t=2 opens that storm on that day, paused
  const q = new URLSearchParams(location.search);
  const state = { storm: meta.order.includes(q.get("storm")) ? q.get("storm") : "ian", frame: "declared",
    t: q.has("t") && !Number.isNaN(Number(q.get("t"))) ? Math.max(-7, Math.min(30, Number(q.get("t")))) : 0,
    playing: false, timer: null, layer: "share", showCell: true, autoplayed: q.has("t") };

  const bar = el("div.controls");
  const figHost = el("div.figure");
  const mapHost = el("div.figure");
  const side = el("div.sidecard.dayboard");
  const legHost = el("div");
  const capHost = el("p.caption");
  const grid = el("div.panelgrid.wide", {}, [
    el("div", {}, [figHost, legHost]),
    el("div", {}, [mapHost]),
  ]);
  // the day's numbers run the full width under the two panels
  clear(host).append(bar, grid, side, capHost);

  let day = null;
  const project = projector(pad2(boundsOf(app.geo.counties)), MW, MH, 8);
  function pad2([a, b, c, d]) {
    const px = (b - a) * 0.03;
    const py = (d - c) * 0.03;
    return [a - px, b + px, c - py, d + py];
  }
  const centers = new Map(app.geo.counties.map((c) => [c.fips, project(...centroid(c.rings))]));

  let sliderEl = null;
  function buildBar() {
    clear(bar);
    bar.appendChild(control("Storm", segmented(meta.order.map((k) => ({
      key: k, label: `${meta.storms[k].label} ${meta.storms[k].year}`, color: meta.storms[k].color,
    })), state.storm, (v) => { stop(); state.storm = v; state.t = 0; load(); }), { storms: true }));
    bar.appendChild(control("Counties", segmented([
      { key: "declared", label: "Declared (IA) counties" }, { key: "statewide", label: "Statewide" },
    ], state.frame, (v) => { state.frame = v; drawSeries(); renderSide(); })));
    bar.appendChild(control("Map fill", segmented([
      { key: "share", label: "Share without power" }, { key: "rain", label: "Rain that day" },
    ], state.layer, (v) => { state.layer = v; drawMap(); })));
    bar.appendChild(control("", checkbox("Cell sites out (FCC)", state.showCell, (v) => { state.showCell = v; drawSeries(); })));
    sliderEl = slider({ min: -7, max: 30, step: 1, value: state.t,
      format: (v) => `day <strong>${v >= 0 ? "+" : ""}${v}</strong>${day && day.dates ? " " + (day.dates[day.t.indexOf(v)] || "") : ""}` },
    (v) => { state.t = v; drawCursor(); drawMap(); renderSide(); });
    bar.appendChild(control("Event day (landfall = 0)", sliderEl, { grow: true }));
    // the play button sits on the map itself (see drawMap)
  }

  function setPlayLabel() {
    if (!state.playBtn) return;
    state.playBtn.innerHTML = state.playing ? "&#10074;&#10074; Pause" : "&#9654; Play";
    state.playBtn.setAttribute("aria-pressed", String(state.playing));
  }
  function start() {
    state.playing = true;
    setPlayLabel();
    state.timer = setInterval(() => {
      state.t = state.t >= 20 ? -3 : state.t + 1;
      sliderEl.input.value = state.t;
      sliderEl.output.innerHTML = `day <strong>${state.t >= 0 ? "+" : ""}${state.t}</strong> ${day.dates[day.t.indexOf(state.t)] || ""}`;
      drawCursor(); drawMap(); renderSide();
    }, 550);
  }
  function stop() {
    state.playing = false;
    setPlayLabel();
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
  }
  // the page opens playing; the first click anywhere (other than on
  // the play button itself) hands control back to the reader
  function autoplay() {
    if (state.autoplayed) return;
    state.autoplayed = true;
    start();
    const halt = (ev) => {
      if (state.playBtn && state.playBtn.contains(ev.target)) return;
      stop();
      document.removeEventListener("pointerdown", halt, true);
      document.removeEventListener("keydown", halt, true);
    };
    document.addEventListener("pointerdown", halt, true);
    document.addEventListener("keydown", halt, true);
  }

  async function load() {
    day = await app.days(state.storm);
    drawSeries();
    drawMap();
    renderSide();
    autoplay();
  }

  /** The storm centre at hour h after landfall, interpolated along the fixes. */
  function eyeAt(trk, h) {
    const H = trk.hours;
    if (!H || h < H[0] || h > H[H.length - 1]) return null;
    let k = 0;
    while (k < H.length - 2 && H[k + 1] < h) k += 1;
    const f = (h - H[k]) / ((H[k + 1] - H[k]) || 1);
    return { lon: trk.lon[k] + f * (trk.lon[k + 1] - trk.lon[k]), lat: trk.lat[k] + f * (trk.lat[k + 1] - trk.lat[k]),
      vmax: trk.vmax[k] + f * (trk.vmax[k + 1] - trk.vmax[k]) };
  }

  /** A hurricane glyph: two spiral arms around an eye, spinning by CSS. */
  function hurricaneGlyph(cx, cy, size, color) {
    const s = size;
    const arm = (sign) => `M0,${-0.28 * s * sign} C${0.55 * s * sign},${-0.35 * s * sign} ${0.75 * s * sign},${0.15 * s * sign} ${0.62 * s * sign},${0.62 * s * sign}`
      + ` C${0.7 * s * sign},${0.2 * s * sign} ${0.45 * s * sign},${-0.05 * s * sign} ${0.2 * s * sign},${-0.1 * s * sign}Z`;
    return svg("g", { class: "eye", transform: `translate(${cx.toFixed(1)},${cy.toFixed(1)})`, "pointer-events": "none" }, [
      svg("circle", { r: 0.62 * s + 6, fill: color, opacity: 0.12 }),
      svg("g", { class: "eye-spin" }, [
        svg("path", { d: arm(1), fill: color, opacity: 0.92 }),
        svg("path", { d: arm(-1), fill: color, opacity: 0.92 }),
        svg("circle", { r: 0.22 * s, fill: "#fff", stroke: color, "stroke-width": 1.6 }),
      ]),
    ]);
  }

  let cursorNode = null;
  let xScale = null;
  let fig = null;
  function drawSeries() {
    const fr = day.frames[state.frame] || day.frames.statewide;
    const ts = day.t;
    fig = figure(figHost, { width: W, height: H, label: "Event curves",
      margin: { top: 14, right: 56, bottom: 44, left: 56 } });
    const f = fig;
    const x = linear([-7.5, 30.5], [0, f.w]);
    xScale = x;
    const maxA = fr.active ? Math.max(0, ...fr.active.filter((v) => v !== null)) : 0;
    const maxS = Math.max(1, ...fr.sewer.filter((v) => v !== null), maxA);
    const y = linear([0, maxS * 1.15], [f.h, 0]);
    const cellMax = (state.showCell && day.cell_total.t.length) ? Math.max(...day.cell_total.out) / (day.cell_total.max_served || 1) : 0;
    const shareMax = Math.max(0.05, ...fr.share.filter((v) => v !== null), cellMax);
    const y2 = linear([0, Math.min(1, shareMax * 1.15)], [f.h, 0]);
    axisY(f, y, { label: "Sewer releases starting that day", labelPad: 42, n: 4 });
    axisX(f, x, { label: "Days from landfall", values: [-7, 0, 7, 14, 21, 28], format: (v) => (v > 0 ? `+${v}` : String(v)), grid: true });
    // right axis
    for (const v of y2.ticks(4)) {
      if (v > y2.domain[1]) continue;
      f.add(svg("text", { x: f.w + 8, y: y2(v) + 4, "font-size": 11, fill: MUTED, text: fmt.pct(v, 0) }));
    }
    f.add(svg("text", { transform: `translate(${f.w + 46},${f.h / 2}) rotate(90)`, "text-anchor": "middle", "font-size": 11.5, fill: MUTED, text: "Share of customers out / cell sites out" }));
    const bw = Math.max(2, (x(1) - x(0)) - 2);
    ts.forEach((t, i) => {
      const v = fr.sewer[i];
      if (v === null) return;
      const rect = f.add(svg("rect", { x: x(t) - bw / 2, y: y(v), width: bw, height: f.h - y(v),
        fill: t >= 0 && t <= 14 ? app.color(state.storm) : LIGHT, opacity: 0.85 }));
      rect.addEventListener("mousemove", (ev) => tip.show(ev, {
        title: `Day ${t >= 0 ? "+" : ""}${t} (${day.dates[i]})`,
        rows: [["Sewer releases", fmt.count(v)], ["Excess over baseline", fmt.num(fr.excess[i], 1)],
          ["Naming lost power", fmt.count(fr.power[i])], ["Notices filed that day", fmt.count(fr.reported[i])],
          ["Customers out (mean)", fmt.pct(fr.share[i], 1)]],
        note: "Select to move the map to this day." }));
      rect.addEventListener("mouseleave", tip.hide);
      rect.addEventListener("click", () => { state.t = t; sliderEl.input.value = t; sliderEl.input.dispatchEvent(new Event("input")); });
    });
    if (fr.active) {
      f.add(svg("path", { d: linePath(ts.map((t, i) => ({ t, v: fr.active[i] })), (p) => x(p.t), (p) => (p.v === null ? null : y(p.v))),
        fill: "none", stroke: NAVY, "stroke-width": 1.6, "stroke-dasharray": "4 3" }));
    }
    f.add(svg("path", { d: linePath(ts.map((t, i) => ({ t, v: fr.share[i] })), (p) => x(p.t), (p) => (p.v === null ? null : y2(p.v))),
      fill: "none", stroke: INK, "stroke-width": 2 }));
    if (state.showCell && day.cell_total.t.length) {
      const ct = day.cell_total;
      const den = ct.max_served || 1;
      const pts = ct.t.map((t, i) => ({ t, v: ct.out[i] / den }));
      const cellPath = linePath(pts, (p) => x(p.t), (p) => y2(p.v));
      f.add(svg("path", { d: cellPath, fill: "none", stroke: "#fff", "stroke-width": 5, opacity: 0.9 }));
      f.add(svg("path", { d: cellPath, fill: "none", stroke: GREEN, "stroke-width": 2.2, "stroke-dasharray": "5 3" }));
      pts.forEach((p, i) => {
        const dot = f.add(svg("circle", { cx: x(p.t), cy: y2(p.v), r: 4, fill: GREEN, stroke: "#fff", "stroke-width": 1.2, style: { cursor: "pointer" } }));
        dot.addEventListener("mousemove", (ev) => tip.show(ev, { title: `FCC report ${ct.date[i]} (${ct.doc[i]})`,
          rows: [["Cell sites out", fmt.count(ct.out[i])], ["Sites served in the area", fmt.count(ct.served[i])],
            ["Out for power", ct.power[i] === null ? "not reported" : fmt.count(ct.power[i])],
            ["Out for transport", ct.transport[i] === null ? "not reported" : fmt.count(ct.transport[i])],
            ["Damaged", ct.damage[i] === null ? "not reported" : fmt.count(ct.damage[i])],
            ["On backup power", ct.backup[i] === null ? "not reported" : fmt.count(ct.backup[i])]],
          note: "Select the point to open the FCC PDF." }));
        dot.addEventListener("mouseleave", tip.hide);
        dot.addEventListener("click", () => window.open(`https://docs.fcc.gov/public/attachments/${ct.doc[i]}A1.pdf`, "_blank"));
      });
    }
    drawCursor();
    clear(legHost).appendChild(legend([
      { label: "Sewer releases by release start (window days in color)", color: app.color(state.storm), kind: "swatch" },
      { label: "Releases recorded as still active that day (dashed navy)", color: NAVY, kind: "swatch" },
      { label: "Share of customers without power", color: INK, kind: "swatch" },
      { label: "Cell sites out, share of the storm's largest reporting area (dashed; select a point for the FCC PDF)", color: GREEN, kind: "swatch" },
    ]));
  }

  function drawCursor() {
    if (!fig) return;
    if (cursorNode) cursorNode.remove();
    cursorNode = fig.add(svg("g", {}, [
      svg("line", { x1: xScale(state.t), x2: xScale(state.t), y1: 0, y2: fig.h, stroke: PINK, "stroke-width": 1.5, "stroke-dasharray": "2 2" }),
      svg("text", { x: xScale(state.t) + 4, y: 11, "font-size": 11, fill: PINK, text: `day ${state.t >= 0 ? "+" : ""}${state.t}` }),
    ]));
  }

  function drawMap() {
    const f = figure(mapHost, { width: MW, height: MH, label: "County map for the day",
      margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    f.add(svg("path", { d: pathOf(app.geo.context.rings, project), fill: LAND, stroke: "#fff", "stroke-width": 0.6 }));
    const i = day.t.indexOf(state.t);
    const rainMax = 150;
    for (const c of app.geo.counties) {
      const cd = day.counties[c.fips];
      let fill = NODATA;
      if (cd && i >= 0) {
        if (state.layer === "share") fill = cd.share[i] === null ? NODATA : sequential(Math.min(1, cd.share[i] / 1));
        else fill = cd.rain[i] === null ? NODATA : sequential(Math.min(1, cd.rain[i] / rainMax));
      }
      const w = app.window(c.fips, state.storm);
      const p = f.add(svg("path", { d: pathOf(c.rings, project), fill, stroke: "#fff", "stroke-width": w && w.ia ? 1.1 : 0.5 }));
      p.addEventListener("mousemove", (ev) => {
        const rows = [];
        if (cd && i >= 0) {
          rows.push(["Customers out (mean of the day)", fmt.pct(cd.share[i], 1)]);
          rows.push(["Peak that day", fmt.pct(cd.peak[i], 1)]);
          rows.push(["Rain (mm)", fmt.num(cd.rain[i], 0)]);
          rows.push(["Sewer releases starting", fmt.count(cd.sewer[i])]);
          rows.push(["Naming lost power", fmt.count(cd.power[i])]);
        }
        const cell = day.cells[c.fips];
        if (cell) {
          const j = cell.t.indexOf(state.t);
          if (j >= 0) rows.push(["Cell sites out", `${fmt.count(cell.out[j])} of ${fmt.count(cell.served[j])}`]);
        }
        tip.show(ev, { title: `${c.name} County`, rows, note: w && w.silent ? "Silent window in this storm." : "" });
      });
      p.addEventListener("mouseleave", tip.hide);
    }
    // releases that day as circles
    for (const c of app.geo.counties) {
      const cd = day.counties[c.fips];
      if (!cd || i < 0 || !cd.sewer[i]) continue;
      const [cx, cy] = centers.get(c.fips);
      f.add(svg("circle", { cx, cy, r: 3 + 2.2 * Math.sqrt(cd.sewer[i]), fill: PINK, "fill-opacity": 0.55, stroke: PINK, "stroke-width": 1, "pointer-events": "none" }));
    }
    const trk = app.geo.tracks[state.storm];
    if (trk) {
      const keep = trk.lon.map((_, k) => k).filter((k) => trk.lon[k] > -92 && trk.lon[k] < -76 && trk.lat[k] > 21 && trk.lat[k] < 34);
      if (keep.length > 1) {
        f.add(svg("path", { d: trackPath(keep.map((k) => trk.lon[k]), keep.map((k) => trk.lat[k]), project), fill: "none", stroke: INK, "stroke-width": 1.4, "pointer-events": "none", opacity: 0.7 }));
      }
    }
    // the storm centre at 12:00 UTC of the event day (the panels count
    // days in UTC from the landfall date), a spinning glyph sized by wind
    if (trk && trk.hours) {
      const eye = eyeAt(trk, state.t * 24 + 12 - (trk.landfall_hour || 0));
      if (eye) {
        const [ex, ey] = project(eye.lon, eye.lat);
        if (ex > -20 && ex < MW + 20 && ey > -20 && ey < MH + 20) {
          f.add(hurricaneGlyph(ex, ey, 9 + 0.16 * Math.max(0, eye.vmax - 30), app.color(state.storm)));
        }
      }
    }
    // the key sits in the Gulf, where the map is empty
    const kx = 10;
    const ky = Math.round(MH * 0.58);
    f.add(svg("text", { x: kx, y: ky, "font-size": 12, fill: INK, "font-weight": 600,
      text: `${app.name(state.storm)}, day ${state.t >= 0 ? "+" : ""}${state.t}` }));
    f.add(svg("text", { x: kx, y: ky + 16, "font-size": 10.5, fill: MUTED,
      text: state.layer === "share" ? "Fill: share of customers without power" : "Fill: county-average rain that day" }));
    f.add(svg("text", { x: kx, y: ky + 30, "font-size": 10.5, fill: MUTED, text: "Circles: sewer releases starting that day" }));
    f.add(svg("text", { x: kx, y: ky + 44, "font-size": 10.5, fill: MUTED, text: "Spiral: the storm centre at 12:00 UTC" }));
    // the play button, on the map
    if (!state.playBtn || !mapHost.contains(state.playBtn)) {
      const play = el("button.btn-play", { type: "button", "aria-pressed": "false",
        onclick: () => (state.playing ? stop() : start()) });
      mapHost.classList.add("map-stage");
      mapHost.appendChild(play);
      state.playBtn = play;
    }
    setPlayLabel();
  }

  function renderSide() {
    clear(side);
    const i = day.t.indexOf(state.t);
    const fr = day.frames[state.frame] || day.frames.statewide;
    side.append(el("h4", { text: `${app.name(state.storm)}: day ${state.t >= 0 ? "+" : ""}${state.t}` }));
    if (i < 0) return;
    const dl = el("div.kvgrid");
    const add = (k, v) => dl.append(el("div.kv", {}, [el("span.kv-k", { text: k }), el("span.kv-v", { text: v })]));
    add("Date", day.dates[i] || "");
    add("Sewer releases starting", fmt.count(fr.sewer[i]));
    if (fr.active) add("Releases recorded as active", fmt.count(fr.active[i]));
    add("Above the county baselines", fmt.num(fr.excess[i], 1));
    add("Naming lost power", fmt.count(fr.power[i]));
    add("Share of customers out", fmt.pct(fr.share[i], 1));
    const ct = day.cell_total;
    const j = ct.t.indexOf(state.t);
    if (j >= 0) {
      add("Cell sites out (FCC)", `${fmt.count(ct.out[j])} of ${fmt.count(ct.served[j])}`);
      if (ct.power[j] !== null) add("Out for lack of power", `${fmt.count(ct.power[j])} (${fmt.pct(ct.power[j] / (ct.out[j] || 1), 0)})`);
      dl.append(el("div.kv", {}, [el("span.kv-k", { text: "Source" }),
        el("a.kv-v", { href: `https://docs.fcc.gov/public/attachments/${ct.doc[j]}A1.pdf`, target: "_blank", rel: "noopener", text: `FCC report ${ct.doc[j]} (PDF)` })]));
    }
    side.append(dl);
    const s = meta.storms[state.storm];
    side.append(el("p.dayboard-foot", { text: `Landfall ${fmt.dateLabel(s.landfall)} at ${s.vmax} kt; ${s.ia_counties} counties with Individual Assistance; ${fmt.count(s.n_sewer)} sewer releases in the window, ${fmt.count(s.excess)} above baseline.` }));
  }

  capHost.innerHTML = "<b>The releases follow the outage on the day.</b> In every storm the sewer releases peak on the landfall day or the day after, on the day of the outage peak in eight of nine; the cell sites out rise with the outage and fall a day or so ahead of it. Drag the day or press play to watch the county map fill and empty; each FCC point opens the report it was read from.";

  buildBar();
  load();
}
