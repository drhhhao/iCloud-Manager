"use client"

import { useState } from "react"
import {
  normalizeMessage,
  sourceSnapshot,
  snapshotHtmlFromSource,
  sourceTextFromSnapshot,
  withBaseHref,
} from "@/lib/mail"
import type { MailMessage } from "@/lib/types"

function CodeCard({ code }: { code: string }) {
  const [label, setLabel] = useState("复制")
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setLabel("已复制")
    } catch {
      setLabel("复制失败")
    }
    setTimeout(() => setLabel("复制"), 1200)
  }
  return (
    <div className="code-card">
      <div>
        <div className="code-label">验证码</div>
        <div className="code-value">{code}</div>
      </div>
      <button className="secondary copy-code-btn" type="button" onClick={copy}>
        {label}
      </button>
    </div>
  )
}

function MailFrame({ html, baseUrl, title }: { html: string; baseUrl: string; title: string }) {
  return (
    <iframe
      className="mail-frame"
      title={title}
      sandbox=""
      referrerPolicy="no-referrer"
      srcDoc={withBaseHref(html, baseUrl)}
    />
  )
}

export function MailDetail({
  message: rawMessage,
  emptyText = "邮件内容会显示在这里",
}: {
  message: MailMessage | null
  emptyText?: string
}) {
  const message = normalizeMessage(rawMessage)
  const snapshot = sourceSnapshot(message)
  const snapshotHtml = snapshotHtmlFromSource(snapshot)
  const code = String(message?.verification_code || "").trim()
  const hasOriginalHtml = Boolean(message?.html || snapshotHtml)

  const detailClass = `detail ${hasOriginalHtml ? "raw-mail-detail" : ""} ${
    code ? "has-code" : ""
  }`.trim()

  if (!message) {
    return (
      <div className="detail">
        <div className="empty">{emptyText}</div>
      </div>
    )
  }

  // Original HTML email.
  if (message.html) {
    const frame = (
      <MailFrame
        html={message.html}
        baseUrl={message.base_url || snapshot?.source_url || ""}
        title={message.subject || "原始邮件"}
      />
    )
    return (
      <div className={detailClass}>
        {code ? (
          <div className="mail-html-shell">
            <CodeCard code={code} />
            {frame}
          </div>
        ) : (
          frame
        )}
      </div>
    )
  }

  // Snapshot-based HTML.
  if (snapshot && snapshotHtml) {
    const frame = (
      <MailFrame
        html={snapshotHtml}
        baseUrl={snapshot.source_url || message.base_url || ""}
        title={message.subject || "源站邮件"}
      />
    )
    return (
      <div className={detailClass}>
        {code ? (
          <div className="mail-html-shell">
            <CodeCard code={code} />
            {frame}
          </div>
        ) : (
          frame
        )}
      </div>
    )
  }

  // Snapshot text fallback.
  if (snapshot && snapshot.raw_response) {
    return (
      <div className={detailClass}>
        {code ? <CodeCard code={code} /> : null}
        <div className="source-preview">
          <div className="source-preview-title">{message.subject || "源站原始内容"}</div>
          <pre className="source-preview-body">{sourceTextFromSnapshot(snapshot, message)}</pre>
        </div>
      </div>
    )
  }

  // Plain text email.
  return (
    <div className={detailClass}>
      {code ? <CodeCard code={code} /> : null}
      <div className="detail-subject">{message.subject || "无主题"}</div>
      <div className="detail-meta">
        <div>发件人：{message.from || "未知"}</div>
        <div>收件人：{message.to || "未知"}</div>
        <div>时间：{message.date || "未知"}</div>
      </div>
      <pre className="detail-body raw-text-body">{message.body || ""}</pre>
    </div>
  )
}
