/**
 * Asset Manager — reusable multi-select label combobox.
 *
 * `buildLabelPicker(hass, initialLabelIds, onChange)` returns
 *   { container, get(), set(labelIds), refreshLabels() }
 * mirroring the {container, get()} shape of buildIconPicker/buildAreaPicker.
 *
 * A single input-like field that shows selected labels as inline chips
 * (each with an × to remove). Clicking or focusing opens a dropdown of
 * all labels with a checkbox reflecting selected state; typing filters
 * by name. A "+ New label…" link at the bottom of the dropdown reveals
 * an inline create form (name + optional color + icon) that calls the
 * native config/label_registry/create WS.
 *
 * Labels are assigned at the device level (DeviceEntry.labels), not on
 * entities. The caller persists the selected set via
 * `updateAssetLabels(hass, assetId, labelIds)`; this picker only manages
 * the UI state and reports changes through `onChange(labelIds)`.
 */

import { h, clear } from "./dom.js";
import { labelColorToCss } from "./constants.js";
import { listLabels, createLabel } from "./ws.js";
import { showToast, withBusy } from "./ui.js";
import { haInput, haSelect } from "./native-fields.js";

const chipStyle = (color) => {
  const css = labelColorToCss(color);
  return css ? `border-color:${css}; color:${css};` : "";
};

export function buildLabelPicker(hass, initialLabelIds = [], onChange = null) {
  const labelIds = new Set(initialLabelIds);
  let allLabels = [];
  let searchTerm = "";
  let dropdownOpen = false;
  let createOpen = false;

  const labelById = (id) => allLabels.find((l) => l.label_id === id);

  // --- Combobox input (chips + search text + ▾) ---
  const searchInput = h("input", {
    class: "am-label-combobox-text",
    placeholder: initialLabelIds.length ? "" : "Add labels…",
    value: "",
  });
  const chipsHolder = h("span", { class: "am-label-combobox-chips" });
  const affordance = h("span", { class: "am-label-combobox-arrow" }, "▾");
  const combobox = h("div", { class: "am-label-combobox" },
    chipsHolder,
    searchInput,
    affordance);

  // --- Dropdown (options + new-link + create form) ---
  const optionsList = h("div", { class: "am-label-options" });
  const newLink = h("button", { type: "button", class: "am-label-new-link" }, "+ New label…");

  const nameInput = haInput({ placeholder: "Label name" });
  const COLOR_OPTIONS = [
    { value: "", label: "Default" },
    { value: "red", label: "Red" },
    { value: "pink", label: "Pink" },
    { value: "purple", label: "Purple" },
    { value: "blue", label: "Blue" },
    { value: "cyan", label: "Cyan" },
    { value: "teal", label: "Teal" },
    { value: "green", label: "Green" },
    { value: "amber", label: "Amber" },
    { value: "orange", label: "Orange" },
    { value: "grey", label: "Grey" },
  ];
  const colorSelect = haSelect({
    options: COLOR_OPTIONS,
    onselected: (v) => { colorSelect._value = v || ""; },
  });
  colorSelect._value = "";
  const iconInput = haInput({ placeholder: "mdi:tag (optional)" });
  const createBtn = h("button", { class: "am-btn" }, "Create label");
  const createErr = h("div", { class: "am-error" });
  const createForm = h("div", { class: "am-label-create" },
    h("div", { class: "am-field" }, h("label", {}, "Name"), nameInput),
    h("div", { style: "display:grid; grid-template-columns:1fr 1fr; gap:6px" },
      h("div", { class: "am-field" }, h("label", {}, "Color"), colorSelect),
      h("div", { class: "am-field" }, h("label", {}, "Icon"), iconInput)),
    createBtn,
    createErr);

  const dropdown = h("div", {
    class: "am-label-dropdown am-label-picker-dropdown",
    style: "position:fixed",
  }, optionsList, newLink, createForm);

  const container = h("div", { class: "am-label-picker" }, combobox);

  const positionDropdown = () => {
    const r = combobox.getBoundingClientRect();
    dropdown.style.left = `${r.left}px`;
    dropdown.style.top = `${r.bottom + 4}px`;
    dropdown.style.width = `${r.width}px`;
    dropdown.style.minWidth = `${r.width}px`;
  };

  // --- State helpers ---
  const get = () => [...labelIds];

  const fire = () => { if (onChange) onChange(get()); };

  const set = (ids) => {
    labelIds.clear();
    for (const id of ids) labelIds.add(id);
    renderChips();
    if (dropdownOpen) renderOptions();
    fire();
  };

  // --- Rendering ---
  const renderChips = () => {
    clear(chipsHolder);
    const ordered = allLabels.filter((l) => labelIds.has(l.label_id));
    for (const label of ordered) {
      chipsHolder.append(h("span", {
        class: "am-label-chip",
        style: chipStyle(label.color),
        title: label.description || "",
      },
        label.icon ? h("ha-icon", { icon: label.icon }) : null,
        h("span", {}, label.name),
        h("span", {
          class: "am-label-chip-x",
          title: "Remove",
          onClick: (ev) => {
            ev.stopPropagation();
            labelIds.delete(label.label_id);
            renderChips();
            if (dropdownOpen) renderOptions();
            fire();
          },
        }, "×")));
    }
    searchInput.placeholder = labelIds.size ? "" : "Add labels…";
  };

  const renderOptions = () => {
    clear(optionsList);
    const q = searchTerm.trim().toLowerCase();
    const matching = allLabels.filter(
      (l) => !q || l.name.toLowerCase().includes(q),
    );
    if (matching.length === 0) {
      optionsList.append(h("p", { class: "am-muted", style: "margin:0 0 6px" },
        q ? "No matching labels." : "No labels yet. Create one below."));
      return;
    }
    for (const label of matching) {
      const selected = labelIds.has(label.label_id);
      optionsList.append(h("div", {
        class: `am-label-option${selected ? " selected" : ""}`,
        style: chipStyle(label.color),
        onClick: () => {
          if (selected) labelIds.delete(label.label_id);
          else labelIds.add(label.label_id);
          renderChips();
          renderOptions();
          fire();
        },
      },
        h("span", { class: "am-label-check" }, selected ? "✓" : ""),
        label.icon ? h("ha-icon", { icon: label.icon, style: "margin-right:4px" }) : null,
        h("span", {}, label.name)));
    }
  };

  const renderCreateVisibility = () => {
    createForm.style.display = createOpen ? "" : "none";
    newLink.style.display = createOpen ? "none" : "";
  };

  // --- Dropdown open/close ---
  const openDropdown = () => {
    if (dropdownOpen) return;
    dropdownOpen = true;
    document.body.append(dropdown);
    positionDropdown();
    createOpen = false;
    renderCreateVisibility();
    renderOptions();
  };
  const closeDropdown = () => {
    if (!dropdownOpen) return;
    dropdownOpen = false;
    dropdown.remove();
    createOpen = false;
    searchTerm = "";
    searchInput.value = "";
    renderCreateVisibility();
  };

  // --- Events ---
  searchInput.addEventListener("focus", openDropdown);
  searchInput.addEventListener("input", () => {
    searchTerm = searchInput.value;
    if (!dropdownOpen) openDropdown();
    renderOptions();
  });
  combobox.addEventListener("click", (ev) => {
    if (ev.target === affordance || ev.target === combobox) {
      searchInput.focus();
    }
  });
  newLink.addEventListener("click", (ev) => {
    ev.stopPropagation();
    createOpen = true;
    renderCreateVisibility();
    nameInput.focus();
  });
  createBtn.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }
    createErr.textContent = "";
    try {
      await withBusy(createBtn, async () => {
        const payload = { name };
        if (colorSelect._value) payload.color = colorSelect._value;
        if (iconInput.value.trim()) payload.icon = iconInput.value.trim();
        await createLabel(hass, payload);
        await refreshLabels();
        const created = allLabels.find((l) => l.name === name);
        if (created) {
          labelIds.add(created.label_id);
          renderChips();
          renderOptions();
          fire();
        }
        showToast(`Created label “${name}”`, "success", 2000);
        createOpen = false;
        nameInput.value = "";
        colorSelect._value = "";
        if (customElements.get("ha-select")) colorSelect.value = "";
        iconInput.value = "";
        renderCreateVisibility();
        searchInput.focus();
      });
    } catch (e) { createErr.textContent = String(e.message || e); }
  });

  // Outside click closes dropdown + collapses create form.
  document.addEventListener("click", (ev) => {
    if (!dropdownOpen) return;
    if (ev.composedPath().includes(combobox) ||
        ev.composedPath().includes(dropdown)) return;
    closeDropdown();
  });

  // --- Load + refresh ---
  let refreshLabels;
  const load = () => {
    refreshLabels = async () => {
      try {
        allLabels = (await listLabels(hass)).slice().sort((a, b) =>
          a.name.localeCompare(b.name));
      } catch { allLabels = []; }
      renderChips();
      if (dropdownOpen) renderOptions();
    };
    return refreshLabels();
  };
  load();

  // Dropdown starts detached; appended to document.body on open.
  renderCreateVisibility();

  return { container, get, set, refreshLabels: () => load() };
}