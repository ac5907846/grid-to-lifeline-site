import { boot } from "../shell.js";
import { $ } from "../lib/dom.js";
import { dataPage } from "../charts/data.js";

boot({
  id: "data",
  needs: ["sources", "dose"].map(String),
  mount(app) { dataPage($("#chart"), app); },
});
