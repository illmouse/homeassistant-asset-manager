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
    };
  }

  // Fallback: plain text input (e.g. if HA hasn't registered the element
  // yet, or the panel runs outside a HA frontend context).
  const input = h("input", {
    class: "am-input",
    value: initial,
    placeholder: "mdi:car",
  });
  if (onChange) input.addEventListener("change", () => onChange(input.value.trim()));
  return {
    container: input,
    get: () => input.value.trim(),
  };
}

export function buildAreaPicker(hass, initial = null, onChange = null) {
  // HA's native <ha-area-picker> uses @lit/context (@consume) to receive
  // areas/api/entities/etc. from providers in HA's app tree. Those
  // providers do not cross our panel's shadow DOM boundary
  // (asset-manager-panel.js attaches its own shadow root), so the native
  // element renders blank inside our panel. Use a plain themed <select>
  // populated from hass.areas instead.
  const areas = (hass && hass.areas) ? Object.values(hass.areas) : [];
  const select = h("select", { class: "am-select" },
    h("option", { value: "", selected: initial == null }, "No area"),
    ...areas.map((a) =>
      h("option", { value: a.area_id, selected: a.area_id === initial }, a.name)));
  if (onChange) select.addEventListener("change", () => onChange(select.value || null));
  const container = h("div", { class: "am-area-picker" }, select);
  return {
    container,
    get: () => (select.value === "" ? null : select.value),
  };
}