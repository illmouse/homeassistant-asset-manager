"""Tests for the Asset Manager config flow."""

from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.asset_manager.const import DOMAIN


async def test_form_user(hass: HomeAssistant, enable_custom_integrations: None) -> None:
    """Test the user form creates an entry."""
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "user"

    result2 = await hass.config_entries.flow.async_configure(result["flow_id"], user_input={})
    await hass.async_block_till_done()
    assert result2["type"] is FlowResultType.CREATE_ENTRY
    assert result2["title"] == "Asset Manager"
    assert result2["data"] == {}


async def test_single_instance_allowed(
    hass: HomeAssistant, enable_custom_integrations: None
) -> None:
    """Only a single config entry is allowed."""
    entry = MockConfigEntry(
        title="Asset Manager",
        domain=DOMAIN,
        data={},
        entry_id="existing",
    )
    entry.add_to_hass(hass)

    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "single_instance_allowed"
