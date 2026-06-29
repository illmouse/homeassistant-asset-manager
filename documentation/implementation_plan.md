# Asset Manager — Implementation Plan

Phases 0–4 are complete: the integration is functional end-to-end from
UI. We are now closing out an **MVP** — the minimum needed to publish as
a usable HACS integration. Post-MVP work (refactoring, new features) is
tracked separately at the bottom.

## Completed (Phases 0–4)

| Phase | What landed | Commit |
|---|---|---|
| 0 — Scaffold | Repo skeleton, config flow, import test, devcontainer | `85fd0c8` |
| 1 — Storage + CRUD | `Asset`/`EntityDef` models, `StorageCollection`-backed assets/entities, coordinator reconciles device + entity registries, 7 entity platforms, WS CRUD + subscribe | `eb9e017` |
| 2 — Templates + Clone | `Template` model, 7 bundled JSON presets, idempotent seeding, `apply_template` + `clone_asset` WS commands | `9ab9e1e` |
| 3 — Derived sensors | Pure `formula.py` evaluator (no `eval`), `DerivedEvaluator` with midnight tick, `AssetDerivedEntity` on `sensor` platform, Vehicle template `days_until_oil_change` | `8418cbd` |
| 4 — Frontend panel | `panel.py` serves `frontend/` + registers `custom` panel; single-file ES module (now split into 9 modules: `asset-manager-panel.js` + `views`/`dialogs`/`pickers`/`config-fields`/`ui`/`ws`/`dom`/`styles`/`constants`); list/detail(info+entities)/template-picker/clone dialogs; live updates via collection subscribe | `96dd815`, `4fdc04e` |

**Tests:** 86 passing, 85% coverage, ruff clean.
**HA version:** runs against `stable` (currently 2026.6.4) via
`dev/compose.yml`; tests pin HA 2026.2.3 on the host venv.

## MVP — to publish

Goal: a user can install via HACS, build an asset from scratch, apply
templates, clone, edit entities, and see derived sensors — all from the
UI, with sensible errors and a README.

- [x] **Template CRUD editor in UI** — currently apply-only; add
  create/edit/delete template dialog. Backend `templates/*` WS CRUD
  already exists (Phase 2 storage); only frontend missing.
- [x] **Error UX** — surface voluptuous validation errors in dialogs
  (create/update entity, template apply) instead of generic toasts.
  Needs `ws.js` to extract `error.message` from WS error responses and
  dialogs to render an `.am-error` line per field.
- [x] **README.md** — install via HACS, screenshots, what it does, link
  to docs. Required for HACS listing.
- [x] **hacs.json** — HACS manifest (`manifest.json` already valid for
  HA; `hacs.json` just declares the repo type + filename).
- [x] **Backup note** — one paragraph in README pointing at
  `.storage/asset_manager/` (assets, entities, templates collections).

Exit criteria: installable via HACS; a fresh user can build a car asset
with a Vehicle template, edit entities, and see `days_until_oil_change`
update — without touching YAML or WS.

## Post-MVP — refactor and new features

Tracked here so we don't lose the ideas; not sequenced. Pick up after
MVP ships.

**Refactoring**
- Frontend module review after the 9-way split (consistency, dead code,
  `ha-icon-picker`/`ha-area-picker` boundary notes in `pickers.js`).
- Coordinator reconcile path is O(entities) per change — index by
  asset_id if asset counts grow.
- `formula.py` error messages could carry entity-slug positions for
  better editor feedback.

**Features**
- Import/Export (JSON) for templates and asset packs.
- Automation-friendly: `asset_manager.service_due` events on derived
  threshold crossings; configurable triggers.
- Area picker: bridge `@lit/context` from the panel host so we can use
  native `ha-area-picker` (searchable combobox) instead of `<select>`.
  See `pickers.js` header comment for the blocker.
- Per-entity history / state-change log (leveraging HA's recorder).
- Tag-based dashboards (auto-generate a dashboard per asset tag).

## Testing strategy
- Unit tests in pytest on the host venv (no HA Core needed for
  models/storage/derived/formula).
- Integration tests via `pytest-homeassistant-custom-component` against
  pinned HA 2026.2.3.
- Manual UI smoke against the `dev/compose.yml` stack (HA `stable`)
  before each merge — see `documentation/devcontainer-setup.md`.