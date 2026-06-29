/**
 * Asset Manager — reusable pickers for icon and area.
 *
 * Two builders, each returning `{ container, get() }` so they slot into
 * the existing dialog/view composition the same way `buildConfigFields`
 * does:
 *   - buildIconPicker(initial, onChange) — wraps HA's native
 *     <ha-icon-picker> (a searchable combo-box dropdown of mdi glyphs).
 *     Falls back to a plain text input if the custom element isn't
 *     registered yet.
 *   - buildAreaPicker(hass, initial, onChange) — a themed <select>
 *     populated from hass.areas. We do NOT use HA's native
 *     <ha-area-picker>: it relies on @lit/context (@consume) for
 *     areas/api/entities/etc., and those context providers live in HA's
 *     app tree and do not cross our panel's shadow DOM boundary
 *     (asset-manager-panel.js attaches its own shadow root), so the
 *     native element renders blank inside our panel.
 */

import { h } from "./dom.js";
import { haInput, haSelect } from "./native-fields.js";

export function buildIconPicker(initial = "", onChange = null) {
  // Prefer HA's native <ha-icon-picker> when available — it shows real
  // mdi glyphs in a searchable dropdown and loads the icon list itself.
  if (customElements.get("ha-icon-picker")) {
    const picker = document.createElement("ha-icon-picker");
    if (initial) picker.value = initial;
    picker.placeholder = "mdi:car";
    picker.label = "Icon";
    // ha-icon-picker fires `value-changed` with { detail: { value } }.
    let current = initial || "";
    picker.addEventListener("value-changed", (ev) => {
      current = ev.detail?.value ?? "";
      if (onChange) onChange(current);
    });
    return {
      container: picker,
      get: () => current,
      set: (value) => {
        current = value || "";
        picker.value = current;
        if (onChange) onChange(current);
      },
    };
  }

  // Fallback: plain text input (e.g. if HA hasn't registered the element
  // yet, or the panel runs outside a HA frontend context).
  const input = haInput({ placeholder: "mdi:car" });
  if (onChange) input.addEventListener("change", () => onChange(input.value.trim()));
  return {
    container: input,
    get: () => input.value.trim(),
    set: (value) => {
      input.value = value || "";
      if (onChange) onChange(input.value.trim());
    },
  };
}

export function buildAreaPicker(hass, initial = null, onChange = null) {
  // HA's native <ha-area-picker> uses @lit/context (@consume) to receive
  // areas/api/entities/etc. from providers in HA's app tree. Those
  // providers do not cross our panel's shadow DOM boundary
  // (asset-manager-panel.js attaches its own shadow root), so the native
  // element renders blank inside our panel. Use a themed <select>
  // (ha-select when available, else .am-select) populated from
  // hass.areas instead.
  const areas = (hass && hass.areas) ? Object.values(hass.areas) : [];
  const options = [
    { value: "", label: "No area" },
    ...areas.map((a) => ({ value: a.area_id, label: a.name })),
  ];
  const select = haSelect({
    options,
    value: initial || "",
    onselected: (v) => { if (onChange) onChange(v || null); },
  });
  select._value = initial || "";
  const container = h("div", { class: "am-area-picker" }, select);
  return {
    container,
    get: () => (select._value === "" || select._value == null ? null : select._value),
  };
}