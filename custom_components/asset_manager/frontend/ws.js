/**
 * Asset Manager — WebSocket API wrappers.
 *
 * Every admin action the panel can trigger is declared here as a thin
 * `callWS` wrapper. Collection CRUD uses the
 * `asset_manager/<collection>/<verb>` convention exposed by
 * `ObservableCollection`; `apply_template` and `clone_asset` are the two
 * bespoke commands registered by the integration.
 */

import { DOMAIN, wsPrefix } from "./constants.js";

export const wsCall = async (hass, type, data = {}) => {
  try {
    return await hass.callWS({ type, ...data });
  } catch (e) {
    // HA WS errors come as { code, message }. Ensure a clean Error
    // with just the message so dialog catch blocks get a readable string.
    throw new Error(e.message || String(e));
  }
};

export const wsSubscribe = (hass, type, onEvent) =>
  hass.connection.subscribeMessage(onEvent, { type });

// Subscribe to HA event-bus events (fired via hass.bus.async_fire*).
// These are NOT WS commands — `subscribeEvents` sends
// {type: "subscribe_events", event_type} which is HA's general event
// subscription mechanism. Use this for events like "label_registry_updated"
// that registries fire internally; use wsSubscribe for ObservableCollection
// change-set streams exposed as bespoke WS commands.
export const wsSubscribeEvents = (hass, eventType, onEvent) =>
  hass.connection.subscribeEvents(onEvent, eventType);

export const assetList = (hass) => wsCall(hass, `${wsPrefix("assets")}/list`);
export const entityList = (hass) => wsCall(hass, `${wsPrefix("entities")}/list`);
export const templateList = (hass) => wsCall(hass, `${wsPrefix("templates")}/list`);
export const templateCreate = (hass, payload) =>
  wsCall(hass, `${wsPrefix("templates")}/create`, payload);
export const templateUpdate = (hass, id, patch) =>
  wsCall(hass, `${wsPrefix("templates")}/update`, { template_id: id, ...patch });
export const templateDelete = (hass, id) =>
  wsCall(hass, `${wsPrefix("templates")}/delete`, { template_id: id });
export const createAsset = (hass, name, extra = {}) =>
  wsCall(hass, `${wsPrefix("assets")}/create`, { name, ...extra });
export const updateAsset = (hass, id, patch) =>
  wsCall(hass, `${wsPrefix("assets")}/update`, { asset_id: id, ...patch });
export const deleteAsset = (hass, id) =>
  wsCall(hass, `${wsPrefix("assets")}/delete`, { asset_id: id });
export const createEntity = (hass, payload) =>
  wsCall(hass, `${wsPrefix("entities")}/create`, payload);
export const updateEntity = (hass, id, patch) =>
  wsCall(hass, `${wsPrefix("entities")}/update`, { entity_id: id, ...patch });
export const deleteEntity = (hass, id) =>
  wsCall(hass, `${wsPrefix("entities")}/delete`, { entity_id: id });
export const applyTemplate = (hass, assetId, templateId, applyLabels = true) =>
  wsCall(hass, `${DOMAIN}/apply_template`, {
    asset_id: assetId,
    template_id: templateId,
    apply_labels: applyLabels,
  });
export const cloneAsset = (hass, sourceId, name) =>
  wsCall(hass, `${DOMAIN}/clone_asset`, { source_asset_id: sourceId, name });
export const getAreas = (hass) => wsCall(hass, `${DOMAIN}/get_areas`);
export const updateArea = (hass, assetId, areaId) =>
  wsCall(hass, `${DOMAIN}/update_area`, { asset_id: assetId, area_id: areaId });

// Native HA label registry (admin-only). We reuse HA's own WS commands
// for label CRUD; assignments go through our bespoke device-label bridge.
export const listLabels = (hass) => wsCall(hass, "config/label_registry/list");
export const createLabel = (hass, payload) =>
  wsCall(hass, "config/label_registry/create", payload);
export const updateLabel = (hass, labelId, patch) =>
  wsCall(hass, "config/label_registry/update", { label_id: labelId, ...patch });
export const deleteLabel = (hass, labelId) =>
  wsCall(hass, "config/label_registry/delete", { label_id: labelId });

// Bespoke: map asset_id -> device label_ids, and full-replace labels.
export const getAssetLabels = (hass) => wsCall(hass, `${DOMAIN}/get_asset_labels`);
export const updateAssetLabels = (hass, assetId, labelIds) =>
  wsCall(hass, `${DOMAIN}/update_asset_labels`, { asset_id: assetId, labels: labelIds });