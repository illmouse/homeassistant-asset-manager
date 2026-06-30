/**
 * Asset Manager — modal dialogs.
 *
 * Five Promise-free modal builders (they call back into the caller on
 * success instead of returning values):
 *   - assetCreateDialog       — name + icon + area + optional template
 *   - cloneDialog             — clone an existing asset under a new name
 *   - templatePickerDialog    — apply a template to an existing asset
 *   - entityEditorDialog      — kind-aware create/edit of one entity
 *   - templateEditorDialog    — full entity-spec list editor for templates
 *
 * Every dialog uses `openModal`/`withBusy`/`showToast` from `ui.js`,
 * the kind-aware config builder from `config-fields.js`, and the
 * reusable icon/area pickers from `pickers.js`.
 */

import { h, clear } from "./dom.js";
import { ENTITY_KINDS, KIND_HAS_UNIT, KIND_HAS_VALUE } from "./constants.js";
import {
  templateList,
  templateCreate,
  templateUpdate,
  templateDelete,
  createAsset,
  createEntity,
  updateEntity,
  deleteEntity,
  applyTemplate,
  cloneAsset,
  updateArea,
  updateAssetLabels,
} from "./ws.js";
import { showToast, openModal, confirmDialog, withBusy } from "./ui.js";
import { buildConfigFields } from "./config-fields.js";
import { buildIconPicker, buildAreaPicker } from "./pickers.js";
import { buildLabelPicker } from "./labelPicker.js";
import { haInput, haSelect } from "./native-fields.js";

// Asset creation dialog: name + icon + area + optional template. When a
// template is selected, create the asset then apply the template in
// sequence. Area is applied after the asset exists (the device is
// created by the coordinator off the WS create event).
export function assetCreateDialog(hass, onCreated) {
  const nameInput = haInput({ placeholder: "Asset name (e.g. My Car)" });
  const iconPicker = buildIconPicker();
  const areaPicker = buildAreaPicker(hass, null, null);
  const labelPicker = buildLabelPicker(hass, [], null);
  const templateSelectOpts = [{ value: "", label: "Blank asset — no template" }];
  const templateSelect = haSelect({
    options: templateSelectOpts,
    onselected: (v) => { templateSelect._value = v; onTemplateChange(); },
  });
  templateSelect._value = "";
  const err = h("div", { class: "am-error" });
  const submit = h("button", { class: "am-btn" }, "Create");
  const close = h("button", { class: "am-btn secondary" }, "Cancel");
  const form = h("div", {},
    h("h3", {}, "New asset"),
    h("div", { class: "am-field", style: "margin-bottom:12px" },
      h("label", {}, "Name"), nameInput),
    h("div", { class: "am-field", style: "margin-bottom:12px" },
      h("label", {}, "Icon"), iconPicker.container),
    h("div", { class: "am-field", style: "margin-bottom:12px" },
      h("label", {}, "Area"), areaPicker.container),
    h("div", { class: "am-field", style: "margin-bottom:12px" },
      h("label", {}, "Labels"), labelPicker.container),
    h("div", { class: "am-field", style: "margin-bottom:12px" },
      h("label", {}, "Start from template"), templateSelect),
    err,
    h("div", { class: "am-modal-actions" }, submit, close));
  const modal = openModal(form);
  close.addEventListener("click", () => modal.remove());

  // Populate template options (built-in + user templates).
  let templates_ = [];
  const onTemplateChange = () => {
    const t = templates_.find((x) => x.id === templateSelect._value) || null;
    const iconDefaulted = !iconPicker.get()
      || (prevTemplate && iconPicker.get() === prevTemplate.icon);
    const labelsDefaulted = !labelPicker.get().length
      || (prevTemplate && sameLabels(labelPicker.get(), prevTemplate.labels));
    if (iconDefaulted) iconPicker.set(t?.icon || "");
    if (labelsDefaulted) labelPicker.set(t?.labels || []);
    prevTemplate = t;
  };
  let prevTemplate = null;
  const sameLabels = (a, b) => {
    const sa = [...(a || [])].sort();
    const sb = [...(b || [])].sort();
    return sa.length === sb.length && sa.every((v, i) => v === sb[i]);
  };
  templateList(hass).then((templates) => {
    templates_ = templates;
    for (const t of [...templates].sort((a, b) => a.name.localeCompare(b.name))) {
      templateSelectOpts.push({ value: t.id, label: `${t.name} (${t.entities?.length || 0} entities)` });
    }
    // Update native ha-select options or fallback <select>.
    if (templateSelect.options && customElements.get("ha-select")) {
      templateSelect.options = templateSelectOpts.map((o) => ({ label: o.label, value: o.value }));
    } else {
      for (const o of templateSelectOpts.slice(1)) {
        templateSelect.append(h("option", { value: o.value }, o.label));
      }
    }
  }).catch(() => { /* leave blank-only option */ });

  submit.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }
    const templateId = templateSelect._value;
    const icon = iconPicker.get() || undefined;
    const areaId = areaPicker.get();
    const labelIds = labelPicker.get();
    err.textContent = "";
    try {
      await withBusy(submit, async () => {
        const asset = await createAsset(hass, name, icon ? { icon } : {});
        if (templateId) {
          try { await applyTemplate(hass, asset.id, templateId, false); }
          catch (e) {
            err.textContent = `Template failed: ${e.message || e}`;
          }
        }
        if (areaId) {
          try { await updateArea(hass, asset.id, areaId); }
          catch (e) {
            err.textContent = `Area assign failed: ${e.message || e}`;
          }
        }
        if (labelIds.length) {
          try { await updateAssetLabels(hass, asset.id, labelIds); }
          catch (e) {
            err.textContent = `Label assign failed: ${e.message || e}`;
          }
        }
        if (err.textContent) return;
        modal.remove();
        onCreated(asset.id);
        showToast(`Created "${name}"`, "success");
      }, { errorToast: false });
    } catch (e) { err.textContent = String(e.message || e); }
  });
  nameInput.focus();
}

export function cloneDialog(hass, sourceAsset, onDone) {
  const input = haInput({ placeholder: `Clone of ${sourceAsset.name}` });
  const err = h("div", { class: "am-error" });
  const submit = h("button", { class: "am-btn" }, "Clone");
  const close = h("button", { class: "am-btn secondary" }, "Cancel");
  const form = h("div", {},
    h("h3", {}, `Clone “${sourceAsset.name}”`),
    h("p", { class: "am-muted" }, "Creates a new asset with a blank serial and copies every entity definition."),
    h("div", { class: "am-field" }, h("label", {}, "New asset name"), input),
    err,
    h("div", { class: "am-modal-actions" }, submit, close));
  const modal = openModal(form);
  close.addEventListener("click", () => modal.remove());
  submit.addEventListener("click", async () => {
    const name = input.value.trim();
    if (!name) { input.focus(); return; }
    err.textContent = "";
    try {
      await withBusy(submit, async () => {
        await cloneAsset(hass, sourceAsset.id, name);
        modal.remove();
        onDone();
        showToast(`Cloned "${sourceAsset.name}" → "${name}"`, "success");
      }, { errorToast: false });
    } catch (e) { err.textContent = String(e.message || e); }
  });
  input.focus();
}

export function templatePickerDialog(hass, asset, onApplied) {
  const applyLabelsToggle = h("input", { type: "checkbox", checked: true });
  const applyLabelsRow = h("label", { style: "display:flex; align-items:center; gap:6px; margin:8px 0; font-size:14px; cursor:pointer" },
    applyLabelsToggle, "Also apply template labels");
  const err = h("div", { class: "am-error" });
  const list = h("div", {});
  const close = h("button", { class: "am-btn secondary" }, "Close");
  const modal = openModal(h("div", {},
    h("h3", {}, `Apply template to "${asset.name}"`),
    h("p", { class: "am-muted" }, "Existing entities with the same slug are skipped."),
    applyLabelsRow, list, err,
    h("div", { class: "am-modal-actions" }, close)));
  close.addEventListener("click", () => modal.remove());
  list.append(h("p", { class: "am-muted" }, h("span", { class: "am-spinner" }), "Loading templates…"));
  templateList(hass).then((templates) => {
    clear(list);
    if (!templates.length) {
      list.append(h("p", { class: "am-muted" }, "No templates available."));
      return;
    }
    for (const t of [...templates].sort((a, b) => a.name.localeCompare(b.name))) {
      const applyBtn = h("button", { class: "am-btn" }, "Apply");
      const row = h("div", { class: "am-row" },
        h("span", { class: "am-grow" }, `${t.name} (${t.entities?.length || 0} entities)`),
        applyBtn);
      applyBtn.addEventListener("click", async () => {
        err.textContent = "";
        try {
          await withBusy(applyBtn, async () => {
            const resp = await applyTemplate(hass, asset.id, t.id, applyLabelsToggle.checked);
            const created = Array.isArray(resp) ? resp : (resp.created || []);
            const appliedLabels = Array.isArray(resp) ? [] : (resp.applied_labels || []);
            modal.remove();
            onApplied(created, appliedLabels);
            showToast(`Applied template "${t.name}" (${created.length} entities added)`, "success");
          }, { errorToast: false });
        } catch (e) { err.textContent = String(e.message || e); }
      });
      list.append(row);
    }
  }).catch((e) => { err.textContent = String(e.message || e); });
}

// Entity editor: kind-aware. Switching the kind rebuilds the config
// fields and shows/hides the unit & initial-value fields.
export function entityEditorDialog(hass, asset, entity, onSaved) {
  const isEdit = !!entity;
  const slug = haInput({ value: entity?.slug || "", placeholder: "mileage" });
  const name = haInput({ value: entity?.name || "", placeholder: "Mileage" });
  const kind = haSelect({
    label: "Kind",
    value: entity?.kind || ENTITY_KINDS[0],
    options: ENTITY_KINDS.map((k) => ({ value: k, label: k })),
    onselected: (v) => { kind._value = v; syncFieldsForKind(v); },
  });
  kind._value = entity?.kind || ENTITY_KINDS[0];
  const unit = haInput({ value: entity?.unit_of_measurement || "", placeholder: "km, °C, …" });
  const iconPicker = buildIconPicker(entity?.icon || "");
  const useNativeEnabled = customElements.get("ha-switch") && customElements.get("ha-formfield");
  const enabledInput = useNativeEnabled
    ? document.createElement("ha-switch")
    : h("input", { type: "checkbox", class: "am-checkbox" });
  enabledInput.checked = entity ? entity.enabled : true;
  const enabledLabel = useNativeEnabled
    ? (() => { const ff = document.createElement("ha-formfield"); ff.label = "Enabled"; ff.append(enabledInput); return ff; })()
    : h("label", { style: "display:flex; align-items:center; gap:8px; cursor:pointer" },
        enabledInput, h("span", {}, "Enabled"));
  const valueInput = haInput({ value: entity?.value == null ? "" : String(entity.value), placeholder: "initial value" });

  const err = h("div", { class: "am-error" });
  const submit = h("button", { class: "am-btn" }, isEdit ? "Save" : "Create");
  const delBtn = isEdit ? h("button", { class: "am-btn danger" }, "Delete") : null;
  const close = h("button", { class: "am-btn secondary" }, "Cancel");

  // Reusable containers so we can rebuild inner sections on kind change.
  const configHolder = h("div", {});
  const unitHolder = h("div", {});
  const valueHolder = h("div", {});
  let configFields = null;

  const syncFieldsForKind = (k) => {
    configFields = buildConfigFields(k, entity?.config || {});
    clear(configHolder).append(h("div", { class: "am-field" }, h("label", {}, "Config"), configFields.container));
    // Show/hide unit + value based on kind.
    clear(unitHolder);
    if (KIND_HAS_UNIT.has(k)) unitHolder.append(h("div", { class: "am-field" }, h("label", {}, "Unit"), unit));
    clear(valueHolder);
    if (KIND_HAS_VALUE.has(k)) valueHolder.append(h("div", { class: "am-field" }, h("label", {}, "Initial value"), valueInput));
  };
  syncFieldsForKind(entity?.kind || "number");

  const form = h("div", {},
    h("h3", {}, isEdit ? `Edit ${entity.slug}` : "New entity"),
    h("div", { class: "am-grid" },
      h("div", { class: "am-field" }, h("label", {}, "Slug"), slug),
      h("div", { class: "am-field" }, h("label", {}, "Display name"), name),
      h("div", { class: "am-field" }, h("label", {}, "Kind"), kind),
      h("div", { class: "am-field" }, h("label", {}, "Icon"), iconPicker.container),
      enabledLabel,
      unitHolder),
    configHolder,
    valueHolder,
    err,
    h("div", { class: "am-modal-actions" }, submit, delBtn, close));
  const modal = openModal(form);
  close.addEventListener("click", () => modal.remove());

  const buildPayload = () => {
    const payload = {
      slug: slug.value.trim(),
      name: name.value.trim(),
      kind: kind._value,
      enabled: enabledInput.checked,
      config: configFields.read(),
    };
    const iconVal = iconPicker.get();
    if (iconVal) payload.icon = iconVal;
    if (KIND_HAS_UNIT.has(payload.kind) && unit.value.trim()) payload.unit_of_measurement = unit.value.trim();
    if (KIND_HAS_VALUE.has(payload.kind)) {
      const v = valueInput.value.trim();
      if (v !== "") {
        if (v === "true") payload.value = true;
        else if (v === "false") payload.value = false;
        else if (!isNaN(Number(v))) payload.value = Number(v);
        else payload.value = v;
      }
    }
    return payload;
  };

  submit.addEventListener("click", async () => {
    err.textContent = "";
    if (!slug.value.trim()) { slug.focus(); return; }
    if (!name.value.trim()) { name.focus(); return; }
    try {
      await withBusy(submit, async () => {
        const payload = buildPayload();
        if (isEdit) await updateEntity(hass, entity.id, payload);
        else await createEntity(hass, { ...payload, asset_id: asset.id });
        modal.remove();
        onSaved();
        showToast(isEdit ? "Entity saved" : "Entity created", "success");
      }, { errorToast: false });
    } catch (e) { err.textContent = String(e.message || e); }
  });
  if (delBtn) delBtn.addEventListener("click", async () => {
    err.textContent = "";
    const ok = await confirmDialog(`Delete entity “${entity.slug}”? This removes it from the asset.`,
      { danger: true, confirmLabel: "Delete" });
    if (!ok) return;
    try {
      await withBusy(delBtn, async () => {
        await deleteEntity(hass, entity.id);
        modal.remove();
        onSaved();
        showToast("Entity deleted", "success");
      }, { errorToast: false });
    } catch (e) { err.textContent = String(e.message || e); }
  });
}

// Full entity-spec editor: name + icon + a list of entity specs, each
// editable via the kind-aware entity editor (reusing the same config
// field builder). Used for create + edit.
export function templateEditorDialog(hass, template, onSaved) {
  const isEdit = !!template;
  const name = haInput({ value: template?.name || "", placeholder: "My Template" });
  const iconPicker = buildIconPicker(template?.icon || "");
  const labelPicker = buildLabelPicker(hass, template?.labels || [], null);
  const err = h("div", { class: "am-error" });
  const specs = (template?.entities || []).map((s) => ({ ...s, config: { ...s.config } }));
  const specsList = h("div", {});

  const renderSpecs = () => {
    clear(specsList);
    specs.forEach((spec, i) => {
      const cfgFields = buildConfigFields(spec.kind, spec.config);
      const specIconPicker = buildIconPicker(spec.icon || "");
      const kindSel = haSelect({
        value: spec.kind,
        options: ENTITY_KINDS.map((k) => ({ value: k, label: k })),
        onselected: (v) => {
          spec.kind = v;
          spec.config = {};
          renderSpecs();
        },
      });
      const slugInp = haInput({ value: spec.slug || "" });
      slugInp.addEventListener("change", () => { spec.slug = slugInp.value.trim(); });
      const nameInp = haInput({ value: spec.name || "" });
      nameInp.addEventListener("change", () => { spec.name = nameInp.value.trim(); });
      const unitInp = haInput({ value: spec.unit_of_measurement || "", placeholder: "unit" });
      unitInp.addEventListener("change", () => { spec.unit_of_measurement = unitInp.value || undefined; });
      const rm = h("button", { class: "am-btn danger" }, "Remove");
      rm.addEventListener("click", () => { specs.splice(i, 1); renderSpecs(); });
      const row = h("div", { class: "am-spec-row" },
        h("div", { class: "am-spec-summary" },
          h("div", {},
            h("span", { style: "font-weight:500" }, spec.name || "(unnamed)"),
            h("span", { class: "am-muted" }, ` · ${spec.slug || "(no slug)"} · ${spec.kind}`)),
          h("div", { class: "am-spec-grid" },
            h("div", { class: "am-field" }, h("label", {}, "Slug"), slugInp),
            h("div", { class: "am-field" }, h("label", {}, "Name"), nameInp),
            h("div", { class: "am-field" }, h("label", {}, "Icon"), specIconPicker.container),
            h("div", { class: "am-field" }, h("label", {}, "Unit"), unitInp)),
          h("div", { class: "am-field", style: "margin-top:6px" }, h("label", {}, "Kind"), kindSel),
          cfgFields.container),
        h("div", { class: "am-spec-actions" }, rm));
      specsList.append(row);
      // Stash the config reader and icon picker so we can collect on submit.
      spec._read = cfgFields.read;
      spec._iconPicker = specIconPicker;
    });
  };
  renderSpecs();

  const addSpec = h("button", { class: "am-btn secondary" }, "+ Add entity spec");
  addSpec.addEventListener("click", () => {
    specs.push({ slug: "", name: "", kind: "number", config: {} });
    renderSpecs();
  });

  const submit = h("button", { class: "am-btn" }, isEdit ? "Save" : "Create");
  const delBtn = isEdit ? h("button", { class: "am-btn danger" }, "Delete") : null;
  const close = h("button", { class: "am-btn secondary" }, "Cancel");
  const form = h("div", {},
    h("h3", {}, isEdit ? `Edit ${template.name}` : "New template"),
    h("div", { class: "am-grid" },
      h("div", { class: "am-field" }, h("label", {}, "Name"), name),
      h("div", { class: "am-field" }, h("label", {}, "Icon"), iconPicker.container),
      h("div", { class: "am-field", style: "grid-column: 1 / -1" }, h("label", {}, "Labels"), labelPicker.container)),
    h("h4", { style: "margin:16px 0 8px" }, "Entity specs"),
    specsList,
    addSpec,
    err,
    h("div", { class: "am-modal-actions" }, submit, delBtn, close));
  const modal = openModal(form);
  close.addEventListener("click", () => modal.remove());

  const buildPayload = () => {
    const entities = specs.map((s) => {
      const spec = {
        slug: s.slug.trim(),
        name: s.name.trim(),
        kind: s.kind,
        config: s._read ? s._read() : (s.config || {}),
      };
      if (s.unit_of_measurement) spec.unit_of_measurement = s.unit_of_measurement;
      const iconVal = s._iconPicker ? s._iconPicker.get() : (s.icon || "");
      if (iconVal) spec.icon = iconVal;
      if (s.value != null) spec.value = s.value;
      return spec;
    });
    if (!entities.length) throw new Error("Add at least one entity spec.");
    for (const e of entities) {
      if (!e.slug || !e.name) throw new Error("Each spec needs a slug and name.");
    }
    const payload = { name: name.value.trim(), entities };
    const templateIcon = iconPicker.get();
    if (templateIcon) payload.icon = templateIcon;
    payload.labels = labelPicker.get();
    return payload;
  };

  submit.addEventListener("click", async () => {
    err.textContent = "";
    if (!name.value.trim()) { name.focus(); return; }
    try {
      await withBusy(submit, async () => {
        const payload = buildPayload();
        if (isEdit) await templateUpdate(hass, template.id, payload);
        else await templateCreate(hass, payload);
        modal.remove();
        onSaved();
        showToast(isEdit ? "Template saved" : "Template created", "success");
      }, { errorToast: false });
    } catch (e) { err.textContent = String(e.message || e); }
  });
  if (delBtn) delBtn.addEventListener("click", async () => {
    err.textContent = "";
    const ok = await confirmDialog(`Delete template “${template.name}”?`,
      { danger: true, confirmLabel: "Delete" });
    if (!ok) return;
    try {
      await withBusy(delBtn, async () => {
        await templateDelete(hass, template.id);
        modal.remove();
        onSaved();
        showToast("Template deleted", "success");
      }, { errorToast: false });
    } catch (e) { err.textContent = String(e.message || e); }
  });
}