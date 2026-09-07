import { boot } from "../shell.js";
import { $ } from "../lib/dom.js";
import { recoveryChart } from "../charts/recovery.js";

boot({
  id: "recovery",
  needs: ["recovery"].map(String),
  mount(app) { recoveryChart($("#chart"), app); },
});
