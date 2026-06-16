import type { MailMessage, MailCache, SourceSnapshot } from "./types"

export function normalizeDateOnly(value: string): string {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toISOString().slice(0, 10)
}

export function looksLikeHtml(value: unknown): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(String(value || ""))
}

function normalizeNewlines(value: unknown): string {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
}

function htmlToText(value: unknown): string {
  if (typeof window === "undefined") return normalizeNewlines(value)
  const doc = new DOMParser().parseFromString(String(value || ""), "text/html")
  return normalizeNewlines(doc.body?.textContent || "")
}

export function extractCode(value: unknown): string {
  const text = String(value || "")
  const contextual = text.match(
    /(?:验证码|登录代码|动态码|校验码|验证代码|verification code|login code|one[-\s]?time code|security code|code)[^\d]{0,100}(\d(?:[\s-]?\d){3,7})/i,
  )
  if (contextual) return contextual[1].replace(/\D/g, "")
  const normalized = text.replace(/\s+/g, " ")
  if (normalized.length > 260) return ""
  const standalone = text.match(/(?<!\d)(\d{4,8})(?!\d)/)
  return standalone ? standalone[1] : ""
}

function unescapeLegacyJsonText(value: unknown): string {
  return String(value || "")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
}

function parseLegacyPayload(body: string): Record<string, any> | null {
  try {
    return JSON.parse(body)
  } catch {
    const match = String(body || "").match(
      /\{\s*"status"\s*:\s*true\s*,\s*"msg"\s*:\s*"([\s\S]*?)"\s*,\s*"time"\s*:\s*"([^"]*)"/i,
    )
    if (!match) return null
    return {
      msg: unescapeLegacyJsonText(match[1]),
      time: unescapeLegacyJsonText(match[2]),
    }
  }
}

export function normalizeMessage(message: MailMessage | null): MailMessage | null {
  if (!message || typeof message !== "object") return message
  const body = String(message.body || "").trim()
  if (!body.startsWith("{")) return message
  try {
    const payload = parseLegacyPayload(body)
    if (!payload) return message
    const raw = String(payload.msg || payload.message || payload.body || "")
    if (!raw.trim()) return message
    const html = looksLikeHtml(raw) ? raw : ""
    const text = html ? htmlToText(raw) : normalizeNewlines(raw)
    const code = message.verification_code || extractCode(`${message.subject || ""}\n${text}`)
    return {
      ...message,
      subject:
        code && (!message.subject || message.subject === "无主题")
          ? `验证码 ${code}`
          : message.subject,
      date: message.date || payload.time || payload.date || "",
      body: text,
      html: html || message.html,
      verification_code: code || message.verification_code || "",
    }
  } catch {
    return message
  }
}

export function sourceSnapshot(message: MailMessage | null): SourceSnapshot | null {
  const snapshot = message?.source_snapshot
  if (!snapshot || typeof snapshot !== "object") return null
  const raw = String(snapshot.raw_response || "")
  if (!raw) return null
  return {
    content_type: String(snapshot.content_type || ""),
    parse_mode: String(snapshot.parse_mode || ""),
    raw_response: raw,
    source_url: String(snapshot.source_url || ""),
  }
}

function findHtmlInPayload(value: any): string {
  if (typeof value === "string") return looksLikeHtml(value) ? value : ""
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findHtmlInPayload(item)
      if (found) return found
    }
    return ""
  }
  if (!value || typeof value !== "object") return ""
  const preferred = [
    "raw_html",
    "html",
    "body_html",
    "content_html",
    "email_html",
    "message_html",
    "body",
    "content",
    "msg",
    "message",
  ]
  for (const key of preferred) {
    if (key in value) {
      const found = findHtmlInPayload(value[key])
      if (found) return found
    }
  }
  for (const child of Object.values(value)) {
    const found = findHtmlInPayload(child)
    if (found) return found
  }
  return ""
}

export function snapshotHtmlFromSource(snapshot: SourceSnapshot | null): string {
  if (!snapshot) return ""
  const raw = snapshot.raw_response || ""
  if (looksLikeHtml(raw)) return raw
  try {
    return findHtmlInPayload(JSON.parse(raw))
  } catch {
    return ""
  }
}

function findTextInPayload(value: any): string {
  if (typeof value === "string")
    return looksLikeHtml(value) ? htmlToText(value) : normalizeNewlines(value)
  if (Array.isArray(value))
    return value.map(findTextInPayload).filter(Boolean).join("\n\n").trim()
  if (!value || typeof value !== "object") return ""
  const preferred = ["text", "body", "content", "msg", "message", "detail", "value"]
  for (const key of preferred) {
    if (key in value) {
      const found = findTextInPayload(value[key])
      if (found) return found
    }
  }
  return ""
}

export function sourceTextFromSnapshot(snapshot: SourceSnapshot, message: MailMessage): string {
  try {
    const text = findTextInPayload(JSON.parse(snapshot.raw_response))
    if (text) return text
  } catch {
    // fall through
  }
  return message.body || snapshot.raw_response || ""
}

export function withBaseHref(html: string, baseUrl: string): string {
  const source = String(html || "")
  const base = String(baseUrl || "").trim()
  if (!source || !base || /<base\b/i.test(source)) return source
  const tag = `<base href="${base.replace(/"/g, "&quot;")}">`
  if (/<head[^>]*>/i.test(source)) {
    return source.replace(/<head([^>]*)>/i, `<head$1>${tag}`)
  }
  return `${tag}${source}`
}

export function messagesFromCache(cache: MailCache | null): MailMessage[] {
  const messages = (cache?.messages || []).map((message) => ({ ...message }))
  if (messages.length === 1) {
    const sourceUrl = cache?.source_url || cache?.account_source_url || ""
    if (cache?.raw_response) {
      messages[0].source_snapshot = {
        content_type: cache?.content_type || "",
        parse_mode: cache?.parse_mode || "",
        raw_response: cache?.raw_response || "",
        source_url: sourceUrl,
      }
    }
  }
  return messages
}

export function formatTime(value?: string): string {
  if (!value) return "未拉取"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}
