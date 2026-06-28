"""Bespoke WebSocket commands for asset_manager."""

from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import config_validation as cv
from homeassistant.util import slugify

from .const import CONF_APPLY_LABELS, DOMAIN
from .coordinator import AssetManagerCoordinator

WS_APPLY_TEMPLATE_SCHEMA = websocket_api.BASE_COMMAND_MESSAGE_SCHEMA.extend(
    {
        vol.Required("type"): "asset_manager/apply_template",
        vol.Required("asset_id"): str,
        vol.Required("template_id"): str,
        vol.Optional(CONF_APPLY_LABELS, default=True): bool,
    }
)

WS_CLONE_ASSET_SCHEMA = websocket_api.BASE_COMMAND_MESSAGE_SCHEMA.extend(
    {
        vol.Required("type"): "asset_manager/clone_asset",
        vol.Required("source_asset_id"): str,
        vol.Required("name"): vol.All(str, vol.Length(min=1)),
    }
)

WS_GET_AREAS_SCHEMA = websocket_api.BASE_COMMAND_MESSAGE_SCHEMA.extend(
    {
        vol.Required("type"): "asset_manager/get_areas",
    }
)

WS_UPDATE_AREA_SCHEMA = websocket_api.BASE_COMMAND_MESSAGE_SCHEMA.extend(
    {
        vol.Required("type"): "asset_manager/update_area",
        vol.Required("asset_id"): str,
        vol.Required("area_id"): vol.Any(str, None),
    }
)

WS_GET_ASSET_LABELS_SCHEMA = websocket_api.BASE_COMMAND_MESSAGE_SCHEMA.extend(
    {
        vol.Required("type"): "asset_manager/get_asset_labels",
    }
)

WS_UPDATE_ASSET_LABELS_SCHEMA = websocket_api.BASE_COMMAND_MESSAGE_SCHEMA.extend(
    {
        vol.Required("type"): "asset_manager/update_asset_labels",
        vol.Required("asset_id"): str,
        vol.Required("labels"): vol.All(cv.ensure_list, [str]),
    }
)


@callback
def async_register_bespoke_commands(
    hass: HomeAssistant, coordinator: AssetManagerCoordinator
) -> None:
    """Register bespoke websocket commands."""
    websocket_api.async_register_command(
        hass,
        "asset_manager/apply_template",
        websocket_api.async_response(ws_apply_template),
        WS_APPLY_TEMPLATE_SCHEMA,
    )
    websocket_api.async_register_command(
        hass,
        "asset_manager/clone_asset",
        websocket_api.async_response(ws_clone_asset),
        WS_CLONE_ASSET_SCHEMA,
    )
    websocket_api.async_register_command(
        hass,
        "asset_manager/get_areas",
        websocket_api.async_response(ws_get_areas),
        WS_GET_AREAS_SCHEMA,
    )
    websocket_api.async_register_command(
        hass,
        "asset_manager/update_area",
        websocket_api.async_response(ws_update_area),
        WS_UPDATE_AREA_SCHEMA,
    )
    websocket_api.async_register_command(
        hass,
        "asset_manager/get_asset_labels",
        websocket_api.async_response(ws_get_asset_labels),
        WS_GET_ASSET_LABELS_SCHEMA,
    )
    websocket_api.async_register_command(
        hass,
        "asset_manager/update_asset_labels",
        websocket_api.async_response(ws_update_asset_labels),
        WS_UPDATE_ASSET_LABELS_SCHEMA,
    )


async def ws_apply_template(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Apply a template's entity specs to an existing asset."""
    coordinator: AssetManagerCoordinator = hass.data[DOMAIN]["coordinator"]
    asset_id: str = msg["asset_id"]
    template_id: str = msg["template_id"]
    apply_labels: bool = msg.get(CONF_APPLY_LABELS, True)

    if asset_id not in coordinator.assets.data:
        connection.send_error(msg["id"], "asset_manager/not_found", f"Asset {asset_id} not found")
        return

    if template_id not in coordinator.templates.data:
        connection.send_error(
            msg["id"],
            "asset_manager/template_not_found",
            f"Template {template_id} not found",
        )
        return

    template = coordinator.templates.data[template_id]
    existing_ids = set(coordinator.entities.data)
    created: list[dict[str, Any]] = []

    for spec in template.entities:
        entity_id = slugify(f"{asset_id}-{spec['slug']}")
        if entity_id in existing_ids:
            continue
        payload = dict(spec)
        payload["asset_id"] = asset_id
        entity = await coordinator.entities.async_create_item(payload)
        created.append(entity.as_dict())

    applied_labels: list[str] = []
    if apply_labels and template.labels:
        device = coordinator.dev_reg.async_get_device({(DOMAIN, asset_id)})
        if device is not None:
            merged = sorted(set(template.labels) | set(device.labels))
            if merged != sorted(device.labels):
                coordinator.dev_reg.async_update_device(device.id, labels=set(merged))
            applied_labels = merged

    connection.send_result(msg["id"], {"created": created, "applied_labels": applied_labels})


async def ws_clone_asset(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Clone a source asset and all its entity definitions."""
    coordinator: AssetManagerCoordinator = hass.data[DOMAIN]["coordinator"]
    source_asset_id: str = msg["source_asset_id"]
    name: str = msg["name"]

    source = coordinator.assets.data.get(source_asset_id)
    if source is None:
        connection.send_error(
            msg["id"],
            "asset_manager/not_found",
            f"Source asset {source_asset_id} not found",
        )
        return

    new_asset_payload: dict[str, Any] = {"name": name}
    if source.manufacturer is not None:
        new_asset_payload["manufacturer"] = source.manufacturer
    if source.model is not None:
        new_asset_payload["model"] = source.model
    if source.icon is not None:
        new_asset_payload["icon"] = source.icon
    new_asset = await coordinator.assets.async_create_item(new_asset_payload)

    # Inherit the source asset's native HA labels (assigned to its device).
    source_device = coordinator.dev_reg.async_get_device({(DOMAIN, source_asset_id)})
    if source_device is not None and source_device.labels:
        new_device = coordinator.dev_reg.async_get_device({(DOMAIN, new_asset.id)})
        if new_device is not None:
            coordinator.dev_reg.async_update_device(
                new_device.id, labels=set(source_device.labels)
            )

    created_entities: list[dict[str, Any]] = []
    for entity_def in coordinator.entities.async_by_asset(source_asset_id):
        payload: dict[str, Any] = {
            "slug": entity_def.slug,
            "name": entity_def.name,
            "kind": entity_def.kind,
            "enabled": entity_def.enabled,
            "config": dict(entity_def.config or {}),
            "value": entity_def.value,
            "asset_id": new_asset.id,
        }
        if entity_def.icon is not None:
            payload["icon"] = entity_def.icon
        if entity_def.unit_of_measurement is not None:
            payload["unit_of_measurement"] = entity_def.unit_of_measurement
        entity = await coordinator.entities.async_create_item(payload)
        created_entities.append(entity.as_dict())

    connection.send_result(msg["id"], {"asset_id": new_asset.id, "entities": created_entities})


async def ws_get_areas(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return the area registry and the current area_id for each asset device."""
    coordinator: AssetManagerCoordinator = hass.data[DOMAIN]["coordinator"]
    registry = ar.async_get(hass)
    areas = [{"area_id": area.id, "name": area.name} for area in registry.areas.values()]
    areas.sort(key=lambda a: a["name"])
    asset_areas: dict[str, str | None] = {}
    for asset_id in coordinator.assets.data:
        device = coordinator.dev_reg.async_get_device({(DOMAIN, asset_id)})
        asset_areas[asset_id] = device.area_id if device else None
    connection.send_result(msg["id"], {"areas": areas, "asset_areas": asset_areas})


async def ws_update_area(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Assign an asset's device to an area (or clear it with None)."""
    coordinator: AssetManagerCoordinator = hass.data[DOMAIN]["coordinator"]
    asset_id: str = msg["asset_id"]
    area_id: str | None = msg["area_id"]

    if asset_id not in coordinator.assets.data:
        connection.send_error(msg["id"], "asset_manager/not_found", f"Asset {asset_id} not found")
        return

    device = coordinator.dev_reg.async_get_device({(DOMAIN, asset_id)})
    if device is None:
        connection.send_error(
            msg["id"], "asset_manager/no_device", f"Device for asset {asset_id} not found"
        )
        return

    coordinator.dev_reg.async_update_device(device.id, area_id=area_id)
    connection.send_result(msg["id"], {"asset_id": asset_id, "area_id": area_id})


async def ws_get_asset_labels(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return the current label_ids for each asset device."""
    coordinator: AssetManagerCoordinator = hass.data[DOMAIN]["coordinator"]
    asset_labels: dict[str, list[str]] = {}
    for asset_id in coordinator.assets.data:
        device = coordinator.dev_reg.async_get_device({(DOMAIN, asset_id)})
        asset_labels[asset_id] = sorted(device.labels) if device else []
    connection.send_result(msg["id"], {"asset_labels": asset_labels})


async def ws_update_asset_labels(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Assign native HA labels to an asset's device (full replace)."""
    coordinator: AssetManagerCoordinator = hass.data[DOMAIN]["coordinator"]
    asset_id: str = msg["asset_id"]
    labels: list[str] = msg["labels"]

    if asset_id not in coordinator.assets.data:
        connection.send_error(msg["id"], "asset_manager/not_found", f"Asset {asset_id} not found")
        return

    device = coordinator.dev_reg.async_get_device({(DOMAIN, asset_id)})
    if device is None:
        connection.send_error(
            msg["id"], "asset_manager/no_device", f"Device for asset {asset_id} not found"
        )
        return

    coordinator.dev_reg.async_update_device(device.id, labels=set(labels))
    connection.send_result(msg["id"], {"asset_id": asset_id, "labels": sorted(labels)})
