import { $ } from "./dom.js";

export function toast(message, type = "ok") {
  const stack = $("toastStack");
  const node = document.createElement("div");
  const mapped = type === "error" ? "err" : type === "success" ? "ok" : type;
  node.className = `toast ${mapped}`;
  node.innerHTML = `<b>${mapped === "err" ? "异常" : "状态"}</b><div>${escapeToast(message)}</div>`;
  stack.appendChild(node);
  while (stack.children.length > 5) stack.firstElementChild.remove();
  setTimeout(() => node.remove(), 3600);
}

export function addLog(message) {
  const list = $("log-list");
  const node = document.createElement("div");
  node.className = "log-item";
  node.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  list.prepend(node);
  while (list.children.length > 80) list.lastChild.remove();
  // Auto-expand the 操作记录 fold so user sees new entries
  const details = list.closest('details');
  if (details && !details.open) {
    details.open = true;
    // Auto-close after 8 seconds if it was auto-opened
    clearTimeout(details._autoCloseTimer);
    details._autoCloseTimer = setTimeout(() => { details.open = false; }, 8000);
  }
}

function escapeToast(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

