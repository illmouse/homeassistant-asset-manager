/**
 * Asset Manager — kind-aware entity config field builder.
 *
 * Builds a DOM container with form inputs tailored to the given entity
 * kind. Returns `{ container, read(): configObj }`. The caller places
 * `container` in the dialog and calls `read()` at submit time. Changing
 * the kind rebuilds the fields (the entity editor does this on
 * `<select>` change).
 */

import { h, clear } from "./dom.js";

export const buildConfigFields = (kind, initialConfig) => {
  const container = h("div", { class: "am-config-section" });
  const cfg = initialConfig || {};
  let rawSync = null; // set when advanced JSON editor is open

  const field = (label, inputNode) =>
    h("div", { class: "am-field" }, h("label", {}, label), inputNode);
  const numInput = (val, placeholder) =>
    h("input", { class: "am-input", type: "number",
      value: val == null ? "" : String(val), placeholder });

  if (kind === "number") {
    const min = numInput(cfg.min, "0");
    const max = numInput(cfg.max, "100");
    const step = numInput(cfg.step ?? 1, "1");
    const mode = h("select", { class: "am-select" },
      h("option", { value: "box", selected: (cfg.mode || "box") === "box" }, "box"),
      h("option", { value: "slider", selected: cfg.mode === "slider" }, "slider"));
    container.append(h("div", { class: "am-grid" },
      field("Min", min), field("Max", max),
      field("Step", step), field("Mode", mode)));
    return {
      container,
      read: () => ({
        min: min.value === "" ? 0 : Number(min.value),
        max: max.value === "" ? 0 : Number(max.value),
        step: step.value === "" ? 1 : Number(step.value),
        mode: mode.value,
      }),
    };
  }

  if (kind === "select") {
    const optionsList = h("div", { class: "am-options-list" });
    const options = [...(cfg.options || [])];
    const renderOptions = () => {
      clear(optionsList);
      options.forEach((opt, i) => {
        const inp = h("input", { class: "am-input", value: opt });
        inp.addEventListener("change", () => { options[i] = inp.value; });
        const rm = h("button", { class: "am-btn danger" }, "×");
        rm.addEventListener("click", (e) => { e.preventDefault(); options.splice(i, 1); renderOptions(); });
        optionsList.append(h("div", { class: "am-option-row" }, inp, rm));
      });
    };
    renderOptions();
    const add = h("button", { class: "am-btn secondary" }, "+ Add option");
    add.addEventListener("click", (e) => { e.preventDefault(); options.push(""); renderOptions(); });
    container.append(field("Options", optionsList), add);
    return {
      container,
      read: () => ({ options: options.map((o) => o.trim()).filter(Boolean) }),
    };
  }

  if (kind === "text") {
    const min = numInput(cfg.min ?? 0, "0");
    const max = numInput(cfg.max ?? 255, "255");
    const pattern = h("input", { class: "am-input", value: cfg.pattern || "", placeholder: "regex pattern (optional)" });
    container.append(h("div", { class: "am-grid" },
      field("Min length", min), field("Max length", max),
      h("div", { class: "am-field", style: "grid-column: 1 / -1" }, h("label", {}, "Pattern"), pattern)));
    return {
      container,
      read: () => ({
        min: min.value === "" ? 0 : Number(min.value),
        max: max.value === "" ? 255 : Number(max.value),
        pattern: pattern.value || "",
      }),
    };
  }

  if (kind === "derived") {
    const useNativeTa = customElements.get("ha-textarea");
    const formula = useNativeTa
      ? document.createElement("ha-textarea")
      : h("textarea", { class: "am-textarea",
          placeholder: "e.g. datediff(oil_change_date, now())" });
    if (useNativeTa) {
      formula.label = "Formula";
      formula.placeholder = "e.g. datediff(oil_change_date, now())";
      formula.resize = "vertical";
      formula.style.width = "100%";
    }
    formula.value = cfg.formula || "";
    const dc = h("input", { class: "am-input", value: cfg.device_class || "", placeholder: "device_class (optional)" });
    const sc = h("input", { class: "am-input", value: cfg.state_class || "", placeholder: "state_class (optional)" });
    container.append(
      useNativeTa ? formula : field("Formula", formula),
      h("div", { class: "am-grid" }, field("Device class", dc), field("State class", sc)));
    return {
      container,
      read: () => {
        const out = { formula: formula.value.trim() };
        if (dc.value.trim()) out.device_class = dc.value.trim();
        if (sc.value.trim()) out.state_class = sc.value.trim();
        return out;
      },
    };
  }

  if (kind === "sensor") {
    const dc = h("input", { class: "am-input", value: cfg.device_class || "", placeholder: "device_class (optional)" });
    const sc = h("input", { class: "am-input", value: cfg.state_class || "", placeholder: "state_class (optional)" });
    container.append(h("div", { class: "am-grid" }, field("Device class", dc), field("State class", sc)));
    return {
      container,
      read: () => {
        const out = {};
        if (dc.value.trim()) out.device_class = dc.value.trim();
        if (sc.value.trim()) out.state_class = sc.value.trim();
        return out;
      },
    };
  }

  // date / button / switch → no config fields
  container.append(h("p", { class: "am-muted" }, "No configuration for this kind."));
  return { container, read: () => ({}) };
};