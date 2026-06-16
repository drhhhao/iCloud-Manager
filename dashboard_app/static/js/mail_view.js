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
  const messages = Array.isArray(state.filteredMessages) ? state.filteredMessages : state.messages;
  if (!messages.length) {
    const emptyText = state.mailListEmptyText || (state.noHistory ? "无历史邮件" : "暂无缓存邮件");
    box.innerHTML = `<div class="empty">${emptyText}</div>`;
    renderMailDetail(null, 0, emptyText);
    return;
  }
  box.innerHTML = "";
  messages.forEach((message, index) => {
    const displayMessage = normalizeMessage(message);
    const item = document.createElement("button");
    item.type = "button";
    item.className = `mail-item ${message.id === state.selectedMessageId ? "active" : ""}`;
    const subject = displayMessage.subject || `第 ${index + 1} 封历史邮件`;
    const sender = displayMessage.from || displayMessage.to || "未知发件人";
    item.innerHTML = `
      <div class="mail-subject">${escapeHtml(subject)}</div>
      <div class="mail-meta">${escapeHtml(sender)}</div>
      <div class="mail-meta">${escapeHtml(displayMessage.date || "")}</div>
    `;
    item.addEventListener("click", () => onSelectMessage(message.id));
    box.appendChild(item);
  });
}

export function renderMailDetail(message, totalMessages = 0, emptyText = "邮件内容会显示在这里") {
  const box = $("mail-detail");
  message = normalizeMessage(message);
  const snapshot = sourceSnapshot(message);
  const snapshotHtml = snapshotHtmlFromSource(snapshot);
  const hasOriginalHtml = Boolean(message?.html || snapshotHtml);
  const code = String(message?.verification_code || "").trim();
  const shouldUseFullWidth = hasOriginalHtml && totalMessages <= 1;
  box.classList.toggle("raw-mail-detail", hasOriginalHtml);
  box.classList.toggle("has-code", Boolean(code));
  box.closest(".messages")?.classList.toggle("raw-mail-open", shouldUseFullWidth);
  if (!message) {
    box.innerHTML = `<div class="empty">${escapeHtml(emptyText)}</div>`;
    return;
  }
  if (message.html) {
    renderHtmlDetail(box, message.html, message.base_url || snapshot?.source_url || "", message.subject || "原始邮件", code);
    return;
  }
  if (snapshot && (snapshotHtml || snapshot.raw_response)) {
    renderSnapshotDetail(box, snapshot, snapshotHtml, message, code);
    return;
  }
  box.innerHTML = `
    ${code ? codeCardHtml(code) : ""}
    <div class="detail-subject">${escapeHtml(message.subject || "无主题")}</div>
    <div class="detail-meta">
      <div>发件人：${escapeHtml(message.from || "未知")}</div>
      <div>收件人：${escapeHtml(message.to || "未知")}</div>
      <div>时间：${escapeHtml(message.date || "未知")}</div>
    </div>
    <pre class="detail-body raw-text-body">${escapeHtml(message.body || "")}</pre>
  `;
  bindCodeCopy(box);
}

function renderHtmlDetail(box, html, baseUrl, title, code) {
  const frame = createMailFrame(html, baseUrl, title);
  if (code) {
    const shell = document.createElement("div");
    shell.className = "mail-html-shell";
    shell.appendChild(codeCard(code));
    shell.appendChild(frame);
    box.replaceChildren(shell);
  } else {
    box.replaceChildren(frame);
  }
  bindCodeCopy(box);
}

function sourceSnapshot(message) {
  const snapshot = message?.source_snapshot;
  if (!snapshot || typeof snapshot !== "object") return null;
  const raw = String(snapshot.raw_response || "");
  if (!raw) return null;
  return {
    content_type: String(snapshot.content_type || ""),
    parse_mode: String(snapshot.parse_mode || ""),
    raw_response: raw,
    source_url: String(snapshot.source_url || "")
  };
}

function snapshotHtmlFromSource(snapshot) {
  if (!snapshot) return "";
  const raw = snapshot.raw_response || "";
  if (looksLikeHtml(raw)) return raw;
  try {
    return findHtmlInPayload(JSON.parse(raw));
  } catch {
    return "";
  }
}

function findHtmlInPayload(value) {
  if (typeof value === "string") return looksLikeHtml(value) ? value : "";
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findHtmlInPayload(item);
      if (found) return found;
    }
    return "";
  }
  if (!value || typeof value !== "object") return "";
  const preferred = ["raw_html", "html", "body_html", "content_html", "email_html", "message_html", "body", "content", "msg", "message"];
  for (const key of preferred) {
    if (key in value) {
      const found = findHtmlInPayload(value[key]);
      if (found) return found;
    }
  }
  for (const child of Object.values(value)) {
    const found = findHtmlInPayload(child);
    if (found) return found;
  }
  return "";
}

function renderSnapshotDetail(box, snapshot, snapshotHtml, message, code) {
  if (snapshotHtml) {
    renderHtmlDetail(box, snapshotHtml, snapshot.source_url || message.base_url || "", message.subject || "源站邮件", code);
    return;
  }
  box.innerHTML = `
    ${code ? codeCardHtml(code) : ""}
    <div class="source-preview">
      <div class="source-preview-title">${escapeHtml(message.subject || "源站原始内容")}</div>
      <pre class="source-preview-body">${escapeHtml(sourceTextFromSnapshot(snapshot, message))}</pre>
    </div>
  `;
  bindCodeCopy(box);
}

function sourceTextFromSnapshot(snapshot, message) {
  try {
    const text = findTextInPayload(JSON.parse(snapshot.raw_response));
    if (text) return text;
  } catch {
    // Fall through to parsed message text.
  }
  return message.body || snapshot.raw_response || "";
}

function findTextInPayload(value) {
  if (typeof value === "string") return looksLikeHtml(value) ? htmlToText(value) : normalizeNewlines(value);
  if (Array.isArray(value)) return value.map(findTextInPayload).filter(Boolean).join("\n\n").trim();
  if (!value || typeof value !== "object") return "";
  const preferred = ["text", "body", "content", "msg", "message", "detail", "value"];
  for (const key of preferred) {
    if (key in value) {
      const found = findTextInPayload(value[key]);
      if (found) return found;
    }
  }
  return "";
}

function createMailFrame(html, baseUrl, title) {
  const frame = document.createElement("iframe");
  frame.className = "mail-frame";
  frame.title = title;
  frame.setAttribute("sandbox", "");
  frame.setAttribute("referrerpolicy", "no-referrer");
  frame.srcdoc = withBaseHref(html, baseUrl);
  return frame;
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

function codeCard(code) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = codeCardHtml(code);
  bindCodeCopy(wrapper);
  return wrapper.firstElementChild;
}

function codeCardHtml(code) {
  return `
    <div class="code-card">
      <div>
        <div class="code-label">验证码</div>
        <div class="code-value">${escapeHtml(code)}</div>
      </div>
      <button class="secondary copy-code-btn" type="button" data-code="${escapeHtml(code)}">复制</button>
    </div>
  `;
}

function bindCodeCopy(root) {
  root.querySelectorAll(".copy-code-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const code = button.dataset.code || "";
      if (!code) return;
      try {
        await navigator.clipboard.writeText(code);
        button.textContent = "已复制";
        setTimeout(() => {
          button.textContent = "复制";
        }, 1200);
      } catch {
        button.textContent = "复制失败";
        setTimeout(() => {
          button.textContent = "复制";
        }, 1200);
      }
    });
  });
}

export function normalizeMessage(message) {
  if (!message || typeof message !== "object") return message;
  const body = String(message.body || "").trim();
  if (!body.startsWith("{")) return message;
  try {
    const payload = parseLegacyPayload(body);
    if (!payload) return message;
    const raw = String(payload.msg || payload.message || payload.body || "");
    if (!raw.trim()) return message;
    const html = looksLikeHtml(raw) ? raw : "";
    const text = html ? htmlToText(raw) : normalizeNewlines(raw);
    const code = message.verification_code || extractCode(`${message.subject || ""}\n${text}`);
    return {
      ...message,
      subject: code && (!message.subject || message.subject === "无主题") ? `验证码 ${code}` : message.subject,
      date: message.date || payload.time || payload.date || "",
      body: text,
      html: html || message.html,
      verification_code: code || message.verification_code || ""
    };
  } catch {
    return message;
  }
}

function parseLegacyPayload(body) {
  try {
    return JSON.parse(body);
  } catch {
    const match = String(body || "").match(/\{\s*"status"\s*:\s*true\s*,\s*"msg"\s*:\s*"([\s\S]*?)"\s*,\s*"time"\s*:\s*"([^"]*)"/i);
    if (!match) return null;
    return {
      msg: unescapeLegacyJsonText(match[1]),
      time: unescapeLegacyJsonText(match[2])
    };
  }
}

function unescapeLegacyJsonText(value) {
  return String(value || "")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, "\"")
    .replace(/\\\\/g, "\\");
}

function normalizeNewlines(value) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function looksLikeHtml(value) {
  return /<\/?[a-z][\s\S]*>/i.test(String(value || ""));
}

function htmlToText(value) {
  const doc = new DOMParser().parseFromString(String(value || ""), "text/html");
  return normalizeNewlines(doc.body?.textContent || "");
}

function extractCode(value) {
  const text = String(value || "");
  const contextual = text.match(/(?:验证码|登录代码|动态码|校验码|验证代码|verification code|login code|one[-\s]?time code|security code|code)[^\d]{0,100}(\d(?:[\s-]?\d){3,7})/i);
  if (contextual) return contextual[1].replace(/\D/g, "");
  const normalized = text.replace(/\s+/g, " ");
  if (normalized.length > 260) return "";
  const standalone = text.match(/(?<!\d)(\d{4,8})(?!\d)/);
  return standalone ? standalone[1] : "";
}
