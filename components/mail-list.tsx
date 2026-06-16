"use client"

import { normalizeMessage } from "@/lib/mail"
import type { MailMessage } from "@/lib/types"

export function MailList({
  messages,
  selectedId,
  emptyText,
  onSelect,
}: {
  messages: MailMessage[]
  selectedId: string
  emptyText: string
  onSelect: (id: string) => void
}) {
  if (!messages.length) {
    return (
      <div className="list">
        <div className="empty">{emptyText}</div>
      </div>
    )
  }

  return (
    <div className="list">
      {messages.map((message, index) => {
        const dm = normalizeMessage(message) || message
        const subject = dm.subject || `第 ${index + 1} 封历史邮件`
        const sender = dm.from || dm.to || "未知发件人"
        return (
          <button
            key={message.id}
            type="button"
            className={`mail-item ${message.id === selectedId ? "active" : ""}`}
            onClick={() => onSelect(message.id)}
          >
            <div className="mail-subject">{subject}</div>
            <div className="mail-meta">{sender}</div>
            <div className="mail-meta">{dm.date || ""}</div>
          </button>
        )
      })}
    </div>
  )
}
