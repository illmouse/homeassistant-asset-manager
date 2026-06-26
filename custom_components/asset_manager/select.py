"""Platform file for the select platform — registers the add callback."""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .const import DATA_COORDINATOR, DOMAIN


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Register the add-entities callback with the coordinator."""
    coordinator = hass.data[DOMAIN][DATA_COORDINATOR]
    coordinator.async_register_adder("select", async_add_entities)
