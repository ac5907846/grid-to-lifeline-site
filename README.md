# From grid failure to lifeline failure

Interactive companion site to the manuscript *From grid failure to
lifeline failure: measuring cross-infrastructure dependency and
resilience across nine Florida hurricanes* (Paper 5 of the series).

The site is a static web app: plain HTML, CSS, and ES modules, no
build step, no framework, no external requests. Every chart is drawn
in the browser from the JSON files in `data/`, which are generated
from the analysis outputs in `02_analysis/`. The site is anonymous
(no author, no affiliation) for review.

## Where it lives

GitHub: <https://github.com/ac5907846/grid-to-lifeline-site>. Hosted on
Cloudflare Pages as project `grid-to-lifeline`
(<https://grid-to-lifeline.pages.dev>, custom domain
<https://lifelines.electriai.com>). To publish a change: rebuild the
data layer, commit, then

```
npx wrangler pages deploy . --project-name grid-to-lifeline --branch main
```

## Run it

A browser will not read `data/` over `file://`, so serve the folder:

```
cd 05_webapp
py -3 -m http.server 8000
```

Then open <http://localhost:8000>. On Windows, `serve.bat` does the
same thing in one double-click.

## Rebuild the data layer

```
py -3 tools/build_data.py
```

The script reads `02_analysis/a*/results/*`, the figure map in
`03_manuscripts/collect_figures.py`, and the FCC report list in
`01_rawData/fcc_dirs/`, and rewrites everything under `data/`. Change
an analysis, re-run the script, and the site follows: no number is
hard-coded in the page.

## Layout

Nine real pages, each with its own URL, its own document title, and
its own data load. The tab bar is a set of links, not a scroll-spy.

```
05_webapp/
  index.html            the resilience signature (four constructs x two lifelines)
  cascade.html          the cascade in event time, with a day scrubber and map
  map.html              nine storm maps, any window quantity as fill
  dose.html             dose-response for both lifelines, model tables
  recovery.html         end classes, recovery lead, wet-well clock, cell lead
  adaptation.html       slopes by storm and era, storm pairs, the mitigation lag
  notices.html          cause mix, narrative terms, every notice searchable
  county.html           county-window explorer and county profile
  data.html             sources with links, pipeline, figure map, rebuild
  css/style.css         light-mode design system (Paper 1's, extended)
  js/
    shell.js            site map, masthead, tabs, data loader
    pages/              one entry module per page
    lib/                dom, scales, axes, geo projection, stats,
                        palette, tooltip, formatting, bars
    charts/             one module per interactive figure
  data/
    meta.json           storms, counties, variable dictionary, headline numbers,
                        the signature table
    windows.json        603 county-windows, columnar (dose, rain, releases,
                        cell, silence, PA, mitigation stock)
    days/<storm>.json   county-day series, event curves, FCC county-day
                        tables with the report number of every row
    geo/                simplified county polygons, background land, tracks
    dose.json           marginal curve, Model A, two doses, era and storm
                        slopes, lag model, wind-or-wire, cell models
    recovery.json       end classes, recovery lead rows, wet-well clock,
                        cell recovery lead
    adaptation.json     storm pairs, HMGP pipeline curves, closed-at-landfall,
                        PA by storm, stock models
    notices.json        every sewer notice in the nine windows, cause mix,
                        narrative terms
    sources.json        public records with links, stages, figure map
  tools/build_data.py   regenerates data/ from the analysis outputs
```

## Reproducibility links

Every data point on the site can be traced to its public record:

- each FCC point on the cascade page opens the DIRS PDF it was read
  from (`docs.fcc.gov/public/attachments/DOC-<n>A1.pdf`);
- each notice in the browser carries its FDEP incident number and a
  map link to its coordinates;
- the data page links every dataset to the holder's page or service
  and lists every result file each analysis stage writes.

## Conventions

Numbers follow the manuscript: no leading zero on decimals, `p`
values to three decimals with a floor at `.001`, the navy, deep pink,
deep green and gray palette of the figures. Storm colors come from
`data/meta.json`, so the site and the paper read as one system.

Light mode only, by design. No em-dashes anywhere.
