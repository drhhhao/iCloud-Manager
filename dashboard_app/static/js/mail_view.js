import { $, escapeHtml, formatTime } from "./dom.js";

export function updateMailboxHeader(account, cache, busy = false) {
  $("fetch-btn").disabled = !account || !account.has_source || busy;
  $("clear-cache-btn").disabled = !account || !account.cached || busy;
  $("delete-btn").disabled = !account || busy;
  if (!account) {
    $("mail-title").textContent = "请选择邮箱";
    $("mail-sub").textContent = "选择左侧邮箱后查看历史邮件";
    return;
  }
  $("mail-title").textContent = account.email;
  const count = cache?.message_count ?? account.last_message_count ?? 0;
  const fetched = cache?.fetched_at || account.last_fetch_at;
  const noHistory = Boolean(cache?.no_history || account.no_history);
  const status = account.last_error ? ` · ${account.last_error}` : noHistory ? " · 无历史邮件" : "";
  $("mail-sub").textContent = `${count} 封邮件 · ${formatTime(fetched)}${status}`;
}

export function renderMailList(state, onSelectMessage) {
  const box = $("mail-list");
  if (!state.messages.length) {
    const emptyText = state.noHistory ? "无历史邮件" : "暂无缓存邮件";
    box.innerHTML = `<div class="empty">${emptyText}</div>`;
    renderMailDetail(null, 0, emptyText);
    return;
  }
  box.innerHTML = "";
  state.messages.forEach((message, index) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `mail-item ${message.id === state.selectedMessageId ? "active" : ""}`;
    const subject = message.subject || `第 ${index + 1} 封历史邮件`;
    const sender = message.from || message.to || "未知发件人";
    item.innerHTML = `
      <div class="mail-subject">${escapeHtml(subject)}</div>
      <div class="mail-meta">${escapeHtml(sender)}</div>
      <div class="mail-meta">${escapeHtml(message.date || "")}</div>
    `;
    item.addEventListener("click", () => onSelectMessage(message.id));
    box.appendChild(item);
  });
}

export function renderMailDetail(message, totalMessages = 0, emptyText = "邮件内容会显示在这里") {
  const box = $("mail-detail");
  const hasOriginalHtml = Boolean(message?.html);
  const shouldUseFullWidth = hasOriginalHtml && totalMessages <= 1;
  box.classList.toggle("raw-mail-detail", hasOriginalHtml);
  box.closest(".messages")?.classList.toggle("raw-mail-open", shouldUseFullWidth);
  if (!message) {
    box.innerHTML = `<div class="empty">${escapeHtml(emptyText)}</div>`;
    return;
  }
  if (message.html) {
    const frame = document.createElement("iframe");
    frame.className = "mail-frame";
    frame.title = message.subject || "原始邮件";
    frame.setAttribute("sandbox", "allow-popups allow-popups-to-escape-sandbox");
    frame.setAttribute("referrerpolicy", "no-referrer-when-downgrade");
    frame.srcdoc = withBaseHref(message.html, message.base_url || "");
    box.replaceChildren(frame);
    return;
  }
  box.innerHTML = `
    <div class="detail-subject">${escapeHtml(message.subject || "无主题")}</div>
    <div class="detail-meta">
      <div>发件人：${escapeHtml(message.from || "未知")}</div>
      <div>收件人：${escapeHtml(message.to || "未知")}</div>
      <div>时间：${escapeHtml(message.date || "未知")}</div>
    </div>
    <div class="detail-body">${escapeHtml(message.body || "")}</div>
  `;
}

function withBaseHref(html, baseUrl) {
  const source = String(html || "");
  const base = String(baseUrl || "").trim();
  if (!source || !base || /<base\b/i.test(source)) return source;
  const tag = `<base href="${escapeHtml(base)}">`;
  if (/<head[^>]*>/i.test(source)) {
    return source.replace(/<head([^>]*)>/i, `<head$1>${tag}`);
  }
  return `${tag}${source}`;
}
