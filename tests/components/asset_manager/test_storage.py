"""Tests for Asset Manager storage collections and WebSocket CRUD."""

from __future__ import annotations

from typing import Any

import pytest
import voluptuous as vol
from homeassistant.core import HomeAssistant
from homeassistant.helpers import collection
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.asset_manager.const import DOMAIN
from custom_components.asset_manager.models import Asset, EntityDef
from custom_components.asset_manager.storage import (
    AssetStorageCollection,
    EntityStorageCollection,
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


def _assets_collection(hass: HomeAssistant) -> AssetStorageCollection:
    """Return the live asset collection."""
    coordinator = hass.data[DOMAIN]["coordinator"]
    return coordinator.assets


def _entities_collection(hass: HomeAssistant) -> EntityStorageCollection:
    """Return the live entity collection."""
    coordinator = hass.data[DOMAIN]["coordinator"]
    return coordinator.entities


async def test_create_asset_via_collection(
    hass: HomeAssistant, enable_custom_integrations: None
) -> None:
    """Creating an asset via the collection stores an Asset."""
    entry = await _setup_integration(hass, enable_custom_integrations)
    assets = _assets_collection(hass)
    created = await assets.async_create_item({"name": "My Car"})
    assert isinstance(created, Asset)
    assert created.name == "My Car"
    assert created.id == "my_car"
    assert assets.data["my_car"] is created
    # entry state remains loaded
    assert entry.state.value == "loaded"


async def test_update_asset_via_collection(
    hass: HomeAssistant, enable_custom_integrations: None
) -> None:
    """Updating an asset merges fields."""
    await _setup_integration(hass, enable_custom_integrations)
    assets = _assets_collection(hass)
    await assets.async_create_item({"name": "Pump"})
    updated = await assets.async_update_item("pump", {"manufacturer": "ACME"})
    assert updated.manufacturer == "ACME"
    assert updated.name == "Pump"


async def test_delete_asset_via_collection(
    hass: HomeAssistant, enable_custom_integrations: None
) -> None:
    """Deleting an asset removes it from the collection."""
    await _setup_integration(hass, enable_custom_integrations)
    assets = _assets_collection(hass)
    await assets.async_create_item({"name": "Fridge"})
    await assets.async_delete_item("fridge")
    assert "fridge" not in assets.data


async def test_create_entity_via_collection(
    hass: HomeAssistant, enable_custom_integrations: None
) -> None:
    """Creating an entity def validates config per kind."""
    await _setup_integration(hass, enable_custom_integrations)
    await _assets_collection(hass).async_create_item({"name": "Car"})
    entities = _entities_collection(hass)
    created = await entities.async_create_item(
        {
            "asset_id": "car",
            "slug": "mileage",
            "name": "Mileage",
            "kind": "number",
            "config": {"min": 0, "max": 300000, "step": 1},
            "value": 12000,
        }
    )
    assert isinstance(created, EntityDef)
    assert created.kind == "number"
    assert created.config == {"min": 0.0, "max": 300000.0, "step": 1.0, "mode": "box"}
    assert created.value == 12000
    assert created.unique_id == "car-mileage"


async def test_create_entity_rejects_invalid_kind(
    hass: HomeAssistant, enable_custom_integrations: None
) -> None:
    """Unknown entity kinds are rejected by voluptuous."""
    await _setup_integration(hass, enable_custom_integrations)
    await _assets_collection(hass).async_create_item({"name": "Car"})
    entities = _entities_collection(hass)
    with pytest.raises(vol.Invalid):
        await entities.async_create_item(
            {
                "asset_id": "car",
                "slug": "bad",
                "name": "Bad",
                "kind": "robot",
            }
        )


async def test_update_entity_value_via_collection(
    hass: HomeAssistant, enable_custom_integrations: None
) -> None:
    """Updating an entity def persists the new value."""
    await _setup_integration(hass, enable_custom_integrations)
    await _assets_collection(hass).async_create_item({"name": "Car"})
    entities = _entities_collection(hass)
    await entities.async_create_item(
        {
            "asset_id": "car",
            "slug": "mileage",
            "name": "Mileage",
            "kind": "number",
            "config": {"min": 0, "max": 300000},
        }
    )
    updated = await entities.async_update_item("car_mileage", {"value": 42000})
    assert updated.value == 42000


async def test_entities_by_asset(hass: HomeAssistant, enable_custom_integrations: None) -> None:
    """async_by_asset returns only the matching entity defs."""
    await _setup_integration(hass, enable_custom_integrations)
    await _assets_collection(hass).async_create_item({"name": "Car"})
    await _assets_collection(hass).async_create_item({"name": "Bike"})
    entities = _entities_collection(hass)
    await entities.async_create_item(
        {
            "asset_id": "car",
            "slug": "mileage",
            "name": "Mileage",
            "kind": "number",
            "config": {"min": 0, "max": 1},
        }
    )
    await entities.async_create_item(
        {
            "asset_id": "bike",
            "slug": "chain",
            "name": "Chain",
            "kind": "switch",
        }
    )
    car_defs = entities.async_by_asset("car")
    assert len(car_defs) == 1
    assert car_defs[0].slug == "mileage"


async def test_ws_create_asset(
    hass: HomeAssistant,
    enable_custom_integrations: None,
    hass_ws_client,
) -> None:
    """The asset_manager/assets/create WS command creates an asset."""
    await _setup_integration(hass, enable_custom_integrations)
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "asset_manager/assets/create", "name": "Van"})
    response = await client.receive_json()
    assert response["success"] is True
    assert response["result"]["name"] == "Van"
    assert response["result"]["id"] == "van"


async def test_ws_list_assets(
    hass: HomeAssistant,
    enable_custom_integrations: None,
    hass_ws_client,
) -> None:
    """The asset_manager/assets/list WS command returns stored assets."""
    await _setup_integration(hass, enable_custom_integrations)
    assets = _assets_collection(hass)
    await assets.async_create_item({"name": "Tractor"})
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "asset_manager/assets/list"})
    response = await client.receive_json()
    assert response["success"] is True
    result: list[dict[str, Any]] = response["result"]
    assert any(item["name"] == "Tractor" for item in result)


async def test_ws_update_asset(
    hass: HomeAssistant,
    enable_custom_integrations: None,
    hass_ws_client,
) -> None:
    """The asset_manager/assets/update WS command updates an asset."""
    await _setup_integration(hass, enable_custom_integrations)
    assets = _assets_collection(hass)
    await assets.async_create_item({"name": "Boat"})
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "asset_manager/assets/update",
            "asset_id": "boat",
            "manufacturer": "Yamaha",
        }
    )
    response = await client.receive_json()
    assert response["success"] is True
    assert response["result"]["manufacturer"] == "Yamaha"


async def test_ws_delete_asset(
    hass: HomeAssistant,
    enable_custom_integrations: None,
    hass_ws_client,
) -> None:
    """The asset_manager/assets/delete WS command removes an asset."""
    await _setup_integration(hass, enable_custom_integrations)
    assets = _assets_collection(hass)
    await assets.async_create_item({"name": "Scooter"})
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "asset_manager/assets/delete", "asset_id": "scooter"})
    response = await client.receive_json()
    assert response["success"] is True
    assert "scooter" not in assets.data


async def test_ws_create_entity(
    hass: HomeAssistant,
    enable_custom_integrations: None,
    hass_ws_client,
) -> None:
    """The asset_manager/entities/create WS command creates an entity def."""
    await _setup_integration(hass, enable_custom_integrations)
    await _assets_collection(hass).async_create_item({"name": "Car"})
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "asset_manager/entities/create",
            "asset_id": "car",
            "slug": "mileage",
            "name": "Mileage",
            "kind": "number",
            "config": {"min": 0, "max": 300000, "step": 1},
            "value": 0,
        }
    )
    response = await client.receive_json()
    assert response["success"] is True
    assert response["result"]["kind"] == "number"
    assert response["result"]["id"] == "car_mileage"


async def test_ws_delete_entity(
    hass: HomeAssistant,
    enable_custom_integrations: None,
    hass_ws_client,
) -> None:
    """The asset_manager/entities/delete WS command removes an entity def."""
    await _setup_integration(hass, enable_custom_integrations)
    await _assets_collection(hass).async_create_item({"name": "Car"})
    entities = _entities_collection(hass)
    await entities.async_create_item(
        {
            "asset_id": "car",
            "slug": "mileage",
            "name": "Mileage",
            "kind": "number",
            "config": {"min": 0, "max": 1},
        }
    )
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {"type": "asset_manager/entities/delete", "entity_id": "car_mileage"}
    )
    response = await client.receive_json()
    assert response["success"] is True
    assert "car_mileage" not in entities.data


async def test_reconcile_creates_device(
    hass: HomeAssistant, enable_custom_integrations: None
) -> None:
    """Creating an asset produces a DeviceRegistry entry."""
    from homeassistant.helpers import device_registry as dr

    await _setup_integration(hass, enable_custom_integrations)
    await _assets_collection(hass).async_create_item(
        {"name": "Car", "manufacturer": "ACME", "model": "Model X"}
    )
    await hass.async_block_till_done()
    dev_reg = dr.async_get(hass)
    device = dev_reg.async_get_device({(DOMAIN, "car")})
    assert device is not None
    assert device.name == "Car"
    assert device.manufacturer == "ACME"
    assert device.model == "Model X"


async def test_reconcile_updates_device(
    hass: HomeAssistant, enable_custom_integrations: None
) -> None:
    """Updating an asset updates the DeviceRegistry entry."""
    from homeassistant.helpers import device_registry as dr

    await _setup_integration(hass, enable_custom_integrations)
    assets = _assets_collection(hass)
    await assets.async_create_item({"name": "Car"})
    await assets.async_update_item("car", {"manufacturer": "Tesla"})
    await hass.async_block_till_done()
    device = dr.async_get(hass).async_get_device({(DOMAIN, "car")})
    assert device is not None
    assert device.manufacturer == "Tesla"


async def test_reconcile_removes_device(
    hass: HomeAssistant, enable_custom_integrations: None
) -> None:
    """Deleting an asset removes the DeviceRegistry entry."""
    from homeassistant.helpers import device_registry as dr

    await _setup_integration(hass, enable_custom_integrations)
    assets = _assets_collection(hass)
    await assets.async_create_item({"name": "Car"})
    await assets.async_delete_item("car")
    await hass.async_block_till_done()
    assert dr.async_get(hass).async_get_device({(DOMAIN, "car")}) is None


async def test_reconcile_creates_entity_registry_entry(
    hass: HomeAssistant, enable_custom_integrations: None
) -> None:
    """Creating an entity def produces an entity registry entry and live entity."""
    from homeassistant.helpers import entity_registry as er

    await _setup_integration(hass, enable_custom_integrations)
    await _assets_collection(hass).async_create_item({"name": "Car"})
    entities = _entities_collection(hass)
    await entities.async_create_item(
        {
            "asset_id": "car",
            "slug": "mileage",
            "name": "Mileage",
            "kind": "number",
            "config": {"min": 0, "max": 1},
        }
    )
    await hass.async_block_till_done()
    ent_reg = er.async_get(hass)
    entity_id = ent_reg.async_get_entity_id("number", DOMAIN, "car-mileage")
    assert entity_id is not None
    state = hass.states.get(entity_id)
    assert state is not None


async def test_reconcile_removes_entity_registry_entry(
    hass: HomeAssistant, enable_custom_integrations: None
) -> None:
    """Deleting an entity def removes the entity registry entry."""
    from homeassistant.helpers import entity_registry as er

    await _setup_integration(hass, enable_custom_integrations)
    await _assets_collection(hass).async_create_item({"name": "Car"})
    entities = _entities_collection(hass)
    await entities.async_create_item(
        {
            "asset_id": "car",
            "slug": "mileage",
            "name": "Mileage",
            "kind": "number",
            "config": {"min": 0, "max": 1},
        }
    )
    await hass.async_block_till_done()
    await entities.async_delete_item("car_mileage")
    await hass.async_block_till_done()
    ent_reg = er.async_get(hass)
    assert ent_reg.async_get_entity_id("number", DOMAIN, "car-mileage") is None


async def test_reconcile_removes_entities_when_asset_deleted(
    hass: HomeAssistant, enable_custom_integrations: None
) -> None:
    """Deleting an asset also removes its entities."""
    from homeassistant.helpers import entity_registry as er

    await _setup_integration(hass, enable_custom_integrations)
    assets = _assets_collection(hass)
    await assets.async_create_item({"name": "Car"})
    entities = _entities_collection(hass)
    await entities.async_create_item(
        {
            "asset_id": "car",
            "slug": "mileage",
            "name": "Mileage",
            "kind": "number",
            "config": {"min": 0, "max": 1},
        }
    )
    await hass.async_block_till_done()
    await assets.async_delete_item("car")
    await hass.async_block_till_done()
    ent_reg = er.async_get(hass)
    assert ent_reg.async_get_entity_id("number", DOMAIN, "car-mileage") is None


async def test_storage_round_trip(
    hass: HomeAssistant, enable_custom_integrations: None, tmp_path
) -> None:
    """Items persist across collection reload."""
    await _setup_integration(hass, enable_custom_integrations)
    assets = _assets_collection(hass)
    await assets.async_create_item({"name": "Persisted"})
    await hass.async_block_till_done()
    new_collection = AssetStorageCollection(assets.store, collection.IDManager())
    await new_collection.async_load()
    assert "persisted" in new_collection.data
    assert new_collection.data["persisted"].name == "Persisted"


@pytest.mark.parametrize(
    ("kind", "config", "value"),
    [
        ("sensor", {"device_class": "duration"}, 42),
        ("text", {"min": 0, "max": 100}, "hello"),
        ("select", {"options": ["a", "b", "c"]}, "a"),
        ("switch", {}, True),
        ("button", {}, None),
        ("date", {}, "2026-06-26"),
    ],
)
async def test_reconcile_creates_entity_for_each_kind(
    hass: HomeAssistant,
    enable_custom_integrations: None,
    kind: str,
    config: dict,
    value: object,
) -> None:
    """Each entity kind produces a live entity in the correct platform."""
    from homeassistant.helpers import entity_registry as er

    await _setup_integration(hass, enable_custom_integrations)
    await _assets_collection(hass).async_create_item({"name": "Car"})
    entities = _entities_collection(hass)
    await entities.async_create_item(
        {
            "asset_id": "car",
            "slug": f"feat_{kind}",
            "name": f"Feat {kind}",
            "kind": kind,
            "config": config,
            "value": value,
        }
    )
    await hass.async_block_till_done()
    ent_reg = er.async_get(hass)
    entity_id = ent_reg.async_get_entity_id(kind, DOMAIN, f"car-feat_{kind}")
    assert entity_id is not None
    assert hass.states.get(entity_id) is not None


async def test_number_entity_persists_value_via_service(
    hass: HomeAssistant, enable_custom_integrations: None
) -> None:
    """Calling number.set_value updates the stored EntityDef value."""
    from homeassistant.helpers import entity_registry as er

    await _setup_integration(hass, enable_custom_integrations)
    await _assets_collection(hass).async_create_item({"name": "Car"})
    entities = _entities_collection(hass)
    await entities.async_create_item(
        {
            "asset_id": "car",
            "slug": "mileage",
            "name": "Mileage",
            "kind": "number",
            "config": {"min": 0, "max": 300000, "step": 1},
            "value": 0,
        }
    )
    await hass.async_block_till_done()
    ent_reg = er.async_get(hass)
    entity_id = ent_reg.async_get_entity_id("number", DOMAIN, "car-mileage")
    assert entity_id is not None
    await hass.services.async_call(
        "number",
        "set_value",
        {"entity_id": entity_id, "value": 42000},
        blocking=True,
    )
    await hass.async_block_till_done()
    assert entities.data["car_mileage"].value == 42000


async def test_switch_entity_persists_state_via_service(
    hass: HomeAssistant, enable_custom_integrations: None
) -> None:
    """Turning a switch on persists True to the EntityDef."""
    from homeassistant.helpers import entity_registry as er

    await _setup_integration(hass, enable_custom_integrations)
    await _assets_collection(hass).async_create_item({"name": "Car"})
    entities = _entities_collection(hass)
    await entities.async_create_item(
        {
            "asset_id": "car",
            "slug": "heater",
            "name": "Heater",
            "kind": "switch",
            "value": False,
        }
    )
    await hass.async_block_till_done()
    ent_reg = er.async_get(hass)
    entity_id = ent_reg.async_get_entity_id("switch", DOMAIN, "car-heater")
    assert entity_id is not None
    await hass.services.async_call(
        "switch",
        "turn_on",
        {"entity_id": entity_id},
        blocking=True,
    )
    await hass.async_block_till_done()
    assert entities.data["car_heater"].value is True
