import { api, sessionStatus } from "./api.js";
import { $ } from "./dom.js";
import { addLog, toast } from "./notifications.js";
import { renderAccounts, setCurrentFilter, updateStats } from "./accounts_view.js";
import { renderMailDetail, renderMailList, updateMailboxHeader } from "./mail_view.js";
import { setupTheme } from "./theme.js";

const state = {
  accounts: [],
  selectedId: "",
  messages: [],
  selectedMessageId: "",
  noHistory: false,
  authenticated: false,
  busy: false,
  scan: null
};

function currentAccount() {
  return state.accounts.find((item) => item.id === state.selectedId) || null;
}

function showLogin(show) {
  $("login-screen").classList.toggle("show", show);
  state.authenticated = !show;
  if (show) setTimeout(() => $("password-input").focus(), 80);
}

function setConn(ok) {
  const pill = $("modePill");
  if (!pill) return;
  pill.textContent = ok ? "iCloud" : "连接异常";
  pill.classList.toggle("fail", !ok);
}

function renderAccountList(options = {}) {
  const {preserveScroll = true} = options;
  const list = $("account-list");
  const scrollTop = list?.scrollTop || 0;
  renderAccounts(state, selectAccount);
  if (preserveScroll && list) {
    list.scrollTop = Math.min(scrollTop, Math.max(0, list.scrollHeight - list.clientHeight));
  }
}

function renderScan(scan) {
  state.scan = scan || {};
  const status = state.scan.status || "idle";
  const total = Number(state.scan.total || 0);
  const done = Number(state.scan.done || 0);
  const success = Number(state.scan.success || 0);
  const failed = Number(state.scan.failed || 0);
  const messages = Number(state.scan.message_count || 0);
  const failedCount = Number(state.scan.failed_count || 0);
  const retryPhase = Number(state.scan.retry_phase || 0);
  const percent = total ? Math.round((done / total) * 100) : 0;

  $("scan-fill").style.width = `${Math.min(100, percent)}%`;

  // Status pill
  const pillMap = {
    running: "扫描中",
    retry_waiting: "等待重试",
    cancelling: "取消中",
    done: "已完成",
    idle: "空闲",
  };
  $("scan-status-pill").textContent = pillMap[status] || status;
  $("scan-status-pill").classList.toggle("fail", failed > 0 && status === "done");
  $("scan-status-pill").classList.toggle("warn", status === "retry_waiting");

  // Cancel button visibility
  const cancelBtn = $("cancel-scan-btn");
  cancelBtn.style.display = status === "running" || status === "retry_waiting" ? "" : "none";

  // Scan-all button
  $("scan-all-btn").disabled = status === "running" || status === "retry_waiting" || status === "cancelling";

  // Retry button
  const retryBtn = $("retry-failed-btn");
  retryBtn.disabled = status === "running" || status === "retry_waiting" || status === "cancelling";

  // Status text
  if (status === "running") {
    const phaseLabel = retryPhase > 0 ? `(第${retryPhase + 1}轮重试) ` : "";
    $("scan-status-text").textContent =
      `${phaseLabel}正在扫描 ${done}/${total}，成功 ${success}，失败 ${failed}，已发现 ${messages} 封邮件`;
    $("scan-all-btn").disabled = true;
  } else if (status === "retry_waiting") {
    $("scan-status-text").textContent = state.scan.current || "等待重试中…";
  } else if (status === "done" && total) {
    let text = `扫描完成：成功 ${success}，失败 ${failed}，共 ${messages} 封邮件`;
    if (failedCount > 0) {
      text += ` — 可点击「重试失败」重新扫描 ${failedCount} 个`;
    }
    $("scan-status-text").textContent = text;
    $("scan-all-btn").disabled = false;
  } else if (status === "cancelling") {
    $("scan-status-text").textContent = "正在取消…";
  } else {
    $("scan-status-text").textContent = "导入后会自动扫描历史邮件";
    $("scan-all-btn").disabled = false;
  }

  // Scan log
  const logs = (state.scan.logs || []).slice(0, 12);
  $("scan-log").innerHTML = logs.map(
    (item) => `<div>${escapeLog(item.message || "")}</div>`
  ).join("");
}

async function loadScanStatus() {
  const data = await api("/api/scan_status");
  renderScan(data.scan);
  return data.scan;
}

async function loadState(keepSelection = true, options = {}) {
  const {reloadSelected = true, preserveListScroll = true, refreshAccountList = true} = options;
  const data = await api("/api/state");
  state.accounts = data.accounts || [];
  updateStats(data.stats || {});
  renderScan(data.scan);
  const previousSelectedId = state.selectedId;
  if (!keepSelection || !state.accounts.some((item) => item.id === state.selectedId)) {
    state.selectedId = state.accounts[0]?.id || "";
  }
  const selectionChanged = previousSelectedId !== state.selectedId;
  if (refreshAccountList || selectionChanged) renderAccountList({preserveScroll: preserveListScroll});
  setConn(true);
  if (state.selectedId && reloadSelected) await loadAccount(state.selectedId);
  else if (state.selectedId) updateMailboxHeader(currentAccount(), {message_count: state.messages.length, no_history: state.noHistory}, state.busy);
  else updateMailboxHeader(null, null);
}

async function selectAccount(id) {
  state.selectedId = id;
  state.messages = [];
  state.selectedMessageId = "";
  state.noHistory = false;
  renderAccountList();
  await loadAccount(id);
}

async function loadAccount(id) {
  const account = state.accounts.find((item) => item.id === id);
  updateMailboxHeader(account, null, state.busy);
  if (!account) return;
  try {
    const data = await api(`/api/account?id=${encodeURIComponent(id)}`);
    const cache = data.cache || null;
    state.messages = cache?.messages || [];
    state.noHistory = Boolean(cache?.no_history || data.account?.no_history);
    state.selectedMessageId = state.messages[0]?.id || "";
    const errorNote = data.account?.last_error || "";
    const emptyMsg = errorNote ? `⚠ ${errorNote}` : state.noHistory ? "无历史邮件" : "";
    renderMailList(state, selectMessage);
    renderMailDetail(state.messages[0] || null, state.messages.length, emptyMsg);
    updateMailboxHeader(data.account, cache, state.busy);
  } catch (err) {
    addLog(err.message);
  }
}

function selectMessage(id) {
  state.selectedMessageId = id;
  renderMailList(state, selectMessage);
  renderMailDetail(state.messages.find((item) => item.id === id) || null, state.messages.length);
}

async function fetchSelected(force = true) {
  const account = currentAccount();
  if (!account) return;
  state.busy = true;
  updateMailboxHeader(account, null, true);
  $("fetch-btn").textContent = "刷新中";
  try {
    const data = await api("/api/fetch_mail", {method: "POST", body: {id: account.id, force}});
    const cache = data.cache || {};
    state.messages = cache.messages || [];
    state.noHistory = Boolean(cache.no_history || data.account?.no_history);
    state.selectedMessageId = state.messages[0]?.id || "";
    renderMailList(state, selectMessage);
    renderMailDetail(state.messages[0] || null, state.messages.length, state.noHistory ? "无历史邮件" : "");
    addLog(`${account.email} 刷新完成，${state.messages.length} 封邮件`);
    toast("邮件已更新");
    await loadState(true, {reloadSelected: false});
  } catch (err) {
    addLog(`${account.email} ${err.message}`);
    toast(err.message, "error");
    await loadState(true, {reloadSelected: false}).catch(() => {});
  } finally {
    state.busy = false;
    $("fetch-btn").textContent = "刷新邮件";
    updateMailboxHeader(currentAccount(), {message_count: state.messages.length}, false);
  }
}

async function importText() {
  try {
    const data = await api("/api/import", {method: "POST", body: {text: $("import-text").value}});
    const s = data.stats || {};
    const skipped = (s.skipped_invalid || 0) + (s.skipped_non_icloud || 0);
    const scanTotal = data.scan?.total || 0;
    addLog(`导入完成：新增 ${s.imported || 0}，更新 ${s.updated || 0}，重复 ${s.duplicates || 0}，跳过 ${skipped}`);
    if (scanTotal) addLog(`已开始后台扫描历史邮件：${scanTotal} 个邮箱`);
    toast(scanTotal ? "导入完成，已开始扫描历史邮件" : "导入完成");
    state.accounts = data.accounts || [];
    renderScan(data.scan);
    if (!state.selectedId && state.accounts.length) state.selectedId = state.accounts[0].id;
    await loadState(true, {reloadSelected: false});
  } catch (err) {
    addLog(`导入失败：${err.message}`);
    toast(err.message, "error");
  }
}

async function scanAllHistory() {
  const acc = state.accounts.filter(a => a.has_source && !a.cached);
  if (acc.length > 50) {
    if (!confirm(`将扫描全部 ${acc.length} 个未缓存的邮箱，确认开始？`)) return;
  }
  try {
    const data = await api("/api/scan_start", {method: "POST", body: {scope: "all"}});
    renderScan(data.scan);
    addLog(`已开始扫描历史邮件：${data.scan?.total || 0} 个邮箱`);
    toast("已开始扫描历史邮件");
  } catch (err) {
    toast(err.message, "error");
  }
}

async function retryFailed() {
  try {
    const data = await api("/api/retry_failed", {method: "POST", body: {}});
    if (data.ok && data.scan) {
      renderScan(data.scan);
      addLog(`开始重试失败账号：${data.scan?.total || 0} 个`);
      toast("已开始重试失败账号");
    } else {
      toast(data.error || "没有需要重试的账号", "warn");
    }
  } catch (err) {
    toast(err.message, "error");
  }
}

async function cancelScan() {
  if (!confirm("确认取消当前扫描？已成功的结果会保留。")) return;
  try {
    const data = await api("/api/scan_cancel", {method: "POST", body: {}});
    if (data.ok) {
      addLog("扫描已取消");
      toast("扫描已取消", "warn");
    }
  } catch (err) {
    toast(err.message, "error");
  }
}

async function clearSelectedCache() {
  const account = currentAccount();
  if (!account) return;
  if (!confirm(`确认清除 ${account.email} 的本地缓存？不会删除源站数据。`)) return;
  try {
    await api("/api/clear_cache", {method: "POST", body: {id: account.id}});
    state.messages = [];
    state.selectedMessageId = "";
    state.noHistory = false;
    renderMailList(state, selectMessage);
    addLog(`${account.email} 缓存已清理`);
    toast("缓存已清理", "warn");
    await loadState(true);
  } catch (err) {
    toast(err.message, "error");
  }
}

async function deleteSelected() {
  const account = currentAccount();
  if (!account) return;
  if (!confirm(`确认删除 ${account.email}？本地缓存也会一起删除。`)) return;
  try {
    await api("/api/delete_account", {method: "POST", body: {id: account.id}});
    addLog(`${account.email} 已删除`);
    state.selectedId = "";
    state.messages = [];
    state.noHistory = false;
    toast("邮箱已删除", "warn");
    await loadState(false);
  } catch (err) {
    toast(err.message, "error");
  }
}

async function checkSession() {
  try {
    const data = await sessionStatus();
    showLogin(!data.authenticated);
    if (data.authenticated) await loadState(false);
  } catch {
    setConn(false);
    showLogin(true);
  }
}

function setupFilterChips() {
  const container = $("filter-chips");
  if (!container) return;
  container.addEventListener("click", (event) => {
    const chip = event.target.closest(".chip");
    if (!chip) return;
    const filter = chip.dataset.filter;
    if (!filter) return;
    setCurrentFilter(filter);
    // Update active state
    container.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    renderAccountList({preserveScroll: false});
  });
}

function bindEvents() {
  $("login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    $("login-error").textContent = "";
    try {
      await api("/api/login", {method: "POST", body: {password: $("password-input").value}});
      $("password-input").value = "";
      showLogin(false);
      addLog("登录成功");
      await loadState(false);
    } catch (err) {
      $("login-error").textContent = err.message;
      $("password-input").value = "";
      $("password-input").focus();
    }
  });
  $("logout-btn").addEventListener("click", async () => {
    await api("/api/logout", {method: "POST", body: {}}).catch(() => {});
    showLogin(true);
    addLog("已退出登录");
  });
  $("reload-btn").addEventListener("click", () => loadState(true).catch((err) => toast(err.message, "error")));
  $("scan-all-btn").addEventListener("click", scanAllHistory);
  $("retry-failed-btn").addEventListener("click", retryFailed);
  $("cancel-scan-btn").addEventListener("click", cancelScan);
  $("search-input").addEventListener("input", () => renderAccountList({preserveScroll: false}));
  $("clear-search-btn").addEventListener("click", () => {$("search-input").value = ""; renderAccountList({preserveScroll: false});});
  $("fetch-btn").addEventListener("click", () => fetchSelected(true));
  $("clear-cache-btn").addEventListener("click", clearSelectedCache);
  $("delete-btn").addEventListener("click", deleteSelected);
  $("import-btn").addEventListener("click", importText);
  $("clear-log-btn").addEventListener("click", () => {$("log-list").innerHTML = "";});
  $("file-input").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    $("file-name").textContent = file.name;
    $("import-text").value = await file.text();
    addLog(`已载入文件：${file.name}`);
  });
  setupFilterChips();
}

function escapeLog(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

setupTheme();
bindEvents();
checkSession();

// Poll scan status more frequently when scanning
setInterval(async () => {
  if (!state.authenticated) return;
  try {
    const previousScanStatus = state.scan?.status;
    const scan = await loadScanStatus();
    const shouldRefreshList =
      (previousScanStatus === "running" && scan.status === "done") ||
      (previousScanStatus === "running" && scan.status === "retry_waiting");
    if (scan.status === "running" || scan.status === "retry_waiting" || shouldRefreshList) {
      await loadState(true, {reloadSelected: false, refreshAccountList: shouldRefreshList});
    }
  } catch (err) {
    // If we get auth error, mark as unauthenticated
    if (err.message === "未登录") {
      showLogin(true);
      return;
    }
    setConn(false);
  }
}, 3000);

// Full state refresh
setInterval(() => {
  if (!state.authenticated) return;
  if (state.scan?.status?.match(/^(running|retry_waiting|cancelling)$/)) return;
  loadState(true, {reloadSelected: false, refreshAccountList: false}).catch((err) => {
    if (err.message === "未登录") showLogin(true);
    else setConn(false);
  });
}, 20000);
