/* Shared page shell. Every page is a real HTML document with its own
   URL; this module builds the masthead and the tab bar, loads only
   the data that page asks for, and then hands control to the page's
   own module. */

import { el, clear, $ } from "./lib/dom.js";
import * as fmt from "./lib/format.js";

/* The site map, in tab order. The resilience signature carries
   index.html, so the site opens on it. */
export const PAGES = [
  { id: "signature", file: "index.html", tab: "Signature",
    title: "The resilience signature of two dependent lifelines" },
  { id: "cascade", file: "cascade.html", tab: "Cascade in time",
    title: "The cascade in event time" },
  { id: "map", file: "map.html", tab: "Storm maps",
    title: "Nine storms, 67 counties" },
  { id: "dose", file: "dose.html", tab: "Dose-response",
    title: "Propagation: the dose-response" },
  { id: "recovery", file: "recovery.html", tab: "Recovery",
    title: "Buffering and recovery autonomy" },
  { id: "adaptation", file: "adaptation.html", tab: "Adaptation",
    title: "Adaptation and the mitigation lag" },
  { id: "notices", file: "notices.html", tab: "Notices",
    title: "What the notices say" },
  { id: "county", file: "county.html", tab: "County explorer",
    title: "County-window explorer" },
  { id: "data", file: "data.html", tab: "Data and code",
    title: "Data, reproduction, and links to the records" },
];
const FILES = {
  meta: "data/meta.json",
  windows: "data/windows.json",
  dose: "data/dose.json",
  recovery: "data/recovery.json",
  adaptation: "data/adaptation.json",
  notices: "data/notices.json",
  sources: "data/sources.json",
};

async function getJSON(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

/** A columnar table {columns, rows} becomes an array of objects. */
export function toObjects(table) {
  const { columns, rows } = table;
  return rows.map((r) => {
    const o = {};
    columns.forEach((c, i) => { o[c] = r[i]; });
    return o;
  });
}

function unpack(obj) {
  if (obj && obj.columns && obj.rows) return toObjects(obj);
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (v && v.columns && v.rows) obj[k] = toObjects(v);
    }
  }
  return obj;
}

function buildApp() {
  const app = { dayCache: new Map(), windowIndex: new Map() };
  app.days = async (storm) => {
    if (app.dayCache.has(storm)) return app.dayCache.get(storm);
    const d = await getJSON(`data/days/${storm}.json`);
    app.dayCache.set(storm, d);
    return d;
  };
  app.window = (fips, storm) =>
    app.windowIndex.get(`${fips}|${storm}`) || null;
  app.storm = (k) => app.meta.storms[k];
  app.name = (k) => app.meta.storms[k].name;
  app.color = (k) => app.meta.storms[k].color;
  return app;
}

async function loadInto(app, needs) {
  const wanted = new Set(["meta", ...needs]);
  const geo = wanted.has("geo");
  wanted.delete("geo");
  const keys = [...wanted];
  const parts = await Promise.all(keys.map((k) => getJSON(FILES[k])));
  keys.forEach((k, i) => { app[k] = unpack(parts[i]); });
  if (app.windows) {
    for (const r of app.windows) {
      app.windowIndex.set(`${r.county_fips}|${r.storm}`, r);
    }
  }
  if (geo) {
    const [counties, context, tracks] = await Promise.all([
      getJSON("data/geo/counties.json"),
      getJSON("data/geo/context.json"),
      getJSON("data/geo/tracks.json"),
    ]);
    app.geo = { counties: counties.counties, context, tracks };
  }
  return app;
}

function masthead(meta, page) {
  const host = $("#masthead");
  if (!host) return;
  const home = page.file === "index.html";
  clear(host);
  const inner = el("div.masthead-inner" + (home ? "" : ".compact"));
  if (home) {
    inner.append(
      el("h1", { text: meta.title }),
      el("p.subtitle", { text: meta.subtitle }),
      // anonymous for review: no author, no affiliation
    );
  } else {
    inner.append(
      el("a.homelink", { href: "index.html", text: meta.short_title || meta.title }),
      el("p.crumb", { text: page.title }),
    );
  }
  host.appendChild(inner);
}

function tabs(page) {
  const host = $("#sitenav");
  if (!host) return;
  clear(host);
  const list = el("ul");
  for (const p of PAGES) {
    const a = el("a", { href: p.file, text: p.tab });
    if (p.id === page.id) {
      a.className = "active";
      a.setAttribute("aria-current", "page");
    }
    list.appendChild(el("li", {}, [a]));
  }
  host.appendChild(el("div.sitenav-inner", {}, [list]));
}

function failure(message) {
  const host = $("#page") || document.body;
  const box = el("div.errorbox", { html: message });
  const mount = $("#chart") || host;
  clear(mount).appendChild(box);
}

/** Entry point for every page module. */
export async function boot({ id, needs = [], mount }) {
  const page = PAGES.find((p) => p.id === id);
  if (location.protocol === "file:") {
    failure("This site loads its data from <code>data/</code>, which "
      + "a browser will not read from the file system. Start a local "
      + "server in the app folder and open the address it prints:"
      + "<br><br><code>py -3 -m http.server 8000</code><br>then visit "
      + "<code>http://localhost:8000</code>.");
    tabs(page);
    return;
  }
  try {
    const app = buildApp();
    await loadInto(app, needs);
    document.title = page.file === "index.html"
      ? app.meta.title
      : `${page.title} | ${app.meta.short_title || app.meta.title}`;
    masthead(app.meta, page);
    tabs(page);
    if (mount) await mount(app, page);
  } catch (err) {
    tabs(page);
    failure("Could not load the data layer: "
      + `<code>${err.message}</code>. Run `
      + "<code>py -3 tools/build_data.py</code> and reload.");
    throw err;
  }
}

/** Storm items for segmented controls and chips, in analysis order. */
export function stormItems(app, keys = null) {
  return (keys || app.meta.order).map((k) => ({
    key: k, label: app.meta.storms[k].label, color: app.meta.storms[k].color,
    title: app.meta.storms[k].name,
  }));
}

export { fmt };
