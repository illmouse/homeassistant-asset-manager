# Asset Manager — Implementation Process

Canonical workflow for executing a unit of work (MVP task or post-MVP
feature). Every agentic session that implements something MUST follow
this end-to-end. It supersedes ad-hoc variations.

## Roles of the three documents

| Document | Purpose | When to read |
|---|---|---|
| `implementation_plan.md` | What to build (completed summary, MVP checklist, post-MVP backlog) | Start of session — pick the next unchecked MVP item or agreed feature |
| `implementation_progress.md` | Hand-off state between sessions | Start of session — read completed phases + cross-phase notes; end of session — update MVP checklist + session log |
| `implementation_process.md` (this file) | How to build (the process) | Start of every session; follow it verbatim |

## Execution workflow

### 1. Orient (read-only)
1. Read `implementation_plan.md`; find the next unchecked MVP item (or
   the agreed post-MVP feature).
2. Read `implementation_progress.md` — the completed-phase summaries
   and **Cross-phase notes** carry env quirks and gotchas that span
   sessions.
3. Read the relevant existing source under
   `custom_components/asset_manager/` and
   `tests/components/asset_manager/` to match established patterns
   **before** extending. Do not invent new patterns.
4. Re-read the architectural invariants and coding conventions in
   `AGENTS.md`. Do not violate them.

### 2. Plan
1. Translate the task into an ordered step list following the codebase's
   natural dependency order (models → storage → coordinator → ws →
   entity → frontend → tests).
2. Note any cross-field validation, schema shape, or HA helper API you
   will need. If unsure how a helper is used, read its source in the
   host venv's installed HA package before writing code.
3. Get to ~95% confidence before writing code. Ask the user follow-up
   questions if the plan is ambiguous — do not guess.

### 3. Implement
1. Work in dependency order; smallest changes that compile and pass
   `ruff check` at each step.
2. Match the existing code style: `from __future__ import annotations`,
   type hints everywhere, voluptuous schemas, `@callback` for sync
   listeners, mutable state only in `hass.data[DOMAIN]`, **no comments**
   unless documenting a genuinely non-obvious decision.
3. Reuse existing schemas/validators rather than duplicating logic.

### 4. Verify (on the host, not in the HA container)
The HA container (`dev/compose.yml`, official image) has no dev
tooling. Run all python/pytest/ruff/git commands on the host:

```bash
source .venv/bin/activate    # Python 3.13, HA 2026.2.3 pinned for tests
```

Verification sequence (run after each substantive change, and before
committing):
1. `ruff check .` — must pass with no fixes needed.
2. `ruff format .` — must leave files unchanged (or format them).
3. `pytest tests/components/asset_manager/ -q --no-header` — existing
   tests still pass AND new tests pass.
4. Coverage when relevant:
   `pytest tests/components/asset_manager/ --cov=custom_components.asset_manager --cov-report term-missing`.
5. Frontend modules: `node --check custom_components/asset_manager/frontend/*.js`.
6. Manual UI smoke against the compose stack — see
   `documentation/devcontainer-setup.md`. Restart the container
   (`docker compose -f dev/compose.yml restart`) for Python changes;
   hard-refresh the browser for frontend-only changes.

If a test fails because of an unhandled callback error, that is
`fail_on_log_exception` (autouse in
`pytest-homeassistant-custom-component`) — fix the root cause, do not
suppress the log.

### 5. Record
1. Update `implementation_progress.md`:
   - Check off the MVP item (`[ ]` → `[x]`).
   - Append a **Session log** entry under the relevant phase or MVP
     section: date · commit SHA · terse change summary.
   - Note any **Deviations** from the plan and why.
2. If a phase-level milestone completed, update `implementation_plan.md`
   (mark item done, add a one-line result).
3. Update the **Phase tracker** in `AGENTS.md` if a phase boundary
   moved.
4. If you discovered a new cross-session gotcha, append it to the
   **Cross-phase notes** in `implementation_progress.md`.

### 6. Commit
1. Commit from the host so the pre-commit hook (`ruff`, `ruff-format`,
   pinned in `.pre-commit-config.yaml`) runs. If pre-commit is not
   installed on the host, run `ruff check . && ruff format .` manually
   before committing.
2. Stage only the files you touched. Never stage secrets (`.secrets`,
   `dev/config/secrets.yaml`).
3. Commit message format (matches repo history):
   ```
   <scope>: <short title>

   - <bullet of each deliverable>
   - <test count> tests pass; ruff clean
   ```
   Use a blank line between subject and body. Imperative mood. Scope is
   the phase name, `mvp`, `frontend`, `docs`, etc.
4. Do not push unless asked. Do not amend a failed commit — fix the
   issue and create a new commit.
5. Docs-only follow-ups get their own commit: `docs: <summary>`.

### 7. Hand off
After the commit, the task is done. Leave the working tree clean. The
next session picks up from step 1 — no other context is required if
`implementation_progress.md` is up to date.

## When something goes wrong
- **Host venv missing**: recreate with
  `python3.13 -m venv .venv && source .venv/bin/activate && pip install -r requirements_test.txt ruff homeassistant==2026.2.3`.
  The container's image is not usable for tests/lint.
- **Container id changed**: `docker ps` to find it. The container name
  is `homeassistant` (set in `dev/compose.yml`).
- **HA helper API unclear**: read the source in the host venv, e.g.
  `sed -n '540,770p' .venv/lib/python3.13/site-packages/homeassistant/helpers/collection.py`.
  Do not guess the API shape.
- **Pre-commit hook not found on host**: run
  `pip install pre-commit && pre-commit install` in the host venv. If
  you skip it, run `ruff check . && ruff format .` manually before
  committing.
- **Test fails on `fail_on_log_exception`**: the integration code raised
  inside a callback. Fix the raise; do not mock the logger.
- **`<ha-area-picker>` renders blank**: expected inside our panel's
  shadow DOM (`@lit/context` providers don't cross the boundary). Use
  the `<select>` fallback in `pickers.js`. See cross-phase notes.

## Process invariants (do NOT skip)
- Read existing source before writing new source.
- Verify on the host (not in the HA container).
- Update `implementation_progress.md` before committing.
- Commit from the host so pre-commit (or manual ruff) runs.
- One logical task per commit (plus a docs follow-up commit if needed).