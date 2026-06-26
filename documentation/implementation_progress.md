# Asset Manager — Implementation Progress

Live progress tracker for the phased build. Each phase is executed in a
fresh agentic session; this file is the hand-off between sessions so a new
agent can resume without re-loading prior context.

**Status legend:** `[ ]` pending · `[~]` in progress · `[x]` done · `[!]`
blocked.

## How to use this file
- At the **start** of a phase session, read the target phase's section here
  (not the whole history) plus `implementation_plan.md` for the source plan.
- At the **end** of a phase session, fill in `Result`, update `Status`, and
  append a short `Session log` entry (date, commit SHA, what changed).
- Keep entries terse — link to commits/tests for detail, don't duplicate
  implementation_plan prose.

---

## Phase 0 — Scaffold  `[x]`
**Deliverable:** repo skeleton + empty integration + import test.

**Plan**
- `custom_components/asset_manager/{__init__.py,const.py,manifest.json}`
- Stub `config_flow.py` (single user_initiated step, no options)
- `tests/components/asset_manager/{__init__.py,test_init.py}` asserting
  `async_setup_entry` returns True
- `.devcontainer/` copied from HA core devcontainer reference
- `pyproject.toml` (ruff config matching HA core), `requirements_test.txt`

**Exit criteria:** devcontainer boots HA, integration installs, nothing else.

**Testing instructions**
```bash
source .venv/bin/activate
pytest tests/components/asset_manager/test_init.py -vv
hass -c config   # verify integration loads, Settings → Devices & Services
```

**Result:** Done. Integration scaffolds, installs via config flow, import
test passes. Dev container boots HA.

**Session log**
- 2026-06-26 · `85fd0c8` · Initial commit: scaffold + Phase 0 files + tests.

---

## Phase 1 — Storage + CRUD primitives  `[x]`
**Deliverable:** create/edit/delete assets and entities via WebSocket.

**Plan**
- `models.py`: `Asset`, `EntityDef` dataclasses + voluptuous schemas
- `storage.py`: `AssetStorageCollection`, `EntityStorageCollection`
  wrapping `StorageCollection` with `ObservableCollection.websocket_api`
  prefix `asset_manager/assets/*`, `asset_manager/entities/*`
- `coordinator.py`: subscribes to collection changes, reconciles device
  registry + live entities
- `entity.py`: `AssetNumberEntity`, `AssetSensorEntity`, `AssetDateEntity`,
  `AssetTextEntity`, `AssetSelectEntity`, `AssetButtonEntity`,
  `AssetSwitchEntity` — thin wrappers reading from collection state

**Exit criteria:** `wscat` against HA can create an asset, add a number
entity, set its value, and the device+entity appear in HA UI.

**Testing instructions**
```bash
source .venv/bin/activate
ruff check . && ruff format .
pytest tests/components/asset_manager/ -vv
# snapshot tests for WS create/update/delete flows
# reconcile tests asserting device+entity registry entries appear/disappear
# manual: wscat -c ws://localhost:8123/api/websocket
```
Manual WS smoke:
```jsonc
// create asset
{"type":"asset_manager/assets/create","name":"Test Car"}
// add number entity
{"type":"asset_manager/entities/create","asset_id":"<id>","slug":"mileage","value":0}
// set value
{"type":"asset_manager/entities/update","entity_id":"<id>","value":42000}
```

**Result:** Done. `AssetStorageCollection` + `EntityStorageCollection`
(subclasses of `helpers.collection.StorageCollection`) persist to
`.storage/asset_manager/{assets,entities}` and expose
`{list,create,update,delete,subscribe}` WS commands via
`StorageCollectionWebsocket`. `AssetManagerCoordinator` subscribes to both
collections' change-set listeners and reconciles one `DeviceRegistry` entry
per asset (identified by `(asset_manager, asset_id)`) plus one live entity
per `EntityDef` across 7 platforms (`number/sensor/date/text/select/button/
switch`), each platform wired through a platform file
(`async_setup_entry` registers its `async_add_entities` callback with the
coordinator). Entity unique IDs follow `{asset_id}-{slug}`; storage ids are
slugified (`{asset_id}_{slug}`). 33 pytest tests pass (WS CRUD + reconcile +
per-kind entity creation + service-driven value persistence); 85% coverage.
Lint clean (ruff 0.15.20); pre-commit passes. HA 2026.7.0b1 boots the
integration in the devcontainer.

**Session log**
- 2026-06-26 · Phase 1 commit (pending) · Implemented models/storage/entity/
  coordinator + 7 platform files + 33 tests. Fixed entity-registry lookup
  bug (must use `unique_id`, not storage id). Dropped `entity_description`
  in favour of direct `_attr_*` to avoid platform-specific description
  fields. Bumped pre-commit ruff pin v0.5.7 → v0.15.20 (py314 support).

---

## Phase 2 — Templates + Clone  `[x]`
**Deliverable:** apply a template, clone an asset.

**Plan**
- `TemplateStorageCollection` with prefix `asset_manager/templates/*`
- Bundled JSON presets: Vehicle, HVAC, Water Filter, Appliance,
  Coffee Machine, UPS, Generic Asset
- WS commands `asset_manager/apply_template` and `asset_manager/clone_asset`
- Template editor in storage layer (frontend deferred to Phase 4)

**Exit criteria:** applying "Vehicle" creates ~10 entities on a new asset;
cloning reproduces all entities onto a renamed asset.

**Testing instructions**
```bash
source .venv/bin/activate
pytest tests/components/asset_manager/test_templates.py -vv   # snapshot + behavior
# manual: apply_template then inspect device registry; clone and compare entity counts
```
Manual WS smoke:
```jsonc
// list builtin templates
{"type":"asset_manager/templates/list"}
// create asset then apply Vehicle preset (10 entities)
{"type":"asset_manager/assets/create","name":"Car"}
{"type":"asset_manager/apply_template","asset_id":"car","template_id":"vehicle"}
// clone the asset (entities reproduced, serial blank)
{"type":"asset_manager/clone_asset","source_asset_id":"car","name":"Car 2"}
```

**Result:** Done. `Template` dataclass + `TEMPLATE_*` schemas in `models.py`
(specs reuse per-kind config validation; `asset_id` absent from specs).
`TemplateStorageCollection` in `storage.py`; `async_load_collections` now
returns a `(assets, entities, templates)` 3-tuple. `async_seed_builtin_templates`
loads the 7 JSON presets from `custom_components/asset_manager/templates/`
idempotently on first load (skips ids already present). `ws.py` registers
two bespoke commands: `asset_manager/apply_template` (idempotent — skips
existing `{asset_id}-{slug}` storage ids) and `asset_manager/clone_asset`
(creates a renamed asset with blank serial, copies all entity defs onto it).
Coordinator takes `templates` as a 4th positional arg; bespoke commands
registered from `async_setup_entry`. 12 new tests in `test_templates.py`
(seeding, idempotency, WS CRUD, apply, clone, error codes, storage
round-trip). 45 pytest tests pass total; ruff clean; pre-commit passes.

**Deviations:** `serial`/`icon`/`unit_of_measurement` are omitted from the
clone payload when the source value is None (voluptuous `str`/`cv.icon`
reject None even under `vol.Optional`); absence is valid.

**Session log**
- 2026-06-26 · `9ab9e1e` · Implemented `Template` model, `TemplateStorageCollection`,
  7 bundled JSON presets, idempotent seeding, `ws.py` bespoke commands
  (`apply_template`, `clone_asset`), coordinator wiring, 12 new tests.
- 2026-06-26 · `b75b49f` · Recorded Phase 2 result in `implementation_plan.md`;
  added "proceed to next phase" workflow to `AGENTS.md`.

---

## Phase 3 — Derived sensors  `[x]`
**Deliverable:** automatic `sensor.asset_*` computed from manual entities.

**Plan**
- `derived.py`: declarative formula evaluator; expressions reference
  other entities by unique_id; runs on `EVENT_STATE_CHANGED`
- Spec lives inside the asset definition:
  `{kind: derived, formula: "..."}`
- Initial operator set: arithmetic, datediff, now(), comparisons

**Exit criteria:** defining `oil_change_date` + `interval_days` yields a
`days_until_oil_change` sensor that updates daily.

**Testing instructions**
```bash
source .venv/bin/activate
pytest tests/components/asset_manager/test_derived.py -vv
# manual: define derived entity, fire EVENT_STATE_CHANGED, verify sensor value
#   advance HA clock a day, confirm recompute
```

**Result:** Done. `formula.py` is a pure recursive-descent parser/evaluator
(no `eval`, no HA deps) supporting arithmetic (`+ - * / %`), comparisons
(`== != < <= > >=`), boolean (`and or not`), parentheses, string literals,
and a whitelisted function set (`now`, `datediff`, `days`, `abs`, `min`,
`max`, `round`). Date subtraction auto-extracts `.days` from timedeltas.
`derived.py` wraps the evaluator with `coerce_value` (typed sibling
resolution: ISO dates, int/float strings) and a `DerivedEvaluator` that
recomputes on entity-collection changes (via the coordinator) and on a
daily midnight tick (`async_track_time_change`). `AssetDerivedEntity` in
`entity.py` extends `SensorEntity` with a `set_derived_value` callback;
derived entities are exposed on the `sensor` platform via
`platform_for_kind("derived") -> "sensor"`. The coordinator now tracks
affected assets on entity changes and defers recomputation via
`async_call_later(0)` so platform adders settle first. `DERIVED_CONFIG_SCHEMA`
requires `config.formula`; shared by `ENTITY_CREATE_SCHEMA` and
`TEMPLATE_ENTITY_SPEC_SCHEMA`. Vehicle template gained a
`days_until_oil_change` derived entity (11 entities total). 32 new tests in
`test_derived.py` (formula parser unit tests, coerce_value, evaluate_derived,
integration: registry, recompute on update, datediff, validation, invalid
formula). 77 pytest tests pass total; 85% coverage; ruff clean.

**Deviations:** (1) Recomputation is driven by the entity-collection change
listener (coordinator) rather than `EVENT_STATE_CHANGED` — the latter
requires an unreliable entity_id→EntityDef mapping. (2) Arithmetic with a
None operand returns None (graceful) rather than raising — this lets
formulas reference siblings whose value is not yet set. (3) Self-referencing
a derived sensor resolves to None (the sensor cannot read its own output).

**Session log**
- 2026-06-26 · `8418cbd` · Implemented `formula.py` (pure
  evaluator), `derived.py` (HA integration + midnight tick),
  `AssetDerivedEntity`, `platform_for_kind`, coordinator recompute wiring,
  Vehicle template derived entity, 32 new tests.

---

## Phase 4 — Frontend panel  `[x]`
**Deliverable:** Settings → Asset Manager UI.

**Plan**
- `frontend_extra/asset_manager/` panel source (compiled to `frontend/`)
- Views: AssetList, AssetDetail (Info/Entities tabs), EntityEditor modal,
  TemplatePicker dialog, CloneDialog
- Wired to WS commands; subscribes to collection change events for live
  updates

**Exit criteria:** end-user can build a car asset from scratch via UI.

**Testing instructions**
```bash
source .venv/bin/activate
pytest tests/components/asset_manager/test_panel.py -vv
# manual: hass -c config → Settings sidebar → Asset Manager →
#   add asset → apply Vehicle template → verify entities on device page
```

**Result:** Done. `panel.py` registers an HTTP static path
`/api/asset_manager/static` → `custom_components/asset_manager/frontend/`
and a `custom` built-in panel at sidebar path `asset-manager`
(`mdi:package-variant`, admin-only, `config_panel_domain=asset_manager`)
whose `module_url` points at the served `asset-manager-panel.js`.
`async_setup_entry` calls `async_register_panel` after platform setup;
`async_unload_entry` calls `async_remove_panel`. Registration is a no-op
when `hass.http` is None (unit-test path). The panel is a single
self-contained ES module (`customElements.define("asset-manager-panel")`,
no Lit/Vite build) using HA's `custom` panel infrastructure (HA injects
`hass`/`narrow`/`panel` onto the element). Views: AssetList (with Add/
Clone/Delete), AssetDetail (Info tab: inline-editable name/manufacturer/
model/serial/icon/tags; Entities tab: list + Add/Edit via EntityEditor
modal with per-kind JSON config + value), TemplatePicker dialog (lists
builtin + user templates, applies via `asset_manager/apply_template`),
CloneDialog. Live updates via `asset_manager/assets/subscribe` +
`asset_manager/entities/subscribe` collection events. 5 new tests in
`test_panel.py` (panel registered on setup, removed on unload, static
path serves the module, frontend dir contains the file, register is
reload-safe). 82 pytest tests pass total; 85% coverage; ruff clean.
HA 2026.7.0b1 boots in ~3.6s with the panel served at
`/api/asset_manager/static/asset-manager-panel.js` (HTTP 200).

**Deviations:** (1) Delivery model changed from `frontend_extra/`
compiled-to-`frontend/` (HA core's `frontend_extra` compile step is not
available to custom integrations) to a single self-contained ES module
served via `hass.http.async_register_static_paths` + HA's bundled
`custom` panel component — no build toolchain, no node deps. (2)
Template UI scope is apply-only (TemplatePicker); template CRUD editor
deferred to Phase 5. (3) Removed `await hass.async_block_till_done()`
from `async_setup_entry` — it deadlocks during real boot when other
stage-2 integrations have pending tasks; `async_forward_entry_setups`
already awaits platform setup. (4) Fixed a pre-existing Phase 2 blocking
`open()` in `async_seed_builtin_templates` (moved to
`hass.async_add_executor_job`); `async_seed_builtin_templates` now
takes `hass` as its first arg.

**Session log**
- 2026-06-26 · `96dd815` · Added `panel.py`,
  `frontend/asset-manager-panel.js` (single-file custom panel),
  `test_panel.py` (5 tests); wired panel register/remove into
  `__init__.py`; removed deadlocking `async_block_till_done` from
  `async_setup_entry`; fixed blocking `open()` in
  `async_seed_builtin_templates`.

---

## Phase 5 — Polish  `[ ]`
**Deliverable:** publishable as a HACS custom integration.

**Plan**
- Import/Export (JSON) for templates and asset packs
- Backup story documented (point at `.storage/asset_manager/`)
- Automation-friendly: trigger events on derived-threshold crossings;
  expose `asset_manager.service_due` events
- Error UX (validation errors surfaced from voluptuous in UI)
- HA store review prep: hacs.json, README.md, screenshots

**Exit criteria:** publishable as a HACS custom integration.

**Testing instructions**
```bash
source .venv/bin/activate
pytest tests/components/asset_manager/ -vv
ruff check . && ruff format . && pre-commit run --all-files
# manual: import/export round-trip; trigger threshold event; HACS install dry-run
```

**Result:** _(pending)_

**Session log:** _(none yet)_

---

## Cross-phase notes
_(use for gotchas that span sessions: env quirks, flaky fixtures, HA version
pins, etc.)_
- Phase 0 env: devcontainer built, `.venv` present, `hass -c config` boots.
- HA version pinned to 2026.7.0b1 (Python 3.14). Devcontainer container id
  at time of Phase 1: `3e42a25eb0e0`. Run tests inside the container:
  `docker exec 3e42a25eb0e0 bash -lc 'cd /workspaces/homeassistant-asset-manager && source .venv/bin/activate && pytest ...'`.
- Host `.venv/bin/python` is a broken symlink (points to /usr/local/bin/python
  which only exists inside the container) — do NOT run pytest/ruff on the host.
- Pre-commit ruff pin bumped v0.5.7 → v0.15.20 so `target-version = "py314"`
  parses; re-run `pre-commit install` inside the container after fresh clone.
- Entity storage id is slugified (`car_mileage`); entity-registry unique_id
  keeps the hyphen (`car-mileage`). WS delete sends the storage id.
- `fail_on_log_exception` is autouse in phcc — any unhandled callback error
  fails the test. Coordinator/entity code must be exception-clean.
- Phase 4: tests that exercise panel registration must call
  `async_setup_component(hass, "http", {"http": {}})` before
  `async_setup_entry` — the `hass` fixture does not boot `http` by
  default. `panel.py` no-ops when `hass.http is None` so the rest of the
  suite is unaffected.
- Phase 4: never call `await hass.async_block_till_done()` from inside
  `async_setup_entry` during stage-2 boot — it deadlocks waiting on
  other integrations' pending tasks. `async_forward_entry_setups`
  already awaits platform setup.