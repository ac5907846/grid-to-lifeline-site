/* What the notices say: the stated cause mix by storm, the words
   that separate a storm's notices from the baseline, and a searchable
   browser of every sewer notice in the nine windows, each with its
   coordinates and its incident number for the FDEP portal. */

import { el, svg, clear, control, segmented, select, chips, checkbox } from "../lib/dom.js";
import { figure, axisX } from "../lib/chart.js";
import { linear } from "../lib/scale.js";
import { legend, table } from "../lib/bars.js";
import * as fmt from "../lib/format.js";
import { INK, MUTED, NAVY, PINK, CAUSE, CAUSE_ORDER, END, LIGHT } from "../lib/palette.js";
import * as tip from "../lib/tooltip.js";

const W = 900;
const PAGE = 40;

export function noticesChart(host, app) {
  const meta = app.meta;
  const N = app.notices;
  const state = { comparison: null, storms: new Set(meta.order), cause: "all", end: "all", county: "all", q: "", sort: "start", dir: 1, page: 0, open: null };

  const causeHost = el("div.figure");
  const termBar = el("div.controls");
  const termHost = el("div.figure");
  const bar = el("div.controls.rows");
  const countHost = el("p.note");
  const tableHost = el("div");
  const pager = el("div.control-row", { style: { marginTop: ".6rem", alignItems: "center", gap: ".8rem" } });
  const capHost = el("p.caption");
  clear(host).append(
    el("h4.algo", { text: "A. Stated cause of the sewer releases in each storm window, and outside every storm frame" }), causeHost,
    el("h4.algo", { text: "B. The words that separate a storm's notices from the baseline (weighted log-odds, top 25 by z)" }), termBar, termHost,
    el("h4.algo", { text: "C. Every sewer notice in the nine windows" }), bar, countHost, tableHost, pager, capHost);

  // A. cause mix
  function drawCauses() {
    const rows = N.cause_by_storm.slice().sort((a, b) => meta.order.indexOf(a.key) - meta.order.indexOf(b.key));
    const f = figure(causeHost, { width: W, height: rows.length * 28 + 40, label: "Cause mix", margin: { top: 6, right: 80, bottom: 42, left: 110 } });
    const x = linear([0, 1], [0, f.w]);
    axisX(f, x, { label: "Share of releases in the window", values: [0, 0.25, 0.5, 0.75, 1], format: (v) => fmt.pct(v, 0) });
    rows.forEach((r, i) => {
      const y0 = i * 28 + 3;
      let cx = 0;
      for (const c of CAUSE_ORDER) {
        const v = r[`${c}_n`] || 0;
        const w = r.n ? (v / r.n) * f.w : 0;
        const rect = f.add(svg("rect", { x: cx, y: y0, width: w, height: 21, fill: CAUSE[c].color, stroke: "#fff", "stroke-width": 0.6, style: { cursor: "pointer" } }));
        rect.addEventListener("mousemove", (ev) => tip.show(ev, { title: `${r.window}: ${CAUSE[c].label}`, rows: [["Releases", fmt.count(v)], ["Share", fmt.pct(r.n ? v / r.n : 0, 0)]], note: "Select to filter the table." }));
        rect.addEventListener("mouseleave", tip.hide);
        rect.addEventListener("click", () => { if (r.key !== "baseline") { state.storms = new Set([r.key]); } state.cause = c; state.page = 0; buildBar(); drawTable(); });
        cx += w;
      }
      f.add(svg("text", { x: -8, y: y0 + 15, "text-anchor": "end", "font-size": 11, fill: INK, text: r.window }));
      f.add(svg("text", { x: f.w + 8, y: y0 + 15, "font-size": 11, fill: MUTED, text: `n = ${fmt.count(r.n)}` }));
    });
    causeHost.appendChild(legend(CAUSE_ORDER.map((c) => ({ label: CAUSE[c].label, color: CAUSE[c].color, kind: "swatch" }))));
  }

  // B. terms
  const comps = [...new Set(N.terms.map((t) => t.comparison))];
  state.comparison = comps.find((c) => c.startsWith("Ian")) || comps[0];
  termBar.appendChild(control("Comparison", select(comps.map((c) => ({ key: c, label: c })), state.comparison, (v) => { state.comparison = v; drawTerms(); })));
  function drawTerms() {
    const rows = N.terms.filter((t) => t.comparison === state.comparison).sort((a, b) => b.z - a.z).slice(0, 25);
    const f = figure(termHost, { width: W, height: rows.length * 18 + 40, label: "Terms", margin: { top: 6, right: 60, bottom: 44, left: 150 } });
    const mx = Math.max(...rows.map((t) => t.z));
    const x = linear([0, mx * 1.05], [0, f.w]);
    axisX(f, x, { label: "z of the weighted log-odds (Monroe et al., 2008)", grid: true });
    rows.forEach((t, i) => {
      const y0 = i * 18 + 2;
      const rect = f.add(svg("rect", { x: 0, y: y0, width: x(t.z), height: 14, fill: NAVY, style: { cursor: "pointer" } }));
      f.add(svg("text", { x: -8, y: y0 + 11, "text-anchor": "end", "font-size": 11, fill: INK, text: t.term }));
      f.add(svg("text", { x: x(t.z) + 6, y: y0 + 11, "font-size": 10.5, fill: MUTED, text: `${t.n_i} vs ${t.n_j}` }));
      rect.addEventListener("mousemove", (ev) => tip.show(ev, { title: t.term, rows: [["In the storm's notices", fmt.count(t.n_i)], ["In the baseline", fmt.count(t.n_j)], ["Log-odds", fmt.num(t.log_odds, 2)], ["z", fmt.num(t.z, 1)]], note: "Select to search the table for this term." }));
      rect.addEventListener("mouseleave", tip.hide);
      rect.addEventListener("click", () => { state.q = t.term; state.page = 0; buildBar(); drawTable(); });
    });
  }

  // C. table
  const counties = [...new Set(N.rows.map((r) => r.county))].filter(Boolean).sort();
  function buildBar() {
    clear(bar);
    const row1 = el("div.controls-row");
    row1.appendChild(control("Storm windows", chips(meta.order.map((k) => ({ key: k, label: meta.storms[k].label, color: meta.storms[k].color })), state.storms, () => { state.page = 0; drawTable(); }, { min: 1 })));
    const row2 = el("div.controls-row");
    row2.appendChild(control("Stated cause", select([{ key: "all", label: "All causes" }].concat(CAUSE_ORDER.map((c) => ({ key: c, label: CAUSE[c].label }))), state.cause, (v) => { state.cause = v; state.page = 0; drawTable(); })));
    row2.appendChild(control("How it ended", select([{ key: "all", label: "All" }].concat(Object.keys(END).map((c) => ({ key: c, label: END[c].label }))), state.end, (v) => { state.end = v; state.page = 0; drawTable(); })));
    row2.appendChild(control("County", select([{ key: "all", label: "All counties" }].concat(counties.map((c) => ({ key: c, label: c }))), state.county, (v) => { state.county = v; state.page = 0; drawTable(); })));
    const search = el("input", { type: "search", placeholder: "search the narratives, names, facilities", value: state.q, oninput: (e) => { state.q = e.target.value; state.page = 0; drawTable(); } });
    row2.appendChild(control("Search", search, { grow: true }));
    bar.append(row1, row2);
  }

  function filtered() {
    const q = state.q.trim().toLowerCase();
    return N.rows.filter((r) => state.storms.has(r.window)
      && (state.cause === "all" || r.cause === state.cause)
      && (state.end === "all" || r.end_class === state.end)
      && (state.county === "all" || r.county === state.county)
      && (!q || `${r.name} ${r.facility} ${r.text} ${r.city}`.toLowerCase().includes(q)));
  }

  function drawTable() {
    const rows = filtered().sort((a, b) => {
      const va = a[state.sort]; const vb = b[state.sort];
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      return (va < vb ? -1 : va > vb ? 1 : 0) * state.dir;
    });
    const gal = rows.reduce((s, r) => s + (r.gallons || 0), 0);
    const power = rows.filter((r) => r.cause === "power").length;
    countHost.textContent = `${fmt.count(rows.length)} notices; ${fmt.count(power)} name lost power; ${fmt.count(gal)} gallons stated in ${fmt.count(rows.filter((r) => r.gallons).length)} of them. Select a row to read the narrative.`;
    const start = state.page * PAGE;
    const page = rows.slice(start, start + PAGE);
    clear(tableHost);
    const cols = [
      { key: "start", label: "Release start", num: false },
      { key: "window", label: "Storm", fmt: (v) => meta.storms[v].label, num: false },
      { key: "county", label: "County", num: false },
      { key: "name", label: "Notice", num: false },
      { key: "cause", label: "Cause", fmt: (v) => (CAUSE[v] ? CAUSE[v].label.split(",")[0] : v), num: false },
      { key: "end_class", label: "Ended by", fmt: (v) => (END[v] ? END[v].label.split(":")[0] : ""), num: false },
      { key: "gallons", label: "Gallons", fmt: (v) => (v ? fmt.count(v) : "") },
      { key: "duration_h", label: "Hours", fmt: (v) => (v === null ? "" : fmt.num(v, 0)) },
      { key: "report_lag_h", label: "Filed after (h)", fmt: (v) => (v === null ? "" : fmt.num(v, 0)) },
    ];
    const t = table(tableHost, cols, page, { onRow: (r, tr) => {
      const next = tr.nextSibling;
      if (next && next.classList && next.classList.contains("detail")) { next.remove(); return; }
      const d = el("tr.detail", {}, [el("td", { colSpan: cols.length }, [
        el("p", { text: r.text || "(no narrative)" }),
        el("p.note", {}, [
          `Incident ${r.incident_number}; ${r.facility ? r.facility + ", " : ""}${r.city || ""}; reported ${r.reported}; asset ${r.asset || "n/a"}; medium ${r.medium || "n/a"}. `,
          el("a", { href: "https://prodenv.dep.state.fl.us/DepPNP/reports/viewIncidentDetails", target: "_blank", rel: "noopener", text: "FDEP portal (search the incident number)" }),
          r.lat ? " · " : "",
          r.lat ? el("a", { href: `https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lon}#map=14/${r.lat}/${r.lon}`, target: "_blank", rel: "noopener", text: "map" }) : "",
        ]),
      ])]);
      tr.after(d);
    } });
    // sortable headers
    t.querySelectorAll("thead th").forEach((th, i) => {
      th.style.cursor = "pointer";
      th.addEventListener("click", () => { const k = cols[i].key; if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = 1; } drawTable(); });
    });
    clear(pager);
    const pages = Math.max(1, Math.ceil(rows.length / PAGE));
    pager.append(
      el("button.btn-quiet", { type: "button", text: "Previous", disabled: state.page === 0, onclick: () => { state.page -= 1; drawTable(); } }),
      el("span.readout", { text: `page ${state.page + 1} of ${pages}` }),
      el("button.btn-quiet", { type: "button", text: "Next", disabled: state.page >= pages - 1, onclick: () => { state.page += 1; drawTable(); } }),
    );
  }

  capHost.innerHTML = "<b>Power causes the count; rain causes the volume.</b> In the four grid-breaking hurricanes the operators named lost power or a failed generator as the cause in two fifths to three fifths of the notices, against one in twenty at baseline; the rain storms name wet weather. Each notice is public: the incident number finds it on the FDEP portal, the coordinates find the manhole.";

  drawCauses();
  drawTerms();
  buildBar();
  drawTable();
}
