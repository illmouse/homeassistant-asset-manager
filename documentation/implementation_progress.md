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

## Phase 1 — Storage + CRUD primitives  `[ ]`
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

**Result:** _(pending)_

**Session log:** _(none yet)_

---

## Phase 2 — Templates + Clone  `[ ]`
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

**Result:** _(pending)_

**Session log:** _(none yet)_

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