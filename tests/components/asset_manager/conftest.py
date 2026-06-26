"""Common fixtures for Asset Manager tests."""

from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.asset_manager.const import DOMAIN


def create_mock_entry(hass: HomeAssistant, data: dict | None = None) -> MockConfigEntry:
    """Create and add a mock Asset Manager config entry."""
    entry = MockConfigEntry(
        title="Asset Manager",
        domain=DOMAIN,
        data=data or {},
        entry_id="test-asset-manager",
    )
    entry.add_to_hass(hass)
    return entry
