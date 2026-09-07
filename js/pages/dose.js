import { boot } from "../shell.js";
import { $ } from "../lib/dom.js";
import { doseChart } from "../charts/dose.js";

boot({
  id: "dose",
  needs: ["windows", "dose"].map(String),
  mount(app) { doseChart($("#chart"), app); },
});
