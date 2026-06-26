# Asset Manager — Implementation Plan

Iterative, each phase shippable to a real HA instance for validation.
Between phases: develop in the devcontainer, run pytest, only push to
real HA for end-to-end sanity.

## Phase 0 — Scaffold
Deliverable: repo skeleton + empty integration + import test.
- `custom_components/asset_manager/{__init__.py,const.py,manifest.json}`
- Stub `config_flow.py` (single user_initiated step, no options)
- `tests/components/asset_manager/__init__.py` + `test_init.py`
  asserting `async_setup_entry` returns True.
- `.devcontainer/` copied from HA core devcontainer reference.
- `pyproject.toml` (ruff config matching HA core), `requirements_test.txt`.
Exit criteria: devcontainer boots HA, integration installs, nothing else.

## Phase 1 — Storage + CRUD primitives
Deliverable: create/edit/delete assets and entities via WebSocket.
- `models.py`: `Asset`, `EntityDef` dataclasses + voluptuous schemas.
- `storage.py`: `AssetStorageCollection`, `EntityStorageCollection`
  wrapping `StorageCollection` with `ObservableCollection.websocket_api`
  prefix `asset_manager/assets/*`, `asset_manager/entities/*`.
- `coordinator.py`: subscribes to collection changes, reconciles
  device registry + live entities.
- `entity.py`: `AssetNumberEntity`, `AssetSensorEntity`, `AssetDateEntity`,
  `AssetTextEntity`, `AssetSelectEntity`, `AssetButtonEntity`,
  `AssetSwitchEntity` — thin wrappers reading from collection state.
- Tests: snapshot tests for WS create/update/delete flows; reconcile
  tests asserting device+entity registry entries appear/disappear.
Exit criteria: `wscat` against HA can create an asset, add a number
entity, set its value, and the device+entity appear in HA UI.

## Phase 2 — Templates + Clone ✅ DONE (commit `9ab9e1e`)
Deliverable: apply a template, clone an asset.
- `TemplateStorageCollection` with prefix `asset_manager/templates/*`.
- Bundled JSON presets: Vehicle, HVAC, Water Filter, Appliance,
  Coffee Machine, UPS, Generic Asset.
- WS commands `asset_manager/apply_template` and `asset_manager/clone_asset`.
- Template editor in storage layer (frontend deferred to Phase 4).
Exit criteria: applying "Vehicle" creates ~10 entities on a new asset;
cloning reproduces all entities onto a renamed asset.

Result:
- `Template` dataclass + `TEMPLATE_*` schemas in `models.py` (specs
  reuse per-kind config validation; `asset_id` absent from specs).
- `TemplateStorageCollection` in `storage.py`; `async_load_collections`
  now returns `(assets, entities, templates)` 3-tuple.
- `async_seed_builtin_templates` loads the 7 JSON presets from
  `custom_components/asset_manager/templates/` idempotently on first
  load (skips ids already present).
- `ws.py` registers `asset_manager/apply_template` (idempotent — skips
  existing `{asset_id}-{slug}` ids) and `asset_manager/clone_asset`
  (creates a renamed asset with blank serial, copies all entity defs).
- Coordinator takes `templates` as 4th positional arg; bespoke
  commands registered from `async_setup_entry`.
- Tests: 12 new in `test_templates.py` (seeding, idempotency, WS CRUD,
  apply, clone, error codes, storage round-trip). 45 total, ruff clean.
- Deviation: `serial`/`icon`/`unit_of_measurement` omitted from clone
  payload when source value is None (voluptuous `str`/`cv.icon` reject
  None even when optional); absence is valid.

## Phase 3 — Derived sensors ✅ DONE (commit `8418cbd`)
Deliverable: automatic `sensor.asset_*` computed from manual entities.
- `derived.py`: declarative formula evaluator; expressions reference
  other entities by unique_id; runs on `EVENT_STATE_CHANGED`.
- Spec lives inside the asset definition: `{kind: derived, formula: "..."}`
- Initial operator set: arithmetic, datediff, now(), comparisons.
Exit criteria: defining `oil_change_date` + `interval_days` yields a
`days_until_oil_change` sensor that updates daily.

Result:
- `formula.py`: pure recursive-descent parser/evaluator (no `eval`, no
  HA deps). Supports arithmetic, comparisons, boolean, parentheses,
  string literals, and whitelisted functions (`now`, `datediff`, `days`,
  `abs`, `min`, `max`, `round`). Date subtraction auto-extracts `.days`.
- `derived.py`: `coerce_value` (typed sibling resolution) +
  `DerivedEvaluator` (recomputes on entity-collection changes via the
  coordinator; daily midnight tick via `async_track_time_change`).
- `AssetDerivedEntity` in `entity.py` extends `SensorEntity`; derived
  entities exposed on the `sensor` platform via `platform_for_kind`.
- `DERIVED_CONFIG_SCHEMA` requires `config.formula`; shared by
  `ENTITY_CREATE_SCHEMA` and `TEMPLATE_ENTITY_SPEC_SCHEMA`.
- Vehicle template gained `days_until_oil_change` derived entity (11 total).
- 32 new tests in `test_derived.py`; 77 total pass; 85% coverage; ruff clean.
- Deviations: recompute driven by entity-collection listener (not
  `EVENT_STATE_CHANGED`); None-aware arithmetic; self-reference → None.

## Phase 4 — Frontend panel ✅ DONE (commit `96dd815`)
Deliverable: Settings → Asset Manager UI.
- `frontend_extra/asset_manager/` panel source (compiled to `frontend/`).
- Views: AssetList, AssetDetail (Info/Entities tabs),
  EntityEditor modal, TemplatePicker dialog, CloneDialog.
- Wired to WS commands; subscribes to collection change events for
  live updates.
Exit criteria: end-user can build a car asset from scratch via UI.

Result:
- `panel.py` serves `custom_components/asset_manager/frontend/` at
  `/api/asset_manager/static` and registers HA's bundled `custom`
  panel at sidebar path `asset-manager` (admin-only,
  `config_panel_domain=asset_manager`, `module_url` →
  `asset-manager-panel.js`). Register on setup, remove on unload.
- `frontend/asset-manager-panel.js`: single self-contained ES module
  (`customElements.define("asset-manager-panel")`, no Lit/Vite build).
  Views: AssetList (Add/Clone/Delete), AssetDetail (Info tab inline-
  editable; Entities tab list + Add/Edit modal with per-kind JSON
  config), TemplatePicker (apply-only), CloneDialog. Live updates via
  `asset_manager/{assets,entities}/subscribe`.
- 5 new tests in `test_panel.py`; 82 total pass; 85% coverage; ruff
  clean. HA 2026.7.0b1 boots in ~3.6s; panel module served HTTP 200.
- Deviations: `frontend_extra/` compile step unavailable to custom
  integrations → single-file ES module served via
  `hass.http.async_register_static_paths` + `custom` panel.
  Template CRUD editor deferred to Phase 5 (apply-only here). Removed
  deadlocking `async_block_till_done()` from `async_setup_entry`.
  Fixed Phase 2 blocking `open()` in `async_seed_builtin_templates`
  (now `hass.async_add_executor_job`; takes `hass` as 1st arg).

## Phase 5 — Polish
- Import/Export (JSON) for templates and asset packs.
- Backup story documented (point at `.storage/asset_manager/`).
- Automation-friendly: trigger events on derived-threshold crossings;
  expose `asset_manager.service_due` events.
- Error UX (validation errors surfaced from voluptuous in UI).
- HA store review prep: hacs.json, README.md, screenshots.
Exit criteria: publishable as a HACS custom integration.

## Testing strategy
- Unit tests in pytest — no HA Core needed for models/storage/derived.
- Integration tests via `pytest-ha` (or built-in `async_setup_component`)
  against real HA devcontainer instance.
- Snapshot tests (Syrupy) for WS payloads and registry state.
- Manual UI smoke in devcontainer before each phase merge.