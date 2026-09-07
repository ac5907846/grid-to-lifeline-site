/* One shared tooltip for the whole page. */

import { $ } from "./dom.js";

let node = null;

function tip() {
  if (!node) node = $("#tooltip");
  return node;
}

/** rows: [[label, value], ...]; note is optional small print. */
export function show(event, { title, rows = [], note = "" }) {
  const t = tip();
  const body = rows.map(([k, v]) =>
    `<div class="t-row"><span>${k}</span><span>${v}</span></div>`)
    .join("");
  t.innerHTML =
    (title ? `<div class="t-title">${title}</div>` : "") + body +
    (note ? `<div class="t-note">${note}</div>` : "");
  t.classList.add("on");
  move(event);
}

export function move(event) {
  const t = tip();
  const pad = 14;
  const r = t.getBoundingClientRect();
  let x = event.clientX + pad;
  let y = event.clientY + pad;
  if (x + r.width > window.innerWidth - 8) {
    x = event.clientX - r.width - pad;
  }
  if (y + r.height > window.innerHeight - 8) {
    y = event.clientY - r.height - pad;
  }
  t.style.left = `${Math.max(4, x)}px`;
  t.style.top = `${Math.max(4, y)}px`;
}

export function hide() {
  tip().classList.remove("on");
}
