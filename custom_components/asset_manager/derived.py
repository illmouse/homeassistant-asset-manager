"""Derived sensor engine for Asset Manager.

A `derived` EntityDef carries a formula in `config["formula"]`. The
formula references sibling entity slugs on the *same* asset; at
evaluation time each referenced slug is resolved to the live
EntityDef value (typed) and the formula is evaluated by `formula.py`.

Recomputation is driven by the coordinator: whenever an entity on an
asset is added or updated (value change via UI, WS, or restore), the
coordinator calls `recompute_asset`. A daily midnight tick
(`async_track_time_change`) refreshes `now()`-based formulas so
`days_until_oil_change` stays current without manual edits.
"""

from __future__ import annotations

import logging
from datetime import date
from typing import Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.event import async_track_time_change

from .formula import FormulaSyntaxError, evaluate_formula, referenced_names
from .models import CONF_FORMULA, EntityDef
from .storage import EntityStorageCollection

_LOGGER = logging.getLogger(__name__)

__all__ = ["DerivedEvaluator", "coerce_value", "evaluate_derived"]


def coerce_value(raw: Any) -> Any:
    """Coerce a stored EntityDef value into a typed Python value.

    Dates are parsed from YYYY-MM-DD strings; numbers from numeric
    strings; everything else is returned as-is.
    """
    if raw is None:
        return None
    if isinstance(raw, date):
        return raw
    if isinstance(raw, bool):
        return raw
    if isinstance(raw, (int, float)):
        return raw
    if isinstance(raw, str):
        if raw == "":
            return None
        try:
            return date.fromisoformat(raw)
        except ValueError:
            pass
        try:
            if "." in raw or "e" in raw.lower():
                return float(raw)
            return int(raw)
        except ValueError:
            return raw
    return raw


def evaluate_derived(entity_def: EntityDef, siblings: dict[str, EntityDef]) -> Any:
    """Evaluate a derived EntityDef's formula against its siblings.

    `siblings` maps slug -> EntityDef for every entity on the same
    asset (including the derived one itself, which is ignored).
    Raises `FormulaSyntaxError` on parse/eval failure.
    """
    formula: str = entity_def.config[CONF_FORMULA]
    variables: dict[str, Any] = {}
    for name in referenced_names(formula):
        sibling = siblings.get(name)
        if sibling is None or sibling.id == entity_def.id:
            variables[name] = None
        else:
            variables[name] = coerce_value(sibling.value)
    return evaluate_formula(formula, variables)


class DerivedEvaluator:
    """Recomputes derived sensor values when dependencies change.

    The coordinator owns the live-entity dict and calls
    `recompute_asset` / `recompute_all` on entity changes. This class
    only manages the daily midnight tick and the evaluation logic.
    """

    def __init__(
        self,
        hass: HomeAssistant,
        entities: EntityStorageCollection,
        live_entities: dict[str, Any],
    ) -> None:
        """Initialise the evaluator.

        `live_entities` is the coordinator's live-entity dict keyed by
        EntityDef id; derived entries are `AssetDerivedEntity` instances
        with a `set_derived_value` method.
        """
        self._hass = hass
        self._entities = entities
        self._live = live_entities
        self._unsub_midnight: Any = None

    def start(self) -> None:
        """Begin the daily midnight refresh."""
        if self._unsub_midnight is None:
            self._unsub_midnight = async_track_time_change(
                self._hass, self._on_midnight, hour=0, minute=0, second=0
            )

    def stop(self) -> None:
        """Detach the midnight listener."""
        if self._unsub_midnight is not None:
            self._unsub_midnight()
            self._unsub_midnight = None

    @callback
    def recompute_all(self) -> None:
        """Recompute every live derived entity (e.g. on startup)."""
        for entity_def in self._entities.data.values():
            if entity_def.kind == "derived":
                self._recompute(entity_def)

    @callback
    def recompute_asset(self, asset_id: str) -> None:
        """Recompute every derived entity on a single asset."""
        for entity_def in self._entities.async_by_asset(asset_id):
            if entity_def.kind == "derived":
                self._recompute(entity_def)

    def _recompute(self, entity_def: EntityDef) -> None:
        """Evaluate one derived entity and push the result to its live object."""
        entity = self._live.get(entity_def.id)
        if entity is None:
            return
        if not getattr(entity, "hass", None):
            return
        siblings = {s.slug: s for s in self._entities.async_by_asset(entity_def.asset_id)}
        try:
            value = evaluate_derived(entity_def, siblings)
        except FormulaSyntaxError as err:
            _LOGGER.warning("Derived formula error for %s: %s", entity_def.unique_id, err)
            entity.set_derived_value(None)
            entity.async_write_ha_state()
            return
        entity.set_derived_value(value)
        entity.async_write_ha_state()

    @callback
    def _on_midnight(self, _now: Any) -> None:
        """Daily refresh so `now()`-based formulas stay current."""
        self.recompute_all()
