# Asset Manager — UI/UX Specification

Domain: `asset_manager`
Purpose: Define the user-facing panel for the Asset Manager custom
integration. This document is the contract between design intent and
implementation — detailed enough for an engineer to build from without
further clarification.

The panel lives under **Settings → Asset Manager** (sidebar icon
`mdi:package-variant`, admin-only) and is registered as a HA `custom`
built-in panel served from `custom_components/asset_manager/frontend/`
via `hass.http.async_register_static_paths` (see `panel.py`). It
communicates exclusively over the WebSocket API; no HTTP REST (the only
HTTP path is the static module URL).

## 1. Overview & Goals

### What the panel is
A single-page panel inside Home Assistant's Settings surface that lets
a user create and manage arbitrary physical assets (vehicles, HVAC,
water filters, appliances, UPS units, coffee machines, etc.), turn each
into a first-class HA device, attach user-defined entities to it, apply
templates, clone assets, and define derived sensors — all without YAML.

### Target user
A Home Assistant user who already manages devices via the UI and wants
to track manual data (mileage, install dates, consumable levels, notes)
on arbitrary physical objects without resorting to `input_*` helpers or
external spreadsheets. Expected to be moderately technical: comfortable
with concepts like "entity", "device", "template", but not with editing
JSON by hand.

### Design principles
1. **Match HA look-and-feel.** Use HA CSS variables, `<ha-card>`,
   `<ha-dialog>`, `<ha-textfield>`, MDI icons. The panel should be
   visually indistinguishable from a first-party settings screen.
2. **No build-toolchain complexity beyond Lit.** No React, no webpack
   config of our own — compile Lit+TypeScript sources to a single ES
   module bundle that HA loads as a custom element. Mirrors the
   `maintenance_supporter` integration's approach.
3. **Progressive enhancement.** The panel must degrade gracefully when
   WS commands are unavailable (integration not loaded) and show a
   clear empty/error state rather than a blank screen.
4. **No raw JSON in the UI.** Every config is driven by a schema and
   rendered with the appropriate widget (slider, dropdown, date picker,
   toggle, formula editor). JSON is an internal transport format only.
5. **Optimistic, then confirmed.** Mutations apply to in-memory state
   immediately on WS round-trip success; failures roll back and surface
   a toast with field-level error mapping.
6. **Keyboard-accessible and localized.** Dialogs manage focus, all
   text is translatable, no hard-coded English in render paths.

## 2. Architecture Decisions

### Adopt LitElement 3 + TypeScript
The current panel is a single 494-line ES module
(`custom_components/asset_manager/frontend/asset-manager-panel.js`)
using plain DOM and a tiny `h()` hyperscript helper. It will be
replaced by a multi-file LitElement 3 + TypeScript project compiled to
a single bundle, following the `maintenance_supporter` pattern:

- `@customElement`, `@property`, `@state` decorators.
- `html` template literals for rendering.
- `sharedStyles` and `panelStyles` arrays of `css` tagged templates.
- A build step (esbuild or `tsc` + Rollup) emits one
  `asset-manager-panel.js` into `custom_components/asset_manager/frontend/`,
  shipped with the integration. No runtime compilation in HA.

### `<ha-dialog>` for all dialogs
Native `confirm()` / `alert()` / `prompt()` are forbidden — they break
HA's visual language and focus management. Every modal uses
`<ha-dialog>` with the `open` attribute and a `@closed` handler, with
`.dialog-title` and `.content` sections, exactly as `maintenance_supporter`
does in `MaintenanceConfirmDialog`.

### Reusable promise-based dialog components
Dialogs are standalone LitElement classes placed once in the panel's
render tree and invoked imperatively. They expose promise-returning
methods so callers can `await`:

```ts
class AssetManagerConfirmDialog extends LitElement {
  public confirm(opts: ConfirmOpts): Promise<boolean> { ... }
  public prompt(opts: PromptOpts): Promise<{ confirmed: boolean; value: string }> { ... }
}
```

This avoids ad-hoc dialog state per caller and matches the
`maintenance_supporter` pattern where a single confirm dialog instance
serves the whole panel.

### `sharedStyles` + `panelStyles`
All styling uses HA CSS variables (`--card-background-color`,
`--primary-color`, `--divider-color`, `--primary-text-color`,
`--error-state-color`, `--success-color`, `--warning-color`,
`--secondary-text-color`, `--ha-card-border-radius`,
`--input-height`, `--mdc-icon-size`). No hard-coded colors. Dark mode
is free because HA swaps the variable values. Styles are composed as
arrays:

```ts
const sharedStyles = [css`:host{display:block}`, css`...`];
const panelStyles  = [...sharedStyles, css`...`];
```

### i18n via `t(key, lang)`
A `t(key, lang)` function with English bundled in the bundle and other
locales fetched at runtime via `ensureLocale(lang)` (lazy
`import()`). Components store the active locale and call
`requestUpdate()` when a locale arrives. Fallback is the key itself if
no translation is found.

### WebSocket subscription pattern
Subscribe via `hass.connection.subscribeMessage` to each collection's
`subscribe` command. Change-set payloads (added/updated/removed) mutate
in-memory `Map`s keyed by `id`; the panel re-renders on each change.
On `hass` replacement (connection loss/reconnect), re-subscribe.

### Migration from plain-DOM single file
See section 12 for the step-by-step migration plan. The existing WS
helpers and subscribe logic are kept; rendering, dialogs, and forms are
replaced wholesale.

## 3. Panel Structure

### Sidebar registration
Registered as a settings panel via `panel.py`
(`async_register_panel` → `frontend.async_register_built_in_panel` with
`component_name="custom"`) so
it appears under **Settings → Asset Manager** with an MDI icon
(`mdi:cube-outline`). The top-level custom element is
`<asset-manager-panel>`.

### Top-level custom element
`AssetManagerPanel` extends `LitElement` and owns:

- `hass` property (HA injects).
- `narrow` property (responsive flag from HA).
- `view` state: `"list" | "detail"`.
- `selectedAssetId` state (string | null).
- `activeTab` state: `"info" | "entities" | "templates" | "danger"`.
- In-memory maps: `assets: Map<string, Asset>`, `entities: Map<string,
  EntityDef>`, `templates: Map<string, Template>`.
- `_loading` state, `_error` state, toast state.
- Child dialog instances (confirm, entity, asset, template).

### View state machine
`view` toggles between `"list"` and `"detail"`. Switching to detail
sets `selectedAssetId` and `activeTab` (defaults to `"info"`). The
back button returns to the list.

### Back-button / history support
Use `history.replaceState` / `history.pushState` so the browser back
button navigates within the panel, mirroring `maintenance_supporter`.
State is encoded in the URL fragment or a query param
(`?asset=<id>&tab=entities`). On `popstate`, the panel restores the
matching view. Deep-linking into a specific asset/entity is supported.

### Responsive (narrow vs wide)
- **Wide:** header bar always visible; list cards render in a
  multi-column responsive grid (`grid-template-columns: repeat(auto-fill,
  minmax(320px, 1fr))`).
- **Narrow:** header hides on the overview when not needed (pattern
  from `maintenance_supporter`); cards stack single-column; detail
  tabs collapse to a dropdown selector instead of a tab bar.

## 4. Views

### 4.1 Asset List (overview)

**Header**
- Title "Asset Manager" with `mdi:cube-outline`.
- "+ Add Asset" button (primary) — opens `AssetManagerAssetDialog` in
  create mode.
- "Templates" secondary button — opens the Template Manager view.
- "Types" secondary button — opens the Type Manager view.
- Summary KPI row: total assets, total entities, total derived sensors,
  total templates. Rendered as small stat chips above the list.

**Search / filter / sort bar**
- Search input (`AmTextfield` or `<ha-textfield>`) filtering by name,
  manufacturer, model, serial, or tag (case-insensitive).
- **Type filter** dropdown: filter assets by `asset.type_id`. "All
  types" default. Options from the `types` collection.
- **Label filter** dropdown (multi-select): filter assets by HA device
  labels. "All labels" default. Options from
  `config/device_registry/list` label entries (HA native labels).
- **Area filter** dropdown: filter assets by `asset.area_id`. "All
  areas" default. Options from `hass.areas` (HA's area registry).
- Filter chips for tags (multi-select; clicking a tag chip toggles it).
- Sort dropdown: Name (A→Z), Name (Z→A), Most entities, Recently
  updated, Type. Persisted to `localStorage` under
  `asset_manager.list.sort`.

**Card list**
- Each asset is an `<ha-card>` row. Card contents:
  - Left: asset icon (`mdi:*` from `asset.icon`, default `mdi:cube-outline`).
  - Middle: name (bold), `manufacturer · model` (secondary text),
    **type label** (small chip with type icon if assigned),
    **area label** (small chip with `mdi:map-marker-outline` if
    assigned), **HA label chips** (small, from the device's HA labels),
    tag chips (small), entity count badge.
  - Right: action menu (overflow `⋮`): Edit, Clone, Delete.
- Clicking the card body opens the detail view for that asset.
- Grouped display option: when a type filter is active, cards can be
  grouped under section headers (e.g. "Vehicles", "Kitchen").

**Empty state**
When no assets exist: a centered card with `mdi:cube-plus-outline`,
copy "No assets yet. Create your first asset or apply a template to
get started.", and primary "Add Asset" + secondary "Browse Templates"
buttons.

**Loading state**
`_loading` true → render skeleton cards (3-4 `<ha-card>` with
pulsing placeholder blocks) instead of the list.

**Actions**
- **Add Asset** → `AssetManagerAssetDialog` create mode.
- **Clone** → `AssetManagerConfirmDialog.prompt` with pre-filled name
  "Clone of <name>"; calls `asset_manager/clone_asset`.
- **Delete** → `AssetManagerConfirmDialog.confirm` with danger styling;
  calls `asset_manager/delete` for the asset's id. Notes: backend
  removes the device and all owned entities (see `storage.py`,
  `entity.py`).

### 4.2 Asset Detail

**Header**
- Back button (`mdi:arrow-left`) → returns to list.
- Asset icon + name (inline-editable on the Information tab).
- Subtitle: manufacturer · model.
- Tab bar (wide) or dropdown (narrow):
  - **Information**
  - **Entities**
  - **Templates** (apply)
  - **Danger zone** (clone + delete grouped here for wide; on narrow
    these are overflow actions)

Tabs **History** and **Maintenance** are out of scope — see section 11.

### 4.3 Information tab

Inline-editable fields with auto-save on blur/change. Each field is an
`AmTextfield` (or appropriate widget) that shows the value as text and
switches to an input on focus. On blur or change, fire the corresponding
`asset_manager/update` WS call; show a toast on success or revert + error
toast on failure.

| Field          | Required? | Widget                     | Validation                                  |
|----------------|-----------|----------------------------|---------------------------------------------|
| name           | required  | `AmTextfield`              | non-empty, ≤ 80 chars                       |
| manufacturer   | optional  | `AmTextfield`              | ≤ 80 chars                                  |
| model          | optional  | `AmTextfield`              | ≤ 80 chars                                  |
| serial         | optional  | `AmTextfield`              | ≤ 80 chars                                  |
| icon           | optional  | `AmIconPicker`             | valid `mdi:*` prefix                        |
| type           | optional  | `<ha-select>` of types     | references `types` collection; "None" = no type |
| area           | optional  | `<ha-select>` of areas     | references HA area registry; "None" = no area |
| labels         | optional  | HA label multi-picker      | HA native device labels (from label registry) |
| tags           | optional  | `AmTagsInput`              | each tag non-empty, ≤ 32 chars, unique      |

**Type assignment + label sync**: when a type is assigned to an asset,
the backend writes the type's slug as a HA label `type:<slug>` onto the
device via `config/device_registry/update { device_id, labels }`. This
makes the type filterable in HA's native device list. Removing the type
removes the `type:` label. The `types` collection is authoritative for
icon/description; the HA label is a projection. See section 4.10.

**Area assignment**: sets `asset.area_id` (our field) AND calls
`config/device_registry/update { device_id, area_id }` so the HA device
moves to the chosen area in HA's native UI too. The area list comes
from `hass.areas` (read-only — areas are managed in HA's own UI).

**Labels**: HA native labels are managed in HA's Settings → Devices &
Services → Labels. In our panel we only pick/apply them to the device
(via `config/device_registry/update`). We do not create or delete HA
labels from our UI — except for the `type:` projection labels, which
are managed automatically by the type assign/unassign flow.

Inline edit is the primary editing path. A full-form
`AssetManagerAssetDialog` is provided as a fallback / create path.

### 4.4 Entities tab

**Header row**
- "+ Add Entity" button (primary).
- Search input filtering by name or slug.
- Sort dropdown: Name, Kind, Recently updated. Persisted to
  `localStorage` under `asset_manager.entities.sort`.

**List**
Each entity is a row inside a single `<ha-card>` (grouped list style,
divider between rows). Row contents:

- Left: entity icon (`mdi:*` from `entity.icon`, default per kind).
- Middle: display name (bold), slug (mono, secondary), kind badge
  (color-coded chip — see section 6), current value rendered per-kind
  (see section 10).
- Right: enabled toggle (`<ha-switch>`), "Edit" button, overflow `⋮`
  with "Delete".

**Empty state**
"No entities. Add one manually or apply a template to populate this
asset." with "Add Entity" and "Apply Template" buttons.

**Add / Edit**
Opens `AssetManagerEntityDialog` (see 4.5).

**Delete**
`AssetManagerConfirmDialog.confirm` with danger styling; calls
`asset_manager/delete` on the entity's id. Note that the entity
registry entry and HA entity are removed by the backend.

### 4.5 Entity Editor Dialog (`AssetManagerEntityDialog`)

A `<ha-dialog>`-based LitElement component. Two modes: **create** and
**edit**. In edit mode, the `kind` selector is locked (disabled with a
tooltip "Kind cannot be changed after creation").

**Fields**

Mandatory fields are marked **(required)** in the label and with a red
asterisk `*`; optional fields are marked **(optional)**. The Save button
is disabled until all required fields pass validation.

| Field          | Required? | Widget                                      | Notes                                              |
|----------------|-----------|---------------------------------------------|----------------------------------------------------|
| kind           | required  | `<ha-select>` / radio group                 | locked on edit; one of the 8 kinds                 |
| slug           | required  | `AmTextfield` (mono, auto-slug on create)   | unique within asset; `[a-z0-9_]+`; locked on edit  |
| name           | required  | `AmTextfield`                               | non-empty, ≤ 80 chars                              |
| icon           | optional  | `AmIconPicker`                              | HA icon picker dialog; default per kind            |
| unit           | optional  | `AmTextfield`                               | shown only for number/sensor/derived               |
| enabled        | optional  | `<ha-switch>`                               | default true                                        |
| config         | required  | `AmConfigForm` (schema-driven)              | generated from the per-kind schema (see 4.5.1);    |
|                |           |                                             | required fields within config vary by kind         |
| value          | optional  | `AmValueInput` (per-kind widget)            | see section 10; hidden for button/derived/sensor   |

Per-kind **config required fields** (driven by `models.py` schemas):
- number: `min`, `max` required; `step`, `mode` optional (defaults 1, box)
- select: `options` required (min 1 entry)
- text: all optional (defaults 0, 255, "")
- sensor: all optional
- switch / button / date: no config fields
- derived: `formula` required; `device_class`, `state_class` optional

**4.5.1 Schema-driven config form**

`AmConfigForm` consumes a voluptuous-style schema definition (mirrors
`models.py` `ENTITY_CONFIG_SCHEMAS`) and renders the appropriate widget
for each field. It is NOT a generic JSON editor. Field rendering rules:

| Kind    | Config field     | Widget                                              |
|---------|------------------|-----------------------------------------------------|
| number  | min              | `AmTextfield` type=number                           |
| number  | max              | `AmTextfield` type=number                           |
| number  | step             | `AmTextfield` type=number (default 1)               |
| number  | mode             | `<ha-select>`: box / slider                         |
| select  | options          | reorderable list editor (add/remove/drag), string[] |
| text    | min              | `AmTextfield` type=number (int)                     |
| text    | max              | `AmTextfield` type=number (int)                     |
| text    | pattern          | `AmTextfield` (regex string)                        |
| sensor  | device_class     | `<ha-select>` of HA sensor device classes           |
| sensor  | state_class      | `<ha-select>`: measurement / total / undefined      |
| switch  | (none)           | —                                                   |
| button  | (none)           | —                                                   |
| date    | (none)           | —                                                   |
| derived | formula          | `AmFormulaEditor` (see 4.5.2)                       |
| derived | device_class     | `<ha-select>` of HA sensor device classes           |
| derived | state_class      | `<ha-select>`: measurement / total / undefined      |

**4.5.2 Formula editor (`AmFormulaEditor`)**

A `<textarea>`-based component with:
- Monospace font.
- Syntax highlighting of sibling-slug references (underlined) and
  whitelisted functions (`now`, `days`, `datediff`, `abs`, `min`, `max`,
  `round`) — see `formula.py` for the DSL contract.
- Autocomplete popover: typing an identifier shows matching sibling
  slugs (entities on the same asset) and whitelisted functions.
  Arrow keys + Enter to accept.
- Live syntax validation: parse on input (debounced 300ms) and show
  inline error markers with messages mapped from `formula.py`'s
  validation errors (e.g. "Unknown identifier 'foo'", "Function
  'sum' is not allowed").
- A short help line listing available functions and an example.

**Dialog actions**
- **Save** — validates all fields, sends `asset_manager/create` or
  `update`; on success closes and toasts; on failure maps voluptuous
  errors to fields via `describeWsError` and highlights them.
- **Delete** (edit mode only) — opens a nested confirm, then
  `asset_manager/delete`.
- **Cancel** — closes without saving.

### 4.6 Templates tab (apply)

Shown on the asset detail view. Lists all templates (from the
`templates` collection) with name, entity count, icon, and an
**Apply** button.

**Apply behavior**
Calls `asset_manager/apply_template {asset_id, template_id}`. The
backend returns the created entity defs. Idempotency: the backend skips
slugs that already exist on the asset (see `storage.py` / template
apply path). The UI toasts: "Applied template '<name>': <n> entities
created, <m> skipped (existing slugs)."

### 4.7 Template Manager (new)

A dedicated view (reachable from the overview's "Templates" button and
from a secondary entry point) for full CRUD on templates. Currently the
integration only supports apply; this spec introduces creation and
editing. Templates are first-class mutable objects in the
`asset_manager/templates` collection — built-ins are seeded on first
load but can be inspected, cloned, edited, or deleted like any
user-created template.

**Type on templates**: every template carries an optional `type_id`
referencing the `types` collection. When a template is applied to an
asset, the asset's `type_id` is set to the template's type if the asset
has no type yet (does not override an existing type). This lets
templates like "Vehicle" auto-categorize the asset as a vehicle.

**List**
- `<ha-card>` rows: template icon, name, **type chip** (if assigned),
  entity count, "Edit" and "Delete" actions, "+ New Template" button in
  the header.
- "**Create from Asset**" button in the header — opens a sub-dialog
  that lets the user pick any existing asset from a dropdown; on
  confirm, creates a new template whose `entities` array is copied
  from that asset's entity defs (kind, slug, name, enabled, config,
  icon, unit_of_measurement — `value` is omitted since templates
  carry no values). Prompts for a template name (default:
  "Template from <asset name>"), icon (default: asset's icon), and
  type (default: asset's type). Calls `asset_manager/templates/create`
  with the resulting spec.
- Search by name; filter by type.

**Editor (`AssetManagerTemplateDialog`)**
A `<ha-dialog>` with:
- Template name (`AmTextfield`, required).
- Template icon (`AmIconPicker`, optional).
- Template type (`<ha-select>` of types, optional) — references the
  `types` collection; "None" = no type.
- Entity spec list: each row is a mini editor for one entity spec
  (ENTITY_CREATE_FIELDS minus `asset_id`). Add/remove/reorder rows.
  Reuses the same field widgets as `AssetManagerEntityDialog` minus the
  `value` field (templates carry no values). Each spec row marks
  required (kind, slug, name) vs optional (icon, unit, enabled, config)
  fields.
- Save / Delete / Cancel.

Notes: editing a template does not retroactively change assets it was
already applied to (templates are blueprints, not live links). This is
documented in the dialog help text. Built-in templates
(`vehicle`, `hvac`, `water_filter`, `appliance`, `coffee_machine`,
`ups`, `generic_asset`) are seeded idempotently with a type assigned
(e.g. `vehicle` template → `vehicle` type) but are otherwise ordinary
collection items — editing or deleting them is allowed and persists.

### 4.8 Clone action

Triggered from the list overflow menu or the detail Danger zone.
`AssetManagerConfirmDialog.prompt` with:
- Title: "Clone asset".
- Message: "Creates a new asset with the same manufacturer, model,
  tags, and icon, plus a copy of all entity definitions. Serial is
  left blank."
- Input label: "New asset name".
- Default value: "Clone of <source name>".
- Confirm label: "Clone".

On confirm, calls `asset_manager/clone_asset {source_asset_id, name}`.
On success, toasts "Cloned to '<name>'" and navigates to the new
asset's detail view.

### 4.9 Delete action

`AssetManagerConfirmDialog.confirm` with danger styling:
- Title: "Delete asset".
- Message: "Permanently delete '<name>'? This removes the device, all
  <n> entities, and their registry entries. This cannot be undone."
- Confirm label: "Delete" (rendered in `--error-state-color`).

On confirm, calls `asset_manager/delete` for the asset id. The backend
removes the device and all owned entities (see `entity.py` cleanup).
On success, toasts "Deleted '<name>'" and returns to the list.

### 4.10 Type Manager (new)

A dedicated view (reachable from the overview's "Types" button) for
full CRUD on the `asset_manager/types` collection. Types are an
internal categorization system (vehicle, appliance, filter, HVAC, etc.)
that doubles as a HA device label for native filterability.

**Data model — `AssetType`**
| Field       | Required? | Type     | Notes                                              |
|-------------|-----------|----------|----------------------------------------------------|
| id          | auto      | str      | collection-assigned                                |
| name        | required  | str      | display name, ≤ 80 chars                           |
| slug        | required  | str      | `[a-z0-9_]+`, unique; auto-derived from name       |
| icon        | optional  | str      | `mdi:*` string via `AmIconPicker`                  |
| description | optional  | str      | ≤ 200 chars; shown in the type manager list        |
| color       | optional  | str      | hex color for the type chip (default: primary)     |

On create, the backend also creates a HA label named `type:<slug>` (via
`config/label_registry/create` or the label collection) so the type is
immediately usable in HA's native device filtering. On rename (slug
change), the old label is removed and the new one created. On delete,
the `type:<slug>` label is removed from HA and the `type_id` is cleared
on all assets that referenced it (their devices lose the label too).

**List**
- `<ha-card>` rows: type icon (in a colored circle), name (bold),
  description (secondary), asset count ("N assets"), "Edit" and
  "Delete" actions, "+ New Type" button in the header.
- Search by name.

**Editor (`AssetManagerTypeDialog`)**
A `<ha-dialog>` with:
- Name (`AmTextfield`, required).
- Slug (`AmTextfield`, mono, auto-derived from name on create, editable,
  locked on edit if assets reference it — or warn + re-sync labels).
- Icon (`AmIconPicker`, optional).
- Color (color input + hex text, optional; defaults to
  `--primary-color`).
- Description (`AmTextfield` multiline, optional).
- Save / Delete / Cancel.

**Built-in types** (seeded idempotently on first load alongside the
built-in templates):
| slug       | name        | icon                |
|------------|-------------|---------------------|
| vehicle    | Vehicle     | `mdi:car`           |
| appliance  | Appliance   | `mdi:fridge-outline`|
| hvac       | HVAC        | `mdi:hvac`          |
| filter     | Filter      | `mdi:air-filter`    |
| ups        | UPS         | `mdi:power-plug`    |
| coffee     | Coffee      | `mdi:coffee`        |
| generic    | Generic     | `mdi:cube-outline`  |

Built-in templates reference these types by id.

**Type → HA label sync (backend)**
- Assign type to asset: `asset.type_id = type.id`; backend calls
  `config/device_registry/update { device_id, labels: [...current, "type:<slug>"] }`.
- Unassign: remove `type:<slug>` from the device's labels.
- Rename type slug: remove old label from all affected devices, add
  new label.
- Delete type: remove `type:<slug>` from all affected devices, clear
  `type_id` on all referencing assets.
The `types` collection is the authoritative source for name/icon/color/
description. The HA label is a lightweight projection for native
filtering — it carries only the `type:<slug>` string.

## 5. Reusable Components

All components are LitElement classes under
`custom_components/asset_manager/frontend-src/components/`.

### `AssetManagerConfirmDialog`
Promise-based confirm + prompt dialog wrapping `<ha-dialog>`.
- `confirm(opts: { title, message, confirmLabel?, cancelLabel?, danger? }): Promise<boolean>`
- `prompt(opts: { title, message, label, value?, multiline?, confirmLabel?, cancelLabel?, danger? }): Promise<{ confirmed: boolean; value: string }>`
- Placed once in the panel render tree; callers `await` the returned
  promise. `@closed` resolves the promise.
- Danger variant styles the confirm button with `--error-state-color`.

### `AssetManagerEntityDialog`
Create/edit entity dialog. See section 4.5. API:
- `open(opts: { assetId, entity?, siblingSlugs: string[] }): Promise<EntityDef | null>`
  (returns the saved entity on confirm, or `null` on cancel).
- Internally manages `AmConfigForm`, `AmValueInput`, `AmFormulaEditor`.

### `AssetManagerAssetDialog`
Full-form asset create/edit dialog. API:
- `open(opts: { asset? }): Promise<Asset | null>`
- Fields: name, manufacturer, model, serial, icon, tags. Used as the
  create path and as a fallback for the Information tab's inline edit.
- On create, optionally lets the user pick a template to apply
  immediately after creation (a `<ha-select>` of templates +
  "Apply after create" checkbox).

### `AssetManagerTemplateDialog`
Template CRUD dialog. See section 4.7. API:
- `open(opts: { template? }): Promise<Template | null>`

### `AmTextfield`
Thin wrapper around `<ha-textfield>` adding: label, value binding,
validation (required, min/max length, pattern), error message display,
and a `valid` property. Mirrors `maintenance_supporter`'s `ms-textfield`.

### `AmIconPicker`
Icon selector that opens HA's icon picker dialog rather than asking the
user to type a `mdi:*` string. Two modes depending on HA version:
- **HA ≥ 2024.8** (recommended): use the built-in `<ha-icon-picker>`
  web component if available — it renders a button showing the current
  icon and opens HA's full icon-search dialog (searchable grid of all
  MDI icons, grouped by category, with a live filter box).
- **Fallback / prototype**: a button showing the current `<ha-icon>`
  preview that opens a custom picker dialog — a searchable, scrollable
  grid of the most common ~200 MDI icons with a filter text input at
  the top. Clicking an icon selects it and closes the dialog. The raw
  `mdi:*` string is still stored as the value.
Validates the `mdi:` prefix on save. Never presents a bare text input
as the primary icon entry method.

### `AmTagsInput`
Chip input. Renders existing tags as removable chips; typing a tag and
 pressing Enter adds a chip. Backspace on an empty input removes the
 last chip. Validates uniqueness and length. Emits `tags-changed`.

### `AmFormulaEditor`
Formula editor for derived entities. See section 4.5.2. API:
- `@property() formula: string`
- `@property() siblingSlugs: string[]`
- `@state() errors: FormulaError[]`
- Emits `formula-changed` on input and `formula-validity` on validation.

### `AmConfigForm`
Schema-driven form generator. Consumes a schema definition (the same
shape as `ENTITY_CONFIG_SCHEMAS` in `models.py`) plus current values,
and renders the appropriate widgets per field (see table in 4.5.1).
API:
- `@property() schema: FieldSchema[]`
- `@property() value: Record<string, unknown>`
- `@property() errors: Record<string, string>` (field path → message)
- Emits `config-changed` with the new value on any field change.

### `AmValueInput`
Per-kind value widget switch. Given a `kind` and the entity's config,
renders the right input for the current value (see section 10). API:
- `@property() kind: EntityKind`
- `@property() config: Record<string, unknown>`
- `@property() value: unknown`
- Emits `value-changed`.

## 6. Design System / Styling

### HA CSS variables (primary palette)
| Variable                     | Use                              |
|------------------------------|----------------------------------|
| `--card-background-color`    | card / dialog backgrounds        |
| `--primary-color`            | primary actions, active tab      |
| `--primary-text-color`       | primary text                     |
| `--secondary-text-color`     | subtitles, helper text           |
| `--divider-color`            | row dividers, borders            |
| `--error-state-color`        | destructive actions, errors      |
| `--success-color`            | success toasts, enabled state    |
| `--warning-color`            | warnings, "skipped" toasts       |
| `--ha-card-border-radius`    | card corners                     |
| `--input-height`             | input control height             |
| `--mdc-icon-size`            | icon size                        |

### Spacing scale
4 / 8 / 12 / 16 / 24 / 32 px. Use CSS custom properties
(`--am-space-1` … `--am-space-6`) defined once in `sharedStyles` so
spacing is consistent and themeable.

### Card patterns
- Asset list cards: `<ha-card>` with padding 16px, row layout
  `display: flex; align-items: center; gap: 16px;`.
- Entity list: single `<ha-card>` containing rows separated by
  `1px solid var(--divider-color)`.
- KPI stat chips: small `<ha-card>` or styled `<div>` with large number
  + label below.

### Badge / chip styles
Kind badges use a small rounded chip with a background tinted from the
semantic color and the kind name. Color map:

| Kind    | CSS class        | Underlying variable        |
|---------|------------------|----------------------------|
| number  | `.kind-number`   | `--primary-color`          |
| sensor  | `.kind-sensor`   | `--success-color`          |
| derived | `.kind-derived`  | `--success-color` (dashed) |
| date    | `.kind-date`     | `--warning-color`          |
| text    | `.kind-text`     | `--secondary-text-color`   |
| select  | `.kind-select`   | `--primary-color`          |
| switch  | `.kind-switch`   | `--primary-color`          |
| button  | `.kind-button`   | `--error-state-color`      |

Tag chips: neutral background (`--divider-color` at low opacity), small
radius, removable on hover.

Status semantics: success = `--success-color`, warning =
`--warning-color`, error = `--error-state-color`. Used for toasts,
enabled/disabled toggles, and danger confirm buttons.

### Icon conventions
All icons are MDI (`mdi:*`). Defaults:
- Asset: `mdi:cube-outline`.
- Entity by kind: number `mdi:counter`, sensor `mdi:gauge`, derived
  `mdi:function-variant`, date `mdi:calendar`, text `mdi:text`,
  select `mdi:format-list-bulleted`, switch `mdi:toggle-switch`,
  button `mdi:gesture-tap`.
- Actions: add `mdi:plus`, edit `mdi:pencil`, clone `mdi:content-copy`,
  delete `mdi:delete`, back `mdi:arrow-left`.

### Responsive breakpoints
Driven by the HA `narrow` property, not media queries, so the panel
matches HA's own split. Wide ≥ 768px equivalent.

### Dark mode
Free via HA CSS variables. No component-level dark-mode logic.

## 7. Interaction Patterns

### Inline edit with auto-save
On the Information tab, fields save on blur or change. Flow:
1. User edits field; component marks it dirty.
2. On blur, component calls `asset_manager/update` with the changed
   field only (partial update).
3. Optimistically keep the new value; on WS error, revert and show an
   error toast with the field-level message from `describeWsError`.
4. On success, a brief success toast (auto-dismiss 2s) or a subtle
   checkmark affordance.

### Dialog promise pattern
Dialogs are placed once in the render tree and expose promise methods.
The panel `await`s the result and reacts. Example:

```ts
const result = await this._confirmDialog.prompt({
  title: t("dialog.clone.title", this.lang),
  message: t("dialog.clone.message", this.lang),
  label: t("dialog.clone.name_label", this.lang),
  value: `Clone of ${asset.name}`,
});
if (result.confirmed) {
  await this._cloneAsset(asset.id, result.value);
}
```

### WebSocket optimistic updates
Mutations (`create`/`update`/`delete`) call the WS command and, on the
acknowledgement, update the in-memory map. We do NOT pre-apply before
the round-trip (the WS round-trip is fast and avoids rollback
complexity); instead we show a loading state on the triggering control
(disabled button + spinner) until the ack arrives. The subscribe
channel then drives the actual re-render.

### Loading states
- `_loading` boolean on the panel: shows skeleton cards / spinner.
- Per-action loading: the triggering button is disabled and shows a
  spinner until the WS ack.
- Dialogs disable their action buttons during save.

### Error surfacing
`describeWsError(err)` maps voluptuous validation errors (which arrive
as `{ code, message, errors: { <field>: <msg> } }`) to a
`Record<string, string>` of field path → human message. Forms consume
this and set `AmTextfield.error` / `AmConfigForm.errors` accordingly.
For non-field errors, a toast with the raw `message` is shown.

### Empty states
Every list has an empty state with an icon, explanatory copy, and a
primary CTA (see 4.1, 4.4, 4.7).

### Confirmation for destructive actions
All delete/clone operations go through `AssetManagerConfirmDialog` with
the danger variant. No silent destructive mutations.

### Keyboard navigation
- Tab order is logical and visible (focus ring using
  `--primary-color`).
- Dialogs trap focus within the dialog while open and restore focus to
  the triggering element on close.
- Escape closes dialogs (resolves with cancel/false).
- Enter activates the primary dialog action when focus is in a single
  textfield.

### Accessibility
- ARIA roles: dialogs get `role="dialog"` and `aria-modal="true"`
  (provided by `<ha-dialog>`).
- Icon-only buttons get `aria-label`.
- Toggle switches get `aria-label` and reflect state.
- Color is never the sole indicator — kind badges include the kind
  name text.
- Live regions: toast container has `aria-live="polite"`.

## 8. i18n

### `t(key, lang)` pattern
A single translation function `t(key: string, lang: string): string`.
English (`en`) is bundled in the build. Other locales are fetched at
runtime via `ensureLocale(lang: string): Promise<void>`, which dynamic-
imports `./locales/<lang>.js` and merges into a locale registry. If a
key is missing in the active locale, fall back to English; if missing
in English, return the key itself.

### Key naming convention
Dot-path, scoped by feature:
- `panel.title`
- `panel.summary.assets`, `panel.summary.entities`, ...
- `list.empty.title`, `list.empty.body`
- `detail.tab.info`, `detail.tab.entities`, ...
- `entity.kind.number`, `entity.kind.derived`, ...
- `dialog.confirm.title`, `dialog.confirm.delete`, ...
- `dialog.clone.title`, `dialog.clone.message`, ...
- `error.field_required`, `error.slug_unique`, ...
- `toast.saved`, `toast.deleted`, `toast.cloned`, ...

### Usage in components
Components read the active language from `this.hass!.language` and call
`t(key, this.hass!.language)`. When a locale is lazy-loaded, the
component that triggered the load calls `requestUpdate()` so the new
translations render. A ` localize`  helper mixin can wrap this if
desired, matching `maintenance_supporter`.

## 9. State Management & Data Flow

### WS subscriptions
On panel connect (and on `hass` change), subscribe to the three
collections:

```ts
this._unsubs.push(
  await this.hass.connection.subscribeMessage(
    (msg) => this._applyChangeSet("assets", msg),
    { type: "asset_manager/subscribe", collection: "assets" }
  ),
  // ... entities, templates
);
```

### In-memory maps
- `assets: Map<string, Asset>`
- `entities: Map<string, EntityDef>` (all entities across all assets;
  filter by `asset_id` when rendering a detail view)
- `templates: Map<string, Template>`

### Change-set application
The subscribe payload is a change set `{ added: [], updated: [], removed: [] }`
(or individual item events, depending on the StorageCollection
serialization — match whatever `storage.py` / `collection.py` emit).
`_applyChangeSet` mutates the relevant map and calls `requestUpdate()`.

### Re-render strategy
Lit's reactive properties drive re-render. Maps are replaced
(immutable update) rather than mutated in place so Lit detects the
change: `this.assets = new Map(this.assets.set(id, item))`.

### Connection loss / reconnect
On `hass` property change (HA swaps the `hass` object on reconnect),
unsubscribe old subscriptions and re-subscribe. Show a banner
"Reconnecting…" while disconnected and clear it on first successful
change-set. If re-subscribe fails, show an error state with a "Retry"
button.

### Optimistic vs confirmed
See section 7. We wait for the WS ack before mutating local state, and
the subscribe channel is the source of truth. This avoids divergence
if two clients edit simultaneously.

## 10. Per-Kind Value Rendering & Input

| Kind    | List display                          | Editor input widget                       | Config form fields                  | Validation                                |
|---------|---------------------------------------|-------------------------------------------|-------------------------------------|-------------------------------------------|
| number  | value + unit                          | `<ha-slider>` or `<ha-textfield type=number>` per `mode`; respects min/max/step | min, max, step, mode                | min ≤ value ≤ max, step multiple          |
| sensor  | value + unit (read-only)              | read-only (no input)                      | device_class, state_class           | —                                         |
| date    | formatted date                        | `<ha-date-picker>` (or native date input) | (none)                              | valid date                                |
| text    | truncated string                      | `<ha-textfield>` (multiline if `max>80`)  | min, max, pattern                   | length within min/max, matches pattern    |
| select  | selected option                       | `<ha-select>` of `options`                | options                             | value ∈ options                           |
| switch  | on/off chip                           | `<ha-switch>`                             | (none)                              | boolean                                   |
| button  | "Press" affordance (no stored value)  | none (no value field)                     | (none)                              | —                                         |
| derived | computed value + unit (read-only)     | read-only (no input)                      | formula, device_class, state_class  | formula passes `formula.py` validation    |

Notes:
- `button` fires `asset_manager_button_press` on activation; no
  persistent value is stored (see `entity.py`).
- `derived` is computed by `DerivedEvaluator` (see `derived.py`,
  `formula.py`); the UI never writes its value.
- `sensor` is read-only in the UI (its value is set by automations or
  integrations; the Asset Manager only defines the entity).
- For `number` with `mode: "slider"`, the slider respects `min`, `max`,
  `step`; with `mode: "box"`, a numeric textfield is shown.

## 11. Out of Scope / Future

The following are intentionally deferred from this spec. They are
listed so implementers do not scope-creep; each has a rationale.

| Feature                      | Rationale                                                                 |
|------------------------------|---------------------------------------------------------------------------|
| **History tab**              | Requires a time-series store (recorder/Statistics) wiring and chart UI;  |
|                              | defer until entity values are confirmed to feed Statistics correctly.    |
| **Maintenance tab**          | Overlaps with the dedicated `maintenance_supporter` integration;         |
|                              | keep Asset Manager focused on asset/entity modeling, not scheduling.     |
| **Import / export UI**       | Backend supports JSON import/export; UI can be added later as a         |
|                              | dialog once the core CRUD UX is stable.                                  |
| **Lovelace card**            | A dashboard card for per-asset summary is a separate deliverable;        |
|                              | the panel is the management surface.                                     |
| **Calendar view**            | Would require date-entity aggregation; defer.                            |
| **Dashboard strategy**       | Per-asset dashboard generation is a future power-user feature.           |
| **Per-entity history charts**| Depends on History tab infrastructure; defer with it.                    |
| **Photo upload**             | Asset photo field is in the data model but file storage UI is out of     |
|                              | scope for the first Lit rewrite.                                         |

## 12. Migration Plan

Move from the current plain-DOM single file
(`custom_components/asset_manager/frontend/asset-manager-panel.js`) to
a Lit+TypeScript multi-file project with a build step.

### Keep
- WebSocket command names and payloads (auto-generated by
  `StorageCollectionWebsocket` + bespoke `clone_asset` /
  `apply_template` / `derive`).
- The subscribe logic conceptually (re-implemented in TS with the
  `hass.connection.subscribeMessage` pattern from
  `maintenance_supporter`).
- The data contracts defined in `models.py`, `entity.py`,
  `formula.py`, `storage.py`.

### Replace
- The `h()` hyperscript helper and all `document.createElement` code →
  Lit `html` templates.
- Native `confirm()` / `alert()` → `AssetManagerConfirmDialog`.
- Raw JSON config textareas → `AmConfigForm` schema-driven rendering.
- Free-text value inputs → `AmValueInput` per-kind widgets.
- Inline CSS in Shadow DOM → `sharedStyles` / `panelStyles` arrays.
- Hard-coded English strings → `t(key, lang)`.

### Steps
1. **Scaffold the TS project** under
   `custom_components/asset_manager/frontend-src/` with `tsconfig.json`, an esbuild
   or Rollup build script, and a dev watcher. Output target:
   `custom_components/asset_manager/frontend/asset-manager-panel.js`
   (single ES module, same filename HA already loads).
2. **Port the WS layer** to a `data.ts` module: typed
   `subscribeAssets/entities/templates`, the change-set applier, and
   typed wrappers for `clone_asset`, `apply_template`, CRUD commands.
   Match `models.py` types exactly.
3. **Build `sharedStyles` + `panelStyles`** with the HA CSS variable
   palette from section 6.
4. **Implement `AssetManagerConfirmDialog`** first (promise-based
   confirm + prompt + danger variant) — it unblocks all destructive
   flows.
5. **Implement `AmTextfield`, `AmIconPicker`, `AmTagsInput`** — the
   leaf input components.
6. **Implement the Asset List view** with search/sort, KPI summary,
   cards, empty + loading states, Add/Clone/Delete actions.
7. **Implement the Asset Detail shell** with tabs, back-button, and
   the Information tab (inline edit + `AssetManagerAssetDialog`).
8. **Implement `AmConfigForm` + `AmValueInput`** driven by
   `ENTITY_CONFIG_SCHEMAS` from `models.py`.
9. **Implement `AssetManagerEntityDialog`** (create/edit) and the
   Entities tab list.
10. **Implement `AmFormulaEditor`** with autocomplete and live
    validation against `formula.py`'s DSL.
11. **Implement the Templates tab (apply)** and the Template Manager
    (`AssetManagerTemplateDialog`).
12. **Wire i18n** with the English bundle and `ensureLocale` loader;
    replace all hard-coded strings.
13. **Verify in the devcontainer** per `AGENTS.md`:
    `docker exec -w /workspaces/homeassistant-asset-manager
    loving_sutherland bash -lc 'source .venv/bin/activate && ruff
    check . && ruff format . && pytest tests/components/asset_manager/
    -q'` (Python side) plus the frontend build + a manual HA load
    (`hass -c config`) to confirm the panel renders.
14. **Remove the old single-file JS** once the Lit bundle is verified
    end-to-end in HA.

### References
- Existing codebase: `custom_components/asset_manager/models.py`,
  `entity.py`, `formula.py`, `derived.py`, `storage.py`,
  `coordinator.py`, `panel.py`, `frontend/asset-manager-panel.js`.
- Architecture: `documentation/architecture.md`.
- Vision: `documentation/draft_architecture.md`.
- Pattern source: `maintenance_supporter` (github.com/iluebbe/maintenance_supporter)
  — LitElement 3 + TS, `<ha-dialog>`, promise-based dialogs,
  `ms-textfield`, sharedStyles, i18n, WS subscribe.
- HA developer docs: https://developers.home-assistant.io/