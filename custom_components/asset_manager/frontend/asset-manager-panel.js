/**
 * Asset Manager — single-file HA custom panel.
 *
 * Registered as the custom element `asset-manager-panel` by HA's
 * `custom` panel infrastructure. HA injects `hass`, `narrow` and
 * `panel` as observed properties on the element; we render via plain
 * DOM (no Lit import) so the module has zero cross-version deps.
 *
 * WS commands (all admin-only):
 *   asset_manager/assets/{list,create,update,delete,subscribe}
 *   asset_manager/entities/{list,create,update,delete,subscribe}
 *   asset_manager/templates/list
 *   asset_manager/apply_template
 *   asset_manager/clone_asset
 *
 * Subscribe events deliver change-set payloads:
 *   [{change_type:"added"|"updated"|"removed", asset_id|entity_id, item}]
 */
(() => {
  const DOMAIN = "asset_manager";
  const ENTITY_KINDS = ["number", "sensor", "date", "text", "select", "button", "switch", "derived"];
  const wsPrefix = (coll) => `${DOMAIN}/${coll}`;

  // -- tiny DOM helpers -------------------------------------------------
  const h = (tag, attrs, ...children) => {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === "class") el.className = v;
        else if (k === "style") el.setAttribute("style", v);
        else if (k.startsWith("on") && typeof v === "function")
          el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (v === false || v == null) continue;
        else if (v === true) el.setAttribute(k, "");
        else el.setAttribute(k, v);
      }
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      el.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return el;
  };
  const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

  // -- WS helpers -------------------------------------------------------
  const wsCall = (hass, type, data = {}) =>
    hass.callWS({ type, ...data });
  const wsSubscribe = (hass, type, onEvent) =>
    hass.connection.subscribeMessage(onEvent, { type });

  const assetList = (hass) => wsCall(hass, `${wsPrefix("assets")}/list`);
  const entityList = (hass) => wsCall(hass, `${wsPrefix("entities")}/list`);
  const templateList = (hass) => wsCall(hass, `${wsPrefix("templates")}/list`);
  const createAsset = (hass, name) => wsCall(hass, `${wsPrefix("assets")}/create`, { name });
  const updateAsset = (hass, id, patch) => wsCall(hass, `${wsPrefix("assets")}/update`, { asset_id: id, ...patch });
  const deleteAsset = (hass, id) => wsCall(hass, `${wsPrefix("assets")}/delete`, { asset_id: id });
  const createEntity = (hass, payload) => wsCall(hass, `${wsPrefix("entities")}/create`, payload);
  const updateEntity = (hass, id, patch) => wsCall(hass, `${wsPrefix("entities")}/update`, { entity_id: id, ...patch });
  const deleteEntity = (hass, id) => wsCall(hass, `${wsPrefix("entities")}/delete`, { entity_id: id });
  const applyTemplate = (hass, assetId, templateId) => wsCall(hass, `${DOMAIN}/apply_template`, { asset_id: assetId, template_id: templateId });
  const cloneAsset = (hass, sourceId, name) => wsCall(hass, `${DOMAIN}/clone_asset`, { source_asset_id: sourceId, name });

  // -- shared styles ----------------------------------------------------
  const STYLES = `
    .am-root { padding: 16px; max-width: 1100px; margin: 0 auto; font-family: var(--paper-font-body1_-_font-family, inherit); }
    .am-title { font-size: 24px; font-weight: 500; margin: 0 0 16px; }
    .am-card { background: var(--card-background-color, #fff); border-radius: 8px;
               box-shadow: 0 1px 3px rgba(0,0,0,.12); padding: 16px; margin-bottom: 16px; }
    .am-row { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--divider-color, #eee); }
    .am-row:last-child { border-bottom: none; }
    .am-grow { flex: 1; }
    .am-btn { background: var(--primary-color, #03a9f4); color: #fff; border: none;
              padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 14px; }
    .am-btn.secondary { background: var(--secondary-background-color, #888); }
    .am-btn.danger { background: var(--error-state-color, #db4437); }
    .am-btn[disabled] { opacity: .5; cursor: not-allowed; }
    .am-input, .am-select { padding: 8px; border: 1px solid var(--divider-color, #ccc);
                            border-radius: 4px; font-size: 14px; background: var(--input-background-color, #fff);
                            color: var(--primary-text-color, #000); }
    .am-modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex;
                   align-items: center; justify-content: center; z-index: 100; }
    .am-modal { background: var(--card-background-color, #fff); border-radius: 8px;
                padding: 24px; max-width: 560px; width: 90%; max-height: 80vh; overflow: auto; }
    .am-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--divider-color, #eee); margin-bottom: 16px; }
    .am-tab { padding: 8px 16px; cursor: pointer; border-bottom: 2px solid transparent; }
    .am-tab.active { border-bottom-color: var(--primary-color, #03a9f4); font-weight: 500; }
    .am-muted { color: var(--secondary-text-color, #888); font-style: italic; }
    .am-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .am-field label { display: block; font-size: 12px; margin-bottom: 4px; color: var(--secondary-text-color, #888); }
    .am-error { color: var(--error-state-color, #db4437); font-size: 13px; margin-top: 8px; }
  `;

  const injectStyles = () => {
    if (document.getElementById("am-panel-styles")) return;
    const s = document.createElement("style");
    s.id = "am-panel-styles";
    s.textContent = STYLES;
    document.head.appendChild(s);
  };

  // -- modal helpers ----------------------------------------------------
  const openModal = (contentEl) => {
    const bg = h("div", { class: "am-modal-bg" });
    const box = h("div", { class: "am-modal" });
    box.append(contentEl);
    bg.append(box);
    bg.addEventListener("click", (e) => { if (e.target === bg) bg.remove(); });
    document.body.appendChild(bg);
    return bg;
  };

  // -- dialogs ----------------------------------------------------------
  function assetCreateDialog(hass, onCreated) {
    const input = h("input", { class: "am-input", placeholder: "Asset name (e.g. My Car)" });
    const err = h("div", { class: "am-error" });
    const submit = h("button", { class: "am-btn" }, "Create");
    const close = h("button", { class: "am-btn secondary" }, "Cancel");
    const form = h("div", {},
      h("h3", {}, "New asset"),
      h("div", { class: "am-field" }, h("label", {}, "Name"), input),
      err,
      h("div", { style: "display:flex; gap:8px; margin-top:16px" }, submit, close),
    );
    const modal = openModal(form);
    close.addEventListener("click", () => modal.remove());
    submit.addEventListener("click", async () => {
      submit.disabled = true;
      try {
        const asset = await createAsset(hass, input.value.trim());
        modal.remove();
        onCreated(asset.id);
      } catch (e) {
        err.textContent = String(e.message || e);
        submit.disabled = false;
      }
    });
    input.focus();
  }

  function cloneDialog(hass, sourceAsset, onDone) {
    const input = h("input", { class: "am-input", placeholder: `Clone of ${sourceAsset.name}` });
    const err = h("div", { class: "am-error" });
    const submit = h("button", { class: "am-btn" }, "Clone");
    const close = h("button", { class: "am-btn secondary" }, "Cancel");
    const form = h("div", {},
      h("h3", {}, `Clone “${sourceAsset.name}”`),
      h("p", { class: "am-muted" }, "Creates a new asset with a blank serial and copies every entity definition."),
      h("div", { class: "am-field" }, h("label", {}, "New asset name"), input),
      err,
      h("div", { style: "display:flex; gap:8px; margin-top:16px" }, submit, close),
    );
    const modal = openModal(form);
    close.addEventListener("click", () => modal.remove());
    submit.addEventListener("click", async () => {
      try {
        submit.disabled = true;
        await cloneAsset(hass, sourceAsset.id, input.value.trim());
        modal.remove();
        onDone();
      } catch (e) {
        err.textContent = String(e.message || e);
        submit.disabled = false;
      }
    });
    input.focus();
  }

  function templatePickerDialog(hass, asset, onApplied) {
    const err = h("div", { class: "am-error" });
    const list = h("div", {});
    const modal = openModal(h("div", {},
      h("h3", {}, `Apply template to “${asset.name}”`),
      h("p", { class: "am-muted" }, "Existing entities with the same slug are skipped."),
      list, err,
      h("div", { style: "display:flex; gap:8px; margin-top:16px" },
        h("button", { class: "am-btn secondary", onClick: () => modal.remove() }, "Close")),
    ));
    templateList(hass).then((templates) => {
      if (!templates.length) { list.append(h("p", { class: "am-muted" }, "No templates available.")); return; }
      for (const t of templates) {
        const row = h("div", { class: "am-row" },
          h("span", { class: "am-grow" }, `${t.name} (${t.entities?.length || 0} entities)`),
          h("button", { class: "am-btn", onClick: async (ev) => {
            ev.target.disabled = true;
            try {
              const created = await applyTemplate(hass, asset.id, t.id);
              onApplied(created);
              modal.remove();
            } catch (e) {
              err.textContent = String(e.message || e);
              ev.target.disabled = false;
            }
          }}, "Apply"),
        );
        list.append(row);
      }
    }).catch((e) => { err.textContent = String(e.message || e); });
  }

  function entityEditorDialog(hass, asset, entity, onSaved) {
    const isEdit = !!entity;
    const slug = h("input", { class: "am-input", value: entity?.slug || "", placeholder: "mileage" });
    const name = h("input", { class: "am-input", value: entity?.name || "", placeholder: "Mileage" });
    const kind = h("select", { class: "am-select" },
      ...ENTITY_KINDS.map((k) => h("option", { value: k, selected: entity?.kind === k }, k)));
    const unit = h("input", { class: "am-input", value: entity?.unit_of_measurement || "", placeholder: "km, °C, …" });
    const icon = h("input", { class: "am-input", value: entity?.icon || "", placeholder: "mdi:counter" });
    const enabled = h("input", { type: "checkbox", checked: entity ? entity.enabled : true });
    const configInput = h("textarea", { class: "am-input", style: "width:100%;min-height:80px",
      placeholder: '{"min":0,"max":300000} or {"formula":"datediff(oil_change_date, now())"}' });
    configInput.value = entity ? JSON.stringify(entity.config || {}, null, 2) : "";
    const valueInput = h("input", { class: "am-input", value: entity?.value == null ? "" : String(entity.value), placeholder: "initial value" });
    const err = h("div", { class: "am-error" });
    const submit = h("button", { class: "am-btn" }, isEdit ? "Save" : "Create");
    const delBtn = isEdit ? h("button", { class: "am-btn danger" }, "Delete") : null;
    const close = h("button", { class: "am-btn secondary" }, "Cancel");
    const form = h("div", {},
      h("h3", {}, isEdit ? `Edit ${entity.slug}` : "New entity"),
      h("div", { class: "am-grid" },
        h("div", { class: "am-field" }, h("label", {}, "Slug"), slug),
        h("div", { class: "am-field" }, h("label", {}, "Display name"), name),
        h("div", { class: "am-field" }, h("label", {}, "Kind"), kind),
        h("div", { class: "am-field" }, h("label", {}, "Unit"), unit),
        h("div", { class: "am-field" }, h("label", {}, "Icon"), icon),
        h("div", { class: "am-field" }, h("label", {}, "Enabled"), enabled),
      ),
      h("div", { class: "am-field", style: "margin-top:12px" }, h("label", {}, "Config (JSON)"), configInput),
      h("div", { class: "am-field", style: "margin-top:12px" }, h("label", {}, "Initial value"), valueInput),
      err,
      h("div", { style: "display:flex; gap:8px; margin-top:16px" }, submit, delBtn, close),
    );
    const modal = openModal(form);
    close.addEventListener("click", () => modal.remove());

    const buildPayload = () => {
      let config = {};
      const raw = configInput.value.trim();
      if (raw) {
        try { config = JSON.parse(raw); }
        catch { throw new Error("Config is not valid JSON"); }
      }
      const payload = {
        slug: slug.value.trim(),
        name: name.value.trim(),
        kind: kind.value,
        enabled: enabled.checked,
        config,
      };
      if (unit.value.trim()) payload.unit_of_measurement = unit.value.trim();
      if (icon.value.trim()) payload.icon = icon.value.trim();
      if (valueInput.value.trim() !== "") {
        const v = valueInput.value.trim();
        if (v === "true") payload.value = true;
        else if (v === "false") payload.value = false;
        else if (!isNaN(Number(v))) payload.value = Number(v);
        else payload.value = v;
      }
      return payload;
    };

    submit.addEventListener("click", async () => {
      err.textContent = "";
      try {
        submit.disabled = true;
        const payload = buildPayload();
        if (isEdit) {
          await updateEntity(hass, entity.id, payload);
        } else {
          await createEntity(hass, { ...payload, asset_id: asset.id });
        }
        modal.remove();
        onSaved();
      } catch (e) {
        err.textContent = String(e.message || e);
        submit.disabled = false;
      }
    });
    if (delBtn) delBtn.addEventListener("click", async () => {
      err.textContent = "";
      try {
        delBtn.disabled = true;
        await deleteEntity(hass, entity.id);
        modal.remove();
        onSaved();
      } catch (e) {
        err.textContent = String(e.message || e);
        delBtn.disabled = false;
      }
    });
  }

  // -- main panel element ----------------------------------------------
  class AssetManagerPanel extends HTMLElement {
    constructor() {
      super();
      this.hass = null;
      this.narrow = false;
      this.panel = null;
      this._subs = [];
      this._assets = new Map();
      this._entities = new Map();
      this._view = { name: "list", assetId: null, tab: "info" };
      this._shadow = this.attachShadow({ mode: "open" });
    }

    connectedCallback() { injectStyles(); this._render(); }
    disconnectedCallback() { this._unsubscribe(); }
    // HA sets hass/narrow/panel as properties; we re-render on change.
    static get observedAttributes() { return []; }
    set hass(v) { this._hass = v; if (v) this._subscribe(); this._render(); }
    get hass() { return this._hass; }
    set narrow(v) { this._narrow = v; this._render(); }
    get narrow() { return this._narrow; }
    set panel(v) { this._panel = v; this._render(); }
    get panel() { return this._panel; }

    _unsubscribe() {
      for (const u of this._subs) { try { u(); } catch {} }
      this._subs = [];
    }

    async _subscribe() {
      this._unsubscribe();
      const hass = this._hass;
      const applyAssets = (items) => {
        this._assets = new Map(items.map((a) => [a.id, a]));
        this._render();
      };
      const applyEntities = (items) => {
        this._entities = new Map(items.map((e) => [e.id, e]));
        this._render();
      };
      try {
        const [assets, entities] = await Promise.all([assetList(hass), entityList(hass)]);
        applyAssets(assets);
        applyEntities(entities);
      } catch (e) {
        this._renderError(e);
        return;
      }
      const onAssetEvent = (msg) => {
        for (const c of msg) {
          if (c.change_type === "removed") this._assets.delete(c.asset_id);
          else this._assets.set(c.asset_id, c.item);
        }
        this._render();
      };
      const onEntityEvent = (msg) => {
        for (const c of msg) {
          if (c.change_type === "removed") this._entities.delete(c.entity_id);
          else this._entities.set(c.entity_id, c.item);
        }
        this._render();
      };
      this._subs.push(await wsSubscribe(hass, `${wsPrefix("assets")}/subscribe`, onAssetEvent));
      this._subs.push(await wsSubscribe(hass, `${wsPrefix("entities")}/subscribe`, onEntityEvent));
    }

    _renderError(err) {
      clear(this._shadow).append(
        h("div", { class: "am-root" },
          h("div", { class: "am-card" },
            h("h2", { class: "am-title" }, "Asset Manager"),
            h("div", { class: "am-error" }, String(err.message || err)))));
    }

    _render() {
      const root = clear(this._shadow);
      if (!this._hass) return;
      root.append(h("style", {}, STYLES));
      if (this._view.name === "list") root.append(this._renderList());
      else if (this._view.name === "detail") root.append(this._renderDetail());
    }

    _renderList() {
      const hass = this._hass;
      const header = h("div", { class: "am-row", style: "border:none" },
        h("h2", { class: "am-title am-grow" }, "Assets"),
        h("button", { class: "am-btn", onClick: () => assetCreateDialog(hass, (id) => this._goDetail(id)) }, "+ Add asset"),
      );
      const card = h("div", { class: "am-card" });
      if (this._assets.size === 0) {
        card.append(h("p", { class: "am-muted" },
          "No assets yet. Click “Add asset” to create one, then apply a template or build entities from scratch."));
      } else {
        for (const asset of [...this._assets.values()].sort((a, b) => a.name.localeCompare(b.name))) {
          const ents = [...this._entities.values()].filter((e) => e.asset_id === asset.id);
          card.append(h("div", { class: "am-row" },
            h("span", { class: "am-grow", style: "cursor:pointer;font-weight:500",
                        onClick: () => this._goDetail(asset.id) },
              `${asset.name} `,
              h("span", { class: "am-muted", style: "font-weight:normal" }, `· ${ents.length} entities`)),
            h("button", { class: "am-btn secondary", onClick: () => cloneDialog(hass, asset, () => {}) }, "Clone"),
            h("button", { class: "am-btn danger", onClick: async () => {
              if (!confirm(`Delete asset “${asset.name}” and all its entities?`)) return;
              try { await deleteAsset(hass, asset.id); }
              catch (e) { alert(String(e.message || e)); }
            }}, "Delete"),
          ));
        }
      }
      return h("div", { class: "am-root" }, header, card);
    }

    _goDetail(id) { this._view = { name: "detail", assetId: id, tab: "info" }; this._render(); }
    _goList() { this._view = { name: "list" }; this._render(); }

    _renderDetail() {
      const hass = this._hass;
      const asset = this._assets.get(this._view.assetId);
      if (!asset) { this._goList(); return h("div"); }
      const entities = [...this._entities.values()]
        .filter((e) => e.asset_id === asset.id)
        .sort((a, b) => a.slug.localeCompare(b.slug));
      const tabs = ["info", "entities"].map((t) =>
        h("div", { class: `am-tab ${this._view.tab === t ? "active" : ""}`, onClick: () => { this._view.tab = t; this._render(); } },
          t === "info" ? "Info" : `Entities (${entities.length})`));

      let body;
      if (this._view.tab === "info") body = this._renderInfoTab(hass, asset);
      else body = this._renderEntitiesTab(hass, asset, entities);

      return h("div", { class: "am-root" },
        h("div", { class: "am-row", style: "border:none" },
          h("button", { class: "am-btn secondary", onClick: () => this._goList() }, "← Back"),
          h("h2", { class: "am-title am-grow" }, asset.name),
          h("button", { class: "am-btn secondary", onClick: () => templatePickerDialog(hass, asset, () => {}) }, "Apply template"),
          h("button", { class: "am-btn secondary", onClick: () => cloneDialog(hass, asset, () => {}) }, "Clone"),
        ),
        h("div", { class: "am-card" }, h("div", { class: "am-tabs" }, ...tabs), body));
    }

    _renderInfoTab(hass, asset) {
      const make = (field, label, type = "text") => {
        const input = h("input", { class: "am-input", value: asset[field] == null ? "" : asset[field], type });
        input.addEventListener("change", async () => {
          try { await updateAsset(hass, asset.id, { [field]: input.value || null }); }
          catch (e) { alert(String(e.message || e)); }
        });
        return h("div", { class: "am-field" }, h("label", {}, label), input);
      };
      const tagsInput = h("input", { class: "am-input", value: (asset.tags || []).join(", "), placeholder: "comma-separated" });
      tagsInput.addEventListener("change", async () => {
        const tags = tagsInput.value.split(",").map((t) => t.trim()).filter(Boolean);
        try { await updateAsset(hass, asset.id, { tags }); }
        catch (e) { alert(String(e.message || e)); }
      });
      return h("div", { class: "am-grid" },
        make("name", "Name"),
        make("manufacturer", "Manufacturer"),
        make("model", "Model"),
        make("serial", "Serial"),
        make("icon", "Icon"),
        h("div", { class: "am-field" }, h("label", {}, "Tags"), tagsInput),
      );
    }

    _renderEntitiesTab(hass, asset, entities) {
      const wrap = h("div", {});
      const add = h("button", { class: "am-btn", onClick: () => entityEditorDialog(hass, asset, null, () => {}) }, "+ Add entity");
      if (entities.length === 0) {
        wrap.append(h("p", { class: "am-muted" }, "No entities yet. Add one manually or apply a template."), add);
        return wrap;
      }
      const list = h("div", {});
      for (const e of entities) {
        const summary = `${e.kind} · ${e.value == null ? "—" : e.value}`;
        list.append(h("div", { class: "am-row" },
          h("span", { class: "am-grow" },
            h("span", { style: "font-weight:500" }, e.name),
            h("span", { class: "am-muted" }, ` · ${e.slug} · ${summary}`)),
          h("button", { class: "am-btn secondary", onClick: () => entityEditorDialog(hass, asset, e, () => {}) }, "Edit"),
        ));
      }
      wrap.append(list, h("div", { style: "margin-top:12px" }, add));
      return wrap;
    }
  }

  customElements.define("asset-manager-panel", AssetManagerPanel);
})();