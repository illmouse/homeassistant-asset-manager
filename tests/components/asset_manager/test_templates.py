"""Tests for Asset Manager template storage, seeding, and bespoke WS commands."""

from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers import collection as col
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.asset_manager.const import DOMAIN
from custom_components.asset_manager.storage import (
    TemplateStorageCollection,
    async_seed_builtin_templates,
)

from .conftest import create_mock_entry


async def _setup_integration(
    hass: HomeAssistant,
    enable_custom_integrations: None,
) -> MockConfigEntry:
    """Set up the integration and return the mock entry."""
    entry = create_mock_entry(hass)
    await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert entry.state.value == "loaded"
    return entry


def _templates_collection(hass: HomeAssistant) -> TemplateStorageCollection:
    """Return the live template collection."""
    coordinator = hass.data[DOMAIN]["coordinator"]
    return coordinator.templates


def _entities_collection(hass):
    """Return the live entity collection."""
    return hass.data[DOMAIN]["coordinator"].entities


def _assets_collection(hass):
    """Return the live asset collection."""
    return hass.data[DOMAIN]["coordinator"].assets


async def test_seed_builtin_templates_loaded(
    hass: HomeAssistant, enable_custom_integrations: None
) -> None:
    """All 7 builtin templates are seeded on startup."""
    await _setup_integration(hass, enable_custom_integrations)
    templates = _templates_collection(hass)
    assert "vehicle" in templates.data
    assert "hvac" in templates.data
    assert "water_filter" in templates.data
    assert "appliance" in templates.data
    assert "coffee_machine" in templates.data
    assert "ups" in templates.data
    assert "generic_asset" in templates.data
    assert len(templates.data) >= 7
    # Vehicle template has 10 entities
    vehicle = templates.data["vehicle"]
    assert len(vehicle.entities) == 11


async def test_seed_builtin_templates_idempotent(
    hass: HomeAssistant, enable_custom_integrations: None
) -> None:
    """Seeding again does not duplicate templates."""
    await _setup_integration(hass, enable_custom_integrations)
    templates = _templates_collection(hass)
    vehicle = templates.data["vehicle"]
    orig_len = len(vehicle.entities)
    # Call seed again
    await async_seed_builtin_templates(hass, templates)
    assert templates.data["vehicle"].entities == vehicle.entities
    assert len(templates.data["vehicle"].entities) == orig_len


async def test_ws_list_templates(
    hass: HomeAssistant,
    enable_custom_integrations: None,
    hass_ws_client,
) -> None:
    """The asset_manager/templates/list WS command returns builtin templates."""
    await _setup_integration(hass, enable_custom_integrations)
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "asset_manager/templates/list"})
    response = await client.receive_json()
    assert response["success"] is True
    result: list[dict[str, Any]] = response["result"]
    names = {item["name"] for item in result}
    assert "Vehicle" in names
    assert "HVAC" in names


async def test_ws_create_template(
    hass: HomeAssistant,
    enable_custom_integrations: None,
    hass_ws_client,
) -> None:
    """Creating a custom template via WS works."""
    await _setup_integration(hass, enable_custom_integrations)
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "asset_manager/templates/create",
            "name": "My Template",
            "entities": [
                {
                    "slug": "temp",
                    "name": "Temperature",
                    "kind": "number",
                    "config": {"min": 0, "max": 100},
                }
            ],
        }
    )
    response = await client.receive_json()
    assert response["success"] is True
    assert response["result"]["name"] == "My Template"
    assert response["result"]["id"] == "my_template"
    assert len(response["result"]["entities"]) == 1


async def test_ws_create_template_rejects_empty_entities(
    hass: HomeAssistant,
    enable_custom_integrations: None,
    hass_ws_client,
) -> None:
    """Creating a template with an empty entities list fails."""
    await _setup_integration(hass, enable_custom_integrations)
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "asset_manager/templates/create",
            "name": "Empty Template",
            "entities": [],
        }
    )
    response = await client.receive_json()
    assert response["success"] is False


async def test_apply_template_creates_entities(
    hass: HomeAssistant,
    enable_custom_integrations: None,
    hass_ws_client,
) -> None:
    """Applying the Vehicle template to an asset creates ~10 entities."""
    await _setup_integration(hass, enable_custom_integrations)
    assets = _assets_collection(hass)
    await assets.async_create_item({"name": "Car"})
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "asset_manager/apply_template",
            "asset_id": "car",
            "template_id": "vehicle",
        }
    )
    response = await client.receive_json()
    assert response["success"] is True
    result: list[dict[str, Any]] = response["result"]
    assert len(result) == 11
    entities = _entities_collection(hass)
    car_entities = entities.async_by_asset("car")
    assert len(car_entities) == 11
    slugs = {e.slug for e in car_entities}
    assert "mileage" in slugs
    assert "fuel_level" in slugs
    # Entity registry has entries
    from homeassistant.helpers import entity_registry as er

    ent_reg = er.async_get(hass)
    assert ent_reg.async_get_entity_id("number", DOMAIN, "car-mileage") is not None


async def test_apply_template_idempotent(
    hass: HomeAssistant,
    enable_custom_integrations: None,
    hass_ws_client,
) -> None:
    """Applying the same template twice does not duplicate entities."""
    await _setup_integration(hass, enable_custom_integrations)
    assets = _assets_collection(hass)
    await assets.async_create_item({"name": "Car"})
    client = await hass_ws_client(hass)
    # First apply
    await client.send_json_auto_id(
        {
            "type": "asset_manager/apply_template",
            "asset_id": "car",
            "template_id": "vehicle",
        }
    )
    response1 = await client.receive_json()
    assert response1["success"] is True
    assert len(response1["result"]) == 11
    # Second apply — should be idempotent, 0 new entities
    await client.send_json_auto_id(
        {
            "type": "asset_manager/apply_template",
            "asset_id": "car",
            "template_id": "vehicle",
        }
    )
    response2 = await client.receive_json()
    assert response2["success"] is True
    assert len(response2["result"]) == 0
    # Total still 10
    entities = _entities_collection(hass)
    assert len(entities.async_by_asset("car")) == 11


async def test_apply_template_unknown_asset(
    hass: HomeAssistant,
    enable_custom_integrations: None,
    hass_ws_client,
) -> None:
    """Applying a template to a non-existent asset returns 404."""
    await _setup_integration(hass, enable_custom_integrations)
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "asset_manager/apply_template",
            "asset_id": "ghost",
            "template_id": "vehicle",
        }
    )
    response = await client.receive_json()
    assert response["success"] is False
    assert response["error"]["code"] == "asset_manager/not_found"


async def test_apply_template_unknown_template(
    hass: HomeAssistant,
    enable_custom_integrations: None,
    hass_ws_client,
) -> None:
    """Applying a non-existent template returns 404."""
    await _setup_integration(hass, enable_custom_integrations)
    assets = _assets_collection(hass)
    await assets.async_create_item({"name": "Car"})
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "asset_manager/apply_template",
            "asset_id": "car",
            "template_id": "nonexistent",
        }
    )
    response = await client.receive_json()
    assert response["success"] is False
    assert response["error"]["code"] == "asset_manager/template_not_found"


async def test_clone_asset(
    hass: HomeAssistant,
    enable_custom_integrations: None,
    hass_ws_client,
) -> None:
    """Cloning an asset reproduces all its entities."""
    await _setup_integration(hass, enable_custom_integrations)
    assets = _assets_collection(hass)
    await assets.async_create_item(
        {
            "name": "Car",
            "manufacturer": "ACME",
            "model": "Model X",
            "serial": "SN123",
            "icon": "mdi:car",
        }
    )
    entities = _entities_collection(hass)
    await entities.async_create_item(
        {
            "asset_id": "car",
            "slug": "mileage",
            "name": "Mileage",
            "kind": "number",
            "config": {"min": 0, "max": 300000},
            "value": 15000,
        }
    )
    await entities.async_create_item(
        {
            "asset_id": "car",
            "slug": "engine_running",
            "name": "Engine Running",
            "kind": "switch",
            "value": False,
        }
    )
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "asset_manager/clone_asset",
            "source_asset_id": "car",
            "name": "Second Car",
        }
    )
    response = await client.receive_json()
    assert response["success"] is True
    result = response["result"]
    assert result["asset_id"] == "second_car"
    assert len(result["entities"]) == 2
    # Cloned asset should not have the serial
    new_asset = assets.data["second_car"]
    assert new_asset.serial is None
    assert new_asset.manufacturer == "ACME"
    assert new_asset.model == "Model X"
    # Cloned entities have new asset prefix
    new_entities = entities.async_by_asset("second_car")
    assert len(new_entities) == 2
    slugs = {e.slug for e in new_entities}
    assert "mileage" in slugs
    assert "engine_running" in slugs
    for e in new_entities:
        assert e.unique_id.startswith("second_car-")


async def test_clone_asset_unknown_source(
    hass: HomeAssistant,
    enable_custom_integrations: None,
    hass_ws_client,
) -> None:
    """Cloning a non-existent asset returns 404."""
    await _setup_integration(hass, enable_custom_integrations)
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "asset_manager/clone_asset",
            "source_asset_id": "ghost",
            "name": "Phantom",
        }
    )
    response = await client.receive_json()
    assert response["success"] is False
    assert response["error"]["code"] == "asset_manager/not_found"


async def test_template_storage_round_trip(
    hass: HomeAssistant, enable_custom_integrations: None
) -> None:
    """Items persist across collection reload."""
    await _setup_integration(hass, enable_custom_integrations)
    templates = _templates_collection(hass)
    await templates.async_create_item(
        {
            "name": "Persisted",
            "entities": [
                {
                    "slug": "power",
                    "name": "Power",
                    "kind": "switch",
                }
            ],
        }
    )
    await hass.async_block_till_done()
    new_collection = TemplateStorageCollection(templates.store, col.IDManager())
    await new_collection.async_load()
    assert "persisted" in new_collection.data
    assert new_collection.data["persisted"].name == "Persisted"
