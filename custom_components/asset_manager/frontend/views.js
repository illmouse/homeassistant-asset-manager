/**
 * Asset Manager — view renderers.
 *
 * Three view renderers, each a function taking the panel instance so it
 * can read/mutate the same state the original methods did:
 *   - renderListView(panel)   — assets list with filter / sort / tag chips
 *   - renderDetailView(panel) — single asset with Info + Entities tabs
 *   - renderTemplatesView(panel) — templates list with create/edit/delete
 *
 * Plus `renderEmptyState(...)` used by multiple views.
 */

import { h, clear } from "./dom.js";
import {
  updateAsset,
  updateEntity,
  deleteEntity,
  deleteAsset,
  templateDelete,
  getAreas,
  updateArea,
  getAssetLabels,
  updateAssetLabels,
} from "./ws.js";
import { showToast, confirmDialog, withBusy, makeSwitch, openModal } from "./ui.js";
import {
  assetCreateDialog,
  cloneDialog,
  templatePickerDialog,
  entityEditorDialog,
  templateEditorDialog,
} from "./dialogs.js";
import { buildIconPicker, buildAreaPicker } from "./pickers.js";
import { buildLabelPicker } from "./labelPicker.js";
import { labelColorToCss } from "./constants.js";
import { haInput, haSelect } from "./native-fields.js";

export const renderEmptyState = (icon, title, body) =>
  h("div", { class: "am-empty" },
    h("ha-icon", { icon }),
    h("div", { style: "font-weight:500; margin-bottom:4px" }, title),
    h("div", {}, body));

// -- assets list with filter / sort / label chips --------------------
// Column metadata: key -> {label, sortable}. `icon` is a special
// non-sortable, no-header column. The "Actions" column is appended
// automatically and not in this map.
const LIST_COLUMNS = [
  { key: "icon", label: "", sortable: false },
  { key: "name", label: "Name", sortable: true },
  { key: "manufacturer", label: "Manufacturer", sortable: true },
  { key: "model", label: "Model", sortable: true },
  { key: "serial", label: "Serial", sortable: true },
  { key: "area", label: "Area", sortable: true },
  { key: "entities", label: "Entities", sortable: true },
  { key: "labels", label: "Labels", sortable: false },
];

const chipStyle = (color) => {
  const css = labelColorToCss(color);
  return css ? `border-color:${css}; color:${css};` : "";
};

export function renderListView(panel) {
  const hass = panel._hass;

  const header = h("div", { class: "am-toolbar" },
    h("h2", { class: "am-title am-grow", style: "margin:0" }, "Assets"),
    h("button", { class: "am-btn secondary",
      onClick: () => { panel._view = { name: "templates" }; panel._render(); } }, "Templates"),
    h("button", { class: "am-btn",
      onClick: () => assetCreateDialog(hass, (id) => panel._goDetail(id)) }, "+ Add asset"));

  const card = h("div", { class: "am-card" });
  if (panel._assets.size === 0) {
    card.append(renderEmptyState("mdi:package-variant-closed", "No assets yet",
      "Click “Add asset” to create one, then apply a template or build entities from scratch."));
    return h("div", { class: `am-root${panel._narrow ? " am-narrow" : ""}` }, header, card);
  }

  // Build filter controls. We keep them mounted and only re-render
  // the list portion when the filter changes, so the search input keeps
  // focus and the caret position is preserved.
  const search = haInput({
    type: "search",
    placeholder: "Search by name, manufacturer, model, or serial…",
    value: panel._search,
    oninput: () => { panel._search = search.value; renderTable(); },
  });

  // Column picker: a small dropdown with checkboxes for each column.
  const colPickerBtn = h("button", { class: "am-btn secondary am-col-picker-btn" }, "⚙ Columns");
  const colPickerDropdown = h("div", { class: "am-col-picker-dropdown", style: "display:none" });
  let colPickerOpen = false;
  for (const col of LIST_COLUMNS) {
    if (col.key === "icon") continue; // icon is always visible
    const checked = panel._listColumns.includes(col.key);
    const cb = h("input", { type: "checkbox", checked: checked ? true : null });
    cb.addEventListener("change", () => {
      const next = new Set(panel._listColumns);
      if (cb.checked) next.add(col.key);
      else next.delete(col.key);
      // Always keep name visible.
      if (!next.has("name")) next.add("name");
      panel._listColumns = LIST_COLUMNS.map((c) => c.key).filter((k) => next.has(k));
      // Keep icon first if present.
      if (!panel._listColumns.includes("icon")) panel._listColumns.unshift("icon");
      try { localStorage.setItem("am-list-columns", JSON.stringify(panel._listColumns)); } catch {}
      renderTable();
    });
    colPickerDropdown.append(h("label", { class: "am-col-picker-item" },
      cb, h("span", {}, col.label)));
  }
  colPickerBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    colPickerOpen = !colPickerOpen;
    colPickerDropdown.style.display = colPickerOpen ? "" : "none";
    if (colPickerOpen) {
      const close = (e) => {
        if (!e.composedPath().includes(colPickerDropdown) && e.target !== colPickerBtn) {
          colPickerOpen = false;
          colPickerDropdown.style.display = "none";
          document.removeEventListener("click", close);
        }
      };
      setTimeout(() => document.addEventListener("click", close), 0);
    }
  });
  const colPicker = h("div", { class: "am-col-picker" }, colPickerBtn, colPickerDropdown);

  const sort = haSelect({
    value: panel._sort,
    options: [
      { value: "name", label: "Sort: Name" },
      { value: "manufacturer", label: "Sort: Manufacturer" },
      { value: "entities", label: "Sort: Entity count" },
    ],
    onselected: (v) => { panel._sort = v; renderTable(); },
  });

  // Filter definitions. Each filter has a `type`:
  //   "text"        — supports pick-from-list (multi-select) and partial-match
  //                   (free-text, case-insensitive .includes()) modes.
  //   "categorical" — pick-from-list only (finite option set).
  // State shape: panel._filters[prop] = null | { mode:"pick", values:Set }
  //                                  | { mode:"match", text:string }.
  const filterDefs = [
    { prop: "area", label: "area", type: "text", options: () => {
        const ids = [...new Set([...panel._assetAreas.values()].filter(Boolean))];
        return ids.map((id) => {
          const area = panel._hass.areas && panel._hass.areas[id];
          return { value: id, label: area ? (area.name || id) : id };
        }).sort((a, b) => a.label.localeCompare(b.label));
      }, match: (a, f) => {
        const av = panel._assetAreas.get(a.id) || "";
        if (f.mode === "pick") return f.values.has(av);
        return av.toLowerCase().includes(f.text.toLowerCase());
      } },
    { prop: "manufacturer", label: "manufacturer", type: "text", options: () => {
        const vals = [...new Set([...panel._assets.values()]
          .map((a) => a.manufacturer).filter(Boolean))].sort();
        return vals.map((v) => ({ value: v, label: v }));
      }, match: (a, f) => {
        const av = a.manufacturer || "";
        if (f.mode === "pick") return f.values.has(av);
        return av.toLowerCase().includes(f.text.toLowerCase());
      } },
    { prop: "model", label: "model", type: "text", options: () => {
        const vals = [...new Set([...panel._assets.values()]
          .map((a) => a.model).filter(Boolean))].sort();
        return vals.map((v) => ({ value: v, label: v }));
      }, match: (a, f) => {
        const av = a.model || "";
        if (f.mode === "pick") return f.values.has(av);
        return av.toLowerCase().includes(f.text.toLowerCase());
      } },
    { prop: "entities", label: "entity count", type: "categorical", options: () => [
        { value: "0", label: "0 entities" },
        { value: "1-5", label: "1-5 entities" },
        { value: "6+", label: "6+ entities" },
      ], match: (a, f) => {
        const n = [...panel._entities.values()].filter((e) => e.asset_id === a.id).length;
        for (const v of f.values) {
          if (v === "0" && n === 0) return true;
          if (v === "1-5" && n >= 1 && n <= 5) return true;
          if (v === "6+" && n >= 6) return true;
        }
        return false;
      } },
    { prop: "icon", label: "icon", type: "categorical", options: () => [
        { value: "yes", label: "With icon" },
        { value: "no", label: "Without icon" },
      ], match: (a, f) => {
        for (const v of f.values) {
          if (v === "yes" && !!a.icon) return true;
          if (v === "no" && !a.icon) return true;
        }
        return false;
      } },
    { prop: "labels", label: "labels", type: "text", options: () => {
        const out = [...panel._labelRegistry.values()].sort((a, b) =>
          (a.name || "").localeCompare(b.name || ""));
        return out.map((l) => ({ value: l.label_id, label: l.name || l.label_id }));
      }, match: (a, f) => {
        const ids = panel._assetLabels.get(a.id) || [];
        if (f.mode === "pick") return ids.some((id) => f.values.has(id));
        const q = f.text.toLowerCase();
        return ids.some((id) => {
          const meta = panel._labelRegistry.get(id);
          return ((meta && meta.name) || id).toLowerCase().includes(q);
        });
      } },
  ];

  // Active check: pick→non-empty Set, match→non-empty trimmed text.
  const isFilterActive = (fd) => {
    const f = panel._filters[fd.prop];
    if (!f) return false;
    if (f.mode === "pick") return f.values.size > 0;
    return !!f.text.trim();
  };

  // Sanitize stored pick-mode selections against current options (a value
  // may no longer be present after assets are added/removed). Match-mode
  // filters need no sanitization.
  for (const fd of filterDefs) {
    const f = panel._filters[fd.prop];
    if (!f || f.mode !== "pick") continue;
    const optIds = new Set(fd.options().map((o) => o.value));
    for (const v of [...f.values]) if (!optIds.has(v)) f.values.delete(v);
    if (f.values.size === 0) panel._filters[fd.prop] = null;
  }

  // Filter button: opens a modal with one row per filterable property.
  const filterBtnLabel = () => {
    const n = filterDefs.filter((fd) => isFilterActive(fd)).length;
    return n ? `Filters (${n})` : "Filters";
  };
  const filterBtn = h("button", { class: "am-btn secondary am-filter-btn" }, filterBtnLabel());
  const refreshFilterBtn = () => { filterBtn.textContent = filterBtnLabel(); };

  // Build the multi-select combobox (single-line input with chips +
  // dropdown, reusing .am-label-combobox* CSS). Returns { container, sync() }.
  const buildFilterCombobox = (fd) => {
    const f = panel._filters[fd.prop];
    const selected = (f && f.mode === "pick") ? f.values : new Set();
    let allOpts = fd.options();
    let searchTerm = "";
    let dropdownOpen = false;

    const searchInput = h("input", {
      class: "am-label-combobox-text",
      placeholder: selected.size ? "" : `Filter by ${fd.label}…`,
      value: "",
    });
    const chipsHolder = h("span", { class: "am-label-combobox-chips" });
    const affordance = h("span", { class: "am-label-combobox-arrow" }, "▾");
    const combobox = h("div", { class: "am-label-combobox" },
      chipsHolder, searchInput, affordance);
    const optionsList = h("div", { class: "am-label-options" });
    // position:fixed so the dropdown escapes the modal's overflow:auto.
    // Toggled via append/remove to document.body; no inline display style.
    const dropdown = h("div", {
      class: "am-label-dropdown am-filter-dropdown",
      style: "position:fixed",
    }, optionsList);

    const ensureFilter = () => {
      let cur = panel._filters[fd.prop];
      if (!cur || cur.mode !== "pick") {
        cur = { mode: "pick", values: new Set() };
        panel._filters[fd.prop] = cur;
      }
      return cur;
    };
    const optLabel = (v) => {
      const o = allOpts.find((o) => o.value === v);
      return o ? o.label : v;
    };

    const renderChips = () => {
      clear(chipsHolder);
      for (const v of selected) {
        chipsHolder.append(h("span", {
          class: "am-label-chip",
          style: "font-size:12px",
        },
          h("span", {}, optLabel(v)),
          h("span", {
            class: "am-label-chip-x",
            title: "Remove",
            onClick: (ev) => {
              ev.stopPropagation();
              selected.delete(v);
              const cur = ensureFilter();
              cur.values.delete(v);
              renderChips();
              if (dropdownOpen) { positionDropdown(); renderOptions(); }
            },
          }, "×")));
      }
      searchInput.placeholder = selected.size ? "" : `Filter by ${fd.label}…`;
    };

    const renderOptions = () => {
      clear(optionsList);
      const q = searchTerm.trim().toLowerCase();
      const matching = allOpts.filter((o) => !q || o.label.toLowerCase().includes(q));
      if (matching.length === 0) {
        optionsList.append(h("p", { class: "am-muted", style: "margin:0 0 6px" },
          q ? "No matches." : "No options."));
        return;
      }
      for (const o of matching) {
        const isSel = selected.has(o.value);
        optionsList.append(h("div", {
          class: `am-label-option${isSel ? " selected" : ""}`,
          title: o.label,
          onClick: () => {
            if (isSel) selected.delete(o.value);
            else selected.add(o.value);
            const cur = ensureFilter();
            if (isSel) cur.values.delete(o.value);
            else cur.values.add(o.value);
            renderChips();
            renderOptions();
          },
        },
          h("span", { class: "am-label-check" }, ""),
          h("span", { class: "am-label-option-text" }, o.label)));
      }
    };

    const positionDropdown = () => {
      const r = combobox.getBoundingClientRect();
      dropdown.style.left = `${r.left}px`;
      dropdown.style.top = `${r.bottom + 4}px`;
      dropdown.style.width = `${r.width}px`;
      dropdown.style.minWidth = `${r.width}px`;
    };

    const openDropdown = () => {
      if (dropdownOpen) return;
      dropdownOpen = true;
      allOpts = fd.options();
      document.body.append(dropdown);
      dropdown.style.display = "";
      positionDropdown();
      renderOptions();
    };
    const closeDropdown = () => {
      if (!dropdownOpen) return;
      dropdownOpen = false;
      dropdown.remove();
      searchTerm = "";
      searchInput.value = "";
      renderChips();
    };

    searchInput.addEventListener("focus", openDropdown);
    searchInput.addEventListener("input", () => {
      searchTerm = searchInput.value;
      if (!dropdownOpen) openDropdown();
      renderOptions();
    });
    combobox.addEventListener("click", (ev) => {
      if (ev.target === affordance || ev.target === combobox) searchInput.focus();
    });
    const onOutside = (ev) => {
      if (!dropdownOpen) return;
      if (ev.composedPath().includes(combobox) ||
          ev.composedPath().includes(dropdown)) return;
      closeDropdown();
    };
    const onScrollOrResize = () => { if (dropdownOpen) positionDropdown(); };
    document.addEventListener("click", onOutside);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);

    renderChips();
    return {
      container: h("div", { class: "am-label-picker" }, combobox),
      sync: () => {
        allOpts = fd.options();
        renderChips();
      },
    };
  };

  // Build one filter row in the dialog.
  const buildFilterRow = (fd) => {
    const row = h("div", { class: "am-filter-dialog-row" },
      h("label", { class: "am-filter-dialog-label" }, fd.label));

    const holder = h("div", {});
    row.append(holder);

    const renderMode = () => {
      clear(holder);
      const f = panel._filters[fd.prop];

      // Text filters get a mode toggle.
      if (fd.type === "text") {
        const curMode = (f && f.mode) || "pick";
        const modeSel = haSelect({
          value: curMode,
          options: [
            { value: "pick", label: "Pick from list" },
            { value: "match", label: "Partial match" },
          ],
          onselected: (v) => {
            if (v === "pick") panel._filters[fd.prop] = { mode: "pick", values: new Set() };
            else panel._filters[fd.prop] = { mode: "match", text: "" };
            renderMode();
          },
        });
        holder.append(modeSel);
      }

      const mode = (f && f.mode) || "pick";
      if (mode === "pick") {
        holder.append(buildFilterCombobox(fd).container);
      } else {
        const inp = haInput({
          type: "text",
          placeholder: `Partial ${fd.label} match…`,
          value: (f && f.text) || "",
          oninput: () => {
            let cur = panel._filters[fd.prop];
            if (!cur || cur.mode !== "match") {
              cur = { mode: "match", text: "" };
              panel._filters[fd.prop] = cur;
            }
            cur.text = inp.value;
          },
        });
        holder.append(inp);
      }
    };
    renderMode();
    return row;
  };

  filterBtn.addEventListener("click", () => {
    const close = openModal(h("div", { class: "am-filter-dialog" },
      h("div", { class: "am-modal-title" }, "Filter assets"),
      ...filterDefs.map(buildFilterRow),
      h("div", { class: "am-modal-actions" },
        h("button", { class: "am-btn secondary", onClick: () => {
          for (const fd of filterDefs) panel._filters[fd.prop] = null;
          refreshFilterBtn();
          renderTable();
          close.remove();
        }}, "Clear all"),
        h("button", { class: "am-btn", onClick: () => {
          refreshFilterBtn();
          renderTable();
          close.remove();
        }}, "Apply"))
    ));
    close.addEventListener("click", (e) => {
      if (e.target === close) { refreshFilterBtn(); renderTable(); }
    });
  });

  // Label chips derived from all assets' device labels. We fetch the
  // asset→labels map async, plus the label registry for display names.
  const labelsRow = h("div", { class: "am-tags" });
  const renderLabels = () => {
    clear(labelsRow);
    const freq = new Map();
    for (const ids of panel._assetLabels.values()) {
      for (const lid of (ids || [])) freq.set(lid, (freq.get(lid) || 0) + 1);
    }
    const TOP_N = 10;
    const nameCompare = (a, b) => {
      const na = (panel._labelRegistry.get(a) || {}).name || a;
      const nb = (panel._labelRegistry.get(b) || {}).name || b;
      return na.localeCompare(nb);
    };
    const sortedByFreq = [...freq.keys()].sort((a, b) =>
      (freq.get(b) || 0) - (freq.get(a) || 0) || nameCompare(a, b));
    let visible = sortedByFreq.slice(0, TOP_N);
    for (const lid of panel._activeLabels) {
      if (!visible.includes(lid)) visible.push(lid);
    }
    if (!visible.length) return;
    for (const lid of visible) {
      const meta = panel._labelRegistry.get(lid) || {};
      const active = panel._activeLabels.has(lid);
      const css = chipStyle(meta.color);
      const chip = h("span", {
        class: `am-label-chip${active ? " active" : ""}`,
        style: active ? "" : css,
        title: meta.description || "",
        onClick: () => {
          if (active) panel._activeLabels.delete(lid);
          else panel._activeLabels.add(lid);
          renderTable();
          renderLabels();
        },
      },
        meta.icon ? h("ha-icon", { icon: meta.icon, style: "margin-right:4px" }) : null,
        meta.name || lid);
      labelsRow.append(chip);
    }
  };
  renderLabels();

  // Table container — rebuilt on filter change, leaving inputs intact.
  const tableHolder = h("div", { class: "am-table-scroll" });
  const renderTable = () => {
    const q = panel._search.trim().toLowerCase();
    const activeLabels = panel._activeLabels;
    let items = [...panel._assets.values()].filter((a) => {
      if (activeLabels.size) {
        const ids = panel._assetLabels.get(a.id) || [];
        if (![...activeLabels].some((id) => ids.includes(id))) return false;
      }
      if (!q) return true;
      return a.name.toLowerCase().includes(q) ||
        (a.manufacturer || "").toLowerCase().includes(q) ||
        (a.model || "").toLowerCase().includes(q) ||
        (a.serial || "").toLowerCase().includes(q);
    });
    // Apply multi-property filters (AND combination; OR within each filter).
    const activeFilters = filterDefs.filter((fd) => isFilterActive(fd));
    if (activeFilters.length) {
      items = items.filter((a) => activeFilters.every((fd) => fd.match(a, panel._filters[fd.prop])));
    }
    const entityCount = (id) => [...panel._entities.values()].filter((e) => e.asset_id === id).length;
    const desc = panel._sortDir === "desc";
    items.sort((a, b) => {
      let r;
      if (panel._sort === "manufacturer") r = (a.manufacturer || "").localeCompare(b.manufacturer || "");
      else if (panel._sort === "model") r = (a.model || "").localeCompare(b.model || "");
      else if (panel._sort === "serial") r = (a.serial || "").localeCompare(b.serial || "");
      else if (panel._sort === "area") r = panel._areaName(a.id).localeCompare(panel._areaName(b.id));
      else if (panel._sort === "entities") r = entityCount(a.id) - entityCount(b.id);
      else r = a.name.localeCompare(b.name);
      return desc ? -r : r;
    });
    clear(tableHolder);
    if (!items.length) {
      const reasons = [];
      if (activeLabels.size) {
        const names = [...activeLabels].map((id) =>
          (panel._labelRegistry.get(id) || {}).name || id);
        reasons.push(`label${activeLabels.size > 1 ? "s" : ""} ${names.map((n) => `“${n}”`).join(", ")}`);
      }
      const active = filterDefs.filter((fd) => isFilterActive(fd));
      if (active.length) reasons.push(`${active.length} filter${active.length > 1 ? "s" : ""}`);
      if (q) reasons.push(`search “${panel._search}”`);
      tableHolder.append(h("p", { class: "am-muted", style: "text-align:center" },
        reasons.length ? `No assets match: ${reasons.join(" + ")}.` : "No assets."));
      return;
    }

    const visibleCols = panel._listColumns;
    const thead = h("tr", {},
      ...visibleCols.map((key) => {
        const col = LIST_COLUMNS.find((c) => c.key === key);
        if (!col || key === "icon") return h("th", { class: "am-table-icon-th" }, "");
        const isActive = panel._sort === key;
        const indicator = isActive ? (panel._sortDir === "desc" ? " ▾" : " ▴") : "";
        return col.sortable
          ? h("th", { class: "am-table-sortable" + (isActive ? " active" : ""),
              onClick: () => {
                if (panel._sort === key) {
                  panel._sortDir = panel._sortDir === "asc" ? "desc" : "asc";
                } else {
                  panel._sort = key;
                  panel._sortDir = "asc";
                }
                renderTable();
              } },
              col.label + indicator)
          : h("th", {}, col.label);
      }),
      h("th", { class: "am-table-actions-th" }, ""));

    const tbodyRows = items.map((asset) => {
      const ents = entityCount(asset.id);
      const cells = visibleCols.map((key) => {
        switch (key) {
          case "icon":
            return h("td", { class: "am-table-icon-td" },
              asset.icon ? h("ha-icon", { icon: asset.icon }) : null);
          case "name":
            return h("td", { class: "am-table-name" },
              h("span", { class: "am-table-link",
                          onClick: () => panel._goDetail(asset.id) },
                asset.name));
          case "manufacturer":
            return h("td", {}, asset.manufacturer || "");
          case "model":
            return h("td", {}, asset.model || "");
          case "serial":
            return h("td", {}, asset.serial || "");
          case "area": {
            const name = panel._areaName(asset.id);
            return h("td", {}, name);
          }
          case "entities":
            return h("td", {}, String(ents));
          case "labels": {
            const ids = panel._assetLabels.get(asset.id) || [];
            if (!ids.length) return h("td", {});
            const shown = ids.slice(0, 3);
            const extra = ids.length - shown.length;
            const chips = shown.map((lid) => {
              const meta = panel._labelRegistry.get(lid) || {};
              return h("span", {
                class: "am-label-chip am-table-chip",
                style: chipStyle(meta.color),
                title: meta.description || "",
              }, meta.name || lid);
            });
            if (extra > 0) chips.push(h("span", { class: "am-muted" }, `+${extra}`));
            return h("td", {}, h("div", { class: "am-table-chips" }, ...chips));
          }
          default:
            return h("td", {}, "");
        }
      });
        cells.push(h("td", {},
        h("div", { class: "am-table-actions" },
          h("button", { class: "am-btn secondary",
            onClick: (ev) => { ev.stopPropagation(); cloneDialog(hass, asset, () => {}); } }, "Clone"),
          h("button", { class: "am-btn danger", onClick: async (ev) => {
            ev.stopPropagation();
            const ok = await confirmDialog(`Delete asset “${asset.name}” and all its entities?`,
              { danger: true, confirmLabel: "Delete" });
            if (!ok) return;
            try { await withBusy(null, async () => { await deleteAsset(hass, asset.id); });
              showToast(`Deleted “${asset.name}”`, "success"); }
            catch (e) { showToast(String(e.message || e), "error", 6000); }
          }}, "Delete"))));
      return h("tr", { class: "am-table-row", onClick: () => panel._goDetail(asset.id) }, ...cells);
    });

    tableHolder.append(h("table", { class: "am-table" },
      h("thead", {}, thead),
      h("tbody", {}, ...tbodyRows)));
  };

  renderTable();

  card.append(h("div", { class: "am-filters" }, search, colPicker, filterBtn), labelsRow, tableHolder);
  return h("div", { class: `am-root${panel._narrow ? " am-narrow" : ""}` }, header, card);
}

export function renderDetailView(panel) {
  const hass = panel._hass;
  const asset = panel._assets.get(panel._view.assetId);
  if (!asset) { panel._goList(); return h("div"); }
  const entities = [...panel._entities.values()]
    .filter((e) => e.asset_id === asset.id)
    .sort((a, b) => a.slug.localeCompare(b.slug));
  const tabs = ["info", "entities"].map((t) =>
    h("div", { class: `am-tab ${panel._view.tab === t ? "active" : ""}`,
               onClick: () => { panel._view.tab = t; panel._render(); } },
      t === "info" ? "Info" : `Entities (${entities.length})`));

  let body;
  if (panel._view.tab === "info") body = renderInfoTab(panel, hass, asset);
  else body = renderEntitiesTab(panel, hass, asset, entities);

  return h("div", { class: `am-root${panel._narrow ? " am-narrow" : ""}` },
    h("div", { class: "am-toolbar" },
      h("button", { class: "am-btn secondary", onClick: () => panel._goList() }, "← Back"),
      h("h2", { class: "am-title am-grow", style: "margin:0" }, asset.name),
      h("button", { class: "am-btn secondary",
        onClick: () => templatePickerDialog(hass, asset, (created, appliedLabels) => {
          if (appliedLabels && appliedLabels.length) {
            panel._assetLabels.set(asset.id, appliedLabels);
          }
          panel._render();
        }) }, "Apply template"),
      h("button", { class: "am-btn secondary",
        onClick: () => cloneDialog(hass, asset, () => {}) }, "Clone")),
    h("div", { class: "am-card" }, h("div", { class: "am-tabs" }, ...tabs), body));
}

function renderInfoTab(panel, hass, asset) {
  const make = (field, label, type = "text") => {
    const input = haInput({
      type,
      value: asset[field] == null ? "" : asset[field],
      onchange: async () => {
        try { await withBusy(null, async () => {
          await updateAsset(hass, asset.id, { [field]: input.value || null }); });
          showToast("Saved", "success", 2000);
        }
        catch (e) { showToast(String(e.message || e), "error", 6000); }
      },
    });
    return h("div", { class: "am-field" }, h("label", {}, label), input);
  };

  // Icon picker: native ha-icon-picker (searchable dropdown of mdi glyphs).
  // Saves on selection; falls back to a text input if the element is absent.
  const saveIcon = async (val) => {
    try { await withBusy(null, async () => {
      await updateAsset(hass, asset.id, { icon: val || null }); });
      showToast("Icon saved", "success", 2000);
    } catch (e) { showToast(String(e.message || e), "error", 6000); }
  };
  const iconPicker = buildIconPicker(asset.icon || "", (val) => saveIcon(val));

  // Area picker: native ha-area-picker pulls areas from @lit/context
  // providers in HA's app tree. The current area_id still comes from
  // the WS get_areas call (which maps asset_id -> area_id via the
  // device registry), so we await that before constructing the picker.
  const areaHolder = h("div", {});
  getAreas(hass).then(({ asset_areas }) => {
    const current = asset_areas[asset.id] || null;
    const onSave = async (val) => {
      try { await withBusy(null, async () => {
            await updateArea(hass, asset.id, val); });
        showToast("Area saved", "success", 2000);
      } catch (e) { showToast(String(e.message || e), "error", 6000); }
    };
    const areaPicker = buildAreaPicker(hass, current, onSave);
    areaHolder.append(areaPicker.container);
  }).catch(() => {
    areaHolder.append(h("p", { class: "am-muted" }, "Area unavailable."));
  });

  // Label picker: native HA labels assigned to the asset's device.
  // The current label_ids come from getAssetLabels; changes persist
  // immediately via updateAssetLabels (full-replace semantics).
  const labelHolder = h("div", {});
  getAssetLabels(hass).then(({ asset_labels }) => {
    const current = asset_labels[asset.id] || [];
    const labelPicker = buildLabelPicker(hass, current, async (labelIds) => {
      try { await withBusy(null, async () => {
        await updateAssetLabels(hass, asset.id, labelIds); });
        showToast("Labels saved", "success", 2000);
      } catch (e) { showToast(String(e.message || e), "error", 6000); }
    });
    labelHolder.append(labelPicker.container);
    // Keep the panel's label map in sync so the list view reflects changes.
    panel._assetLabels.set(asset.id, labelIds);
  }).catch(() => {
    labelHolder.append(h("p", { class: "am-muted" }, "Labels unavailable."));
  });

  return h("div", { class: "am-grid" },
    make("name", "Name"),
    make("manufacturer", "Manufacturer"),
    make("model", "Model"),
    make("serial", "Serial"),
    h("div", { class: "am-field", style: "grid-column: 1 / -1" },
      h("label", {}, "Icon"), iconPicker.container),
    h("div", { class: "am-field" },
      h("label", {}, "Area"), areaHolder),
    h("div", { class: "am-field", style: "grid-column: 1 / -1" },
      h("label", {}, "Labels"), labelHolder));
}

function renderEntitiesTab(panel, hass, asset, entities) {
  const wrap = h("div", {});
  const add = h("button", { class: "am-btn",
    onClick: () => entityEditorDialog(hass, asset, null, () => {}) }, "+ Add entity");

  if (entities.length === 0) {
    wrap.append(renderEmptyState("mdi:format-list-bulleted", "No entities yet",
      "Add one manually or apply a template."), h("div", { style: "text-align:center; margin-top:8px" }, add));
    return wrap;
  }

  // Batch toolbar: select-all + enable/disable/delete on selection.
  const useNativeCb = customElements.get("ha-checkbox");
  const selectAll = useNativeCb
    ? document.createElement("ha-checkbox")
    : h("input", { type: "checkbox", class: "am-checkbox" });
  const batchLabel = h("span", { class: "am-grow" }, `${panel._selectedEntityIds.size} selected`);
  const batchEnable = h("button", { class: "am-btn", disabled: "" }, "Enable");
  const batchDisable = h("button", { class: "am-btn secondary", disabled: "" }, "Disable");
  const batchDelete = h("button", { class: "am-btn danger", disabled: "" }, "Delete");
  const batchBar = h("div", { class: "am-batch-bar" },
    selectAll, batchLabel, batchEnable, batchDisable, batchDelete);

  const updateBatchBar = () => {
    const n = panel._selectedEntityIds.size;
    batchLabel.textContent = `${n} selected`;
    batchEnable.disabled = n === 0;
    batchDisable.disabled = n === 0;
    batchDelete.disabled = n === 0;
    selectAll.checked = entities.length > 0 && n === entities.length;
  };

  selectAll.addEventListener("change", () => {
    if (selectAll.checked) entities.forEach((e) => panel._selectedEntityIds.add(e.id));
    else panel._selectedEntityIds.clear();
    panel._render();
  });

  const runBatch = async (fn, okMsg) => {
    const ids = [...panel._selectedEntityIds];
    let errs = 0;
    for (const id of ids) {
      try { await fn(id); }
      catch (e) { errs++; showToast(String(e.message || e), "error", 6000); }
    }
    panel._selectedEntityIds.clear();
    showToast(`${okMsg} (${ids.length - errs}/${ids.length})`, errs ? "info" : "success");
    panel._render();
  };
  batchEnable.addEventListener("click", () =>
    runBatch((id) => updateEntity(hass, id, { enabled: true }), "Enabled"));
  batchDisable.addEventListener("click", () =>
    runBatch((id) => updateEntity(hass, id, { enabled: false }), "Disabled"));
  batchDelete.addEventListener("click", async () => {
    const n = panel._selectedEntityIds.size;
    const ok = await confirmDialog(`Delete ${n} entit${n === 1 ? "y" : "ies"}?`,
      { danger: true, confirmLabel: "Delete" });
    if (!ok) return;
    await runBatch((id) => deleteEntity(hass, id), "Deleted");
  });

  const list = h("div", {});
  for (const e of entities) {
    const selected = panel._selectedEntityIds.has(e.id);
    const checkbox = useNativeCb
      ? document.createElement("ha-checkbox")
      : h("input", { type: "checkbox", class: "am-checkbox" });
    checkbox.checked = selected;
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) panel._selectedEntityIds.add(e.id);
      else panel._selectedEntityIds.delete(e.id);
      updateBatchBar();
    });

    // Inline enabled toggle (quick UX) — patches only `enabled`.
    const toggle = makeSwitch(e.enabled, async (next) => {
      try { await withBusy(toggle, async () => {
        await updateEntity(hass, e.id, { enabled: next }); });
        showToast(`“${e.name}” ${next ? "enabled" : "disabled"}`, "success", 2000);
      } catch (err) {
        toggle.checked = !next; // revert
        showToast(String(err.message || err), "error", 6000);
      }
    });

    // Inline value editor for writable kinds (number/text). For
    // derived/button/etc. we skip the inline input — editing those
    // values from the panel would be misleading.
    let inlineValue = null;
    if (e.kind === "number" || e.kind === "text") {
      inlineValue = haInput({
        type: e.kind === "number" ? "number" : "text",
        value: e.value == null ? "" : String(e.value),
        placeholder: "value",
        onchange: async () => {
          const raw = inlineValue.value.trim();
          let next;
          if (raw === "") next = null;
          else if (e.kind === "number") next = Number(raw);
          else next = raw;
          try { await withBusy(null, async () => {
            await updateEntity(hass, e.id, { value: next }); });
            showToast("Value saved", "success", 2000);
          } catch (err) {
            inlineValue.value = e.value == null ? "" : String(e.value);
            showToast(String(err.message || err), "error", 6000);
          }
        },
      });
      inlineValue.classList.add("am-inline-value");
    }

    const summary = h("div", { class: "am-entity-summary am-grow" },
      h("span", { class: "am-entity-name" }, e.name),
      h("span", { class: "am-entity-meta" },
        `${e.slug} · ${e.kind}${e.unit_of_measurement ? ` · ${e.unit_of_measurement}` : ""}`));

    const editBtn = h("button", { class: "am-btn secondary",
      onClick: () => entityEditorDialog(hass, asset, e, () => {}) }, "Edit");

    list.append(h("div", { class: "am-row am-entity-row" },
      h("div", { class: "am-entity-head" }, checkbox, summary),
      h("div", { class: "am-entity-controls" }, inlineValue, toggle, editBtn)));
  }

  wrap.append(batchBar, list, h("div", { style: "margin-top:12px" }, add));
  updateBatchBar();
  return wrap;
}

// -- templates view -------------------------------------------------
export function renderTemplatesView(panel) {
  const hass = panel._hass;
  const header = h("div", { class: "am-toolbar" },
    h("button", { class: "am-btn secondary", onClick: () => panel._goList() }, "← Back"),
    h("h2", { class: "am-title am-grow", style: "margin:0" }, "Templates"),
    h("button", { class: "am-btn",
      onClick: () => templateEditorDialog(hass, null, () => {}) }, "+ New template"));

  const card = h("div", { class: "am-card" });
  const templates = [...panel._templates.values()].sort((a, b) => a.name.localeCompare(b.name));
  if (templates.length === 0) {
    card.append(renderEmptyState("mdi:file-document-outline", "No templates",
      "Create a template to reuse entity specs across assets."));
  } else for (const t of templates) {
    const iconEl = t.icon
      ? h("ha-icon", { icon: t.icon, style: "margin-right:6px;vertical-align:middle" })
      : null;
    card.append(h("div", { class: "am-row am-row-clickable",
      onClick: () => templateEditorDialog(hass, t, () => {}) },
      h("span", { class: "am-grow" },
        iconEl,
        h("span", { style: "font-weight:500" }, t.name),
        h("span", { class: "am-muted" }, ` · ${t.entities?.length || 0} entities`)),
      h("button", { class: "am-btn secondary",
        onClick: (ev) => { ev.stopPropagation(); templateEditorDialog(hass, t, () => {}); } }, "Edit"),
      h("button", { class: "am-btn danger", onClick: async (ev) => {
        ev.stopPropagation();
        const ok = await confirmDialog(`Delete template “${t.name}”?`,
          { danger: true, confirmLabel: "Delete" });
        if (!ok) return;
        try { await withBusy(null, async () => { await templateDelete(hass, t.id); });
          showToast(`Deleted “${t.name}”`, "success"); }
        catch (e) { showToast(String(e.message || e), "error", 6000); }
      }}, "Delete")));
  }
  return h("div", { class: `am-root${panel._narrow ? " am-narrow" : ""}` }, header, card);
}