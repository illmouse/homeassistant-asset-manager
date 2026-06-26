"""The Asset Manager integration."""

from __future__ import annotations

import logging

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.typing import ConfigType

from .const import DATA_COORDINATOR, DOMAIN, PLATFORMS
from .coordinator import AssetManagerCoordinator
from .storage import async_load_collections
from .ws import async_register_bespoke_commands

_LOGGER = logging.getLogger(__name__)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """YAML setup is not supported."""
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up an Asset Manager config entry."""
    data: dict = hass.data.setdefault(DOMAIN, {})
    assets, entities, templates = await async_load_collections(hass)
    coordinator = AssetManagerCoordinator(hass, entry, assets, entities, templates)
    data[DATA_COORDINATOR] = coordinator
    async_register_bespoke_commands(hass, coordinator)
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload an Asset Manager config entry."""
    data: dict = hass.data.get(DOMAIN, {})
    coordinator: AssetManagerCoordinator | None = data.get(DATA_COORDINATOR)
    if coordinator is not None:
        await coordinator.async_unload()
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        data.pop(DATA_COORDINATOR, None)
        if not data:
            hass.data.pop(DOMAIN, None)
    return unload_ok
