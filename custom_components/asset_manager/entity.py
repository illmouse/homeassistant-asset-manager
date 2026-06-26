"""Entity classes backed by EntityDef / EntityStorageCollection state."""

from __future__ import annotations

import contextlib
from datetime import date
from typing import Any, override

from homeassistant.components.button import ButtonEntity
from homeassistant.components.date import DateEntity
from homeassistant.components.number import NumberEntity, NumberMode
from homeassistant.components.select import SelectEntity
from homeassistant.components.sensor import SensorEntity
from homeassistant.components.switch import SwitchEntity
from homeassistant.components.text import TextEntity, TextMode
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.restore_state import RestoreEntity
from homeassistant.util import slugify

from .const import DOMAIN
from .models import EntityDef
from .storage import EntityStorageCollection


def _device_info(asset_id: str, asset_name: str) -> DeviceInfo:
    """Return device info linking an entity to its asset device."""
    return DeviceInfo(
        identifiers={(DOMAIN, asset_id)},
        name=asset_name,
        via_device=None,
    )


class AssetEntityMixin(RestoreEntity):
    """Common behaviour for all asset-managed entities.

    Subclasses set the platform base class and `_attr_*` fields from the
    EntityDef config. State is read from the live EntityDef stored in the
    entity collection and written back through `async_update_item`.
    """

    _def: EntityDef
    _collection: EntityStorageCollection
    _asset_name: str

    def init_from_def(
        self,
        entity_def: EntityDef,
        collection: EntityStorageCollection,
        asset_name: str,
    ) -> None:
        """Populate attributes from an EntityDef."""
        self._def = entity_def
        self._collection = collection
        self._asset_name = asset_name
        self._attr_has_entity_name = True
        self._attr_unique_id = entity_def.unique_id
        self._attr_device_info = _device_info(entity_def.asset_id, asset_name)
        self._attr_entity_category = None
        self._attr_available = True
        self._attr_name = entity_def.name
        self._attr_icon = entity_def.icon

    @property
    def def_id(self) -> str:
        """Return the EntityDef id."""
        return self._def.id

    @callback
    def async_update_def(self, entity_def: EntityDef) -> None:
        """Apply a new EntityDef (collection update)."""
        self._def = entity_def
        self._attr_name = entity_def.name
        self._attr_icon = entity_def.icon
        self._async_write_ha_state()

    async def _persist_value(self, value: Any) -> None:
        """Write the new value back to the entity collection."""
        await self._collection.async_update_item(self._def.id, {"value": value})

    async def async_added_to_hass(self) -> None:
        """Restore previous state on startup."""
        await super().async_added_to_hass()
        if (last_state := await self.async_get_last_state()) is not None:
            self._restore_from_last_state(last_state.state)

    def _restore_from_last_state(self, state: str | None) -> None:
        """Override per platform to restore value from a state string."""


class AssetNumberEntity(AssetEntityMixin, NumberEntity):
    """A user-defined number input attached to an asset."""

    _attr_native_value: float | None

    def init_from_def(
        self,
        entity_def: EntityDef,
        collection: EntityStorageCollection,
        asset_name: str,
    ) -> None:
        """Populate attributes from an EntityDef."""
        super().init_from_def(entity_def, collection, asset_name)
        cfg = entity_def.config
        self._attr_native_min_value = cfg.get("min", 0.0)
        self._attr_native_max_value = cfg.get("max", 100.0)
        self._attr_native_step = cfg.get("step", 1.0)
        self._attr_native_unit_of_measurement = entity_def.unit_of_measurement
        self._attr_mode = NumberMode(cfg.get("mode", "box"))
        self._attr_native_value = (
            float(entity_def.value) if entity_def.value is not None else None
        )

    @override
    @callback
    def async_update_def(self, entity_def: EntityDef) -> None:
        """Apply a new EntityDef (collection update)."""
        cfg = entity_def.config
        self._attr_native_min_value = cfg.get("min", 0.0)
        self._attr_native_max_value = cfg.get("max", 100.0)
        self._attr_native_step = cfg.get("step", 1.0)
        self._attr_native_unit_of_measurement = entity_def.unit_of_measurement
        if entity_def.value is not None:
            self._attr_native_value = float(entity_def.value)
        super().async_update_def(entity_def)

    @override
    async def async_set_native_value(self, value: float) -> None:
        """Persist a new number value."""
        self._attr_native_value = float(value)
        await self._persist_value(float(value))

    @override
    def _restore_from_last_state(self, state: str | None) -> None:
        """Restore the float value from the last state."""
        if state is None:
            return
        with contextlib.suppress(ValueError):
            self._attr_native_value = float(state)


class AssetSensorEntity(AssetEntityMixin, SensorEntity):
    """A read-only sensor attached to an asset."""

    _attr_native_value: float | int | str | None

    def init_from_def(
        self,
        entity_def: EntityDef,
        collection: EntityStorageCollection,
        asset_name: str,
    ) -> None:
        """Populate attributes from an EntityDef."""
        super().init_from_def(entity_def, collection, asset_name)
        cfg = entity_def.config
        if "device_class" in cfg:
            self._attr_device_class = cfg["device_class"]
        if "state_class" in cfg:
            self._attr_state_class = cfg["state_class"]
        self._attr_native_unit_of_measurement = entity_def.unit_of_measurement
        self._attr_native_value = entity_def.value

    @override
    @callback
    def async_update_def(self, entity_def: EntityDef) -> None:
        """Apply a new EntityDef (collection update)."""
        self._attr_native_value = entity_def.value
        self._attr_native_unit_of_measurement = entity_def.unit_of_measurement
        super().async_update_def(entity_def)

    @override
    def _restore_from_last_state(self, state: str | None) -> None:
        """Restore the sensor value from the last state."""
        if state is None:
            return
        try:
            self._attr_native_value = float(state)
        except ValueError:
            self._attr_native_value = state


class AssetTextEntity(AssetEntityMixin, TextEntity):
    """A user-defined text input attached to an asset."""

    _attr_native_value: str | None

    def init_from_def(
        self,
        entity_def: EntityDef,
        collection: EntityStorageCollection,
        asset_name: str,
    ) -> None:
        """Populate attributes from an EntityDef."""
        super().init_from_def(entity_def, collection, asset_name)
        cfg = entity_def.config
        self._attr_native_min = cfg.get("min", 0)
        self._attr_native_max = cfg.get("max", 255)
        self._attr_pattern = cfg.get("pattern", "")
        self._attr_mode = TextMode.TEXT
        self._attr_native_value = str(entity_def.value) if entity_def.value is not None else None

    @override
    @callback
    def async_update_def(self, entity_def: EntityDef) -> None:
        """Apply a new EntityDef (collection update)."""
        if entity_def.value is not None:
            self._attr_native_value = str(entity_def.value)
        super().async_update_def(entity_def)

    @override
    async def async_set_value(self, value: str) -> None:
        """Persist a new text value."""
        self._attr_native_value = value
        await self._persist_value(value)

    @override
    def _restore_from_last_state(self, state: str | None) -> None:
        """Restore the text value from the last state."""
        if state is None:
            return
        self._attr_native_value = state


class AssetSelectEntity(AssetEntityMixin, SelectEntity):
    """A user-defined select attached to an asset."""

    _attr_current_option: str | None

    def init_from_def(
        self,
        entity_def: EntityDef,
        collection: EntityStorageCollection,
        asset_name: str,
    ) -> None:
        """Populate attributes from an EntityDef."""
        super().init_from_def(entity_def, collection, asset_name)
        self._attr_options = list(entity_def.config.get("options") or [])
        self._attr_current_option = (
            str(entity_def.value) if entity_def.value is not None else None
        )

    @override
    @callback
    def async_update_def(self, entity_def: EntityDef) -> None:
        """Apply a new EntityDef (collection update)."""
        self._attr_options = list(entity_def.config.get("options") or [])
        if entity_def.value is not None:
            self._attr_current_option = str(entity_def.value)
        super().async_update_def(entity_def)

    @override
    async def async_select_option(self, option: str) -> None:
        """Persist a new option."""
        self._attr_current_option = option
        await self._persist_value(option)

    @override
    def _restore_from_last_state(self, state: str | None) -> None:
        """Restore the selected option from the last state."""
        if state is None:
            return
        self._attr_current_option = state


class AssetSwitchEntity(AssetEntityMixin, SwitchEntity):
    """A user-defined switch attached to an asset."""

    _attr_is_on: bool | None

    def init_from_def(
        self,
        entity_def: EntityDef,
        collection: EntityStorageCollection,
        asset_name: str,
    ) -> None:
        """Populate attributes from an EntityDef."""
        super().init_from_def(entity_def, collection, asset_name)
        self._attr_is_on = bool(entity_def.value) if entity_def.value is not None else None

    @override
    @callback
    def async_update_def(self, entity_def: EntityDef) -> None:
        """Apply a new EntityDef (collection update)."""
        if entity_def.value is not None:
            self._attr_is_on = bool(entity_def.value)
        super().async_update_def(entity_def)

    @override
    async def async_turn_on(self, **kwargs: Any) -> None:
        """Persist the on state."""
        self._attr_is_on = True
        await self._persist_value(True)

    @override
    async def async_turn_off(self, **kwargs: Any) -> None:
        """Persist the off state."""
        self._attr_is_on = False
        await self._persist_value(False)

    @override
    def _restore_from_last_state(self, state: str | None) -> None:
        """Restore the switch state from the last state."""
        if state is None:
            return
        self._attr_is_on = state.lower() == "on"


class AssetButtonEntity(AssetEntityMixin, ButtonEntity):
    """A user-defined button attached to an asset."""

    def init_from_def(
        self,
        entity_def: EntityDef,
        collection: EntityStorageCollection,
        asset_name: str,
    ) -> None:
        """Populate attributes from an EntityDef."""
        super().init_from_def(entity_def, collection, asset_name)

    @override
    async def async_press(self) -> None:
        """Fire a press event; buttons have no persistent value."""
        self.hass.bus.async_fire(
            f"{DOMAIN}_button_press",
            {"asset_id": self._def.asset_id, "entity_id": self.entity_id},
        )


class AssetDateEntity(AssetEntityMixin, DateEntity):
    """A user-defined date input attached to an asset."""

    _attr_native_value: date | None

    def init_from_def(
        self,
        entity_def: EntityDef,
        collection: EntityStorageCollection,
        asset_name: str,
    ) -> None:
        """Populate attributes from an EntityDef."""
        super().init_from_def(entity_def, collection, asset_name)
        self._attr_native_value = _parse_date(entity_def.value)

    @override
    @callback
    def async_update_def(self, entity_def: EntityDef) -> None:
        """Apply a new EntityDef (collection update)."""
        self._attr_native_value = _parse_date(entity_def.value)
        super().async_update_def(entity_def)

    @override
    async def async_set_value(self, value: date) -> None:
        """Persist a new date value."""
        self._attr_native_value = value
        await self._persist_value(value.isoformat())

    @override
    def _restore_from_last_state(self, state: str | None) -> None:
        """Restore the date value from the last state."""
        self._attr_native_value = _parse_date(state)


class AssetDerivedEntity(AssetEntityMixin, SensorEntity):
    """A read-only sensor computed from sibling entities on the asset.

    State is set by `set_derived_value` (called from `DerivedEvaluator`)
    rather than read from the EntityDef `value`; the stored `value` is
    only a cache of the last computed result.
    """

    _attr_native_value: float | int | str | bool | date | None

    def init_from_def(
        self,
        entity_def: EntityDef,
        collection: EntityStorageCollection,
        asset_name: str,
    ) -> None:
        """Populate attributes from an EntityDef."""
        super().init_from_def(entity_def, collection, asset_name)
        cfg = entity_def.config
        if "device_class" in cfg:
            self._attr_device_class = cfg["device_class"]
        if "state_class" in cfg:
            self._attr_state_class = cfg["state_class"]
        self._attr_native_unit_of_measurement = entity_def.unit_of_measurement
        self._attr_native_value = entity_def.value

    @override
    @callback
    def async_update_def(self, entity_def: EntityDef) -> None:
        """Apply a new EntityDef (collection update)."""
        cfg = entity_def.config
        if "device_class" in cfg:
            self._attr_device_class = cfg["device_class"]
        if "state_class" in cfg:
            self._attr_state_class = cfg["state_class"]
        self._attr_native_unit_of_measurement = entity_def.unit_of_measurement
        super().async_update_def(entity_def)

    @callback
    def set_derived_value(self, value: float | int | str | bool | date | None) -> None:
        """Set the computed native value (called by the derived evaluator)."""
        self._attr_native_value = value

    @override
    def _restore_from_last_state(self, state: str | None) -> None:
        """Restore the last computed value from the persisted state."""
        if state is None:
            return
        parsed = _parse_date(state)
        if parsed is not None:
            self._attr_native_value = parsed
            return
        try:
            self._attr_native_value = float(state)
        except ValueError:
            self._attr_native_value = state


def _parse_date(value: Any) -> date | None:
    """Parse a YYYY-MM-DD string into a date."""
    if value is None or value == "":
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value))
    except ValueError:
        return None


ENTITY_CLASS_MAP: dict[str, type[AssetEntityMixin]] = {
    "number": AssetNumberEntity,
    "sensor": AssetSensorEntity,
    "date": AssetDateEntity,
    "text": AssetTextEntity,
    "select": AssetSelectEntity,
    "button": AssetButtonEntity,
    "switch": AssetSwitchEntity,
    "derived": AssetDerivedEntity,
}


def build_entity(
    entity_def: EntityDef,
    collection: EntityStorageCollection,
    asset_name: str,
) -> AssetEntityMixin:
    """Instantiate the correct entity subclass for an EntityDef."""
    cls = ENTITY_CLASS_MAP[entity_def.kind]
    entity = cls.__new__(cls)
    entity.init_from_def(entity_def, collection, asset_name)
    return entity


def entity_slug(entity_def: EntityDef) -> str:
    """Return the object id slug for an entity."""
    return slugify(entity_def.slug)


def platform_for_kind(kind: str) -> str:
    """Return the HA platform name for an entity kind.

    `derived` entities are exposed on the `sensor` platform.
    """
    return "sensor" if kind == "derived" else kind


__all__ = [
    "AssetButtonEntity",
    "AssetDateEntity",
    "AssetDerivedEntity",
    "AssetEntityMixin",
    "AssetNumberEntity",
    "AssetSelectEntity",
    "AssetSensorEntity",
    "AssetSwitchEntity",
    "AssetTextEntity",
    "build_entity",
    "entity_slug",
    "platform_for_kind",
]


def _entry_id(hass: HomeAssistant, entry: ConfigEntry) -> str:
    """Return the config entry id (helper for parity with future phases)."""
    return entry.entry_id
