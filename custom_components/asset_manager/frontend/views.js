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
import { showToast, confirmDialog, withBusy, makeSwitch } from "./ui.js";
import {
  assetCreateDialog,
  cloneDialog,
  templatePickerDialog,
  entityEditorDialog,
  templateEditorDialog,
} from "./dialogs.js";
import { buildIconPicker, buildAreaPicker } from "./pickers.js";
import { buildLabelPicker } from "./labelPicker.js";

export const renderEmptyState = (icon, title, body) =>
  h("div", { class: "am-empty" },
    h("div", { class: "am-empty-icon" }, icon),
    h("div", { style: "font-weight:500; margin-bottom:4px" }, title),
    h("div", {}, body));

// -- assets list with filter / sort / label chips --------------------
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
  const search = h("input", { class: "am-input am-search", type: "search",
    placeholder: "Search by name, manufacturer, or model…", value: panel._search });
  const sort = h("select", { class: "am-select am-sort" },
    h("option", { value: "name", selected: panel._sort === "name" }, "Sort: Name"),
    h("option", { value: "manufacturer", selected: panel._sort === "manufacturer" }, "Sort: Manufacturer"),
    h("option", { value: "entities", selected: panel._sort === "entities" }, "Sort: Entity count"));
  sort.addEventListener("change", () => { panel._sort = sort.value; refreshList(); });

  // Label chips derived from all assets' device labels. We fetch the
  // asset→labels map async, plus the label registry for display names.
  const labelsRow = h("div", { class: "am-tags" });
  const renderLabels = () => {
    clear(labelsRow);
    const allLabelIds = [...new Set([...panel._assetLabels.values()]
      .flatMap((ids) => ids || []))].sort((a, b) => {
      const na = (panel._labelRegistry.get(a) || {}).name || a;
      const nb = (panel._labelRegistry.get(b) || {}).name || b;
      return na.localeCompare(nb);
    });
    if (!allLabelIds.length) return;
    for (const lid of allLabelIds) {
      const meta = panel._labelRegistry.get(lid) || {};
      const active = panel._activeLabel === lid;
      const css = meta.color ? `border-color:var(--label-color-${meta.color}, var(--state-active-color, #03a9f4)); color:var(--label-color-${meta.color}, var(--state-active-color, #03a9f4));` : "";
      const chip = h("span", {
        class: `am-label-chip${active ? " active" : ""}`,
        style: active ? "" : css,
        title: meta.description || "",
        onClick: () => { panel._activeLabel = active ? null : lid; refreshList(); renderLabels(); },
      },
        meta.icon ? h("ha-icon", { icon: meta.icon, style: "margin-right:4px" }) : null,
        meta.name || lid);
      labelsRow.append(chip);
    }
  };
  renderLabels();

  // List container — rebuilt on filter change, leaving inputs intact.
  const listHolder = h("div", {});
  const refreshList = () => {
    const q = panel._search.trim().toLowerCase();
    const labelId = panel._activeLabel;
    let items = [...panel._assets.values()].filter((a) => {
      if (labelId && !((panel._assetLabels.get(a.id) || []).includes(labelId))) return false;
      if (!q) return true;
      return a.name.toLowerCase().includes(q) ||
        (a.manufacturer || "").toLowerCase().includes(q) ||
        (a.model || "").toLowerCase().includes(q);
    });
    const entityCount = (id) => [...panel._entities.values()].filter((e) => e.asset_id === id).length;
    items.sort((a, b) => {
      if (panel._sort === "manufacturer") return (a.manufacturer || "").localeCompare(b.manufacturer || "");
      if (panel._sort === "entities") return entityCount(b.id) - entityCount(a.id);
      return a.name.localeCompare(b.name);
    });
    clear(listHolder);
    if (!items.length) {
      listHolder.append(h("p", { class: "am-muted", style: "text-align:center" },
        labelId ? `No assets with label “${(panel._labelRegistry.get(labelId) || {}).name || labelId}”.` : `No assets match “${panel._search}”.`));
      return;
    }
    for (const asset of items) {
      const ents = entityCount(asset.id);
      const iconEl = asset.icon
        ? h("ha-icon", { icon: asset.icon, style: "margin-right:6px;vertical-align:middle" })
        : null;
      listHolder.append(h("div", { class: "am-row" },
        h("span", { class: "am-grow", style: "cursor:pointer;font-weight:500",
                    onClick: () => panel._goDetail(asset.id) },
          iconEl,
          `${asset.name} `,
          h("span", { class: "am-muted", style: "font-weight:normal" },
            `· ${ents} entit${ents === 1 ? "y" : "ies"}`)),
        h("button", { class: "am-btn secondary",
          onClick: () => cloneDialog(hass, asset, () => {}) }, "Clone"),
        h("button", { class: "am-btn danger", onClick: async () => {
          const ok = await confirmDialog(`Delete asset “${asset.name}” and all its entities?`,
            { danger: true, confirmLabel: "Delete" });
          if (!ok) return;
          try { await withBusy(null, async () => { await deleteAsset(hass, asset.id); });
            showToast(`Deleted “${asset.name}”`, "success"); }
          catch (e) { showToast(String(e.message || e), "error", 6000); }
        }}, "Delete")));
    }
  };

  search.addEventListener("input", () => {
    panel._search = search.value;
    refreshList();
  });
  refreshList();

  card.append(h("div", { class: "am-filters" }, search, sort), labelsRow, listHolder);
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
    const input = h("input", { class: "am-input",
      value: asset[field] == null ? "" : asset[field], type });
    input.addEventListener("change", async () => {
      try { await withBusy(input, async () => {
        await updateAsset(hass, asset.id, { [field]: input.value || null }); });
        showToast("Saved", "success", 2000);
      }
      catch (e) { showToast(String(e.message || e), "error", 6000); }
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
      inlineValue = h("input", {
        class: "am-input am-inline-value",
        value: e.value == null ? "" : String(e.value),
        type: e.kind === "number" ? "number" : "text",
        placeholder: "value"});
      inlineValue.addEventListener("change", async () => {
        const raw = inlineValue.value.trim();
        let next;
        if (raw === "") next = null;
        else if (e.kind === "number") next = Number(raw);
        else next = raw;
        try { await withBusy(inlineValue, async () => {
          await updateEntity(hass, e.id, { value: next }); });
          showToast("Value saved", "success", 2000);
        } catch (err) {
          inlineValue.value = e.value == null ? "" : String(e.value); // revert
          showToast(String(err.message || err), "error", 6000);
        }
      });
    }

    const summary = h("div", { class: "am-entity-summary am-grow" },
      h("span", { class: "am-entity-name" }, e.name),
      h("span", { class: "am-entity-meta" },
        `${e.slug} · ${e.kind}${e.unit_of_measurement ? ` · ${e.unit_of_measurement}` : ""}`));

    const editBtn = h("button", { class: "am-btn secondary",
      onClick: () => entityEditorDialog(hass, asset, e, () => {}) }, "Edit");

    list.append(h("div", { class: "am-row" },
      checkbox, summary, inlineValue, toggle, editBtn));
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
    card.append(h("div", { class: "am-row" },
      h("span", { class: "am-grow" },
        iconEl,
        h("span", { style: "font-weight:500" }, t.name),
        h("span", { class: "am-muted" }, ` · ${t.entities?.length || 0} entities`)),
      h("button", { class: "am-btn secondary",
        onClick: () => templateEditorDialog(hass, t, () => {}) }, "Edit"),
      h("button", { class: "am-btn danger", onClick: async () => {
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