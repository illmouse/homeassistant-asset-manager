/**
 * Asset Manager — HA custom panel entry module.
 *
 * Registered as the custom element `asset-manager-panel` by HA's
 * `custom` panel infrastructure. HA injects `hass`, `narrow` and `panel`
 * as observed properties on the element. We render via plain DOM (no
 * Lit, no mwc imports) so the module has zero cross-version deps — HA's
 * custom-panel loader fetches this file as a bare ES module with no
 * shared element registry, so we cannot rely on mwc-* or ha-* custom
 * elements being upgraded.
 *
 * UX layer (delegated to sibling modules):
 *   - showToast(): non-blocking toast replacing alert().
 *   - confirmDialog(): Promise-based modal replacing confirm().
 *   - withBusy(): disables the trigger element + reverts on failure.
 *   - Responsive `.am-narrow` layout driven by HA's `narrow` prop.
 *   - Search/sort/label-chip filter for the asset list (re-renders only
 *     the list portion, not the whole panel, so the search input keeps
 *     focus and the caret position is preserved).
 *   - Kind-aware entity editor: the config form section swaps fields
 *     based on the selected entity kind (number → min/max/step/mode,
 *     select → options editor, derived → formula, …).
 *   - Template management: dedicated Templates view with create / edit
 *     / delete and live subscription; templates can also be applied at
 *     asset-creation time.
 *
 * WS commands (all admin-only):
 *   asset_manager/assets/{list,create,update,delete,subscribe}
 *   asset_manager/entities/{list,create,update,delete,subscribe}
 *   asset_manager/templates/{list,create,update,delete,subscribe}
 *   asset_manager/apply_template
 *   asset_manager/clone_asset
 *   asset_manager/get_areas
 *   asset_manager/update_area
 *   asset_manager/get_asset_labels
 *   asset_manager/update_asset_labels
 *   config/label_registry/{list,create,update,delete} (native HA)
 *
 * Subscribe events deliver change-set payloads:
 *   [{change_type:"added"|"updated"|"removed", asset_id|entity_id|template_id, item}]
 */

import { wsPrefix } from "./constants.js";
import { h, clear } from "./dom.js";
import { STYLES, injectStyles } from "./styles.js";
import {
  assetList,
  entityList,
  templateList,
  listLabels,
  getAssetLabels,
  getAreas,
  wsSubscribe,
  wsSubscribeEvents,
} from "./ws.js";
import {
  renderListView,
  renderDetailView,
  renderTemplatesView,
} from "./views.js";

class AssetManagerPanel extends HTMLElement {
  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: "open" });
    this._hass = null;
    this._narrow = false;
    this._panel = null;
    this._subs = [];
    this._assets = new Map();
    this._entities = new Map();
    this._templates = new Map();
    this._assetLabels = new Map(); // asset_id -> [label_id]
    this._labelRegistry = new Map(); // label_id -> label _entry_dict
    this._loaded = false;
    this._view = { name: "list", assetId: null, tab: "info" };
    // ephemeral UI state held outside _view so re-renders don't wipe it
    this._search = "";
    this._sort = "name";
    this._sortDir = "asc";
    this._activeLabels = new Set();
    this._filters = {}; // property -> selected value (null = "All")
    this._selectedEntityIds = new Set();
    // Asset list table: which columns are visible. Persisted to
    // localStorage so the user's choice survives reloads.
    this._listColumns = (() => {
      try {
        const saved = JSON.parse(localStorage.getItem("am-list-columns") || "null");
        if (Array.isArray(saved) && saved.length) return saved;
      } catch { /* ignore */ }
      return ["icon", "name", "manufacturer", "model", "entities"];
    })();
    this._assetAreas = new Map(); // asset_id -> area_id
    this._renderPending = false;
  }

  connectedCallback() { injectStyles(); this._render(); }
  disconnectedCallback() { this._unsubscribe(); }
  // HA sets hass/narrow/panel as properties; we re-render on change.
  // `hass` is reassigned on every HA state tick (many times per second),
  // so we (1) only (re)subscribe when the connection is fresh (no active
  // subs — disconnection clears them) and (2) coalesce renders via
  // requestAnimationFrame to avoid tearing down the shadow DOM on every
  // tick, which used to cause a visible "blink" (Loading → data).
  static get observedAttributes() { return []; }
  set hass(v) { this._hass = v; if (v && !this._subs.length) this._subscribe(); this._scheduleRender(); }
  get hass() { return this._hass; }
  set narrow(v) { this._narrow = v; this._scheduleRender(); }
  get narrow() { return this._narrow; }
  set panel(v) { this._panel = v; this._scheduleRender(); }
  get panel() { return this._panel; }

  // Coalesce multiple property updates into a single rAF. Direct callers
  // that need an immediate paint (e.g. after a user action) call _render()
  // directly; this path is for the high-frequency HA property setters.
  _scheduleRender() {
    if (this._renderPending) return;
    this._renderPending = true;
    requestAnimationFrame(() => { this._renderPending = false; this._render(); });
  }

  _unsubscribe() {
    for (const u of this._subs) { try { u(); } catch {} }
    this._subs = [];
  }

  async _subscribe() {
    this._unsubscribe();
    this._loaded = false;
    this._render();
    const hass = this._hass;
    const apply = (coll, items) => {
      this[`_${coll}`] = new Map(items.map((x) => [x.id, x]));
      this._render();
    };
    const applyAssets = (items) => apply("assets", items);
    const applyEntities = (items) => apply("entities", items);
    const applyTemplates = (items) => apply("templates", items);
    try {
      const [assets, entities, templates, labels, assetLabels, areas] = await Promise.all([
        assetList(hass), entityList(hass), templateList(hass),
        listLabels(hass), getAssetLabels(hass), getAreas(hass)]);
      applyAssets(assets);
      applyEntities(entities);
      applyTemplates(templates);
      this._labelRegistry = new Map(labels.map((l) => [l.label_id, l]));
      this._assetLabels = new Map(Object.entries(assetLabels.asset_labels));
      this._assetAreas = new Map(Object.entries(areas.asset_areas || {}));
    } catch (e) {
      this._renderError(e);
      return;
    }
    this._loaded = true;
    this._render();
    // HA's ObservableCollection change-set always puts the full item
    // under `c.item` (regardless of collection) and the id under the
    // collection-specific key (`asset_id` / `entity_id` / `template_id`).
    const onEvent = (coll, idKey) => (msg) => {
      for (const c of msg) {
        if (c.change_type === "removed") {
          this[`_${coll}`].delete(c[idKey]);
          if (coll === "entities") this._selectedEntityIds.delete(c[idKey]);
        } else this[`_${coll}`].set(c[idKey], c.item);
      }
      this._render();
    };
    this._subs.push(await wsSubscribe(hass, `${wsPrefix("assets")}/subscribe`,
      onEvent("assets", "asset_id")));
    this._subs.push(await wsSubscribe(hass, `${wsPrefix("entities")}/subscribe`,
      onEvent("entities", "entity_id")));
    this._subs.push(await wsSubscribe(hass, `${wsPrefix("templates")}/subscribe`,
      onEvent("templates", "template_id")));
    // Native HA label registry updates (create/update/delete). The
    // label registry fires "label_registry_updated" on the HA event
    // bus (hass.bus.async_fire_internal), not as a WS command, so we
    // subscribe via subscribeEvents. Refresh the label registry map
    // and re-render so chips/colors stay current.
    this._subs.push(await wsSubscribeEvents(hass, "label_registry_updated",
      async () => {
        try {
          const fresh = await listLabels(hass);
          this._labelRegistry = new Map(fresh.map((l) => [l.label_id, l]));
        } catch { /* ignore transient errors */ }
        this._render();
      }));
  }

  _renderError(err) {
    clear(this._shadow).append(
      h("style", {}, STYLES),
      this._wrapTopBar(
        h("div", { class: "am-root" },
          h("div", { class: "am-card" },
            h("h2", { class: "am-title" }, "Asset Manager"),
            h("div", { class: "am-error" }, String(err.message || err))))));
  }

  // Wrap `content` in HA's `<ha-top-app-bar-fixed>` so the mobile top
  // app bar with the hamburger menu button appears (HA's shell does
  // NOT render a top bar for custom panels — each panel must render
  // its own). The `navigationIcon` slot is left empty so the bar
  // auto-renders `<ha-menu-button>`, which dispatches `hass-toggle-menu`
  // (handled by the root shell to open the sidebar drawer on mobile).
  // `narrow` is reflected to `:host([narrow])` for HA's bar styles. The
  // element lives in the shadow DOM; HA defines it globally so it
  // upgrades regardless of our module's isolated registry.
  _wrapTopBar(content) {
    if (!customElements.get("ha-top-app-bar-fixed")) {
      customElements.whenDefined("ha-top-app-bar-fixed")
        .then(() => this._scheduleRender());
      return h("div", {}, content);
    }
    const bar = document.createElement("ha-top-app-bar-fixed");
    if (this._narrow) bar.setAttribute("narrow", "");
    bar.append(
      h("h1", { slot: "title", class: "page-title" }, "Asset Manager"));
    bar.append(content);
    return bar;
  }

  _render() {
    // Preserve keyboard focus across the full shadow-DOM rebuild that
    // follows: if an input/textarea with a data-field attribute has
    // focus, snapshot its name + selection, then restore after rebuild.
    // This keeps the caret in place when auto-save triggers a re-render.
    let focusSnapshot = null;
    const active = this._shadow.activeElement;
    if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")
        && active.dataset && active.dataset.field) {
      focusSnapshot = {
        field: active.dataset.field,
        start: active.selectionStart,
        end: active.selectionEnd,
      };
    }
    const root = clear(this._shadow);
    if (!this._hass) return;
    root.append(h("style", {}, STYLES));
    if (!this._loaded) {
      root.append(this._wrapTopBar(
        h("div", { class: "am-root" },
          h("div", { class: "am-card" },
            h("h2", { class: "am-title" }, "Asset Manager"),
            h("p", { class: "am-muted" }, h("span", { class: "am-spinner" }), " Loading…")))));
      return;
    }
    let viewEl;
    if (this._view.name === "list") viewEl = renderListView(this);
    else if (this._view.name === "detail") viewEl = renderDetailView(this);
    else if (this._view.name === "templates") viewEl = renderTemplatesView(this);
    root.append(this._wrapTopBar(viewEl));
    if (focusSnapshot) {
      const el = this._shadow.querySelector(`[data-field="${CSS.escape(focusSnapshot.field)}"]`);
      if (el) {
        try {
          el.focus();
          if (typeof el.setSelectionRange === "function" && focusSnapshot.start != null) {
            el.setSelectionRange(focusSnapshot.start, focusSnapshot.end ?? focusSnapshot.start);
          }
        } catch { /* ignore */ }
      }
    }
  }

  _goDetail(id) { this._view = { name: "detail", assetId: id, tab: "info" }; this._render(); }
  _goList() { this._view = { name: "list" }; this._render(); }

  // Resolve an asset's area name for the list table. Returns "" if the
  // asset has no area or the area no longer exists.
  _areaName(assetId) {
    const areaId = this._assetAreas.get(assetId);
    if (!areaId || !this._hass || !this._hass.areas) return "";
    const area = this._hass.areas[areaId];
    return area ? (area.name || areaId) : "";
  }
}

customElements.define("asset-manager-panel", AssetManagerPanel);