"""Data models and voluptuous schemas for Asset Manager."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import voluptuous as vol
from homeassistant.const import (
    CONF_ICON,
    CONF_ID,
    CONF_NAME,
    CONF_UNIT_OF_MEASUREMENT,
)
from homeassistant.helpers import config_validation as cv

CONF_MANUFACTURER = "manufacturer"
CONF_MODEL = "model"
CONF_SERIAL = "serial"
CONF_TAGS = "tags"
CONF_ASSET_ID = "asset_id"
CONF_SLUG = "slug"
CONF_KIND = "kind"
CONF_ENABLED = "enabled"
CONF_CONFIG = "config"
CONF_VALUE = "value"
CONF_ENTITIES = "entities"

KIND_NUMBER = "number"
KIND_SENSOR = "sensor"
KIND_DATE = "date"
KIND_TEXT = "text"
KIND_SELECT = "select"
KIND_BUTTON = "button"
KIND_SWITCH = "switch"
KIND_DERIVED = "derived"

ENTITY_KINDS = (
    KIND_NUMBER,
    KIND_SENSOR,
    KIND_DATE,
    KIND_TEXT,
    KIND_SELECT,
    KIND_BUTTON,
    KIND_SWITCH,
    KIND_DERIVED,
)

NUMBER_CONFIG_SCHEMA = vol.Schema(
    {
        vol.Required("min"): vol.Coerce(float),
        vol.Required("max"): vol.Coerce(float),
        vol.Optional("step", default=1): vol.All(vol.Coerce(float), vol.Range(min=1e-9)),
        vol.Optional("mode", default="box"): vol.In(["box", "slider"]),
    }
)

SELECT_CONFIG_SCHEMA = vol.Schema(
    {
        vol.Required("options"): vol.All(
            cv.ensure_list, [vol.All(str, vol.Length(min=1))], vol.Length(min=1)
        ),
    }
)

TEXT_CONFIG_SCHEMA = vol.Schema(
    {
        vol.Optional("min", default=0): vol.All(int, vol.Range(min=0)),
        vol.Optional("max", default=255): vol.All(int, vol.Range(min=1)),
        vol.Optional("pattern", default=""): str,
    }
)

SENSOR_CONFIG_SCHEMA = vol.Schema(
    {
        vol.Optional("device_class"): str,
        vol.Optional("state_class"): str,
    }
)

SWITCH_CONFIG_SCHEMA = vol.Schema({})
BUTTON_CONFIG_SCHEMA = vol.Schema({})
DATE_CONFIG_SCHEMA = vol.Schema({})

CONF_FORMULA = "formula"
CONF_STATE_CLASS = "state_class"
CONF_DEVICE_CLASS = "device_class"

DERIVED_CONFIG_SCHEMA = vol.Schema(
    {
        vol.Required(CONF_FORMULA): vol.All(str, vol.Length(min=1)),
        vol.Optional(CONF_DEVICE_CLASS): str,
        vol.Optional(CONF_STATE_CLASS): str,
    }
)


def _entity_config_validator(kind: str) -> vol.Schema:
    """Return the config schema for the given entity kind."""
    return {
        KIND_NUMBER: NUMBER_CONFIG_SCHEMA,
        KIND_SENSOR: SENSOR_CONFIG_SCHEMA,
        KIND_DATE: DATE_CONFIG_SCHEMA,
        KIND_TEXT: TEXT_CONFIG_SCHEMA,
        KIND_SELECT: SELECT_CONFIG_SCHEMA,
        KIND_BUTTON: BUTTON_CONFIG_SCHEMA,
        KIND_SWITCH: SWITCH_CONFIG_SCHEMA,
        KIND_DERIVED: DERIVED_CONFIG_SCHEMA,
    }[kind]


# Raw voluptuous field dicts (VolDictType) — consumed by StorageCollectionWebsocket
# and wrapped into vol.Schema by the storage layer for full validation.
ASSET_CREATE_FIELDS: dict[Any, Any] = {
    vol.Required(CONF_NAME): vol.All(str, vol.Length(min=1)),
    vol.Optional(CONF_MANUFACTURER): str,
    vol.Optional(CONF_MODEL): str,
    vol.Optional(CONF_SERIAL): str,
    vol.Optional(CONF_ICON): cv.icon,
    vol.Optional(CONF_TAGS): vol.All(cv.ensure_list, [str]),
}

ASSET_UPDATE_FIELDS: dict[Any, Any] = {
    vol.Optional(CONF_NAME): vol.All(str, vol.Length(min=1)),
    vol.Optional(CONF_MANUFACTURER): vol.Any(str, None),
    vol.Optional(CONF_MODEL): vol.Any(str, None),
    vol.Optional(CONF_SERIAL): vol.Any(str, None),
    vol.Optional(CONF_ICON): vol.Any(cv.icon, None),
    vol.Optional(CONF_TAGS): vol.Any(vol.All(cv.ensure_list, [str]), None),
}

ASSET_CREATE_SCHEMA = vol.Schema(ASSET_CREATE_FIELDS)
ASSET_UPDATE_SCHEMA = vol.Schema(ASSET_UPDATE_FIELDS)

ENTITY_CREATE_FIELDS: dict[Any, Any] = {
    vol.Required(CONF_ASSET_ID): str,
    vol.Required(CONF_SLUG): vol.All(str, vol.Length(min=1)),
    vol.Required(CONF_NAME): vol.All(str, vol.Length(min=1)),
    vol.Required(CONF_KIND): vol.In(ENTITY_KINDS),
    vol.Optional(CONF_ENABLED, default=True): bool,
    vol.Optional(CONF_CONFIG, default={}): dict,
    vol.Optional(CONF_VALUE): vol.Any(int, float, str, bool, None),
    vol.Optional(CONF_ICON): cv.icon,
    vol.Optional(CONF_UNIT_OF_MEASUREMENT): str,
}

ENTITY_UPDATE_FIELDS: dict[Any, Any] = {
    vol.Optional(CONF_SLUG): vol.All(str, vol.Length(min=1)),
    vol.Optional(CONF_NAME): vol.All(str, vol.Length(min=1)),
    vol.Optional(CONF_ENABLED): bool,
    vol.Optional(CONF_CONFIG): dict,
    vol.Optional(CONF_VALUE): vol.Any(int, float, str, bool, None),
    vol.Optional(CONF_ICON): vol.Any(cv.icon, None),
    vol.Optional(CONF_UNIT_OF_MEASUREMENT): vol.Any(str, None),
}


def _validate_entity_fields(data: dict[str, Any]) -> dict[str, Any]:
    """Validate a full entity definition payload (cross-field)."""
    kind = data[CONF_KIND]
    config = data.get(CONF_CONFIG, {})
    validated = _entity_config_validator(kind)(config)
    result = dict(data)
    result[CONF_CONFIG] = dict(validated)
    result.setdefault(CONF_ENABLED, True)
    result.setdefault(CONF_VALUE, None)
    return result


ENTITY_CREATE_SCHEMA = vol.Schema(vol.All(ENTITY_CREATE_FIELDS, _validate_entity_fields))
ENTITY_UPDATE_SCHEMA = vol.Schema(ENTITY_UPDATE_FIELDS)

# Template entity spec — same as ENTITY_CREATE_FIELDS but without asset_id
TEMPLATE_ENTITY_SPEC_FIELDS: dict[Any, Any] = {
    vol.Required(CONF_SLUG): vol.All(str, vol.Length(min=1)),
    vol.Required(CONF_NAME): vol.All(str, vol.Length(min=1)),
    vol.Required(CONF_KIND): vol.In(ENTITY_KINDS),
    vol.Optional(CONF_ENABLED, default=True): bool,
    vol.Optional(CONF_CONFIG, default={}): dict,
    vol.Optional(CONF_VALUE): vol.Any(int, float, str, bool, None),
    vol.Optional(CONF_ICON): cv.icon,
    vol.Optional(CONF_UNIT_OF_MEASUREMENT): str,
}

TEMPLATE_ENTITY_SPEC_SCHEMA = vol.Schema(
    vol.All(TEMPLATE_ENTITY_SPEC_FIELDS, _validate_entity_fields)
)

TEMPLATE_CREATE_FIELDS: dict[Any, Any] = {
    vol.Required(CONF_NAME): vol.All(str, vol.Length(min=1)),
    vol.Optional(CONF_ICON): cv.icon,
    vol.Required(CONF_ENTITIES): vol.All(
        cv.ensure_list, [TEMPLATE_ENTITY_SPEC_SCHEMA], vol.Length(min=1)
    ),
}

TEMPLATE_UPDATE_FIELDS: dict[Any, Any] = {
    vol.Optional(CONF_NAME): vol.All(str, vol.Length(min=1)),
    vol.Optional(CONF_ICON): vol.Any(cv.icon, None),
    vol.Optional(CONF_ENTITIES): vol.All(
        cv.ensure_list, [TEMPLATE_ENTITY_SPEC_SCHEMA], vol.Length(min=1)
    ),
}

TEMPLATE_CREATE_SCHEMA = vol.Schema(TEMPLATE_CREATE_FIELDS)
TEMPLATE_UPDATE_SCHEMA = vol.Schema(TEMPLATE_UPDATE_FIELDS)


@dataclass(slots=True)
class Template:
    """A reusable template blueprint with entity specs."""

    id: str
    name: str
    entities: list[dict[str, Any]] = field(default_factory=list)
    icon: str | None = None

    def as_dict(self) -> dict[str, Any]:
        """Return JSON-serialisable representation including id."""
        result: dict[str, Any] = {
            CONF_ID: self.id,
            CONF_NAME: self.name,
            CONF_ENTITIES: list(self.entities),
        }
        if self.icon is not None:
            result[CONF_ICON] = self.icon
        return result


@dataclass(slots=True)
class Asset:
    """A physical asset tracked by the integration."""

    id: str
    name: str
    manufacturer: str | None = None
    model: str | None = None
    serial: str | None = None
    icon: str | None = None
    tags: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        """Return JSON-serialisable representation including id."""
        result: dict[str, Any] = {CONF_ID: self.id, CONF_NAME: self.name}
        for key in (CONF_MANUFACTURER, CONF_MODEL, CONF_SERIAL, CONF_ICON):
            value = getattr(self, key)
            if value is not None:
                result[key] = value
        if self.tags:
            result[CONF_TAGS] = list(self.tags)
        return result


@dataclass(slots=True)
class EntityDef:
    """A user-defined entity attached to an asset."""

    id: str
    asset_id: str
    slug: str
    name: str
    kind: str
    enabled: bool = True
    config: dict[str, Any] = field(default_factory=dict)
    value: float | int | str | bool | None = None
    icon: str | None = None
    unit_of_measurement: str | None = None

    @property
    def unique_id(self) -> str:
        """Return the stable entity unique id."""
        return f"{self.asset_id}-{self.slug}"

    def as_dict(self) -> dict[str, Any]:
        """Return JSON-serialisable representation including id."""
        result: dict[str, Any] = {
            CONF_ID: self.id,
            CONF_ASSET_ID: self.asset_id,
            CONF_SLUG: self.slug,
            CONF_NAME: self.name,
            CONF_KIND: self.kind,
            CONF_ENABLED: self.enabled,
            CONF_CONFIG: dict(self.config),
            CONF_VALUE: self.value,
        }
        if self.icon is not None:
            result[CONF_ICON] = self.icon
        if self.unit_of_measurement is not None:
            result[CONF_UNIT_OF_MEASUREMENT] = self.unit_of_measurement
        return result
