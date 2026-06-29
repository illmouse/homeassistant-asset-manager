/**
 * Asset Manager — shared CSS styles + style injector.
 *
 * `STYLES` is one big template literal — the panel renders it into a
 * `<style>` node inside its shadow root and also injects a copy into
 * `document.head` for light-DOM children (toasts/modals). The injector is
 * idempotent so repeated calls are cheap.
 */

import { PLACEHOLDER_COLOR } from "./constants.js";

export const TOAST_HOST_ID = "am-toast-host";

export const STYLES = `
  .am-root { padding: 16px; max-width: 1100px; margin: 0 auto;
             font-family: var(--paper-font-body1_-_font-family, inherit); }
  .am-title { font-size: 24px; font-weight: 500; margin: 0 0 16px; }
  .am-card { background: var(--card-background-color, #fff); border-radius: 8px;
             box-shadow: 0 1px 3px rgba(0,0,0,.12); padding: 16px; margin-bottom: 16px; }
  .am-row { display: flex; align-items: center; gap: 12px; padding: 8px 0;
            border-bottom: 1px solid var(--divider-color, #eee); }
  .am-row:last-child { border-bottom: none; }
  .am-row.am-row-clickable { cursor: pointer; transition: background-color .1s ease; }
  .am-row.am-row-clickable:hover { background: var(--divider-color, rgba(0,0,0,.06)); }
  .am-grow { flex: 1; min-width: 0; }
  .am-btn-row { display: flex; gap: 8px; flex-wrap: wrap; }
  .am-btn { background: var(--primary-color, #03a9f4); color: #fff; border: none;
            padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 14px;
            transition: opacity .15s ease, filter .15s ease; }
  .am-btn:hover { filter: brightness(1.08); }
  .am-btn.secondary { background: var(--secondary-background-color, #888); color: var(--primary-text-color, #fff); }
  .am-btn.danger { background: var(--error-state-color, #db4437); }
  .am-btn[disabled] { opacity: .5; cursor: not-allowed; filter: none; }
  .am-input, .am-select, .am-textarea {
    padding: 8px; border: 1px solid var(--divider-color, #ccc);
    border-radius: 4px; font-size: 14px; width: 100%;
    box-sizing: border-box; font-family: inherit;
    color-scheme: light dark;
    background: var(--input-fill-color, var(--card-background-color, #1c1c1c));
    color: var(--input-ink-color, var(--primary-text-color, #e1e1e1));
  }
  /* Native HA form elements — make them fill our card/dialog width and
     inherit the HA theme. These are webawesome-based (ha-input,
     ha-textarea) and Lit-based (ha-select); they default to inline-block
     and need explicit sizing in our flex/grid layouts. */
  ha-input, ha-textarea, ha-select { display: block; width: 100%; box-sizing: border-box; }
  ha-input::part(wa-input), ha-textarea::part(wa-textarea) { width: 100%; }
  .am-native-field { display: flex; flex-direction: column; gap: 4px; width: 100%; }
  .am-native-label { font-size: 12px; color: var(--secondary-text-color, #888); }
  /* Style the <select> dropdown arrow explicitly so it tracks the
     theme instead of using the UA default (which can be invisible
     on dark fills). The appearance:none reset lets us substitute
     our own chevron via background-image. */
  .am-select {
    appearance: none; -webkit-appearance: none;
    padding-right: 28px;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'><path d='M2 4l4 4 4-4' stroke='%23989898' stroke-width='1.5' fill='none' stroke-linecap='round'/></svg>");
    background-repeat: no-repeat;
    background-position: right 8px center;
    /* Preserve the themed fill behind the arrow. */
    background-color: var(--input-fill-color, var(--card-background-color, #1c1c1c));
  }
  .am-input::placeholder, .am-textarea::placeholder {
    color: ${PLACEHOLDER_COLOR};
  }
  /* Selects have no ::placeholder; an unselected <select> shows the
     first <option> in the input color. Keep that readable too. */
  .am-select:invalid { color: ${PLACEHOLDER_COLOR}; }
  .am-textarea { font-family: var(--paper-font-body1_-_font-family, monospace);
                 min-height: 80px; resize: vertical; }
  .am-checkbox { width: 18px; height: 18px; cursor: pointer; accent-color: var(--primary-color, #03a9f4); }
  .am-switch { position: relative; width: 36px; height: 20px; cursor: pointer; flex: 0 0 auto; }
  .am-switch input { opacity: 0; width: 0; height: 0; }
  .am-switch .am-switch-track { position: absolute; inset: 0; background: var(--divider-color, #bbb);
                                border-radius: 999px; transition: background .2s ease; }
  .am-switch .am-switch-thumb { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px;
                                background: #fff; border-radius: 50%; transition: transform .2s ease;
                                box-shadow: 0 1px 3px rgba(0,0,0,.3); }
  .am-switch input:checked + .am-switch-track { background: var(--primary-color, #03a9f4); }
  .am-switch input:checked + .am-switch-track + .am-switch-thumb { transform: translateX(16px); }
  .am-modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,.4);
                 display: flex; align-items: center; justify-content: center; z-index: 100; }
  .am-modal { background: var(--card-background-color, #fff); border-radius: 8px;
              padding: 24px; max-width: 560px; width: 90%; max-height: 85vh; overflow: auto; }
  .am-modal-actions { display: flex; gap: 8px; margin-top: 16px; flex-wrap: wrap; }
  .am-confirm-body { margin-bottom: 8px; line-height: 1.5; }
  .am-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--divider-color, #eee);
             margin-bottom: 16px; flex-wrap: wrap; }
  .am-tab { padding: 8px 16px; cursor: pointer; border-bottom: 2px solid transparent;
            color: var(--secondary-text-color, #888); }
  .am-tab.active { border-bottom-color: var(--primary-color, #03a9f4);
                   font-weight: 500; color: var(--primary-text-color, #000); }
  .am-muted { color: var(--secondary-text-color, #888); font-style: italic; }
  .am-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; }
  .am-field label { display: block; font-size: 12px; margin-bottom: 4px;
                    color: var(--secondary-text-color, #888); }
  .am-error { color: var(--error-state-color, #db4437); font-size: 13px; margin-top: 8px;
              padding: 6px 10px; border-left: 3px solid var(--error-state-color, #db4437);
              border-radius: 4px; background: rgba(219,68,55,.06); }
  .am-error:empty { display: none; }
  .am-empty { text-align: center; padding: 32px 16px; color: var(--secondary-text-color, #888); }
  .am-empty .am-empty-icon { font-size: 40px; margin-bottom: 8px; opacity: .5; }
  .am-toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
  .am-toolbar .am-grow { flex: 1 1 200px; }
  .am-entity-summary { display: flex; flex-direction: column; line-height: 1.35; min-width: 0; }
  .am-entity-summary .am-entity-name { font-weight: 500; overflow: hidden;
                                        text-overflow: ellipsis; white-space: nowrap; }
  .am-entity-summary .am-entity-meta { color: var(--secondary-text-color, #888); font-size: 13px;
                                        overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .am-batch-bar { display: flex; gap: 8px; align-items: center; padding: 8px 0;
                  border-bottom: 1px solid var(--divider-color, #eee); margin-bottom: 8px;
                  color: var(--secondary-text-color, #888); font-size: 13px; flex-wrap: wrap; }
  .am-inline-value { width: 120px; flex: 0 0 auto; }
  .am-spinner { width: 16px; height: 16px; border: 2px solid var(--divider-color, #ccc);
                border-top-color: var(--primary-color, #03a9f4); border-radius: 50%;
                display: inline-block; animation: am-spin 0.8s linear infinite;
                vertical-align: middle; margin-right: 6px; }
  @keyframes am-spin { to { transform: rotate(360deg); } }

  /* Filter controls on the asset list */
  .am-filters { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
  .am-filters .am-search { flex: 1 1 220px; margin: 0; }
  .am-sort { flex: 0 0 auto; }
  .am-filter-btn { flex: 0 0 auto; }

  /* Filter dialog (modal) */
  .am-filter-dialog { min-width: 360px; max-width: 90vw; }
  .am-filter-dialog-row { display: flex; flex-direction: column; gap: 4px;
                           margin-bottom: 12px; }
  .am-filter-dialog-label { font-size: 0.85em;
                             color: var(--secondary-text-color, #888);
                             text-transform: capitalize; }
  .am-filter-dialog-select { width: 100%; }
  .am-filter-dialog-mode { width: 100%; margin-bottom: 6px; }
  .am-filter-dialog-input { width: 100%; }
  /* Filter combobox dropdown (position:fixed to escape modal overflow). */
  .am-label-dropdown.am-filter-dropdown { z-index: 200; right: auto; box-sizing: border-box; }
  /* Label picker dropdown (position:fixed to escape modal overflow). */
  .am-label-dropdown.am-label-picker-dropdown { z-index: 200; right: auto; box-sizing: border-box; }
  /* CSS-drawn checkbox for filter dropdown options. Visible in both
     states so the toggle affordance reads as a checkbox, not empty
     space. Scoped to .am-filter-dropdown so the label picker's
     text-glyph check (labelPicker.js) is unaffected. */
  .am-filter-dropdown .am-label-check {
    width: 14px; height: 14px; flex: 0 0 14px;
    border: 1px solid var(--secondary-text-color, #888);
    border-radius: 2px; background: transparent;
    position: relative; color: transparent;
  }
  .am-filter-dropdown .am-label-option.selected .am-label-check {
    background: var(--primary-color, #03a9f4);
    border-color: var(--primary-color, #03a9f4);
  }
  .am-filter-dropdown .am-label-option.selected .am-label-check::after {
    content: "✓"; position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-size: 11px; font-weight: 700;
  }

  /* Column picker for the asset list table */
  .am-col-picker { position: relative; flex: 0 0 auto; }
  .am-col-picker-dropdown { position: absolute; z-index: 50; top: 100%; right: 0;
                             margin-top: 4px; min-width: 180px;
                             background: var(--card-background-color, #fff);
                             border: 1px solid var(--divider-color, #ccc);
                             border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,.2);
                             padding: 8px; display: flex; flex-direction: column; gap: 6px; }
  .am-col-picker-item { display: flex; align-items: center; gap: 6px;
                        cursor: pointer; font-size: 14px; }

  /* Asset list table */
  .am-table-scroll { overflow-x: auto; }
  .am-table { width: 100%; border-collapse: collapse; font-size: 14px; }
  .am-table th { text-align: left; padding: 8px 10px; font-weight: 500;
                 color: var(--secondary-text-color, #888);
                 border-bottom: 1px solid var(--divider-color, #eee);
                 white-space: nowrap; }
  .am-table-sortable { cursor: pointer; user-select: none; }
  .am-table-sortable:hover { color: var(--primary-color, #03a9f4); }
  .am-table-sortable.active { color: var(--primary-color, #03a9f4); }
  .am-table-icon-th { width: 32px; }
  .am-table .am-table-actions-th { text-align: right; white-space: nowrap; }
  .am-table td { padding: 8px 10px; border-bottom: 1px solid var(--divider-color, #eee);
                 vertical-align: middle; }
  .am-table tbody tr { transition: background-color .1s ease; cursor: pointer; }
  .am-table tbody tr:hover { background: var(--divider-color, rgba(0,0,0,.06)); }
  .am-table tbody tr:last-child td { border-bottom: none; }
  .am-table-icon-td { text-align: center; white-space: nowrap; }
  .am-table-name { font-weight: 500; }
  .am-table-link { cursor: pointer; color: var(--primary-text-color, #000); }
  .am-table-link:hover { color: var(--primary-color, #03a9f4); }
  .am-table .am-table-actions { display: flex; justify-content: flex-end; gap: 4px;
                       white-space: nowrap; }
  .am-table-chips { display: flex; gap: 4px; flex-wrap: wrap; align-items: center; }
  .am-table-chip { font-size: 11px; padding: 2px 8px; }
  .am-tags { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
  .am-label-chip { display: inline-flex; align-items: center; gap: 4px;
                   font-size: 12px; padding: 4px 10px; border-radius: 999px; cursor: pointer;
                   border: 1px solid var(--divider-color, #ccc);
                   color: var(--secondary-text-color, #888);
                   background: var(--card-background-color, #fff); transition: all .15s ease; }
  .am-label-chip.active { background: var(--primary-color, #03a9f4); color: #fff;
                          border-color: var(--primary-color, #03a9f4); }
  .am-label-chip-x { font-weight: 700; margin-left: 4px; cursor: pointer;
                      padding: 0 2px; line-height: 1; }
  .am-label-chip-x:hover { opacity: .7; }

  /* Label picker (Info tab + create dialog) — single multi-select combobox */
  .am-label-picker { position: relative; }
  .am-label-combobox { display: flex; flex-wrap: wrap; align-items: center;
                       gap: 4px; min-height: 36px; padding: 4px 28px 4px 6px;
                       border: 1px solid var(--divider-color, #ccc);
                       border-radius: 6px;
                       background: var(--card-background-color, #fff);
                       cursor: text; position: relative; }
  .am-label-combobox:focus-within { border-color: var(--primary-color, #03a9f4); }
  .am-label-combobox-chips { display: flex; gap: 4px; flex-wrap: wrap;
                             align-items: center; }
  .am-label-combobox-text { flex: 1 1 80px; min-width: 80px; border: 0;
                            background: transparent; outline: none;
                            color: var(--primary-text-color, #000);
                            font: inherit; padding: 2px 0; }
  .am-label-combobox-arrow { position: absolute; right: 8px; top: 50%;
                              transform: translateY(-50%); font-size: 12px;
                              color: var(--secondary-text-color, #888);
                              pointer-events: none; }
  .am-label-dropdown { position: absolute; z-index: 50; top: 100%; left: 0;
                       right: 0; margin-top: 4px; min-width: 260px;
                       background: var(--card-background-color, #fff);
                       border: 1px solid var(--divider-color, #ccc);
                       border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,.2);
                       padding: 8px; }
  .am-label-options { max-height: 200px; overflow-y: auto; margin-bottom: 8px; }
  .am-label-option { display: flex; align-items: center; gap: 6px;
                     padding: 6px 8px; cursor: pointer; border-radius: 4px;
                     border: 1px solid transparent; margin-bottom: 4px;
                     min-width: 0; }
  .am-label-option-text { min-width: 0; overflow: hidden;
                           text-overflow: ellipsis; white-space: nowrap; }
  .am-label-option:hover { background: var(--divider-color, rgba(0,0,0,.06)); }
  .am-label-option.selected { border-color: var(--primary-color, #03a9f4); }
  .am-label-check { width: 14px; display: inline-block;
                    color: var(--primary-color, #03a9f4); font-weight: 700; }
  .am-label-new-link { display: block; margin: 4px 2px 8px; padding: 0;
                       background: none; border: 0; cursor: pointer;
                       color: var(--primary-color, #03a9f4);
                       font-size: 12px; }
  .am-label-create { margin-top: 8px; padding-top: 8px;
                     border-top: 1px solid var(--divider-color, #eee); }
  .am-label-create .am-field { margin-bottom: 6px; }

  /* Area picker: a themed <select> + an optional "no area" reset. Reuses
     .am-select so it tracks the theme's input styling. */
  .am-area-picker { display: flex; flex-direction: column; gap: 4px; }

  /* Entity / template editor */
  .am-config-section { margin-top: 12px; }
  .am-options-list { display: flex; flex-direction: column; gap: 6px; }
  .am-option-row { display: flex; gap: 6px; align-items: center; }
  .am-option-row .am-input { flex: 1 1 auto; }
  .am-option-row .am-btn { padding: 6px 10px; flex: 0 0 auto; }
  .am-advanced-toggle { margin-top: 12px; }
  .am-advanced-toggle summary { cursor: pointer; color: var(--secondary-text-color, #888); font-size: 13px; }

  .am-spec-row { display: flex; gap: 8px; align-items: flex-start; padding: 8px 0;
                 border-bottom: 1px solid var(--divider-color, #eee); }
  .am-spec-row:last-child { border-bottom: none; }
  .am-spec-row .am-spec-summary { flex: 1 1 auto; min-width: 0; }
  .am-spec-row .am-spec-summary > div { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .am-spec-row .am-spec-actions { display: flex; gap: 6px; flex: 0 0 auto; }
  .am-spec-row .am-btn { padding: 4px 10px; font-size: 12px; }

  /* Toasts */
  #${TOAST_HOST_ID} { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
                      z-index: 200; display: flex; flex-direction: column; gap: 8px;
                      align-items: center; pointer-events: none; }
  .am-toast { background: var(--card-background-color, #333); color: var(--primary-text-color, #fff);
              padding: 10px 16px; border-radius: 6px; box-shadow: 0 3px 8px rgba(0,0,0,.25);
              font-size: 14px; max-width: 90vw; opacity: 0; transform: translateY(8px);
              transition: opacity .2s ease, transform .2s ease; cursor: pointer;
              pointer-events: auto; border-left: 4px solid var(--primary-color, #03a9f4); }
  .am-toast.am-toast-error { border-left-color: var(--error-state-color, #db4437); }
  .am-toast.am-toast-success { border-left-color: var(--state-active-color, #4caf50); }
  .am-toast.am-toast-show { opacity: 1; transform: translateY(0); }

  /* Narrow (mobile) layout */
  .am-root.am-narrow { padding: 8px; }
  .am-root.am-narrow .am-grid { grid-template-columns: 1fr; }
  .am-root.am-narrow .am-row { flex-wrap: wrap; }
  .am-root.am-narrow .am-btn-row .am-btn { flex: 1 1 auto; }
  .am-root.am-narrow .am-inline-value { width: 100%; flex: 1 1 100%; }
  .am-root.am-narrow .am-batch-bar .am-btn { flex: 1 1 auto; }
  .am-root.am-narrow .am-filters { flex-direction: column; align-items: stretch; }
  .am-root.am-narrow .am-sort { width: 100%; }
  .am-root.am-narrow .am-filter-btn { width: 100%; }
  .am-root.am-narrow .am-col-picker { align-self: flex-end; }
`;

export const injectStyles = () => {
  if (document.getElementById("am-panel-styles")) return;
  const s = document.createElement("style");
  s.id = "am-panel-styles";
  s.textContent = STYLES;
  document.head.appendChild(s);
};