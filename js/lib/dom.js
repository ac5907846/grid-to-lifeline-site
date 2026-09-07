/* DOM and SVG construction helpers.
   Small on purpose: the charts build their own markup, so the page
   ships no templating library. */

const SVG_NS = "http://www.w3.org/2000/svg";

/** HTML element: el("button.chip", {onclick}, "text" | [nodes]) */
export function el(spec, attrs = {}, children = []) {
  const [tag, ...classes] = spec.split(".");
  const node = document.createElement(tag || "div");
  if (classes.length) node.className = classes.join(" ");
  apply(node, attrs);
  append(node, children);
  return node;
}

/** SVG element: svg("circle", {cx, cy, r}) */
export function svg(tag, attrs = {}, children = []) {
  const node = document.createElementNS(SVG_NS, tag);
  apply(node, attrs, true);
  append(node, children);
  return node;
}

function apply(node, attrs, isSvg = false) {
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "text") node.textContent = v;
    else if (k === "html") node.innerHTML = v;
    else if (k === "style" && typeof v === "object") {
      Object.assign(node.style, v);
    } else if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === "class") {
      node.setAttribute("class", v);
    } else if (!isSvg && k in node && k !== "list" && k !== "type") {
      node[k] = v;
    } else {
      node.setAttribute(k, v);
    }
  }
}

function append(node, children) {
  const list = Array.isArray(children) ? children : [children];
  for (const c of list) {
    if (c === null || c === undefined || c === false) continue;
    node.appendChild(typeof c === "object" ? c
      : document.createTextNode(String(c)));
  }
}

export const clear = (node) => {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
};

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) =>
  Array.from(root.querySelectorAll(sel));

/** Pointer position in an SVG's own user units. */
export function pointerPos(svgNode, event) {
  const ctm = svgNode.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const pt = svgNode.createSVGPoint();
  pt.x = event.clientX;
  pt.y = event.clientY;
  const p = pt.matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

/** A labeled control wrapper for the control bar. */
export function control(label, node, opts = {}) {
  return el("div.control" + (opts.grow ? ".grow" : ""), {}, [
    el("span.label", { text: label }),
    node,
  ]);
}

/** Segmented button group. items: [{key, label, color}] */
export function segmented(items, value, onChange, opts = {}) {
  const wrap = el("div.seg" + (opts.storms ? ".storms" : ""));
  const buttons = new Map();
  for (const it of items) {
    const b = el("button", {
      type: "button",
      text: it.label,
      "aria-pressed": String(it.key === value),
      onclick: () => {
        for (const [k, node] of buttons) {
          node.setAttribute("aria-pressed", String(k === it.key));
        }
        onChange(it.key);
      },
    });
    if (it.color) b.style.setProperty("--sw", it.color);
    buttons.set(it.key, b);
    wrap.appendChild(b);
  }
  wrap.setValue = (k) => {
    for (const [key, node] of buttons) {
      node.setAttribute("aria-pressed", String(key === k));
    }
  };
  return wrap;
}

/** Multi-select chip row. selected is a Set that this mutates. */
export function chips(items, selected, onChange, opts = {}) {
  const wrap = el("div.chips");
  const nodes = new Map();
  for (const it of items) {
    const b = el("button.chip" + (it.focal ? ".focal" : ""), {
      type: "button",
      text: it.label,
      title: it.title || "",
      "aria-pressed": String(selected.has(it.key)),
      onclick: () => {
        if (selected.has(it.key)) {
          if (selected.size > (opts.min ?? 1)) selected.delete(it.key);
        } else {
          if (opts.max && selected.size >= opts.max) return;
          selected.add(it.key);
        }
        sync();
        onChange(selected);
      },
    });
    if (it.color) b.style.setProperty("--sw", it.color);
    nodes.set(it.key, b);
    wrap.appendChild(b);
  }
  function sync() {
    for (const [k, node] of nodes) {
      node.setAttribute("aria-pressed", String(selected.has(k)));
    }
  }
  wrap.sync = sync;
  return wrap;
}

/** Checkbox with a label. */
export function checkbox(label, checked, onChange) {
  const input = el("input", {
    type: "checkbox", checked,
    onchange: (e) => onChange(e.target.checked),
  });
  return el("label.check", {}, [input, label]);
}

/** <select> from [{key,label,group}] with optional optgroups. */
export function select(items, value, onChange, groups = null) {
  const sel = el("select", {
    onchange: (e) => onChange(e.target.value),
  });
  if (groups) {
    const byGroup = new Map();
    for (const it of items) {
      if (!byGroup.has(it.group)) byGroup.set(it.group, []);
      byGroup.get(it.group).push(it);
    }
    for (const [g, list] of byGroup) {
      const og = el("optgroup", { label: groups[g] || g });
      for (const it of list) {
        og.appendChild(el("option", {
          value: it.key, text: it.label,
          selected: it.key === value,
        }));
      }
      sel.appendChild(og);
    }
  } else {
    for (const it of items) {
      sel.appendChild(el("option", {
        value: it.key, text: it.label, selected: it.key === value,
      }));
    }
  }
  sel.value = value;
  return sel;
}

/** Range slider with a live value readout. */
export function slider(opts, onInput) {
  const out = el("span.readout");
  const input = el("input", {
    type: "range",
    min: opts.min, max: opts.max, step: opts.step ?? 1,
    value: opts.value,
    oninput: (e) => {
      const v = Number(e.target.value);
      out.innerHTML = opts.format(v);
      onInput(v);
    },
  });
  out.innerHTML = opts.format(opts.value);
  const wrap = el("div", { style: { minWidth: "12rem" } },
    [input, out]);
  wrap.input = input;
  wrap.output = out;
  return wrap;
}
