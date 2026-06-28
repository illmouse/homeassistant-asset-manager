/**
 * Asset Manager — reusable native HA label picker.
 *
 * `buildLabelPicker(hass, initialLabelIds, onChange)` returns
 *   { container, get(), set(labelIds) }
 * mirroring the {container, get()} shape of buildIconPicker/buildAreaPicker.
 *
 * Renders:
 *   - a row of chips for the currently-assigned labels (each chip colored
 *     per its HA label color, with an × to unassign),
 *   - an "Add label" button that opens a dropdown of all available labels
 *     not yet assigned, plus an inline "New label" form (name + optional
 *     color + icon) that calls the native config/label_registry/create WS.
 *
 * Labels are assigned at the device level (DeviceEntry.labels), not on
 * entities. The caller is responsible for persisting the selected set via
 * `updateAssetLabels(hass, assetId, labelIds)`; this picker only manages
 * the UI state and reports changes through `onChange(labelIds)`.
 */

import { h, clear } from "./dom.js";
import { labelColorToCss } from "./constants.js";
import { listLabels, createLabel } from "./ws.js";
import { showToast, withBusy } from "./ui.js";

// Resolve a label's display color to an inline CSS string.
const chipStyle = (color) => {
  const css = labelColorToCss(color);
  return css ? `border-color:${css}; color:${css};` : "";
};

export function buildLabelPicker(hass, initialLabelIds = [], onChange = null) {
  const labelIds = new Set(initialLabelIds);
  let allLabels = []; // [{label_id, name, color, icon, ...}]

  const chipsRow = h("div", { class: "am-label-chips" });
  const dropdownHolder = h("div", {});
  const addBtn = h("button", { class: "am-btn secondary am-label-add" }, "+ Add label");

  const container = h("div", { class: "am-label-picker" },
    chipsRow,
    h("div", { class: "am-label-controls" }, addBtn, dropdownHolder));

  const get = () => [...labelIds];

  const set = (ids) => {
    labelIds.clear();
    for (const id of ids) labelIds.add(id);
    renderChips();
    if (onChange) onChange(get());
  };

  const labelById = (id) => allLabels.find((l) => l.label_id === id);

  const renderChips = () => {
    clear(chipsRow);
    if (labelIds.size === 0) {
      chipsRow.append(h("span", { class: "am-muted" }, "No labels assigned."));
      return;
    }
    // Render in the order of allLabels so chips stay stable.
    const ordered = allLabels.filter((l) => labelIds.has(l.label_id));
    for (const label of ordered) {
      const chip = h("span", {
        class: "am-label-chip",
        style: chipStyle(label.color),
        title: label.description || "",
      },
        label.icon ? h("ha-icon", { icon: label.icon }) : null,
        h("span", {}, label.name),
        h("span", {
          class: "am-label-chip-x",
          title: "Unassign",
          onClick: (ev) => {
            ev.stopPropagation();
            labelIds.delete(label.label_id);
            renderChips();
            if (onChange) onChange(get());
          },
        }, "×"));
      chipsRow.append(chip);
    }
  };

  let searchTerm = "";

  const renderDropdown = () => {
    clear(dropdownHolder);
    const inner = h("div", { class: "am-label-dropdown" });

    // Search input — filters available labels by name.
    const searchInput = h("input", {
      class: "am-input am-label-search",
      placeholder: "Search labels…",
      value: searchTerm,
    });
    searchInput.addEventListener("input", () => {
      searchTerm = searchInput.value;
      renderOptions();
    });

    // Scrollable options list.
    const optionsList = h("div", { class: "am-label-options" });
    const renderOptions = () => {
      clear(optionsList);
      const q = searchTerm.trim().toLowerCase();
      const available = allLabels.filter(
        (l) => !labelIds.has(l.label_id)
          && (!q || l.name.toLowerCase().includes(q)),
      );
      if (available.length === 0) {
        optionsList.append(h("p", { class: "am-muted", style: "margin:0 0 6px" },
          q ? "No matching labels." : "No more labels. Create one below."));
      } else {
        for (const label of available) {
          optionsList.append(h("div", {
            class: "am-label-option",
            style: chipStyle(label.color),
            onClick: () => {
              labelIds.add(label.label_id);
              renderChips();
              renderDropdown();
              if (onChange) onChange(get());
            },
          },
            label.icon ? h("ha-icon", { icon: label.icon, style: "margin-right:4px" }) : null,
            label.name));
        }
      }
    };
    renderOptions();

    // Inline create-label form.
    const nameInput = h("input", { class: "am-input am-label-create-name", placeholder: "New label name" });
    const colorSelect = h("select", { class: "am-select am-label-create-color" },
      h("option", { value: "" }, "Default color"),
      h("option", { value: "red" }, "Red"),
      h("option", { value: "pink" }, "Pink"),
      h("option", { value: "purple" }, "Purple"),
      h("option", { value: "blue" }, "Blue"),
      h("option", { value: "cyan" }, "Cyan"),
      h("option", { value: "teal" }, "Teal"),
      h("option", { value: "green" }, "Green"),
      h("option", { value: "amber" }, "Amber"),
      h("option", { value: "orange" }, "Orange"),
      h("option", { value: "grey" }, "Grey"));
    const iconInput = h("input", { class: "am-input am-label-create-icon", placeholder: "mdi:tag (optional)" });
    const createBtn = h("button", { class: "am-btn" }, "Create label");
    const createErr = h("div", { class: "am-error" });
    createBtn.addEventListener("click", async () => {
      const name = nameInput.value.trim();
      if (!name) { nameInput.focus(); return; }
      createErr.textContent = "";
      try {
        await withBusy(createBtn, async () => {
          const payload = { name };
          if (colorSelect.value) payload.color = colorSelect.value;
          if (iconInput.value.trim()) payload.icon = iconInput.value.trim();
          await createLabel(hass, payload);
          await refreshLabels();
          const created = allLabels.find((l) => l.name === name);
          if (created) {
            labelIds.add(created.label_id);
            renderChips();
            renderDropdown();
            if (onChange) onChange(get());
          }
          showToast(`Created label “${name}”`, "success", 2000);
        });
      } catch (e) { createErr.textContent = String(e.message || e); }
    });

    inner.append(
      searchInput,
      optionsList,
      h("div", { class: "am-label-create" },
        h("div", { class: "am-field" }, h("label", {}, "New label"), nameInput),
        h("div", { style: "display:grid; grid-template-columns:1fr 1fr; gap:6px" },
          h("div", { class: "am-field" }, h("label", {}, "Color"), colorSelect),
          h("div", { class: "am-field" }, h("label", {}, "Icon"), iconInput)),
        createBtn,
        createErr));

    dropdownHolder.append(inner);
    searchInput.focus();
  };

  let dropdownOpen = false;
  addBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    dropdownOpen = !dropdownOpen;
    if (dropdownOpen) {
      renderDropdown();
      // Close on outside click.
      setTimeout(() => {
        const onDoc = (e) => {
          if (!e.composedPath().includes(container)) {
            dropdownOpen = false;
            clear(dropdownHolder);
            document.removeEventListener("click", onDoc);
          }
        };
        document.addEventListener("click", onDoc);
      }, 0);
    } else {
      clear(dropdownHolder);
    }
  });

  // Load the full label list once, then re-render. Callers that need
  // to refresh after external changes (e.g. label_registry_updated) can
  // call refreshLabels() again.
  let refreshLabels;
  const load = () => {
    refreshLabels = async () => {
      try {
        allLabels = (await listLabels(hass)).slice().sort((a, b) =>
          a.name.localeCompare(b.name));
      } catch { allLabels = []; }
      renderChips();
      if (dropdownOpen) renderDropdown();
    };
    return refreshLabels();
  };
  load();

  return { container, get, set, refreshLabels: () => load() };
}