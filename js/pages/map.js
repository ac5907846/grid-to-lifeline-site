import { boot } from "../shell.js";
import { $ } from "../lib/dom.js";
import { stormMap } from "../charts/map.js";

boot({
  id: "map",
  needs: ["windows", "geo"].map(String),
  mount(app) { stormMap($("#chart"), app); },
});
