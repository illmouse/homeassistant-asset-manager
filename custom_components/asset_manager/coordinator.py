"""Coordinator that reconciles collections with device/entity registries."""

from __future__ import annotations

import logging
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.collection import CollectionChange
from homeassistant.helpers.device_registry import DeviceRegistry, async_get

from .const import DOMAIN
from .entity import build_entity
from .models import Asset, EntityDef
from .storage import AssetStorageCollection, EntityStorageCollection, TemplateStorageCollection

_LOGGER = logging.getLogger(__name__)


class AssetManagerCoordinator:
    """Owns the live entity objects and reconciles device + entity registries.

    Subscribes to asset & entity collection change sets and keeps:
      - one DeviceRegistry entry per asset, identified by (DOMAIN, asset_id)
      - one live Entity per EntityDef, attached to the asset device
    """

    def __init__(
        self,
        hass: HomeAssistant,
        entry: ConfigEntry,
        assets: AssetStorageCollection,
        entities: EntityStorageCollection,
        templates: TemplateStorageCollection,
    ) -> None:
        """Initialise the coordinator."""
        self.hass = hass
        self.entry = entry
        self.assets = assets
        self.entities = entities
        self.templates = templates
        self.dev_reg: DeviceRegistry = async_get(hass)
        self.ent_reg = er.async_get(hass)
        self._live: dict[str, Any] = {}
        self._entity_adders: dict[str, Any] = hass.data[DOMAIN].setdefault("entity_adders", {})
        self._unsub_assets = assets.async_add_change_set_listener(self._on_asset_changes)
        self._unsub_entities = entities.async_add_change_set_listener(self._on_entity_changes)

    async def async_unload(self) -> None:
        """Detach listeners and remove all devices/entities."""
        if self._unsub_assets:
            self._unsub_assets()
            self._unsub_assets = None
        if self._unsub_entities:
            self._unsub_entities()
            self._unsub_entities = None
        for asset_id in list(self.assets.data):
            await self._remove_asset_device(asset_id)
        self._live.clear()

    @callback
    def async_register_adder(self, platform: str, adder: Any) -> None:
        """Register an `async_add_entities` callback for a platform."""
        self._entity_adders[platform] = adder
        for entity_def in self.entities.data.values():
            if entity_def.kind == platform:
                self._add_entity(entity_def)

    def _asset_name(self, asset_id: str) -> str:
        """Return the asset's display name, falling back to its id."""
        asset: Asset | None = self.assets.data.get(asset_id)
        return asset.name if asset else asset_id

    async def _on_asset_changes(self, change_set: list[CollectionChange]) -> None:
        """Reconcile device registry for changed assets."""
        for change in change_set:
            if change.change_type == "added" or change.change_type == "updated":
                self._upsert_device(change.item)
            elif change.change_type == "removed":
                await self._remove_asset_device(change.item_id)

    def _upsert_device(self, asset: Asset) -> None:
        """Create or update the DeviceRegistry entry for an asset."""
        self.dev_reg.async_get_or_create(
            config_entry_id=self.entry.entry_id,
            identifiers={(DOMAIN, asset.id)},
            name=asset.name,
            manufacturer=asset.manufacturer,
            model=asset.model,
            sw_version=None,
            hw_version=None,
        )

    async def _remove_asset_device(self, asset_id: str) -> None:
        """Remove the device and all its entities when an asset is deleted."""
        for entity_def in self.entities.async_by_asset(asset_id):
            await self._remove_entity(entity_def)
        if device := self.dev_reg.async_get_device({(DOMAIN, asset_id)}):
            self.dev_reg.async_remove_device(device.id)

    async def _on_entity_changes(self, change_set: list[CollectionChange]) -> None:
        """Reconcile live entities for changed EntityDefs."""
        for change in change_set:
            item: EntityDef = change.item
            if change.change_type == "added":
                self._add_entity(item)
            elif change.change_type == "updated":
                self._update_entity(item)
            elif change.change_type == "removed":
                await self._remove_entity(item)

    def _add_entity(self, entity_def: EntityDef) -> None:
        """Create a live entity and register it with its platform adder."""
        adder = self._entity_adders.get(entity_def.kind)
        if adder is None:
            _LOGGER.debug(
                "Platform %s not ready yet; will add entity %s on setup",
                entity_def.kind,
                entity_def.unique_id,
            )
            return
        existing = self.ent_reg.async_get_entity_id(entity_def.kind, DOMAIN, entity_def.unique_id)
        if existing is not None:
            _LOGGER.debug("Entity %s already registered", entity_def.unique_id)
            self._live[entity_def.id] = None
            return
        entity = build_entity(entity_def, self.entities, self._asset_name(entity_def.asset_id))
        self._live[entity_def.id] = entity
        adder([entity])

    def _update_entity(self, entity_def: EntityDef) -> None:
        """Push a new EntityDef to the live entity object."""
        entity = self._live.get(entity_def.id)
        if entity is not None:
            entity.async_update_def(entity_def)

    async def _remove_entity(self, entity_def: EntityDef) -> None:
        """Remove a live entity and its registry entry."""
        self._live.pop(entity_def.id, None)
        entity_reg_id = self.ent_reg.async_get_entity_id(
            entity_def.kind, DOMAIN, entity_def.unique_id
        )
        if entity_reg_id is not None:
            self.ent_reg.async_remove(entity_reg_id)
