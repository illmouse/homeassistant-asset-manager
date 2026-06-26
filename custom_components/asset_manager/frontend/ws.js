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

export const wsCall = (hass, type, data = {}) =>
  hass.callWS({ type, ...data });

export const wsSubscribe = (hass, type, onEvent) =>
  hass.connection.subscribeMessage(onEvent, { type });

export const assetList = (hass) => wsCall(hass, `${wsPrefix("assets")}/list`);
export const entityList = (hass) => wsCall(hass, `${wsPrefix("entities")}/list`);
export const templateList = (hass) => wsCall(hass, `${wsPrefix("templates")}/list`);
export const templateCreate = (hass, payload) =>
  wsCall(hass, `${wsPrefix("templates")}/create`, payload);
export const templateUpdate = (hass, id, patch) =>
  wsCall(hass, `${wsPrefix("templates")}/update`, { template_id: id, ...patch });
export const templateDelete = (hass, id) =>
  wsCall(hass, `${wsPrefix("templates")}/delete`, { template_id: id });
export const createAsset = (hass, name) =>
  wsCall(hass, `${wsPrefix("assets")}/create`, { name });
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
export const applyTemplate = (hass, assetId, templateId) =>
  wsCall(hass, `${DOMAIN}/apply_template`, {
    asset_id: assetId,
    template_id: templateId,
  });
export const cloneAsset = (hass, sourceId, name) =>
  wsCall(hass, `${DOMAIN}/clone_asset`, { source_asset_id: sourceId, name });