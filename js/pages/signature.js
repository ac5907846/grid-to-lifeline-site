import { boot } from "../shell.js";
import { $ } from "../lib/dom.js";
import { signatureChart } from "../charts/signature.js";

boot({
  id: "signature",
  needs: ["windows", "dose", "recovery"].map(String),
  mount(app) { signatureChart($("#chart"), app); },
});
