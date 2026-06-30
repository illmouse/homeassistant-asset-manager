# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.2] — 2026-06-30

Patch release: fixes the panel blinking/refreshing when the "Add asset"
dialog (or any other modal) was open. A browser-extension console error
(`trigger-autofill-script-injection.js: Could not establish connection`)
was a downstream symptom of the DOM churning on every HA state tick.

### Fixed

- **Panel blinked while a modal was open (critical)** — HA reassigns
  the `hass` property on every state tick (many times per second). The
  panel's `set hass()` handler called `_subscribe()` unconditionally,
  which tore down all subscriptions, flashed a "Loading…" state,
  refetched every collection, re-rendered, and re-subscribed on every
  tick. Now `_subscribe()` only runs when there are no active
  subscriptions (i.e. on first connect or after reconnection); steady-
  state `hass` updates just re-render the existing data.
- **Excessive shadow-DOM rebuilds** — the `hass`/`narrow`/`panel`
  setters now coalesce renders through `requestAnimationFrame`, so
  multiple property updates in the same frame paint once instead of
  tearing down and rebuilding the DOM several times. Direct callers
  that need an immediate paint (lifecycle transitions in `_subscribe`,
  WS event handlers) still call `_render()` synchronously.

[0.1.2]: https://github.com/illmouse/homeassistant-asset-manager/releases/tag/v0.1.2

## [0.1.1] — 2026-06-29

Patch release: critical bug fixes and UI polish from production
feedback.

### Fixed

- **Blinking asset list / `unknown_command` error (critical)** — the
  panel subscribed to the HA event-bus event `label_registry_updated`
  via `subscribeMessage` (reserved for WS commands), causing an
  infinite re-subscribe loop that blinked the list and periodically
  reloaded the page. Now uses the correct `subscribeEvents` API.
- **Icon rendered as literal text** — the empty-state icon
  `mdi:package-variant-closed` showed as text instead of a glyph.
  Now rendered via `<ha-icon>`.
- **No icon picker in label dialog** — the "add new tag" dialog used a
  plain text input for the icon. Now uses HA's native `<ha-icon-picker>`.

### Changed

- **device_class / state_class dropdowns** — sensor and derived entity
  config now uses dropdowns populated from HA's closed enums
  (`SensorDeviceClass`, `SensorStateClass`) instead of free-form text
  fields.
- **Repo restructuring** — dev tooling moved under `dev/`
  (`dev/scripts/`, `dev/compose.yml` now tracked); `dev/config/` and
  `dev/diagnostics/` remain gitignored. Removed obsolete
  `implementation_*.md` docs and redundant root `conftest.py`.

### Added

- **Release process documentation** — `llm_wiki/release.md` documents
  versioning rules, pre-release checklist, and cutting a release.

### Technical

- 97 tests passing (up from 91). ruff clean; all frontend JS passes
  `node --check`.

[0.1.1]: https://github.com/illmouse/homeassistant-asset-manager/releases/tag/v0.1.1

## [0.1.0] — 2026-06-29

First public release. Asset Manager is a custom Home Assistant
integration that turns arbitrary physical assets into first-class HA
devices with user-defined entities, templates, cloning, and derived
sensors — fully UI-driven, no YAML.

### Added

- **Assets as HA devices** — each asset becomes a Device Registry
  entry identified by `[("asset_manager", asset_id)]`, with name,
  manufacturer, model, serial, icon, and HA labels.
- **User-defined entities** — attach entities of 8 kinds to any asset:
  `number`, `sensor`, `date`, `text`, `select`, `button`, `switch`,
  and `derived`. Entity unique IDs are `{asset_id}-{slug}`, preserving
  identity across renames. Configurable per kind (min/max/step/mode,
  options, device_class/state_class, formula, etc.).
- **Templates** — reusable entity blueprints with their own icon and
  labels. Bundled presets: Vehicle, Battery, Generic Sensor, and more.
  Apply a template to a new asset in one click; template labels merge
  onto the asset's device.
- **Clone** — duplicate an asset including its entities and labels;
  assign a new name. Great for fleet tracking.
- **Derived sensors** — define a sensor whose value is a formula over
  other entities on the same asset. Safe formula evaluator (no
  `eval`): supports arithmetic, comparison, and date functions.
  Recalculation is event-driven plus a midnight tick for date math.
- **Native HA labels integration** — assets use HA's built-in label
  registry. New bespoke WS commands `get_asset_labels` and
  `update_asset_labels` (full-replace). Clone copies source device
  labels. Panel subscribes to `label_registry_updated` for live
  refresh.
- **Frontend panel** — sidebar panel built as modular ES modules (no
  build step). List view with sortable columns, multi-property
  filters (area, manufacturer, model, entity count, icon, labels),
  search, and column picker. Detail view with entity management.
  Templates view with CRUD editor. Live updates via collection
  subscribe.
- **Native HA form elements** — panel uses `ha-input`, `ha-select`,
  `ha-textarea`, and `ha-icon-picker` with automatic fallback to flat
  `.am-*` elements on older HA builds. New `native-fields.js` wrapper
  module; `h()` helper extended with `.`-prefix property support for
  Lit elements.
- **Clickable rows** — asset list and template list rows are fully
  clickable with hover state; action buttons stop propagation.
- **Error UX** — voluptuous validation errors surfaced inline in
  dialogs per field instead of generic toasts.
- **Config flow** — single-instance config flow (no options); creates
  one config entry and registers the panel.
- **Backup note** — all data stored in `.storage/asset_manager/`
  (assets, entities, templates) and included in HA snapshots.
- **Screenshots** — assets list, asset detail, templates list,
  template editor.

### Technical

- Python 3.13+, async-first, type hints throughout.
- `StorageCollection` + `Store` for persistence (no custom SQL).
- 91 tests passing in HA container (Python 3.14, HA 2026.7.0b2).
- ruff clean; all frontend JS passes `node --check`.
- MIT license.

[0.1.0]: https://github.com/illmouse/homeassistant-asset-manager/releases/tag/v0.1.0