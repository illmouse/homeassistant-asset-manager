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
 *   - Search/sort/tag-chip filter for the asset list (re-renders only
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
  wsSubscribe,
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
    this._loaded = false;
    this._view = { name: "list", assetId: null, tab: "info" };
    // ephemeral UI state held outside _view so re-renders don't wipe it
    this._search = "";
    this._sort = "name";
    this._activeTag = null;
    this._selectedEntityIds = new Set();
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
      const [assets, entities, templates] = await Promise.all([
        assetList(hass), entityList(hass), templateList(hass)]);
      applyAssets(assets);
      applyEntities(entities);
      applyTemplates(templates);
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
  }

  _renderError(err) {
    clear(this._shadow).append(
      h("style", {}, STYLES),
      h("div", { class: "am-root" },
        h("div", { class: "am-card" },
          h("h2", { class: "am-title" }, "Asset Manager"),
          h("div", { class: "am-error" }, String(err.message || err)))));
  }

  _render() {
    const root = clear(this._shadow);
    if (!this._hass) return;
    root.append(h("style", {}, STYLES));
    if (!this._loaded) {
      root.append(h("div", { class: "am-root" },
        h("div", { class: "am-card" },
          h("h2", { class: "am-title" }, "Asset Manager"),
          h("p", { class: "am-muted" }, h("span", { class: "am-spinner" }), " Loading…"))));
      return;
    }
    if (this._view.name === "list") root.append(renderListView(this));
    else if (this._view.name === "detail") root.append(renderDetailView(this));
    else if (this._view.name === "templates") root.append(renderTemplatesView(this));
  }

  _goDetail(id) { this._view = { name: "detail", assetId: id, tab: "info" }; this._render(); }
  _goList() { this._view = { name: "list" }; this._render(); }
}

customElements.define("asset-manager-panel", AssetManagerPanel);