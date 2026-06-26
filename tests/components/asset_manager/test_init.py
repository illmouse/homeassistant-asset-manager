"""Tests for the Asset Manager integration setup."""

from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.asset_manager.const import DOMAIN


async def test_setup_entry_success(hass: HomeAssistant, enable_custom_integrations: None) -> None:
    """Test setting up the integration via a config entry."""
    entry = MockConfigEntry(
        title="Asset Manager",
        domain=DOMAIN,
        data={},
        entry_id="test",
    )
    entry.add_to_hass(hass)
    await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert entry.state is ConfigEntryState.LOADED
    assert DOMAIN in hass.data


async def test_unload_entry(hass: HomeAssistant, enable_custom_integrations: None) -> None:
    """Test unloading the integration."""
    entry = MockConfigEntry(
        title="Asset Manager",
        domain=DOMAIN,
        data={},
        entry_id="test",
    )
    entry.add_to_hass(hass)
    await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()
    assert entry.state is ConfigEntryState.NOT_LOADED


async def test_async_setup_yaml_not_supported(hass: HomeAssistant) -> None:
    """YAML setup is a no-op (always returns True)."""
    from custom_components.asset_manager import async_setup

    assert await async_setup(hass, {}) is True
