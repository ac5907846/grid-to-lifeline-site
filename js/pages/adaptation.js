import { boot } from "../shell.js";
import { $ } from "../lib/dom.js";
import { adaptationChart } from "../charts/adaptation.js";

boot({
  id: "adaptation",
  needs: ["adaptation", "dose"].map(String),
  mount(app) { adaptationChart($("#chart"), app); },
});
