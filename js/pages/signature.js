import { boot } from "../shell.js";
import { $ } from "../lib/dom.js";
import { twoCurves } from "../charts/twocurves.js";
import { signatureChart } from "../charts/signature.js";

boot({
  id: "signature",
  needs: ["windows", "dose", "recovery", "adaptation"].map(String),
  mount(app) {
    twoCurves($("#twocurves"), app);
    signatureChart($("#chart"), app);
  },
});
