/**
 * Asset Manager — native HA form field wrappers.
 *
 * Three factory helpers that prefer HA's native Material-styled custom
 * elements (ha-input, ha-select, ha-textarea) and fall back to our
 * flat .am-input / .am-select / .am-textarea elements on older HA
 * builds where those custom elements are not registered.
 *
 * Each helper returns a DOM node (not a {container,get} object) with a
 * `.value` property and standard event listeners, so callers can treat
 * them uniformly regardless of which path was taken:
 *
 *   - haInput({label, placeholder, value, type, oninput, onchange})
 *   - haSelect({label, options, value, onselected})
 *   - haTextarea({label, placeholder, value, rows})
 *
 * `haSelect` normalizes the event model: callers pass an `onselected`
 * callback which fires on both paths (native ha-select fires
 * `selected`; the fallback <select> fires `change`). The callback
 * receives the selected value string directly.
 */

import { h } from "./dom.js";

const HAS_HA_INPUT = () => !!customElements.get("ha-input");
const HAS_HA_SELECT = () => !!customElements.get("ha-select");
const HAS_HA_TEXTAREA = () => !!customElements.get("ha-textarea");

// Build a fallback <select> with <option> children from `options`.
// options: array of {value,label} or strings.
const fallbackSelect = (opts) =>
  h("select", { class: "am-select" },
    ...opts.map((o) => {
      const val = typeof o === "string" ? o : o.value;
      const label = typeof o === "string" ? o : (o.label || o.value);
      return h("option", { value: val }, label);
    }));

export function haInput(props = {}) {
  if (HAS_HA_INPUT()) {
    const attrs = {};
    if (props.type) attrs.type = props.type;
    if (props.label) attrs.label = props.label;
    if (props.placeholder) attrs.placeholder = props.placeholder;
    if (props.disabled) attrs.disabled = "";
    if (props.required) attrs.required = "";
    if (props.oninput) attrs.oninput = props.oninput;
    if (props.onchange) attrs.onchange = props.onchange;
    const el = h("ha-input", attrs);
    if (props.value != null) el.value = props.value;
    if (props.withClear) el.withClear = true;
    return el;
  }
  const attrs = { class: "am-input" };
  if (props.type) attrs.type = props.type;
  if (props.placeholder) attrs.placeholder = props.placeholder;
  if (props.disabled) attrs.disabled = "";
  if (props.oninput) attrs.oninput = props.oninput;
  if (props.onchange) attrs.onchange = props.onchange;
  const el = h("input", attrs);
  if (props.value != null) el.value = props.value;
  if (props.label) {
    const lbl = h("label", { class: "am-native-label" }, props.label);
    return h("div", { class: "am-native-field" }, lbl, el);
  }
  return el;
}

export function haSelect(props = {}) {
  const opts = props.options || [];
  const onSelected = props.onselected;
  if (HAS_HA_SELECT()) {
    const el = document.createElement("ha-select");
    if (props.label) el.label = props.label;
    if (props.helper) el.helper = props.helper;
    if (props.clearable) el.clearable = true;
    el.options = opts.map((o) =>
      typeof o === "string" ? o : { label: o.label || o.value, value: o.value });
    if (props.value != null) el.value = props.value;
    if (onSelected) el.addEventListener("selected", (ev) => onSelected(ev.detail?.value));
    return el;
  }
  const el = fallbackSelect(opts);
  if (props.value != null) el.value = props.value;
  if (onSelected) el.addEventListener("change", () => onSelected(el.value));
  if (props.label) {
    const lbl = h("label", { class: "am-native-label" }, props.label);
    return h("div", { class: "am-native-field" }, lbl, el);
  }
  return el;
}

export function haTextarea(props = {}) {
  if (HAS_HA_TEXTAREA()) {
    const attrs = {};
    if (props.label) attrs.label = props.label;
    if (props.placeholder) attrs.placeholder = props.placeholder;
    if (props.rows != null) attrs.rows = props.rows;
    if (props.disabled) attrs.disabled = "";
    if (props.oninput) attrs.oninput = props.oninput;
    if (props.onchange) attrs.onchange = props.onchange;
    const el = h("ha-textarea", attrs);
    if (props.value != null) el.value = props.value;
    if (props.resize) el.resize = props.resize;
    return el;
  }
  const attrs = { class: "am-textarea" };
  if (props.placeholder) attrs.placeholder = props.placeholder;
  if (props.rows != null) attrs.rows = props.rows;
  if (props.oninput) attrs.oninput = props.oninput;
  if (props.onchange) attrs.onchange = props.onchange;
  const el = h("textarea", attrs);
  if (props.value != null) el.value = props.value;
  if (props.label) {
    const lbl = h("label", { class: "am-native-label" }, props.label);
    return h("div", { class: "am-native-field" }, lbl, el);
  }
  return el;
}