/**
 * Asset Manager — UI primitives: toasts, confirm dialog, busy wrapper,
 * modal host, and the CSS-only switch.
 *
 * These are the building blocks the dialogs and views layer on top of.
 * Nothing here knows about the Asset Manager domain — they're generic
 * UX helpers that could be reused by any HA custom panel.
 */

import { h } from "./dom.js";
import { TOAST_HOST_ID } from "./styles.js";

const ensureToastHost = () => {
  let host = document.getElementById(TOAST_HOST_ID);
  if (!host) {
    host = h("div", { id: TOAST_HOST_ID });
    document.body.appendChild(host);
  }
  return host;
};

export const showToast = (message, kind = "info", timeout = 3500) => {
  const host = ensureToastHost();
  const t = h("div", { class: `am-toast am-toast-${kind}`, role: "status" }, String(message));
  host.appendChild(t);
  requestAnimationFrame(() => t.classList.add("am-toast-show"));
  const dismiss = () => {
    t.classList.remove("am-toast-show");
    setTimeout(() => t.remove(), 220);
  };
  t.addEventListener("click", dismiss);
  if (timeout) setTimeout(dismiss, timeout);
  return t;
};

export const openModal = (contentEl) => {
  const bg = h("div", { class: "am-modal-bg" });
  const box = h("div", { class: "am-modal" });
  box.append(contentEl);
  bg.append(box);
  bg.addEventListener("click", (e) => { if (e.target === bg) bg.remove(); });
  document.body.appendChild(bg);
  return bg;
};

export const confirmDialog = (
  message,
  { danger = false, confirmLabel = "Confirm", cancelLabel = "Cancel" } = {},
) =>
  new Promise((resolve) => {
    const ok = h("button", { class: `am-btn${danger ? " danger" : ""}` }, confirmLabel);
    const cancel = h("button", { class: "am-btn secondary" }, cancelLabel);
    const body = h("div", { class: "am-confirm-body" }, message);
    const modal = openModal(h("div", {}, body, h("div", { class: "am-modal-actions" }, cancel, ok)));
    ok.addEventListener("click", () => { modal.remove(); resolve(true); });
    cancel.addEventListener("click", () => { modal.remove(); resolve(false); });
    modal.addEventListener("click", (e) => { if (e.target === modal) { modal.remove(); resolve(false); } });
    ok.focus();
  });

// Wrap an async action with a busy-state: disables the trigger
// element while in flight and shows a transient toast on failure.
export const withBusy = async (triggerEl, fn, { errorToast = true } = {}) => {
  if (triggerEl) triggerEl.disabled = true;
  try {
    return await fn();
  } catch (e) {
    const msg = String(e.message || e);
    if (errorToast) showToast(msg, "error", 6000);
    throw e;
  } finally {
    if (triggerEl) triggerEl.disabled = false;
  }
};

export const makeSwitch = (checked, onChange) => {
  if (customElements.get("ha-switch")) {
    const sw = document.createElement("ha-switch");
    sw.checked = !!checked;
    sw.addEventListener("change", () => onChange(sw.checked));
    return sw;
  }
  const input = h("input", { type: "checkbox", class: "am-switch-input" });
  if (checked) input.checked = true;
  input.addEventListener("change", () => onChange(input.checked));
  return h("label", { class: "am-switch" },
    input,
    h("span", { class: "am-switch-track" }),
    h("span", { class: "am-switch-thumb" }));
};