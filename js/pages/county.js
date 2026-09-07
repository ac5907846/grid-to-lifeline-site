import { boot } from "../shell.js";
import { $ } from "../lib/dom.js";
import { countyChart } from "../charts/county.js";

boot({
  id: "county",
  needs: ["windows"].map(String),
  mount(app) { countyChart($("#chart"), app); },
});
