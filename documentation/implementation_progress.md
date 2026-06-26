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

## Phase 3 — Derived sensors  `[ ]`
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

**Result:** _(pending)_

**Session log:** _(none yet)_

---

## Phase 4 — Frontend panel  `[ ]`
**Deliverable:** Settings → Asset Manager UI.

**Plan**
- `frontend_extra/asset_manager/` panel source (compiled to `frontend/`)
- Views: AssetList, AssetDetail (Info/Entities/Templates tabs),
  EntityEditor modal, TemplatePicker dialog, CloneDialog
- Wired to WS commands; subscribes to collection change events for live
  updates

**Exit criteria:** end-user can build a car asset from scratch via UI.

**Testing instructions**
```bash
# build panel per frontend_extra/asset_manager instructions (tbd)
hass -c config
# manual: Settings → Asset Manager → add asset → add entities → save → verify device page
```

**Result:** _(pending)_

**Session log:** _(none yet)_

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