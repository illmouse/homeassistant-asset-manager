"""Register the Asset Manager settings panel as a HA built-in custom panel.

The panel source is a single self-contained ES module shipped under
``custom_components/asset_manager/frontend/``. We serve it via an HTTP
static path and register a ``custom`` built-in panel whose ``module_url``
points at that path. HA injects ``hass``, ``narrow`` and ``panel``
properties onto the custom element, so the JS module needs no imports
from HA's bundled chunks.
"""

from __future__ import annotations

from pathlib import Path

from homeassistant.components import frontend
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DOMAIN

PANEL_URL_PATH = "asset-manager"
PANEL_COMPONENT_NAME = "custom"
PANEL_SIDEBAR_TITLE = "Asset Manager"
PANEL_SIDEBAR_ICON = "mdi:package-variant"
PANEL_MODULE_URL = f"/api/{DOMAIN}/static/asset-manager-panel.js"
PANEL_WEB_COMPONENT_NAME = "asset-manager-panel"

STATIC_URL_PATH = f"/api/{DOMAIN}/static"
FRONTEND_DIR = Path(__file__).parent / "frontend"


async def async_register_panel(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Serve the panel assets and register the sidebar panel.

    Skips silently when the ``http`` component is not loaded — this is
    only the case in unit tests that exercise the storage/coordinator
    layer without booting the HTTP stack. Production HA always has
    ``http`` available before any integration setup runs.
    """
    if hass.http is None:
        return

    await hass.http.async_register_static_paths(
        [StaticPathConfig(STATIC_URL_PATH, str(FRONTEND_DIR), cache_headers=True)]
    )

    frontend.async_register_built_in_panel(
        hass,
        component_name=PANEL_COMPONENT_NAME,
        sidebar_title=PANEL_SIDEBAR_TITLE,
        sidebar_icon=PANEL_SIDEBAR_ICON,
        frontend_url_path=PANEL_URL_PATH,
        config={
            "_panel_custom": {
                "name": PANEL_WEB_COMPONENT_NAME,
                "module_url": PANEL_MODULE_URL,
                "embed_iframe": False,
                "trust_external": False,
            }
        },
        require_admin=True,
        config_panel_domain=DOMAIN,
    )


def async_remove_panel(hass: HomeAssistant) -> None:
    """Remove the Asset Manager sidebar panel."""
    frontend.async_remove_panel(hass, PANEL_URL_PATH, warn_if_unknown=False)
