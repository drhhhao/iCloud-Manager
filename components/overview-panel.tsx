"use client"

import type { Scan, Stats } from "@/lib/types"

const PILL_MAP: Record<string, string> = {
  running: "扫描中",
  retry_waiting: "等待重试",
  cancelling: "取消中",
  cancelled: "已取消",
  done: "已完成",
  idle: "空闲",
}

function scanStatusText(scan: Scan): string {
  const status = scan.status || "idle"
  const total = Number(scan.total || 0)
  const done = Number(scan.done || 0)
  const success = Number(scan.success || 0)
  const failed = Number(scan.failed || 0)
  const messages = Number(scan.message_count || 0)
  const failedCount = Number(scan.failed_count || 0)
  const retryPhase = Number(scan.retry_phase || 0)

  if (status === "running") {
    const phaseLabel = retryPhase > 0 ? `(第${retryPhase + 1}轮重试) ` : ""
    return `${phaseLabel}正在扫描 ${done}/${total}，成功 ${success}，失败 ${failed}，已发现 ${messages} 封邮件`
  }
  if (status === "retry_waiting") return scan.current || "等待重试中…"
  if (status === "done" && total) {
    let text = `扫描完成：成功 ${success}，失败 ${failed}，共 ${messages} 封邮件`
    if (failedCount > 0) text += ` — 可点击「重试失败」重新扫描 ${failedCount} 个`
    return text
  }
  if (status === "cancelling") return "正在取消…"
  if (status === "cancelled") {
    return `扫描已取消：已完成 ${done}/${total}，成功 ${success}，仍失败 ${failed}，共 ${messages} 封邮件`
  }
  return "导入后会自动扫描历史邮件"
}

export function OverviewPanel({
  stats,
  scan,
  onScanAll,
  onRetryFailed,
  onCancelScan,
}: {
  stats: Stats
  scan: Scan
  onScanAll: () => void
  onRetryFailed: () => void
  onCancelScan: () => void
}) {
  const status = scan.status || "idle"
  const total = Number(scan.total || 0)
  const done = Number(scan.done || 0)
  const failed = Number(scan.failed || 0)
  const percent = total ? Math.min(100, Math.round((done / total) * 100)) : 0
  const busyScan = status === "running" || status === "retry_waiting" || status === "cancelling"
  const showCancel = status === "running" || status === "retry_waiting"
  const pillFail = failed > 0 && (status === "done" || status === "cancelled")
  const logs = (scan.logs || []).slice(0, 12)

  return (
    <div className="box">
      <div className="sectionTitle">总览</div>
      <div className="statsGrid">
        <div className="stat">
          <span>邮箱总数</span>
          <b>{stats.total || 0}</b>
        </div>
        <div className="stat">
          <span>可收信</span>
          <b>{stats.with_source || 0}</b>
        </div>
        <div className="stat">
          <span>已缓存</span>
          <b>{stats.cached || 0}</b>
        </div>
        <div className="stat">
          <span>邮件数量</span>
          <b>{stats.messages || 0}</b>
        </div>
        <div className="stat dangerStat">
          <span>异常账号</span>
          <b>{stats.errors || 0}</b>
        </div>
      </div>

      <div className="toolbar scanActions">
        <button type="button" onClick={onScanAll} disabled={busyScan}>
          扫描历史
        </button>
        <button className="secondary" type="button" onClick={onRetryFailed} disabled={busyScan}>
          重试失败
        </button>
        {showCancel ? (
          <button className="softDanger" type="button" onClick={onCancelScan}>
            取消扫描
          </button>
        ) : null}
        <span className={`pill ${pillFail ? "fail" : ""} ${status === "retry_waiting" ? "warn" : ""}`}>
          {PILL_MAP[status] || status}
        </span>
      </div>

      <div className="scanBar">
        <div className="scanFill" style={{ width: `${percent}%` }} />
      </div>
      <div className="muted">{scanStatusText(scan)}</div>
      <div className="scanLog">
        {logs.map((item, i) => (
          <div key={i}>{item.message || ""}</div>
        ))}
      </div>
    </div>
  )
}
