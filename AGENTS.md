# AGENTS.md — Asset Manager for Home Assistant

Custom integration (`asset_manager` domain) that turns arbitrary
physical assets into first-class HA devices with user-defined entities,
templates, cloning, and derived sensors — fully UI-driven, no YAML.

## Where to start
- Vision & overview: `documentation/draft_architecture.md`
- Architecture: `documentation/architecture.md`
- Phased plan: `documentation/implementation_plan.md`
- Dev environment: `documentation/devcontainer-setup.md`

## Layout
```
custom_components/asset_manager/   # the integration (ships to HA)
  __init__.py
  manifest.json
  config_flow.py
  const.py
  models.py
  storage.py
  coordinator.py
  entity.py
  derived.py
tests/components/asset_manager/    # pytest (mirrors HA core layout)
documentation/                     # architecture + plans
.devcontainer/                    # local HA dev environment
frontend_extra/asset_manager/      # Settings panel source
```

## Build & test commands
```bash
# Activate venv (created by script/setup in the devcontainer)
source .venv/bin/activate

# Lint (matches HA core style)
ruff check .
ruff format .
pre-commit run --all-files

# Test entire integration
pytest tests/components/asset_manager/ -vv

# Test a single file
pytest tests/components/asset_manager/test_storage.py -x

# Coverage report
pytest tests/components/asset_manager/ \
  --cov=custom_components.asset_manager --cov-report term-missing

# Run HA locally (devcontainer) — http://localhost:8123
hass -c config
```

## Test conventions
- Tests use `pytest-homeassistant-custom-component` (installed via
  `requirements_test.txt`). Import `MockConfigEntry` from
  `pytest_homeassistant_custom_component.common` — not `tests.common`
  (that's only available in HA's source tree).
- Use the `enable_custom_integrations` fixture in any test that loads
  the integration. It clears the loader cache so our `custom_components/`
  is discovered.
- ConfigFlow subclasses must be declared `class Foo(ConfigFlow, domain=DOMAIN)`
  or the flow handler won't register in `HANDLERS`.

## Iteration philosophy
- Develop in the devcontainer; iterate fast without pushing to git.
- Push to a real HA instance only for end-to-end validation.
- Never develop against production HA — it hides bugs and frustrates reload.

## Fast iteration loop
HA caches Python imports, so most changes require restarting HA:
1. Edit code under `custom_components/asset_manager/`.
2. Ctrl+C the running `hass -c config` process.
3. Restart with `hass -c config` (~3-5s on a warm container).
4. For entity/coordinator-only changes, **Settings → Devices & Services →
   Asset Manager → ⋮ → Reload** avoids a full restart.
5. Watch logs in a second terminal: `tail -f config/home-assistant.log`.
   `config/configuration.yaml` sets `custom_components.asset_manager: debug`.

## Coding conventions (match HA core)
- Python 3.14+, async-first, type hints everywhere.
- Validate all inputs with voluptuous schemas.
- Sync listeners tagged `@callback`; never block the event loop.
- All mutable integration state lives in `hass.data[DOMAIN]`.
- No comments unless documenting a non-obvious decision.

## Architectural invariants (do NOT violate)
- No HA Helpers internally — entities are owned by us, not by `input_*`.
- No custom SQLite/SQLAlchemy — use `StorageCollection` + `Store`.
- One `DeviceRegistry` entry per asset, identified by
  `[("asset_manager", asset_id)]`.
- Entity unique IDs: `{asset_id}-{entity_slug}` — preserves identity
  across renames.
- WebSocket CRUD comes free from `ObservableCollection`; only add
  bespoke commands (`clone_asset`, `apply_template`, `derive`).

## Useful HA references
- Dev docs home: https://developers.home-assistant.io/
- Testing: developers.home-assistant.io/docs/development_testing/
- Dev environment: developers.home-assistant.io/docs/development_environment/
- Device registry: developers.home-assistant.io/docs/device_registry_index/
- Entity registry: developers.home-assistant.io/docs/entity_registry_index/
- WebSocket API: developers.home-assistant.io/docs/api/websocket/
- Storage helper source: home-assistant/core `homeassistant/helpers/storage.py`
- Collection helper source: same repo `homeassistant/helpers/collection.py`

## Phase tracker
- [x] Phase 0 — Scaffold
- [x] Phase 1 — Storage + CRUD
- [ ] Phase 2 — Templates + Clone
- [ ] Phase 3 — Derived sensors
- [ ] Phase 4 — Frontend panel
- [ ] Phase 5 — Polish & release