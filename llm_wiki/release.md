# Release process — Asset Manager for Home Assistant

This document describes how to cut a new release of the Asset Manager
custom integration. Releases are distributed via HACS (Home Assistant
Community Store) and GitHub Releases; HACS resolves the latest Git tag
and ships the `custom_components/asset_manager/` tree to the user's HA
instance.

## Versioning

This project follows [Semantic Versioning](https://semver.org/):

- **MAJOR** — breaking changes (storage format migrations that cannot
  be auto-upgraded, removed WS commands, changed entity unique-ID
  scheme, dropped HA version support below the current minimum).
- **MINOR** — new features, new entity kinds, new bundled templates,
  new WS commands, backward-compatible storage additions.
- **PATCH** — bug fixes, UI polish, doc updates, dependency bumps.

The version string lives in **two** places that must stay in sync for
a release:

1. `custom_components/asset_manager/manifest.json` — `"version"` field.
   This is what HACS and HA show to users.
2. `CHANGELOG.md` — a new `## [X.Y.Z] — YYYY-MM-DD` section.

`hacs.json` carries only the minimum HA version, not the integration
version — it does **not** need to change per release unless the minimum
HA version changes.

## Pre-release checklist

Run these on the **host** (not inside the HA container — the official
image has no dev tooling):

```bash
source .venv/bin/activate

# 1. Lint + format
ruff check . && ruff format .

# 2. Tests
pytest tests/components/asset_manager/ -q

# 3. Frontend syntax
node --check custom_components/asset_manager/frontend/*.js

# 4. Working tree clean (no stray uncommitted changes)
git status
```

All four must pass before tagging. If `pre-commit` is installed on the
host, the hook runs `ruff --fix` + `ruff-format` automatically on commit.

## Cutting a release

### 1. Bump the version

Edit `custom_components/asset_manager/manifest.json`:

```json
  "version": "0.2.0"
```

### 2. Update the changelog

Add a new section at the top of `CHANGELOG.md` (below the header
block), using [Keep a Changelog](https://keepachangelog.com/) format:

```markdown
## [0.2.0] — 2026-07-15

### Added
- New entity kind: `datetime` (configurable timezone-aware timestamp).
- WS command `asset_manager/export_asset` for JSON export of a single asset.

### Fixed
- Label registry subscription no longer sends `unknown_command` (was
  using `subscribeMessage` for an event-bus event; now uses
  `subscribeEvents`).

### Changed
- `SENSOR_DEVICE_CLASSES` and `SENSOR_STATE_CLASSES` are now dropdowns
  in the entity config dialog instead of free-form text.

### Removed
- Dropped support for HA < 2026.2.0 (manifest `homeassistant` field
  raised from 2025.10.0 to 2026.2.0).
```

Use the `Added` / `Changed` / `Deprecated` / `Removed` / `Fixed` /
`Security` subsections as applicable. Omit empty subsections.

Also update the `[Unreleased]` link at the bottom of `CHANGELOG.md`
(if present) and add a new version comparison link, e.g.:

```markdown
[0.2.0]: https://github.com/illmouse/homeassistant-asset-manager/compare/v0.1.0...v0.2.0
```

### 3. Commit the release prep

```bash
git add custom_components/asset_manager/manifest.json CHANGELOG.md
git commit -m "chore: prepare vX.Y.Z release"
```

The commit message convention is `chore: prepare vX.Y.Z release`
(matching the `v0.1.0` precedent — `a5112ca`).

### 4. Tag the release

Create an **annotated** tag (not lightweight — annotated tags carry the
release message and are what GitHub Releases display):

```bash
git tag -a vX.Y.Z -m "vX.Y.Z — short release summary

Longer description of the release, mirroring the CHANGELOG intro."
```

The tag name **must** be `v` + the version number (`v0.2.0`, not
`0.2.0`). HACS resolves tags matching `v*`; the `v` prefix is the
established convention from `v0.1.0`.

### 5. Push

```bash
git push origin main
git push origin vX.Y.Z
```

Push the tag explicitly — `git push origin main` does not push tags
unless `--follow-tags` is configured.

### 6. Create the GitHub Release

Use `gh` (or the web UI):

```bash
gh release create vX.Y.Z --title "vX.Y.Z" \
  --notes "$(git tag -l --format='%(contents)' vX.Y.Z)"
```

The release title is the tag name (`vX.Y.Z`); the body is the tag
annotation (which mirrors the CHANGELOG intro). Do **not** attach
binary assets — HACS fetches the source tree from the tag, so there
is nothing to upload.

## Post-release

- Verify the release appears at
  https://github.com/illmouse/homeassistant-asset-manager/releases
- Verify HACS picks it up: in a test HA instance, HACS → Asset Manager
  → "Update information" (if already installed) or install fresh and
  confirm the version number matches the tag.
- If the release fixes user-reported issues, comment on / close those
  issues referencing the release tag.

## HACS-specific notes

- `hacs.json` controls how HACS renders the repo. Current fields:
  - `name` — display name in HACS ("Asset Manager").
  - `render_readme` — `true` so HACS renders `README.md` as the
    integration description.
  - `homeassistant` — minimum HA version ("2026.2.0"). Bump only
    when the code requires a newer HA API; users on older HA will see
    an install error otherwise.
- HACS resolves the latest tag matching `v*` as the "latest release".
- HACS ships the entire `custom_components/asset_manager/` directory
  to the user's `/config/custom_components/asset_manager/`. Anything
  outside that directory (tests, docs, `dev/`, `llm_wiki/`) is never
  delivered to users.
- The `manifest.json` `version` field is what HA's UI shows under
  Settings → Devices & Services → Asset Manager.

## Rollback

If a release ships with a critical bug:

1. **Do not delete the tag** — users who already downloaded it need it
   to remain resolvable, and HACS caches by tag.
2. Cut a patch release (`vX.Y.Z+1`) with the fix and follow the normal
   process. HACS will offer it as an update.
3. Only delete a tag if it was created by mistake and no users could
   have fetched it yet (e.g. tag pushed to a private fork). Delete the
   GitHub Release first, then `git tag -d vX.Y.Z && git push origin :refs/tags/vX.Y.Z`.

## Release artifacts summary

| File | Purpose | Changes per release? |
|------|---------|----------------------|
| `custom_components/asset_manager/manifest.json` | HA + HACS version source | Yes — `"version"` |
| `CHANGELOG.md` | Human-readable history | Yes — new section |
| `hacs.json` | HACS metadata | Only if min HA version changes |
| `README.md` | User-facing install/feature docs | Only if features/install change |
| Git tag `vX.Y.Z` | HACS resolution target | Yes — one per release |
| GitHub Release | User-facing release notes | Yes — one per release |