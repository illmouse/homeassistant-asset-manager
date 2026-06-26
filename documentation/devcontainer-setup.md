# Dev Environment Setup

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Visual Studio Code](https://code.visualstudio.com/) with the
  [Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
  extension.
- Git.

## First start

1. Open the repo in VS Code:
   ```
   code /home/ill/git/homeassistant-asset-manager
   ```
2. VS Code detects `.devcontainer/devcontainer.json` and prompts
   **"Reopen in Container"** — click it.
3. The image builds (~2-3 min first time) and `script/setup` runs:
   - Creates `.venv/`
   - Installs `homeassistant==2026.6.4` + test deps
   - Installs pre-commit hooks
   - Symlinks `custom_components/asset_manager` →
     `config/custom_components/asset_manager`
4. Start HA in a terminal:
   ```
   hass -c config
   ```
5. Open http://localhost:8123 and complete the onboarding
   (first run only — state persists in `config/.storage/`).

## Daily workflow

Each container start re-runs `script/bootstrap` (activates `.venv`,
recreates the symlink). Just start HA:

```
hass -c config
```

### Fast iteration loop

HA caches Python imports, so most changes require restarting HA:

1. Edit code under `custom_components/asset_manager/`.
2. Ctrl+C in the HA terminal to stop it.
3. `hass -c config` to restart (~3-5s on a warm container).
4. Reload the integration's config entry via
   **Settings → Devices & Services → Asset Manager → ⋮ → Reload**
   for entity/coordinator logic changes that don't touch `__init__.py`
   or `config_flow.py`.

### Watching logs

In a second terminal:

```
tail -f config/home-assistant.log
```

Or rely on the console output of `hass -c config`.
`config/configuration.yaml` already sets
`custom_components.asset_manager: debug`.

## Running tests

```
pytest tests/components/asset_manager/ -vv
```

Single file:

```
pytest tests/components/asset_manager/test_init.py -x
```

Coverage:

```
pytest tests/components/asset_manager/ \
  --cov=custom_components.asset_manager --cov-report term-missing
```

## Linting

```
ruff check .
ruff format .
```

Or via pre-commit on staged files:

```
pre-commit run --all-files
```

## Pinned versions

| Component   | Version     |
|-------------|-------------|
| HA          | 2026.6.4    |
| Python      | 3.14        |
| Ruff        | >=0.5       |
| Pytest      | >=8.0       |

Bump `requirements.txt` deliberately; re-run `script/setup` after a
version change.

## Troubleshooting

- **Integration missing in HA**: confirm the symlink
  `config/custom_components/asset_manager` points to
  `../../custom_components/asset_manager`. `script/bootstrap` recreates
  it on each start.
- **Port 8123 already in use**: another HA instance is running on the
  host. Stop it or change `appPort` in `.devcontainer/devcontainer.json`.
- **`hass` not found**: activate the venv — `source .venv/bin/activate`.
- **Edits not picked up**: HA caches imports. Restart `hass` after
  changing Python files.