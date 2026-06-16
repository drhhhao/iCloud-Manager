"use client"

import { useMemo } from "react"
import type { Account, AccountFilter } from "@/lib/types"

const CHIP_DEFS: { key: AccountFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "error", label: "异常" },
  { key: "no_history", label: "无历史" },
  { key: "cached", label: "已缓存" },
  { key: "has_mail", label: "有邮件" },
]

function matchesFilter(account: Account, filter: AccountFilter): boolean {
  switch (filter) {
    case "error":
      return !!account.last_error
    case "no_history":
      return Boolean(account.no_history) && !account.last_error
    case "cached":
      return Boolean(account.cached) && !account.no_history
    case "has_mail":
      return (account.last_message_count || 0) > 0
    default:
      return true
  }
}

function AccountRow({
  account,
  active,
  onSelect,
}: {
  account: Account
  active: boolean
  onSelect: (id: string) => void
}) {
  const pills: React.ReactNode[] = []
  if (account.last_error) {
    pills.push(
      <span key="err" className="pill fail" title={account.last_error}>
        异常
      </span>,
    )
  }
  if (account.no_history) {
    pills.push(
      <span key="nh" className="pill dim">
        无历史
      </span>,
    )
  } else if (account.cached) {
    pills.push(
      <span key="ok" className="pill ok">
        {account.last_message_count || 0} 封
      </span>,
    )
  } else if (!account.last_error) {
    pills.push(
      <span key="todo" className="pill">
        待扫描
      </span>,
    )
  }
  if (!account.has_source) {
    pills.push(
      <span key="src" className="pill fail">
        缺链接
      </span>,
    )
  }

  return (
    <button
      type="button"
      className={`account-item ${active ? "active" : ""}`}
      onClick={() => onSelect(account.id)}
    >
      <div className="account-main">
        <div className="account-email" title={account.email}>
          {account.email}
        </div>
      </div>
      <div className="account-meta">{pills}</div>
    </button>
  )
}

export function AccountsPanel({
  accounts,
  selectedId,
  search,
  setSearch,
  filter,
  setFilter,
  onSelect,
  onReload,
  onLogout,
}: {
  accounts: Account[]
  selectedId: string
  search: string
  setSearch: (v: string) => void
  filter: AccountFilter
  setFilter: (f: AccountFilter) => void
  onSelect: (id: string) => void
  onReload: () => void
  onLogout: () => void
}) {
  const keyword = search.trim().toLowerCase()

  const searchMatched = useMemo(
    () => accounts.filter((a) => !keyword || a.email.toLowerCase().includes(keyword)),
    [accounts, keyword],
  )

  const counts = useMemo(() => {
    const c: Record<AccountFilter, number> = {
      all: 0,
      error: 0,
      no_history: 0,
      cached: 0,
      has_mail: 0,
    }
    for (const a of searchMatched) {
      c.all++
      if (a.last_error) c.error++
      if (a.no_history && !a.last_error) c.no_history++
      if (a.cached && !a.no_history) c.cached++
      if ((a.last_message_count || 0) > 0) c.has_mail++
    }
    return c
  }, [searchMatched])

  const visible = useMemo(
    () => searchMatched.filter((a) => matchesFilter(a, filter)),
    [searchMatched, filter],
  )

  const subText =
    keyword || filter !== "all"
      ? `${visible.length} / ${accounts.length} 个账号`
      : `${accounts.length} 个账号`

  return (
    <>
      <div className="box">
        <div className="sectionTitle">邮箱列表</div>
        <div className="row">
          <input
            type="search"
            placeholder="搜索邮箱"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1 }}
          />
          <button className="secondary" type="button" onClick={() => setSearch("")}>
            清空
          </button>
        </div>
        <div className="filterChips">
          {CHIP_DEFS.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className={`chip ${filter === chip.key ? "active" : ""}`}
              onClick={() => setFilter(chip.key)}
            >
              {chip.label} {counts[chip.key]}
            </button>
          ))}
        </div>
        <div className="pager">
          <button className="secondary" type="button" onClick={onReload}>
            刷新
          </button>
          <div className="muted">{subText}</div>
          <button className="secondary" type="button" onClick={onLogout}>
            退出
          </button>
        </div>
      </div>

      <div className="aliases">
        {visible.length ? (
          visible.map((account) => (
            <AccountRow
              key={account.id}
              account={account}
              active={account.id === selectedId}
              onSelect={onSelect}
            />
          ))
        ) : (
          <div className="empty">没有匹配的邮箱</div>
        )}
      </div>
    </>
  )
}
