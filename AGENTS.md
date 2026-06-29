# AGENTS.md — Asset Manager for Home Assistant

Custom integration (`asset_manager` domain) that turns arbitrary
physical assets into first-class HA devices with user-defined entities,
templates, cloning, and derived sensors — fully UI-driven, no YAML.

## Where to start
- Vision & overview: `documentation/draft_architecture.md`
- Architecture: `documentation/architecture.md`
- Dev environment: `documentation/dev-environment-setup.md`
- Release process: `llm_wiki/release.md`
- Agent docs index: `llm_wiki/`

## Verification
1. Implement to ~95% confidence, matching existing patterns.
2. Verify **on the host** (not in the HA container — the official image
   has no dev tooling):
   ```
   source .venv/bin/activate
   ruff check . && ruff format . && pytest tests/components/asset_manager/ -q
   node --check custom_components/asset_manager/frontend/*.js
   ```
   The HA container (`dev/compose.yml`) is only for running HA itself,
   not for lint/tests.
3. Commit from the host so the pre-commit hook runs. If pre-commit is
   not installed on the host, run `ruff check . && ruff format .`
   manually before committing.

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
  panel.py
  frontend/                  # modular ES modules (no build step)
    asset-manager-panel.js   # entry: AssetManagerPanel class + customElements.define
    constants.js             # DOMAIN, ENTITY_KINDS, kind→capability sets, dropdown lists
    dom.js                   # h() hyperscript helper, clear()
    native-fields.js         # haInput/haSelect/haTextarea wrappers (native + fallback)
    ws.js                    # WebSocket CRUD + subscribe wrappers
    styles.js                # STYLES string + injectStyles()
    ui.js                    # toast, confirmDialog, withBusy, openModal, makeSwitch
    config-fields.js         # kind-aware entity config field builder
    dialogs.js               # 5 modal dialogs (asset/clone/templatePicker/entity/templateEditor)
    views.js                 # 3 view renderers (list/detail/templates)
tests/components/asset_manager/    # pytest (mirrors HA core layout)
documentation/                     # architecture + plans
llm_wiki/                          # agent-facing docs (release process, …)
dev/                               # local HA dev environment (tracked + gitignored)
  compose.yml                      # docker compose stack (HA service) — tracked
  scripts/                         # dev tooling (setup, bootstrap, test_integration) — tracked
  config/                          # HA config dir (mounted as /config) — gitignored
  diagnostics/                     # saved diagnostic exports from HA UI — gitignored
```

## Build & test commands

> **Run lint and tests on the host**, not inside the HA container. The
> official HA image (`dev/compose.yml`) has no dev tooling — it is only
> for running HA itself.

```bash
# Activate host venv (Python 3.13 + HA 2026.2.3). If missing, recreate:
#   python3.13 -m venv .venv && source .venv/bin/activate
#   pip install -r requirements_test.txt ruff homeassistant==2026.2.3
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

# Run HA locally (compose stack) — http://localhost:8123
docker compose -f dev/compose.yml up -d
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
- Develop against the local compose stack (`dev/compose.yml`); iterate
  fast without pushing to git.
- Push to a real HA instance only for end-to-end validation.
- Never develop against production HA — it hides bugs and frustrates reload.

## Fast iteration loop
HA caches Python imports, so most changes require restarting HA:
1. Edit code under `custom_components/asset_manager/`.
2. `docker compose -f dev/compose.yml restart` (~5-10s on a warm
   container).
3. For entity/coordinator-only changes, **Settings → Devices & Services
   → Asset Manager → ⋮ → Reload** avoids a full restart.
4. Frontend-only changes (under `frontend/`): hard-refresh the browser.
5. Watch logs: `docker compose -f dev/compose.yml logs -f` or
   `tail -f dev/config/home-assistant.log`.

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
- [x] MVP — shipped (storage, CRUD, templates, clone, derived sensors, frontend panel)
- [ ] Post-MVP — refactor + new features