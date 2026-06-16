"use client"

import type { LogItem } from "@/hooks/use-dashboard"

export function OperationLog({
  logs,
  onClear,
}: {
  logs: LogItem[]
  onClear: () => void
}) {
  return (
    <details className="box fold">
      <summary>操作记录</summary>
      <div className="foldBody">
        <div className="toolbar">
          <button className="secondary" type="button" onClick={onClear}>
            清空记录
          </button>
        </div>
        <div className="logBox">
          {logs.map((item) => (
            <div key={item.id} className="log-item">
              [{item.time}] {item.message}
            </div>
          ))}
        </div>
      </div>
    </details>
  )
}
