/* Data and reproduction: the public records with links to where they
   live, the stage pipeline with every result file it writes, the
   figure-to-stage map, and how to rebuild. */

import { el, clear } from "../lib/dom.js";
import { table } from "../lib/bars.js";
import * as fmt from "../lib/format.js";

export function dataPage(host, app) {
  const S = app.sources;
  const meta = app.meta;
  clear(host);

  host.appendChild(el("h3.rule", { text: "1. The public records" }));
  host.appendChild(el("p", { text: "Every input is a public record with a stable home. The links go to the holder's own page or service; the raw files are read by the download scripts named in the repository." }));
  const src = el("div.sources");
  const t = el("table");
  t.appendChild(el("thead", {}, [el("tr", {}, ["Dataset", "Holder", "What it gives the paper", "Records used", "Where it lives", "Stages"].map((h) => el("th", { text: h })))]));
  const tb = el("tbody");
  for (const s of S.sources) {
    tb.appendChild(el("tr", {}, [
      el("td", { text: s.name }), el("td", { text: s.holder }), el("td", { text: s.what }), el("td", { text: s.records }),
      el("td", {}, s.links.map((l) => el("div", {}, [el("a", { href: l[1], target: "_blank", rel: "noopener", text: l[0] })]))),
      el("td", { text: s.stages.join(", ") }),
    ]));
  }
  t.appendChild(tb);
  src.appendChild(t);
  host.appendChild(src);

  host.appendChild(el("h3.rule", { text: "2. The analysis pipeline" }));
  host.appendChild(el("p", { text: `Eighteen stages, one folder each, run top to bottom with py -3 analysis.py; every figure module reads only its own stage's results. ${S.stages.length} stages are listed from the folders on disk; select one to see the files it writes.` }));
  const stages = el("div");
  for (const st of S.stages) {
    const det = el("details.stage");
    det.appendChild(el("summary", {}, [el("b", { text: st.stage }), ` (${st.results.length} result files, ${st.figures.length} figures)`]));
    det.appendChild(el("p", { text: st.purpose }));
    det.appendChild(el("p.note", { text: "Results: " + st.results.join(", ") }));
    if (st.figures.length) det.appendChild(el("p.note", { text: "Figures: " + st.figures.join(", ") }));
    stages.appendChild(det);
  }
  host.appendChild(stages);

  host.appendChild(el("h3.rule", { text: "3. Which stage draws which figure" }));
  table(host, [
    { key: "figure", label: "Manuscript figure", num: false }, { key: "stage", label: "Stage", num: false }, { key: "file", label: "Figure file", num: false },
  ], S.figures);

  host.appendChild(el("h3.rule", { text: "4. The models in one place" }));
  const h = meta.headline;
  const d = app.dose;
  host.appendChild(el("p", { text: `Sewer propagation: negative binomial on releases in the county window, exposure customers per 100,000, county and storm fixed effects, dispersion ${fmt.num(h.alpha, 3)} from a discrete fit held fixed, county-clustered errors; ${fmt.count(h.n_windows)} county-windows. Cell propagation: binomial GLM on sites out of sites served with the same fixed effects, ${fmt.count(d.cell_summary.panel.county_days)} county-days. Buffering: Poisson quasi-likelihood on the county-day panel with county-by-storm and event-day fixed effects, six lagged doses and two rain terms. Recovery autonomy: end class read from the narrative by fixed regular expressions with precedence operator, grid, repair. Adaptation: storm and era slopes with likelihood-ratio and Wald tests, Wilcoxon signed-rank on storm pairs, and Model A refitted with the county's completed mitigation stock.` }));
  table(host, [
    { key: "term", label: "Sewer dose (Model A)", num: false }, { key: "irr", label: "IRR", fmt: (v) => fmt.num(v, 2) },
    { key: "ci", label: "95% CI", fmt: (_, r) => `${fmt.num(r.irr_lo, 2)} to ${fmt.num(r.irr_hi, 2)}` }, { key: "p", label: "p", fmt: (v) => fmt.pval(v) },
  ], d.model_A);
  table(host, [
    { key: "term", label: "County-day lag (Model C)", num: false }, { key: "irr", label: "IRR", fmt: (v) => fmt.num(v, 3) },
    { key: "ci", label: "95% CI", fmt: (_, r) => `${fmt.num(r.irr_lo, 2)} to ${fmt.num(r.irr_hi, 2)}` }, { key: "p", label: "p", fmt: (v) => fmt.pval(v) },
  ], d.lag);

  host.appendChild(el("h3.rule", { text: "5. Rebuild this site" }));
  host.appendChild(el("pre.pseudo", { text: "cd 06_Paper5_Cascade\\02_analysis\nfor s in a01..a18: py -3 <s>\\analysis.py; py -3 <s>\\figures.py\ncd ..\\05_webapp\npy -3 tools\\build_data.py      # rewrites data\\*.json from the results\npy -3 -m http.server 8000      # then open http://localhost:8000" }));
  host.appendChild(el("p.note", { text: meta.build_note }));
}
