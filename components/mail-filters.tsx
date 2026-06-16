"use client"

import type { MailFilters } from "@/hooks/use-dashboard"

export function MailFiltersPanel({
  filters,
  setFilters,
  filteredCount,
  totalCount,
}: {
  filters: MailFilters
  setFilters: (f: MailFilters) => void
  filteredCount: number
  totalCount: number
}) {
  const update = (patch: Partial<MailFilters>) => setFilters({ ...filters, ...patch })

  return (
    <details className="box fold mailTools" open>
      <summary>邮件筛选</summary>
      <div className="foldBody">
        <div className="filterGrid">
          <input
            type="search"
            placeholder="发件人 / 主题 / 正文"
            value={filters.keyword}
            onChange={(e) => update({ keyword: e.target.value })}
          />
          <input
            type="search"
            inputMode="numeric"
            placeholder="验证码"
            value={filters.code}
            onChange={(e) => update({ code: e.target.value })}
          />
          <input
            type="date"
            aria-label="开始日期"
            value={filters.from}
            onChange={(e) => update({ from: e.target.value })}
          />
          <input
            type="date"
            aria-label="结束日期"
            value={filters.to}
            onChange={(e) => update({ to: e.target.value })}
          />
        </div>
        <div className="toolbar">
          <button
            className="secondary"
            type="button"
            onClick={() => setFilters({ keyword: "", code: "", from: "", to: "" })}
          >
            清空筛选
          </button>
          <span className="pill">
            {filteredCount} / {totalCount} 封邮件
          </span>
        </div>
      </div>
    </details>
  )
}
