import { boot } from "../shell.js";
import { $ } from "../lib/dom.js";
import { cascadeChart } from "../charts/cascade.js";

boot({
  id: "cascade",
  needs: ["geo"].map(String),
  mount(app) { cascadeChart($("#chart"), app); },
});
