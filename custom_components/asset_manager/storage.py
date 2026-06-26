"""Storage collections for assets and entities."""

from __future__ import annotations

from typing import Any, override

from homeassistant.const import CONF_ID, CONF_NAME
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import collection
from homeassistant.helpers.storage import Store
from homeassistant.util import slugify

from .const import (
    ASSET_STORAGE_KEY,
    DOMAIN,
    ENTITY_STORAGE_KEY,
    STORAGE_VERSION,
)
from .models import (
    ASSET_CREATE_FIELDS,
    ASSET_CREATE_SCHEMA,
    ASSET_UPDATE_FIELDS,
    ASSET_UPDATE_SCHEMA,
    ENTITY_CREATE_FIELDS,
    ENTITY_CREATE_SCHEMA,
    ENTITY_UPDATE_FIELDS,
    ENTITY_UPDATE_SCHEMA,
    Asset,
    EntityDef,
)


class AssetStorageCollection(collection.StorageCollection):
    """Collection of assets persisted under .storage/asset_manager/assets."""

    @override
    async def _process_create_data(self, data: dict[str, Any]) -> dict[str, Any]:
        """Validate the payload for creating an asset."""
        return ASSET_CREATE_SCHEMA(data)

    @override
    @callback
    def _get_suggested_id(self, info: dict[str, Any]) -> str:
        """Suggest an id based on the asset name."""
        return slugify(info[CONF_NAME])

    @override
    async def _update_data(self, item: Asset, update_data: dict[str, Any]) -> Asset:
        """Apply validated updates to an asset."""
        validated = ASSET_UPDATE_SCHEMA(update_data)
        merged = item.as_dict() | {k: v for k, v in validated.items() if k in validated}
        return Asset(
            id=item.id,
            name=merged.get(CONF_NAME, item.name),
            manufacturer=merged.get("manufacturer", item.manufacturer),
            model=merged.get("model", item.model),
            serial=merged.get("serial", item.serial),
            icon=merged.get("icon", item.icon),
            tags=list(merged.get("tags", item.tags) or []),
        )

    @override
    def _create_item(self, item_id: str, data: dict[str, Any]) -> Asset:
        """Instantiate an Asset from validated data."""
        return Asset(
            id=item_id,
            name=data[CONF_NAME],
            manufacturer=data.get("manufacturer"),
            model=data.get("model"),
            serial=data.get("serial"),
            icon=data.get("icon"),
            tags=list(data.get("tags") or []),
        )

    @override
    def _deserialize_item(self, data: dict[str, Any]) -> Asset:
        """Reconstruct an Asset from stored data."""
        return self._create_item(data[CONF_ID], data)

    @override
    def _serialize_item(self, item_id: str, item: Asset) -> dict[str, Any]:
        """Return the stored representation of an asset."""
        return item.as_dict()

    @override
    @callback
    def _data_to_save(self) -> collection.SerializedStorageCollection:
        """Return the JSON payload for the store."""
        return self._base_data_to_save()


class EntityStorageCollection(collection.StorageCollection):
    """Collection of entity definitions persisted under .storage/asset_manager/entities."""

    @override
    async def _process_create_data(self, data: dict[str, Any]) -> dict[str, Any]:
        """Validate the payload for creating an entity definition."""
        return ENTITY_CREATE_SCHEMA(data)

    @override
    @callback
    def _get_suggested_id(self, info: dict[str, Any]) -> str:
        """Suggest an id based on asset_id + slug."""
        return f"{info['asset_id']}-{info['slug']}"

    @override
    async def _update_data(self, item: EntityDef, update_data: dict[str, Any]) -> EntityDef:
        """Apply validated updates to an entity definition."""
        validated = ENTITY_UPDATE_SCHEMA(update_data)
        merged = item.as_dict() | {k: v for k, v in validated.items() if k in validated}
        return EntityDef(
            id=item.id,
            asset_id=item.asset_id,
            slug=merged.get("slug", item.slug),
            name=merged.get("name", item.name),
            kind=item.kind,
            enabled=merged.get("enabled", item.enabled),
            config=dict(merged.get("config", item.config)),
            value=merged.get("value", item.value),
            icon=merged.get("icon", item.icon),
            unit_of_measurement=merged.get("unit_of_measurement", item.unit_of_measurement),
        )

    @override
    def _create_item(self, item_id: str, data: dict[str, Any]) -> EntityDef:
        """Instantiate an EntityDef from validated data."""
        return EntityDef(
            id=item_id,
            asset_id=data["asset_id"],
            slug=data["slug"],
            name=data["name"],
            kind=data["kind"],
            enabled=data.get("enabled", True),
            config=dict(data.get("config") or {}),
            value=data.get("value"),
            icon=data.get("icon"),
            unit_of_measurement=data.get("unit_of_measurement"),
        )

    @override
    def _deserialize_item(self, data: dict[str, Any]) -> EntityDef:
        """Reconstruct an EntityDef from stored data."""
        return self._create_item(data[CONF_ID], data)

    @override
    def _serialize_item(self, item_id: str, item: EntityDef) -> dict[str, Any]:
        """Return the stored representation of an entity definition."""
        return item.as_dict()

    @override
    @callback
    def _data_to_save(self) -> collection.SerializedStorageCollection:
        """Return the JSON payload for the store."""
        return self._base_data_to_save()

    def async_by_asset(self, asset_id: str) -> list[EntityDef]:
        """Return all entity definitions for a given asset."""
        return [item for item in self.data.values() if item.asset_id == asset_id]


async def async_load_collections(
    hass: HomeAssistant,
) -> tuple[AssetStorageCollection, EntityStorageCollection]:
    """Create, load and register websocket commands for both collections.

    Returns the two collections for the coordinator to subscribe to.
    """
    asset_collection = AssetStorageCollection(
        Store(hass, STORAGE_VERSION, ASSET_STORAGE_KEY),
        collection.IDManager(),
    )
    entity_collection = EntityStorageCollection(
        Store(hass, STORAGE_VERSION, ENTITY_STORAGE_KEY),
        collection.IDManager(),
    )

    collection.StorageCollectionWebsocket(
        asset_collection,
        f"{DOMAIN}/assets",
        "asset",
        ASSET_CREATE_FIELDS,
        ASSET_UPDATE_FIELDS,
    ).async_setup(hass)

    collection.StorageCollectionWebsocket(
        entity_collection,
        f"{DOMAIN}/entities",
        "entity",
        ENTITY_CREATE_FIELDS,
        ENTITY_UPDATE_FIELDS,
    ).async_setup(hass)

    await asset_collection.async_load()
    await entity_collection.async_load()
    return asset_collection, entity_collection
