import { boot } from "../shell.js";
import { $ } from "../lib/dom.js";
import { noticesChart } from "../charts/notices.js";

boot({
  id: "notices",
  needs: ["notices"].map(String),
  mount(app) { noticesChart($("#chart"), app); },
});
