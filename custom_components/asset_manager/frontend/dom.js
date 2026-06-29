/**
 * Asset Manager — tiny DOM helpers.
 *
 * `h()` is a hyperscript-style element factory: attribute keys starting
 * with `on` become event listeners, `class`/`style` are handled specially,
 * and `false`/`null`/`undefined` children are skipped. `clear()` removes
 * all children and returns the parent so callers can chain `.append(...)`.
 */

export const h = (tag, attrs, ...children) => {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") el.className = v;
      else if (k === "style") el.setAttribute("style", v);
      else if (k.startsWith("on") && typeof v === "function")
        el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k.startsWith(".")) el[k.slice(1)] = v;
      else if (v === false || v == null) continue;
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, v);
    }
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
};

export const clear = (el) => {
  while (el && el.firstChild) el.removeChild(el.firstChild);
  return el;
};