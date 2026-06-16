"use client"

import { useMemo } from "react"
import { useDashboard } from "@/hooks/use-dashboard"
import { formatTime, normalizeMessage, sourceSnapshot, snapshotHtmlFromSource } from "@/lib/mail"
import { OverviewPanel } from "./overview-panel"
import { ImportPanel } from "./import-panel"
import { AccountsPanel } from "./accounts-panel"
import { OperationLog } from "./operation-log"
import { MailFiltersPanel } from "./mail-filters"
import { MailList } from "./mail-list"
import { MailDetail } from "./mail-detail"
import { LoginOverlay } from "./login-overlay"
import { ThemeControls } from "./theme-controls"
import { ToastStack } from "./toast-stack"

export function Dashboard() {
  const d = useDashboard()

  const selectedMessage = useMemo(
    () => d.filteredMessages.find((m) => m.id === d.selectedMessageId) || null,
    [d.filteredMessages, d.selectedMessageId],
  )

  // Determine full-width raw mail layout (mirrors original logic).
  const rawMailOpen = useMemo(() => {
    const m = normalizeMessage(selectedMessage)
    if (!m) return false
    const snapshot = sourceSnapshot(m)
    const hasHtml = Boolean(m.html || snapshotHtmlFromSource(snapshot))
    return hasHtml && d.filteredMessages.length <= 1
  }, [selectedMessage, d.filteredMessages.length])

  const account = d.currentAccount
  const headerTitle = account ? account.email : "请选择邮箱"
  const headerSub = (() => {
    if (!account) return "选择左侧邮箱后查看历史邮件"
    const count = account.last_message_count ?? d.messages.length ?? 0
    const status = account.last_error
      ? ` · ${account.last_error}`
      : account.no_history
        ? " · 无历史邮件"
        : ""
    return `${count} 封邮件 · ${formatTime(account.last_fetch_at)}${status}`
  })()

  const fetchDisabled = !account || !account.has_source || d.busy
  const clearDisabled = !account || !account.cached || d.busy
  const deleteDisabled = !account || d.busy

  return (
    <>
      <div className="app">
        <aside className="side">
          <div className="brandBlock">
            <div className="brand">iCloud邮箱管理面板</div>
            <div className="muted">批量归档 · 快速选箱 · 历史邮件取阅</div>
          </div>

          <OverviewPanel
            stats={d.stats}
            scan={d.scan}
            onScanAll={d.scanAllHistory}
            onRetryFailed={d.retryFailed}
            onCancelScan={d.cancelScan}
          />

          <ImportPanel
            importing={d.importing}
            onImport={d.importText}
            onLog={d.addLog}
            onToast={d.toast}
          />

          <AccountsPanel
            accounts={d.accounts}
            selectedId={d.selectedId}
            search={d.accountSearch}
            setSearch={d.setAccountSearch}
            filter={d.accountFilter}
            setFilter={d.setAccountFilter}
            onSelect={d.selectAccount}
            onReload={d.reload}
            onLogout={d.logout}
          />

          <OperationLog logs={d.logs} onClear={d.clearLog} />
        </aside>

        <main className="main">
          <div className="top">
            <div>
              <div className="brand">{headerTitle}</div>
              <div className="muted">{headerSub}</div>
            </div>
            <div className="toolbar topActions">
              <span className={`pill ${d.connOk ? "" : "fail"}`}>
                {d.connOk ? "iCloud" : "连接异常"}
              </span>
              <button
                type="button"
                disabled={fetchDisabled}
                className={d.busy ? "isBusy" : ""}
                onClick={() => d.fetchSelected(true)}
              >
                {d.busy ? "刷新中" : "刷新邮件"}
              </button>
              <button
                className="secondary"
                type="button"
                disabled={clearDisabled}
                onClick={d.clearSelectedCache}
              >
                清缓存
              </button>
              <button
                className="softDanger"
                type="button"
                disabled={deleteDisabled}
                onClick={d.deleteSelected}
              >
                删除邮箱
              </button>
              <ThemeControls />
            </div>
          </div>

          <MailFiltersPanel
            filters={d.mailFilters}
            setFilters={d.setMailFilters}
            filteredCount={d.filteredMessages.length}
            totalCount={d.messages.length}
          />

          <section className={`messages ${rawMailOpen ? "raw-mail-open" : ""}`}>
            <MailList
              messages={d.filteredMessages}
              selectedId={d.selectedMessageId}
              emptyText={d.mailListEmptyText}
              onSelect={d.setSelectedMessageId}
            />
            <MailDetail message={selectedMessage} emptyText={d.mailListEmptyText} />
          </section>
        </main>
      </div>

      <LoginOverlay show={d.authChecked && !d.authenticated} onLogin={d.login} />
      <ToastStack toasts={d.toasts} onDismiss={d.dismissToast} />
    </>
  )
}
