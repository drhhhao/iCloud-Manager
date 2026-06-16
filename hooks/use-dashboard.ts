"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { api, ApiError, sessionStatus } from "@/lib/api"
import { messagesFromCache, normalizeMessage, normalizeDateOnly } from "@/lib/mail"
import type {
  Account,
  AccountFilter,
  MailCache,
  MailMessage,
  Scan,
  Stats,
  StateResponse,
} from "@/lib/types"

export interface ToastItem {
  id: number
  message: string
  type: "ok" | "error" | "warn" | "success"
}

export interface LogItem {
  id: number
  time: string
  message: string
}

export interface MailFilters {
  keyword: string
  code: string
  from: string
  to: string
}

let toastSeq = 0
let logSeq = 0

export function useDashboard() {
  const [authenticated, setAuthenticated] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [connOk, setConnOk] = useState(true)

  const [accounts, setAccounts] = useState<Account[]>([])
  const [stats, setStats] = useState<Stats>({})
  const [scan, setScan] = useState<Scan>({ status: "idle" })

  const [selectedId, setSelectedId] = useState("")
  const [messages, setMessages] = useState<MailMessage[]>([])
  const [noHistory, setNoHistory] = useState(false)
  const [selectedMessageId, setSelectedMessageId] = useState("")
  const [accountError, setAccountError] = useState("")

  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)

  const [accountSearch, setAccountSearch] = useState("")
  const [accountFilter, setAccountFilter] = useState<AccountFilter>("all")
  const [mailFilters, setMailFilters] = useState<MailFilters>({
    keyword: "",
    code: "",
    from: "",
    to: "",
  })

  const [logs, setLogs] = useState<LogItem[]>([])
  const [toasts, setToasts] = useState<ToastItem[]>([])

  // Refs to read latest values inside intervals / async without stale closures.
  const selectedIdRef = useRef(selectedId)
  const scanRef = useRef(scan)
  const authRef = useRef(authenticated)
  const accountLoadSeq = useRef(0)
  selectedIdRef.current = selectedId
  scanRef.current = scan
  authRef.current = authenticated

  const toast = useCallback((message: string, type: ToastItem["type"] = "ok") => {
    const id = ++toastSeq
    setToasts((prev) => {
      const next = [...prev, { id, message, type }]
      return next.slice(-5)
    })
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3600)
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const addLog = useCallback((message: string) => {
    const id = ++logSeq
    setLogs((prev) => [
      { id, time: new Date().toLocaleTimeString(), message },
      ...prev,
    ].slice(0, 80))
  }, [])

  const clearLog = useCallback(() => setLogs([]), [])

  const currentAccount = useMemo(
    () => accounts.find((a) => a.id === selectedId) || null,
    [accounts, selectedId],
  )

  const filteredMessages = useMemo(() => {
    const matches = (message: MailMessage) => {
      const dm = normalizeMessage(message) || message
      const keyword = mailFilters.keyword.trim().toLowerCase()
      const code = mailFilters.code.trim()
      const from = mailFilters.from
      const to = mailFilters.to
      const haystack = [dm.subject, dm.from, dm.to, dm.body, dm.date]
        .map((v) => String(v || "").toLowerCase())
        .join("\n")
      if (keyword && !haystack.includes(keyword)) return false
      if (code && !String(dm.verification_code || "").includes(code)) return false
      const messageDate = normalizeDateOnly(String(dm.date || ""))
      if (from && messageDate && messageDate < from) return false
      if (to && messageDate && messageDate > to) return false
      if ((from || to) && !messageDate) return false
      return true
    }
    return messages.filter(matches)
  }, [messages, mailFilters])

  // Keep a valid selected message id in sync with the filtered list.
  useEffect(() => {
    if (!filteredMessages.some((m) => m.id === selectedMessageId)) {
      setSelectedMessageId(filteredMessages[0]?.id || "")
    }
  }, [filteredMessages, selectedMessageId])

  const mailListEmptyText = useMemo(() => {
    if (accountError) return accountError
    if (messages.length && !filteredMessages.length) return "没有匹配筛选条件的邮件"
    return noHistory ? "无历史邮件" : "暂无缓存邮件"
  }, [accountError, messages.length, filteredMessages.length, noHistory])

  const loadAccount = useCallback(
    async (id: string) => {
      const loadSeq = ++accountLoadSeq.current
      try {
        const data = await api<{ account: Account; cache: MailCache | null }>(
          `/api/account?id=${encodeURIComponent(id)}`,
        )
        if (loadSeq !== accountLoadSeq.current || selectedIdRef.current !== id) return
        if (data.account?.id !== id) return
        const cache = data.cache || null
        setMessages(messagesFromCache(cache))
        setNoHistory(Boolean(cache?.no_history || data.account?.no_history))
        setSelectedMessageId("")
        setAccountError(data.account?.last_error ? `⚠ ${data.account.last_error}` : "")
        setAccounts((prev) =>
          prev.map((a) => (a.id === id ? { ...a, ...data.account } : a)),
        )
      } catch (err) {
        if (loadSeq !== accountLoadSeq.current || selectedIdRef.current !== id) return
        if (err instanceof ApiError && err.message === "未登录") {
          setAuthenticated(false)
          return
        }
        addLog((err as Error).message)
      }
    },
    [addLog],
  )

  const loadState = useCallback(
    async (
      keepSelection = true,
      options: { reloadSelected?: boolean } = {},
    ) => {
      const { reloadSelected = true } = options
      const data = await api<StateResponse>("/api/state")
      setAccounts(data.accounts || [])
      setStats(data.stats || {})
      setScan(data.scan || { status: "idle" })
      setConnOk(true)
      let nextSelected = selectedIdRef.current
      const hasSelected = (data.accounts || []).some((a) => a.id === nextSelected)
      if (!keepSelection || !hasSelected) {
        nextSelected = data.accounts?.[0]?.id || ""
        setSelectedId(nextSelected)
      }
      if (nextSelected && reloadSelected) await loadAccount(nextSelected)
    },
    [loadAccount],
  )

  const selectAccount = useCallback(
    async (id: string) => {
      setSelectedId(id)
      setMessages([])
      setNoHistory(false)
      setSelectedMessageId("")
      setAccountError("")
      await loadAccount(id)
    },
    [loadAccount],
  )

  const checkSession = useCallback(async () => {
    try {
      const data = await sessionStatus()
      setAuthenticated(Boolean(data.authenticated))
      setAuthChecked(true)
      if (data.authenticated) await loadState(false)
    } catch {
      setConnOk(false)
      setAuthenticated(false)
      setAuthChecked(true)
    }
  }, [loadState])

  const login = useCallback(
    async (password: string) => {
      await api("/api/login", { method: "POST", body: { password } })
      setAuthenticated(true)
      addLog("登录成功")
      await loadState(false)
    },
    [addLog, loadState],
  )

  const logout = useCallback(async () => {
    await api("/api/logout", { method: "POST", body: {} }).catch(() => {})
    setAuthenticated(false)
    addLog("已退出登录")
  }, [addLog])

  const fetchSelected = useCallback(
    async (force = true) => {
      const account = accounts.find((a) => a.id === selectedIdRef.current)
      if (!account) return
      setBusy(true)
      try {
        const data = await api<{ cache: MailCache; account: Account }>("/api/fetch_mail", {
          method: "POST",
          body: { id: account.id, force },
        })
        const cache = data.cache || {}
        const msgs = messagesFromCache(cache)
        setMessages(msgs)
        const nh = Boolean(cache.no_history || data.account?.no_history)
        setNoHistory(nh)
        setSelectedMessageId("")
        setAccountError("")
        addLog(`${account.email} 刷新完成，${msgs.length} 封邮件`)
        toast("邮件已更新")
        setAccounts((prev) =>
          prev.map((a) =>
            a.id === account.id
              ? {
                  ...a,
                  ...(data.account || {}),
                  cached: true,
                  last_message_count: msgs.length,
                  no_history: nh,
                }
              : a,
          ),
        )
      } catch (err) {
        addLog(`${account.email} ${(err as Error).message}`)
        toast((err as Error).message, "error")
        await loadState(true, { reloadSelected: false }).catch(() => {})
      } finally {
        setBusy(false)
      }
    },
    [accounts, addLog, toast, loadState],
  )

  const importText = useCallback(
    async (text: string) => {
      if (importing) return
      setImporting(true)
      try {
        const data = await api<{ stats: any; accounts: Account[]; scan: Scan }>("/api/import", {
          method: "POST",
          body: { text },
        })
        const s = data.stats || {}
        const skipped = (s.skipped_invalid || 0) + (s.skipped_non_icloud || 0)
        const scanTotal = data.scan?.total || 0
        addLog(
          `导入完成：新增 ${s.imported || 0}，更新 ${s.updated || 0}，重复 ${s.duplicates || 0}，跳过 ${skipped}`,
        )
        if (scanTotal) addLog(`已开始后台扫描历史邮件：${scanTotal} 个邮箱`)
        toast(scanTotal ? "导入完成，已开始扫描历史邮件" : "导入完成")
        setScan(data.scan || { status: "idle" })
        await loadState(true, { reloadSelected: false })
        return true
      } catch (err) {
        addLog(`导入失败：${(err as Error).message}`)
        toast((err as Error).message, "error")
        return false
      } finally {
        setImporting(false)
      }
    },
    [importing, addLog, toast, loadState],
  )

  const scanAllHistory = useCallback(async () => {
    const acc = accounts.filter((a) => a.has_source)
    if (acc.length > 50 && !window.confirm(`将扫描全部 ${acc.length} 个带收信链接的邮箱，确认开始？`)) {
      return
    }
    try {
      const data = await api<{ scan: Scan }>("/api/scan_start", {
        method: "POST",
        body: { scope: "all" },
      })
      setScan(data.scan || { status: "idle" })
      addLog(`已开始扫描历史邮件：${data.scan?.total || 0} 个邮箱`)
      toast("已开始扫描历史邮件")
    } catch (err) {
      toast((err as Error).message, "error")
    }
  }, [accounts, addLog, toast])

  const retryFailed = useCallback(async () => {
    try {
      const data = await api<{ ok: boolean; scan?: Scan; error?: string }>("/api/retry_failed", {
        method: "POST",
        body: {},
      })
      if (data.ok && data.scan) {
        setScan(data.scan)
        addLog(`开始重试失败账号：${data.scan?.total || 0} 个`)
        toast("已开始重试失败账号")
      } else {
        toast(data.error || "没有需要重试的账号", "warn")
      }
    } catch (err) {
      toast((err as Error).message, "error")
    }
  }, [addLog, toast])

  const cancelScan = useCallback(async () => {
    if (!window.confirm("确认取消当前扫描？已成功的结果会保留。")) return
    try {
      const data = await api<{ ok: boolean }>("/api/scan_cancel", { method: "POST", body: {} })
      if (data.ok) {
        addLog("扫描已取消")
        toast("扫描已取消", "warn")
      }
    } catch (err) {
      toast((err as Error).message, "error")
    }
  }, [addLog, toast])

  const clearSelectedCache = useCallback(async () => {
    const account = accounts.find((a) => a.id === selectedIdRef.current)
    if (!account) return
    if (!window.confirm(`确认清除 ${account.email} 的本地缓存？不会删除源站数据。`)) return
    try {
      await api("/api/clear_cache", { method: "POST", body: { id: account.id } })
      setMessages([])
      setNoHistory(false)
      setSelectedMessageId("")
      setAccountError("")
      addLog(`${account.email} 缓存已清理`)
      toast("缓存已清理", "warn")
      await loadState(true)
    } catch (err) {
      toast((err as Error).message, "error")
    }
  }, [accounts, addLog, toast, loadState])

  const deleteSelected = useCallback(async () => {
    const account = accounts.find((a) => a.id === selectedIdRef.current)
    if (!account) return
    if (!window.confirm(`确认删除 ${account.email}？本地缓存也会一起删除。`)) return
    try {
      await api("/api/delete_account", { method: "POST", body: { id: account.id } })
      addLog(`${account.email} 已删除`)
      setSelectedId("")
      setMessages([])
      setNoHistory(false)
      toast("邮箱已删除", "warn")
      await loadState(false)
    } catch (err) {
      toast((err as Error).message, "error")
    }
  }, [accounts, addLog, toast, loadState])

  const reload = useCallback(() => {
    loadState(true).catch((err) => toast((err as Error).message, "error"))
  }, [loadState, toast])

  // Initial session check.
  useEffect(() => {
    checkSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fast scan-status polling.
  useEffect(() => {
    const timer = setInterval(async () => {
      if (!authRef.current) return
      try {
        const prevStatus = scanRef.current?.status
        const data = await api<{ scan: Scan }>("/api/scan_status")
        const nextScan = data.scan || { status: "idle" }
        setScan(nextScan)
        const refreshList =
          prevStatus === "running" &&
          (nextScan.status === "done" || nextScan.status === "retry_waiting")
        if (
          nextScan.status === "running" ||
          nextScan.status === "retry_waiting" ||
          refreshList
        ) {
          await loadState(true, { reloadSelected: false })
        }
      } catch (err) {
        if (err instanceof ApiError && err.message === "未登录") {
          setAuthenticated(false)
          return
        }
        setConnOk(false)
      }
    }, 3000)
    return () => clearInterval(timer)
  }, [loadState])

  // Slow full-state refresh.
  useEffect(() => {
    const timer = setInterval(() => {
      if (!authRef.current) return
      const status = scanRef.current?.status
      if (status === "running" || status === "retry_waiting" || status === "cancelling") return
      loadState(true, { reloadSelected: false }).catch((err) => {
        if (err instanceof ApiError && err.message === "未登录") setAuthenticated(false)
        else setConnOk(false)
      })
    }, 20000)
    return () => clearInterval(timer)
  }, [loadState])

  return {
    authenticated,
    authChecked,
    connOk,
    accounts,
    stats,
    scan,
    selectedId,
    currentAccount,
    messages,
    filteredMessages,
    selectedMessageId,
    setSelectedMessageId,
    noHistory,
    mailListEmptyText,
    busy,
    importing,
    accountSearch,
    setAccountSearch,
    accountFilter,
    setAccountFilter,
    mailFilters,
    setMailFilters,
    logs,
    toasts,
    dismissToast,
    clearLog,
    addLog,
    toast,
    // actions
    login,
    logout,
    reload,
    selectAccount,
    fetchSelected,
    importText,
    scanAllHistory,
    retryFailed,
    cancelScan,
    clearSelectedCache,
    deleteSelected,
  }
}
