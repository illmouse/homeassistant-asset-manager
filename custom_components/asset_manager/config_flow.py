"""Config flow for the Asset Manager integration."""

from typing import Any

import voluptuous as vol
from homeassistant.config_entries import ConfigFlow, ConfigFlowResult

from .const import DOMAIN

STEP_USER_DATA_SCHEMA = vol.Schema({})


class AssetManagerFlowHandler(ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Asset Manager."""

    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Handle the initial user step."""
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")
        if user_input is None:
            return self.async_show_form(step_id="user", data_schema=STEP_USER_DATA_SCHEMA)
        return self.async_create_entry(title="Asset Manager", data={})
