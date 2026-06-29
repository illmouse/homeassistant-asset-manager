# Dev Environment Setup

The integration runs against a real Home Assistant instance inside a
Docker Compose stack defined in `dev/compose.yml`. HA uses the official
`ghcr.io/home-assistant/home-assistant:stable` image; the integration is
bind-mounted directly into the container's `/config`, so edits on the
host are reflected immediately (HA's Python import cache still applies —
see [Fast iteration loop](#fast-iteration-loop)).

## Layout

```
dev/
  compose.yml              docker compose stack (HA service) — tracked
  scripts/                 dev tooling (setup, bootstrap, test_integration) — tracked
  config/                  HA config dir (mounted as /config in container) — gitignored
    configuration.yaml     default_config + frontend themes
    secrets.yaml           HA secrets (not committed secrets — see below)
    .storage/              HA state, device/entity/area registries
    custom_components/     bind-mounted from ../custom_components/
    home-assistant.log     live log file
  diagnostics/             saved diagnostic exports from HA UI — gitignored
custom_components/asset_manager/   the integration (bind-mounted into HA)
```

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) with the
  [Compose](https://docs.docker.com/compose/) plugin (`docker compose`
  subcommand — ships with Docker Desktop and modern Docker Engine).

That's it — no VS Code, no devcontainer extension, no host-side venv
required to run HA. Tests and linting run on the host (see
[Running tests](#running-tests)).

## First start

1. Start the stack from the `dev/` directory:

   ```
   docker compose -f dev/compose.yml up -d
   ```

   The first pull may take a minute. The container is named
   `homeassistant` and publishes port `8123`.

2. Open http://localhost:8123 and complete onboarding (first run only;
   state persists in `dev/config/.storage/`).

3. Add the **Asset Manager** integration via
   **Settings → Devices & Services → Add Integration → Asset Manager**.
   The config flow has no options — just submit the empty form.

The integration source is bind-mounted:
`dev/compose.yml` mounts `../custom_components/asset_manager` to
`/config/custom_components/asset_manager`, so HA sees your edits without
rebuilding any image.

## Daily workflow

### Starting and stopping HA

```
docker compose -f dev/compose.yml up -d      # start (detached)
docker compose -f dev/compose.yml down       # stop and remove container
docker compose -f dev/compose.yml restart    # restart HA (picks up .py changes)
```

`restart: unless-stopped` is set in `compose.yml`, so the container
comes back after a host reboot / Docker restart unless you `down` it.

### Fast iteration loop

HA caches Python imports, so Python changes require a container restart.
Frontend (JS) changes only need a browser hard-refresh.

1. Edit code under `custom_components/asset_manager/`.
2. **Python changes** (`__init__.py`, `config_flow.py`, `coordinator.py`,
   `entity.py`, `derived.py`, `ws.py`, `storage.py`):
   ```
   docker compose -f dev/compose.yml restart
   ```
   (~5-10s once the container is warm).
3. **Entity/coordinator-only changes** (no `__init__.py`/`config_flow.py`
   touch): avoid a full restart by reloading the integration via
   **Settings → Devices & Services → Asset Manager → ⋮ → Reload**.
4. **Frontend changes** (anything under `frontend/`): hard-refresh the
   browser tab. HA serves the panel files directly from the bind mount.
5. Watch logs in a second terminal:
   ```
   docker compose -f dev/compose.yml logs -f
   ```
   Or tail the file directly:
   ```
   tail -f dev/config/home-assistant.log
   ```
   `dev/config/configuration.yaml` does not yet set
   `custom_components.asset_manager: debug` — add it under `logger:`
   if you need verbose integration logs:

   ```yaml
   logger:
     logs:
       custom_components.asset_manager: debug
   ```

## Running tests

Tests run **on the host**, not inside the HA container (the official
image has no dev tooling). Use the host venv:

```bash
source .venv/bin/activate    # see AGENTS.md to recreate if missing

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

```bash
source .venv/bin/activate

ruff check .
ruff format .
```

Or via pre-commit on staged files:

```
pre-commit run --all-files
```

## End-to-end smoke test

`dev/scripts/test_integration` exercises the config flow and config-entry
loading against a running HA instance via the REST + WebSocket APIs.
It requires a long-lived access token in `HASS_TOKEN` (create one in
HA under **Settings → People → your user → Long-Lived Access Tokens**,
or use the existing `.secrets` file):

```bash
set -a; . .secrets; set +a
python dev/scripts/test_integration
```

## Pinned versions

| Component   | Version     |
|-------------|-------------|
| HA image    | `stable` (currently 2026.6.4) |
| Python (host venv, for tests/lint) | 3.13+ |
| Ruff        | >=0.5       |
| Pytest      | >=8.0       |

The container tracks `ghcr.io/home-assistant/home-assistant:stable`.
To pin a specific HA version, edit `dev/compose.yml`:

```yaml
image: "ghcr.io/home-assistant/home-assistant:2026.6.4"
```

then `docker compose -f dev/compose.yml pull && docker compose -f dev/compose.yml up -d`.

## Configuration notes

- **Time zone**: `compose.yml` sets `TZ: Europe/Moscow`. Adjust to your
  locale if needed.
- **Privileged mode**: the container runs `privileged: true` so HA can
  access `/run/dbus`, Bluetooth, and other host hardware. This is the
  standard recommendation for HA container installs; narrow it down only
  if you know which devices you need.
- **Secrets**: `dev/config/secrets.yaml` holds HA-level secrets (unused
  by Asset Manager itself). Do not put integration secrets there — use
  the repo-root `.secrets` file (gitignored) for `HASS_TOKEN` used by
  `dev/scripts/test_integration`.

## Troubleshooting

- **Integration missing in HA**: confirm the bind mount is live —
  `docker compose -f dev/compose.yml exec homeassistant ls /config/custom_components/asset_manager`
  should list `__init__.py`, `manifest.json`, etc. If empty, check that
  `dev/compose.yml`'s relative path `../custom_components/asset_manager`
  resolves from the `dev/` directory.
- **Port 8123 already in use**: another HA instance is running on the
  host. Stop it or change the `ports:` mapping in `dev/compose.yml`.
- **Edits not picked up**: HA caches Python imports. Run
  `docker compose -f dev/compose.yml restart` after changing Python
  files. Frontend JS only needs a browser hard-refresh.
- **Database warnings on startup** ("could not validate that the sqlite3
  database was shutdown cleanly"): normal after an unclean restart. HA
  runs a migration check and recovers automatically; no action needed.
- **Old `config/` at repo root is gone**: the repo-root `config/`
  directory used by the previous VS Code devcontainer setup has been
  removed. All HA state now lives under `dev/config/`.