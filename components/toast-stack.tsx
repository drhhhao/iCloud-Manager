"use client"

import type { ToastItem } from "@/hooks/use-dashboard"

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[]
  onDismiss: (id: number) => void
}) {
  return (
    <div className="toastStack" aria-live="polite" aria-atomic="true">
      {toasts.map((t) => {
        const mapped = t.type === "error" ? "err" : t.type === "success" ? "ok" : t.type
        return (
          <div key={t.id} className={`toast ${mapped}`} onClick={() => onDismiss(t.id)}>
            <b>{mapped === "err" ? "异常" : "状态"}</b>
            <div>{t.message}</div>
          </div>
        )
      })}
    </div>
  )
}
