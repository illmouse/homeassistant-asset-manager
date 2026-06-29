# Asset Manager — Architecture

Domain: `asset_manager`
Purpose: Manage arbitrary physical assets as first-class Home Assistant
devices, with user-defined entities (numbers, dates, text, booleans,
selects, buttons), templates, cloning, and derived sensors — entirely
from the UI, no YAML, no HA Helpers.

## Schematic

```
┌─────────────────────────────────────────────────────────────┐
│                        Home Assistant                       │
│                                                             │
│  Config Flow ──▶ ConfigEntry (single, user-initiated)       │
│                       │                                     │
│                       ▼                                     │
│         ┌──────────────────────────────┐                    │
│         │   AssetManager Coordinator   │                    │
│         │   (custom_components/        │                    │
│         │     asset_manager/)          │                    │
│         └──────────┬───────────────────┘                    │
│                    │                                        │
│      ┌─────────────┼─────────────────┐                      │
│      ▼             ▼                 ▼                      │
│  Templates     Assets            Entities                   │
│  StorageColl.  StorageColl.      (live HA entities)         │
│      │             │                 │                      │
│      └─────────────┴──────┬──────────┘                      │
│                           ▼                                 │
│               .storage/asset_manager/*.json                 │
│               (Store, debounced saves, atomic writes)       │
│                                                             │
│  Device Registry ◀── 1 device per asset                     │
│  Entity Registry  ◀── 1 entry per user-defined entity       │
│                                                             │
│  WebSocket API ◀── {prefix}/list|create|update|delete       │
│                  + clone_asset, apply_template, derive      │
│                                                             │
│  Frontend panel (frontend_extra/) ◀── Settings → Asset Mgr  │
└─────────────────────────────────────────────────────────────┘
```

## Crucial architecture decisions

### Domain name
`asset_manager` — short, conventional HA domain form, matches the
integration's visible name.

### Storage backend
`helpers/storage.Store` + `helpers/collection.StorageCollection`.
Three named collections persisted under `.storage/asset_manager/`:
- `templates` — reusable entity-blueprint definitions
- `assets` — asset metadata (manufacturer, model, serial, photo, tags)
- `entities` — per-asset user-defined entity specs

Rationale:
- Canonical HA pattern, used by `input_*`, `todo`, `scene`, `blueprint`.
- `ObservableCollection` auto-registers CRUD WebSocket commands and
  emits change events entities subscribe to.
- Atomic JSON writes (`write_utf8_file_atomic`), debounced 10s saves.
- Scales comfortably to thousands of items; SQLite/SQLAlchemy only
  worthwhile if measured perf issues arise — rejected as premature.

### Device/Entity modelling
- Every asset → one `DeviceRegistry` entry (manufacturer, model,
  serial, identifiers `[("asset_manager", asset_id)]`).
- Every user-defined entity → one HA entity, attached to the device.
  Unique ID `{asset_id}-{entity_slug}` so renames preserve identity.
- Supported entity platforms: `number`, `sensor`, `date`, `text`,
  `select`, `button`, `switch`.
- Derived/template sensors are `sensor` entities computed on change.

### Config flow
Single config entry, user-initiated via Settings → Devices & Services.
No credentials; the entry's existence enables the integration.

### Frontend panel
Settings → Asset Manager, registered via `register_data_entry_flow`
+ a custom route in `frontend_extra/`. Talks to the auto-generated
WebSocket commands; no HTTP REST.

### Imports / exports
JSON. Templates export/import for sharing. Asset packs support both.

### What we deliberately do NOT use
- HA Helpers (input_*) — they pollute the user's entity space and
  break the "single integration owns everything" invariant.
- Custom SQLAlchemy / SQLite DB — premature complexity; HA's
  StorageCollection covers our scale.
- Global mutable state outside `hass.data[DOMAIN]`.

## References
- Developer docs: https://developers.home-assistant.io/
- Storage helper: `homeassistant/helpers/storage.py`
- Collection helper: `homeassistant/helpers/collection.py`
- Device registry: developers.home-assistant.io/docs/device_registry_index/
- Entity registry: developers.home-assistant.io/docs/entity_registry_index/
- WebSocket API: developers.home-assistant.io/docs/api/websocket