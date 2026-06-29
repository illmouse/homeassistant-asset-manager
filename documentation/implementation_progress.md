# Asset Manager — Implementation Progress

Live progress tracker. Phases 0–4 are complete; the MVP close-out is
complete. Post-MVP work is listed in `implementation_plan.md` but
not tracked here until started.

**Status legend:** `[ ]` pending · `[~]` in progress · `[x]` done · `[!]`
blocked.

## Completed phases

### Phase 0 — Scaffold  `[x]`
- 2026-06-26 · `85fd0c8` · Repo skeleton, config flow, import test.

### Phase 1 — Storage + CRUD  `[x]`
- 2026-06-26 · `eb9e017` · `Asset`/`EntityDef` models,
  `AssetStorageCollection` + `EntityStorageCollection` (WS CRUD +
  subscribe via `StorageCollectionsWebsocket`), coordinator reconciles
  device + entity registries across 7 platforms, 33 tests.
  Fixed entity-registry lookup (use `unique_id`, not storage id).
  Dropped `entity_description` for direct `_attr_*`.

### Phase 2 — Templates + Clone  `[x]`
- 2026-06-26 · `9ab9e1e` · `Template` model, 7 JSON presets, idempotent
  seeding, `apply_template` + `clone_asset` WS commands, 12 new tests.
  Deviation: `serial`/`icon`/`unit_of_measurement` omitted from clone
  payload when None (voluptuous rejects None under `vol.Optional`).
- 2026-06-26 · `b75b49f` · Recorded Phase 2 in plan; added workflow to
  AGENTS.md.

### Phase 3 — Derived sensors  `[x]`
- 2026-06-26 · `8418cbd` · `formula.py` (pure recursive-descent
  evaluator, no `eval`), `derived.py` (`DerivedEvaluator` + midnight
  tick), `AssetDerivedEntity` on `sensor` platform, Vehicle template
  `days_until_oil_change`, 32 new tests.
  Deviations: recompute driven by entity-collection listener (not
  `EVENT_STATE_CHANGED`); None-aware arithmetic; self-reference → None.

### Phase 4 — Frontend panel  `[x]`
- 2026-06-26 · `96dd815` · `panel.py` serves `frontend/` + registers
  `custom` panel; single-file ES module panel; list/detail/templates/
  clone dialogs; live updates via subscribe. 5 new tests.
  Deviations: `frontend_extra/` compile step unavailable to custom
  integrations → single ES module via `async_register_static_paths` +
  `custom` panel. Template UI apply-only (CRUD editor → MVP). Removed
  deadlocking `async_block_till_done()` from `async_setup_entry`. Fixed
  blocking `open()` in `async_seed_builtin_templates`.
- 2026-06-27 · `4fdc04e` · Split single-file panel into 9 ES modules
  (`views`, `dialogs`, `pickers`, `config-fields`, `ui`, `ws`, `dom`,
  `styles`, `constants`).

#### Error UX changes (Error UX - voluptuous errors surfaced in dialogs)
- Fixed all `withBusy` calls in dialogs to pass `{ errorToast: false }` — errors
  now show in the dialog's `.am-error` div instead of a redundant toast.
- `assetCreateDialog`: template/area/label failures set `err.textContent` inline
  and abort creation early, instead of showing toasts and creating a partial asset.
- Changed `wsCall` to extract HA WS error `.message` and throw a clean `Error`,
  so catch blocks never see `[object Object]`.
- Improved `.am-error` styling (padding, left border, subtle background) for
  better visibility.
- Fixed dangling `} catch (e) { ... }` and `});` at lines 182-183 of
  `dialogs.js` (copy-paste bug from template CRUD editor work that caused a
  runtime parse error). `node --check` does not catch this in ESM modules —
  only actual module execution reveals it.

## Post-Phase-4 frontend work (uncommitted)
- Icon picker: `buildIconPicker` wraps native `<ha-icon-picker>` (works
  in shadow DOM — uses `@property hass`).
- Area picker: `buildAreaPicker` reverted to plain `<select>` because
  `<ha-area-picker>` uses `@lit/context` (`@consume`) whose providers
  don't cross our panel's shadow DOM boundary. Native searchable
  combobox deferred to post-MVP (see plan).
- List view renders `<ha-icon>` glyph instead of text label.
- `styles.js`: removed dead icon-grid CSS (`.am-icon-*`,
  `.am-asset-icon`); kept `.am-area-picker`.
- Backend `ws.py`: added `asset_manager/get_areas` and
  `asset_manager/update_area` WS commands; `ws.js` gained `getAreas`/
  `updateArea` wrappers.

## MVP close-out  `[x]`
**Goal:** publishable as a HACS custom integration.

- [x] Template CRUD editor in UI (backend exists; frontend only)
- [x] Error UX — voluptuous errors surfaced in dialogs
- [x] README.md
- [x] hacs.json
- [x] Backup note in README

**Result:** v0.1.0 tagged. README, hacs.json, CHANGELOG, screenshots,
manifest metadata (issue_tracker, homeassistant min-version,
codeowners, documentation URL) all in place.

**Session log:**
- **2026-06-29** — v0.1.0 release prep. Committed pending frontend
  work (native HA form elements, clickable rows, label color fix,
  dropdown overflow fix, error banner `:empty` fix, screenshots) as
  `3c8a2cc`. Wrote README.md (features, screenshots, install via
  HACS, entity kinds table, backup note, troubleshooting, files
  tree). Wrote CHANGELOG.md (Keep a Changelog format, v0.1.0 entry).
  Updated manifest.json: `documentation`/`issue_tracker` →
  `github.com/illmouse/...`, `codeowners` → `[@illmouse]`, added
  `"homeassistant": "2026.2.0"`. Created `hacs.json` with
  `render_readme: true` + min-version. Restored `panel.py`
  `cache_headers=True` (was False for dev). Tagged `v0.1.0`.

---

## Cross-phase notes
- **Dev environment changed**: the `.devcontainer/` + VS Code setup is
  superseded by `dev/compose.yml` (Docker Compose, official HA
  `stable` image). See `documentation/devcontainer-setup.md`. The old
  repo-root `config/` directory is gone; HA state lives under
  `dev/config/`.
- **Tests/lint run on the host** (Python 3.13 venv, HA 2026.2.3), not
  in the container (the official image has no dev tooling). The
  `.devcontainer/Dockerfile` + `script/setup` + `script/bootstrap` are
  legacy and may be removed.
- HA runtime version: `stable` (currently 2026.6.4) via compose. Test
  pin: 2026.2.3 via `requirements_test.txt`.
- Entity storage id is slugified (`car_mileage`); entity-registry
  unique_id keeps the hyphen (`car-mileage`). WS delete sends the
  storage id.
- `fail_on_log_exception` is autouse in phcc — any unhandled callback
  error fails the test. Coordinator/entity code must be exception-clean.
- Panel tests must call `async_setup_component(hass, "http", {"http": {}})`
  before `async_setup_entry` — the `hass` fixture does not boot `http`
  by default. `panel.py` no-ops when `hass.http is None`.
- Never call `await hass.async_block_till_done()` from inside
  `async_setup_entry` during stage-2 boot — it deadlocks.
- `<ha-area-picker>` cannot be used inside our panel's shadow DOM
  (`@lit/context` providers don't reach it). Use `<select>` from
  `hass.areas`. `<ha-icon-picker>` works (uses `@property hass`).