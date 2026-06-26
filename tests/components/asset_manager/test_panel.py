"""Tests for the Asset Manager settings panel registration."""

from __future__ import annotations

from pathlib import Path

from homeassistant.components import frontend
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.asset_manager import async_unload_entry
from custom_components.asset_manager.const import DOMAIN
from custom_components.asset_manager.panel import (
    PANEL_MODULE_URL,
    PANEL_URL_PATH,
)

from .conftest import create_mock_entry


async def _setup(
    hass: HomeAssistant,
    enable_custom_integrations: None,
) -> MockConfigEntry:
    """Set up the integration; return the mock entry.

    The `http` component is required because panel registration serves
    the panel module via `hass.http.async_register_static_paths`.
    """
    assert await async_setup_component(hass, "http", {"http": {}})
    await hass.async_block_till_done()
    entry = create_mock_entry(hass)
    await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert entry.state is ConfigEntryState.LOADED
    return entry


async def test_panel_registered_on_setup(
    hass: HomeAssistant, enable_custom_integrations: None
) -> None:
    """async_setup_entry registers the Asset Manager sidebar panel."""
    await _setup(hass, enable_custom_integrations)
    panels = hass.data.get(frontend.DATA_PANELS, {})
    assert PANEL_URL_PATH in panels
    panel = panels[PANEL_URL_PATH]
    assert panel.component_name == "custom"
    assert panel.require_admin is True
    assert panel.config_panel_domain == DOMAIN
    cfg = panel.config["_panel_custom"]
    assert cfg["name"] == "asset-manager-panel"
    assert cfg["module_url"] == PANEL_MODULE_URL


async def test_panel_removed_on_unload(
    hass: HomeAssistant, enable_custom_integrations: None
) -> None:
    """async_unload_entry removes the sidebar panel."""
    entry = await _setup(hass, enable_custom_integrations)
    assert PANEL_URL_PATH in hass.data.get(frontend.DATA_PANELS, {})
    await async_unload_entry(hass, entry)
    await hass.async_block_till_done()
    assert PANEL_URL_PATH not in hass.data.get(frontend.DATA_PANELS, {})


async def test_static_path_serves_panel_module(
    hass: HomeAssistant,
    enable_custom_integrations: None,
    hass_client,
) -> None:
    """The served module is the single-file panel source."""
    await _setup(hass, enable_custom_integrations)
    client = await hass_client()
    resp = await client.get(PANEL_MODULE_URL)
    assert resp.status == 200
    body = (await resp.text()).strip()
    assert body.startswith("/*") or body.startswith("(()")
    assert "customElements.define" in body
    assert "asset-manager-panel" in body


async def test_static_path_served_from_frontend_dir() -> None:
    """The frontend dir contains the panel module file."""
    from custom_components.asset_manager import panel as panel_mod

    module_path = Path(panel_mod.FRONTEND_DIR) / "asset-manager-panel.js"
    assert module_path.is_file()
    assert module_path.stat().st_size > 0


async def test_register_panel_survives_reload(
    hass: HomeAssistant, enable_custom_integrations: None
) -> None:
    """`async_register_panel` is safe to call again after async_remove_panel."""
    assert await async_setup_component(hass, "http", {"http": {}})
    await hass.async_block_till_done()
    from custom_components.asset_manager.panel import async_register_panel, async_remove_panel

    entry = create_mock_entry(hass)
    await async_register_panel(hass, entry)
    await hass.async_block_till_done()
    assert PANEL_URL_PATH in hass.data[frontend.DATA_PANELS]

    async_remove_panel(hass)
    assert PANEL_URL_PATH not in hass.data.get(frontend.DATA_PANELS, {})

    # Re-registering must not raise (panel slot is free again).
    await async_register_panel(hass, entry)
    assert PANEL_URL_PATH in hass.data[frontend.DATA_PANELS]
