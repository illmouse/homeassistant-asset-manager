"""Tests for Asset Manager derived sensor engine and formula evaluator."""

from __future__ import annotations

from datetime import date
from typing import Any
from unittest.mock import patch

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.asset_manager.const import DOMAIN
from custom_components.asset_manager.derived import (
    coerce_value,
    evaluate_derived,
)
from custom_components.asset_manager.formula import (
    FormulaSyntaxError,
    evaluate_formula,
    referenced_names,
)
from custom_components.asset_manager.models import EntityDef

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


def _entities_collection(hass: HomeAssistant):
    """Return the live entity collection."""
    return hass.data[DOMAIN]["coordinator"].entities


def _assets_collection(hass: HomeAssistant):
    """Return the live asset collection."""
    return hass.data[DOMAIN]["coordinator"].assets


def _make_def(slug: str, kind: str, value: Any, asset_id: str = "car", **extra) -> EntityDef:
    """Build a minimal EntityDef for formula tests."""
    config = extra.pop("config", {})
    return EntityDef(
        id=f"{asset_id}-{slug}",
        asset_id=asset_id,
        slug=slug,
        name=slug.title(),
        kind=kind,
        value=value,
        config=config,
        **extra,
    )


# --------------------------------------------------------------------------
# Formula parser unit tests (no HA)
# --------------------------------------------------------------------------


def test_referenced_names_excludes_functions() -> None:
    """referenced_names returns sibling slugs, not function heads."""
    names = referenced_names("oil_change_date - now()")
    assert names == {"oil_change_date"}


def test_referenced_names_multiple() -> None:
    """Multiple sibling references are all captured."""
    names = referenced_names("a + b * c")
    assert names == {"a", "b", "c"}


def test_referenced_names_excludes_keywords() -> None:
    """Python keywords are not treated as names."""
    names = referenced_names("a and b or not c")
    assert names == {"a", "b", "c"}


def test_evaluate_arithmetic() -> None:
    """Basic arithmetic evaluates."""
    assert evaluate_formula("1 + 2 * 3", {}) == 7
    assert evaluate_formula("(1 + 2) * 3", {}) == 9
    assert evaluate_formula("10 % 3", {}) == 1


def test_evaluate_variables() -> None:
    """Variables are substituted from the variables dict."""
    assert evaluate_formula("a + b", {"a": 2, "b": 3}) == 5


def test_evaluate_comparisons() -> None:
    """Comparison operators return booleans."""
    assert evaluate_formula("a < b", {"a": 1, "b": 2}) is True
    assert evaluate_formula("a >= b", {"a": 5, "b": 2}) is True
    assert evaluate_formula("a == b", {"a": 1, "b": 1}) is True


def test_evaluate_boolean() -> None:
    """and/or/not work."""
    assert evaluate_formula("a and b", {"a": True, "b": False}) is False
    assert evaluate_formula("a or b", {"a": True, "b": False}) is True
    assert evaluate_formula("not a", {"a": False}) is True


def test_evaluate_now_returns_date() -> None:
    """now() returns today's date."""
    with patch("custom_components.asset_manager.formula.date") as mock_date:
        mock_date.today.return_value = date(2026, 6, 26)
        result = evaluate_formula("now()", {})
    assert result == date(2026, 6, 26)


def test_evaluate_datediff() -> None:
    """datediff returns days between two dates."""
    a = date(2026, 7, 4)
    b = date(2026, 6, 26)
    assert evaluate_formula("datediff(a, b)", {"a": a, "b": b}) == 8


def test_evaluate_subtraction_dates() -> None:
    """Subtracting two dates yields a timedelta.days."""
    a = date(2026, 7, 4)
    b = date(2026, 6, 26)
    assert evaluate_formula("a - b", {"a": a, "b": b}) == 8


def test_evaluate_funcs() -> None:
    """Whitelisted functions work."""
    assert evaluate_formula("abs(-5)", {}) == 5
    assert evaluate_formula("min(3, 7)", {}) == 3
    assert evaluate_formula("max(3, 7)", {}) == 7
    assert evaluate_formula("round(3.14159, 2)", {}) == 3.14


def test_evaluate_unknown_name_raises() -> None:
    """An undefined name raises FormulaSyntaxError."""
    with pytest.raises(FormulaSyntaxError):
        evaluate_formula("unknown_var + 1", {})


def test_evaluate_unknown_function_raises() -> None:
    """An undefined function raises FormulaSyntaxError."""
    with pytest.raises(FormulaSyntaxError):
        evaluate_formula("foobar(1)", {})


def test_evaluate_empty_raises() -> None:
    """An empty formula raises FormulaSyntaxError."""
    with pytest.raises(FormulaSyntaxError):
        evaluate_formula("", {})


def test_evaluate_syntax_error_raises() -> None:
    """A malformed expression raises FormulaSyntaxError."""
    with pytest.raises(FormulaSyntaxError):
        evaluate_formula("1 +", {})


def test_evaluate_string_literal() -> None:
    """String literals are parsed."""
    assert evaluate_formula("'hello'", {}) == "hello"


# --------------------------------------------------------------------------
# coerce_value
# --------------------------------------------------------------------------


def test_coerce_value_date_string() -> None:
    """ISO date strings are parsed into dates."""
    assert coerce_value("2026-06-26") == date(2026, 6, 26)


def test_coerce_value_int_string() -> None:
    """Integer strings are parsed into ints."""
    assert coerce_value("42") == 42


def test_coerce_value_float_string() -> None:
    """Float strings are parsed into floats."""
    assert coerce_value("3.14") == 3.14


def test_coerce_value_none() -> None:
    """None stays None."""
    assert coerce_value(None) is None


def test_coerce_value_empty_string() -> None:
    """Empty string becomes None."""
    assert coerce_value("") is None


def test_coerce_value_passthrough() -> None:
    """Non-numeric strings pass through unchanged."""
    assert coerce_value("Petrol") == "Petrol"


# --------------------------------------------------------------------------
# evaluate_derived (EntityDef-level)
# --------------------------------------------------------------------------


def test_evaluate_derived_arithmetic() -> None:
    """A derived def with a simple arithmetic formula evaluates."""
    siblings = {
        "a": _make_def("a", "number", 10),
        "b": _make_def("b", "number", 5),
        "total": _make_def("total", "derived", None, config={"formula": "a + b"}),
    }
    assert evaluate_derived(siblings["total"], siblings) == 15


def test_evaluate_derived_datediff() -> None:
    """A derived def computing days-until a date works."""
    with patch("custom_components.asset_manager.formula.date") as mock_date:
        mock_date.today.return_value = date(2026, 6, 26)
        siblings = {
            "oil_change_date": _make_def("oil_change_date", "date", "2026-07-04"),
            "days_until": _make_def(
                "days_until",
                "derived",
                None,
                config={"formula": "datediff(oil_change_date, now())"},
            ),
        }
        result = evaluate_derived(siblings["days_until"], siblings)
    assert result == 8


def test_evaluate_derived_ignores_self_reference() -> None:
    """A derived sensor referencing itself resolves to None (no value yet)."""
    siblings = {
        "x": _make_def("x", "number", 10),
        "loop": _make_def("loop", "derived", None, config={"formula": "loop + x"}),
    }
    assert evaluate_derived(siblings["loop"], siblings) is None


def test_evaluate_derived_missing_sibling() -> None:
    """A reference to a non-existent sibling resolves to None (graceful)."""
    siblings = {
        "x": _make_def("x", "number", 10),
        "d": _make_def("d", "derived", None, config={"formula": "x + missing"}),
    }
    assert evaluate_derived(siblings["d"], siblings) is None


# --------------------------------------------------------------------------
# Integration: derived entity lifecycle via the coordinator
# --------------------------------------------------------------------------


async def test_create_derived_entity_registers_sensor(
    hass: HomeAssistant, enable_custom_integrations: None
) -> None:
    """Creating a derived entity produces a sensor in the entity registry."""
    await _setup_integration(hass, enable_custom_integrations)
    await _assets_collection(hass).async_create_item({"name": "Car"})
    entities = _entities_collection(hass)
    await entities.async_create_item(
        {
            "asset_id": "car",
            "slug": "a",
            "name": "A",
            "kind": "number",
            "config": {"min": 0, "max": 100},
            "value": 10,
        }
    )
    await entities.async_create_item(
        {
            "asset_id": "car",
            "slug": "total",
            "name": "Total",
            "kind": "derived",
            "config": {"formula": "a + 5"},
        }
    )
    await hass.async_block_till_done()
    ent_reg = er.async_get(hass)
    sensor_id = ent_reg.async_get_entity_id("sensor", DOMAIN, "car-total")
    assert sensor_id is not None


async def test_derived_recomputes_on_sibling_value_change(
    hass: HomeAssistant, enable_custom_integrations: None
) -> None:
    """Updating a sibling entity recomputes the derived sensor state."""
    await _setup_integration(hass, enable_custom_integrations)
    await _assets_collection(hass).async_create_item({"name": "Car"})
    entities = _entities_collection(hass)
    await entities.async_create_item(
        {
            "asset_id": "car",
            "slug": "a",
            "name": "A",
            "kind": "number",
            "config": {"min": 0, "max": 100},
            "value": 10,
        }
    )
    await entities.async_create_item(
        {
            "asset_id": "car",
            "slug": "total",
            "name": "Total",
            "kind": "derived",
            "config": {"formula": "a + 5"},
        }
    )
    await hass.async_block_till_done()
    await hass.async_block_till_done()
    from homeassistant.helpers import entity_registry as er

    ent_reg = er.async_get(hass)
    eid = ent_reg.async_get_entity_id("sensor", DOMAIN, "car-total")
    assert eid is not None
    state = hass.states.get(eid)
    assert state is not None
    assert float(state.state) == 15
    await entities.async_update_item("car_a", {"value": 20})
    await hass.async_block_till_done()
    await hass.async_block_till_done()
    state = hass.states.get(eid)
    assert float(state.state) == 25


async def test_derived_datediff_formula(
    hass: HomeAssistant, enable_custom_integrations: None
) -> None:
    """A datediff-based derived sensor reflects the gap between dates."""
    fixed_today = date(2026, 6, 26)
    with patch("custom_components.asset_manager.formula.date") as mock_date:
        mock_date.today.return_value = fixed_today
        await _setup_integration(hass, enable_custom_integrations)
        await _assets_collection(hass).async_create_item({"name": "Car"})
        entities = _entities_collection(hass)
        await entities.async_create_item(
            {
                "asset_id": "car",
                "slug": "oil_change_date",
                "name": "Oil Change Date",
                "kind": "date",
                "value": "2026-07-04",
            }
        )
        await entities.async_create_item(
            {
                "asset_id": "car",
                "slug": "days_until",
                "name": "Days Until Oil Change",
                "kind": "derived",
                "config": {"formula": "datediff(oil_change_date, now())"},
            }
        )
        await hass.async_block_till_done()
        await hass.async_block_till_done()
        from homeassistant.helpers import entity_registry as er

        ent_reg = er.async_get(hass)
        eid = ent_reg.async_get_entity_id("sensor", DOMAIN, "car-days_until")
        assert eid is not None
        state = hass.states.get(eid)
        assert state is not None
        assert int(state.state) == 8


async def test_derived_validation_requires_formula(
    hass: HomeAssistant, enable_custom_integrations: None
) -> None:
    """Creating a derived entity without a formula is rejected."""
    await _setup_integration(hass, enable_custom_integrations)
    await _assets_collection(hass).async_create_item({"name": "Car"})
    entities = _entities_collection(hass)
    with pytest.raises(Exception):  # noqa: B017
        await entities.async_create_item(
            {
                "asset_id": "car",
                "slug": "bad",
                "name": "Bad",
                "kind": "derived",
                "config": {},
            }
        )


async def test_derived_invalid_formula_logs_warning(
    hass: HomeAssistant, enable_custom_integrations: None
) -> None:
    """An invalid formula yields an unknown state but does not crash."""
    await _setup_integration(hass, enable_custom_integrations)
    await _assets_collection(hass).async_create_item({"name": "Car"})
    entities = _entities_collection(hass)
    await entities.async_create_item(
        {
            "asset_id": "car",
            "slug": "a",
            "name": "A",
            "kind": "number",
            "config": {"min": 0, "max": 100},
            "value": 10,
        }
    )
    await entities.async_create_item(
        {
            "asset_id": "car",
            "slug": "broken",
            "name": "Broken",
            "kind": "derived",
            "config": {"formula": "1 +"},
        }
    )
    await hass.async_block_till_done()
    await hass.async_block_till_done()
    from homeassistant.helpers import entity_registry as er

    ent_reg = er.async_get(hass)
    eid = ent_reg.async_get_entity_id("sensor", DOMAIN, "car-broken")
    assert eid is not None
    state = hass.states.get(eid)
    assert state is not None
    assert state.state in ("unknown", "unavailable", None)


async def test_derived_template_spec_validation(
    hass: HomeAssistant, enable_custom_integrations: None
) -> None:
    """A template entity spec with kind derived requires a formula."""
    from custom_components.asset_manager.models import TEMPLATE_ENTITY_SPEC_SCHEMA

    spec = TEMPLATE_ENTITY_SPEC_SCHEMA(
        {"slug": "total", "name": "Total", "kind": "derived", "config": {"formula": "a + b"}}
    )
    assert spec["config"]["formula"] == "a + b"
    with pytest.raises(Exception):  # noqa: B017
        TEMPLATE_ENTITY_SPEC_SCHEMA(
            {"slug": "bad", "name": "Bad", "kind": "derived", "config": {}}
        )
