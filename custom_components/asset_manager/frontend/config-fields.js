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
import { haInput, haSelect, haTextarea } from "./native-fields.js";
import { SENSOR_DEVICE_CLASSES, SENSOR_STATE_CLASSES } from "./constants.js";

export const buildConfigFields = (kind, initialConfig) => {
  const container = h("div", { class: "am-config-section" });
  const cfg = initialConfig || {};
  let rawSync = null;

  const field = (label, inputNode) =>
    h("div", { class: "am-field" }, h("label", {}, label), inputNode);
  const numInput = (val, placeholder) =>
    haInput({ type: "number", value: val == null ? "" : String(val), placeholder });

  if (kind === "number") {
    const min = numInput(cfg.min, "0");
    const max = numInput(cfg.max, "100");
    const step = numInput(cfg.step ?? 1, "1");
    const mode = haSelect({
      label: "Mode",
      value: cfg.mode || "box",
      options: [
        { value: "box", label: "box" },
        { value: "slider", label: "slider" },
      ],
      onselected: (v) => { mode.value = v; },
    });
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
        const inp = haInput({ value: opt });
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
    const pattern = haInput({ value: cfg.pattern || "", placeholder: "regex pattern (optional)" });
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
    const formula = haTextarea({
      label: "Formula",
      value: cfg.formula || "",
      placeholder: "e.g. datediff(oil_change_date, now())",
      resize: "vertical",
    });
    const dc = haSelect({
      label: "Device class",
      value: cfg.device_class || "",
      clearable: true,
      options: SENSOR_DEVICE_CLASSES.map((v) => ({ value: v, label: v || "—" })),
    });
    const sc = haSelect({
      label: "State class",
      value: cfg.state_class || "",
      clearable: true,
      options: SENSOR_STATE_CLASSES.map((v) => ({ value: v, label: v || "—" })),
    });
    container.append(
      formula,
      h("div", { class: "am-grid" }, field("Device class", dc), field("State class", sc)));
    return {
      container,
      read: () => {
        const out = { formula: formula.value.trim() };
        if (dc.value) out.device_class = dc.value;
        if (sc.value) out.state_class = sc.value;
        return out;
      },
    };
  }

  if (kind === "sensor") {
    const dc = haSelect({
      label: "Device class",
      value: cfg.device_class || "",
      clearable: true,
      options: SENSOR_DEVICE_CLASSES.map((v) => ({ value: v, label: v || "—" })),
    });
    const sc = haSelect({
      label: "State class",
      value: cfg.state_class || "",
      clearable: true,
      options: SENSOR_STATE_CLASSES.map((v) => ({ value: v, label: v || "—" })),
    });
    container.append(h("div", { class: "am-grid" }, field("Device class", dc), field("State class", sc)));
    return {
      container,
      read: () => {
        const out = {};
        if (dc.value) out.device_class = dc.value;
        if (sc.value) out.state_class = sc.value;
        return out;
      },
    };
  }

  // date / button / switch → no config fields
  container.append(h("p", { class: "am-muted" }, "No configuration for this kind."));
  return { container, read: () => ({}) };
};