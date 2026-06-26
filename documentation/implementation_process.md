# Asset Manager — Implementation Process

Canonical, repeatable workflow for executing one phase of the phased
build. Every agentic session that implements a phase MUST follow this
process end-to-end. It supersedes ad-hoc variations and is the single
source of truth — `AGENTS.md` and `implementation_progress.md` both
point back here.

## Roles of the three documents

| Document | Purpose | When to read |
|---|---|---|
| `implementation_plan.md` | What to build (deliverables, exit criteria) | Start of phase — pick the next non-`✅ DONE` phase |
| `implementation_progress.md` | Hand-off state between sessions | Start of phase — read only the target phase section + cross-phase notes; end of phase — update it |
| `implementation_process.md` (this file) | How to build (the process) | Start of every phase; follow it verbatim |

## Phase execution workflow

### 1. Orient (read-only)
1. Read `implementation_plan.md`; find the first phase heading NOT
   marked `✅ DONE (commit <sha>)`. That is the target phase.
2. Read the target phase's section in `implementation_progress.md`
   (not the whole history) plus the **Cross-phase notes** at the
   bottom — those carry env quirks and gotchas that span sessions.
3. Read the relevant existing source under
   `custom_components/asset_manager/` and
   `tests/components/asset_manager/` to match established patterns
   **before** extending. Do not invent new patterns.
4. Re-read the architectural invariants and coding conventions in
   `AGENTS.md`. Do not violate them.

### 2. Plan
1. Translate the phase's deliverables into an ordered task list
   (models → storage → coordinator → ws → tests, or the phase's
   natural dependency order).
2. Note any cross-field validation, schema shape, or HA helper API
   you will need. If unsure how a helper is used, read its source
   inside the devcontainer before writing code (see step 4).
3. Get to ~95% confidence before writing code. Ask the user
   follow-up questions if the plan is ambiguous — do not guess.

### 3. Implement
1. Work in dependency order; smallest changes that compile and pass
   `ruff check` at each step.
2. Match the existing code style exactly: `from __future__ import
   annotations`, type hints everywhere, voluptuous schemas,
   `@callback` for sync listeners, mutable state only in
   `hass.data[DOMAIN]`, **no comments** unless documenting a
   genuinely non-obvious decision.
3. Reuse existing schemas/validators rather than duplicating logic
   (e.g. per-kind entity config validation is shared between
   `ENTITY_CREATE_SCHEMA` and `TEMPLATE_ENTITY_SPEC_SCHEMA`).

### 4. Verify (inside the devcontainer)
The host `.venv` is a broken symlink — Python 3.14 and all deps live
only inside the container. Run every python/pytest/ruff/git command
inside the container `loving_sutherland`:

```bash
docker exec -w /workspaces/homeassistant-asset-manager loving_sutherland \
  bash -lc 'source .venv/bin/activate && <cmd>'
```

Verification sequence (run after each substantive change, and
definitely before committing):
1. `ruff check .` — must pass with no fixes needed.
2. `ruff format .` — must leave files unchanged (or format them).
3. `pytest tests/components/asset_manager/ -q --no-header` — all
   existing tests still pass AND new tests pass.
4. For coverage: `pytest tests/components/asset_manager/ --cov=
   custom_components.asset_manager --cov-report term-missing`.

If a test fails because of an unhandled callback error, that is
`fail_on_log_exception` (autouse in pytest-homeassistant-custom-
component) — fix the root cause, do not suppress the log.

### 5. Record
1. Update the phase in `implementation_progress.md`:
   - Flip status `[ ]` → `[x]`.
   - Fill in **Result** (what was built, files touched, test counts,
     coverage if measured).
   - Append a **Session log** entry: date · commit SHA · terse change
     summary. One line per commit.
   - Note any **Deviations** from the plan and why.
2. Update the phase heading in `implementation_plan.md`: append
   `✅ DONE (commit <short-sha>)` and add a **Result** subsection
   mirroring the progress entry (files, deviations, test count).
3. Update the **Phase tracker** in `AGENTS.md` (the `- [x]`/`- [ ]`
   list near the bottom).
4. If you discovered a new cross-session gotcha, append it to the
   **Cross-phase notes** in `implementation_progress.md`.

### 6. Commit
1. Commit **from inside the container** so the pre-commit hook
   (`ruff`, `ruff-format`, pinned in `.pre-commit-config.yaml`) runs
   against the working venv. The host cannot run pre-commit.
2. Stage only the files you touched. Never stage secrets.
3. Commit message format (matches repo history):
   ```
   Phase N: <short title>

   - <bullet of each deliverable>
   - <test count> tests pass; ruff clean
   ```
   Use a blank line between subject and body. Imperative mood.
4. Do not push unless asked. Do not amend a failed commit — fix the
   issue and create a new commit.
5. Docs-only follow-ups (recording results, process tweaks) get
   their own commit: `docs: <summary>`.

### 7. Hand off
After the commit, the phase is done. Leave the working tree clean.
The next session picks up from step 1 of this file — no other
context is required if `implementation_progress.md` is up to date.

## When something goes wrong

- **Host venv looks usable**: it is not. `python`/`pytest`/`ruff`
  on the host are broken symlinks or missing deps. Always use the
  container.
- **Container id changed**: `docker ps` to find the new id, update
  the Cross-phase notes. The container name `loving_sutherland` is
  stable across restarts; the id is not.
- **HA helper API unclear**: read the source inside the container,
  e.g. `sed -n '540,770p' .venv/lib/python3.14/site-packages/
  homeassistant/helpers/collection.py`. Do not guess the API shape.
- **Pre-commit hook not found**: the hook is hardcoded to
  `/workspaces/homeassistant-asset-manager/.venv/bin/python`. It
  only resolves inside the container. Committing from the host
  fails with `pre-commit not found` — that is expected; re-run the
  commit inside the container.
- **Test fails on `fail_on_log_exception`**: the integration code
  raised inside a callback. Fix the raise; do not mock the logger.

## Process invariants (do NOT skip)
- Read existing source before writing new source.
- Verify inside the container, not on the host.
- Update `implementation_progress.md` AND `implementation_plan.md`
  AND the `AGENTS.md` tracker before committing.
- Commit from inside the container so pre-commit runs.
- One phase per commit (plus a docs follow-up commit if needed).