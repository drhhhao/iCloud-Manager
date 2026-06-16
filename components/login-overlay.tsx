"use client"

import { useEffect, useRef, useState } from "react"

export function LoginOverlay({
  show,
  onLogin,
}: {
  show: boolean
  onLogin: (password: string) => Promise<void>
}) {
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (show) {
      const t = setTimeout(() => inputRef.current?.focus(), 80)
      return () => clearTimeout(t)
    }
  }, [show])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    try {
      await onLogin(password)
      setPassword("")
    } catch (err) {
      setError((err as Error).message)
      setPassword("")
      inputRef.current?.focus()
    }
  }

  return (
    <div className={`login-screen ${show ? "show" : ""}`}>
      <form className="modalCard login-card" onSubmit={submit}>
        <div className="modalTitle">访问密钥</div>
        <div className="modalText">输入本地面板密码后进入邮箱管理台。</div>
        <input
          ref={inputRef}
          type="password"
          autoComplete="current-password"
          placeholder="面板密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="toolbar loginActions">
          <span className="pill">本地 · 离线安全</span>
          <button type="submit">进入</button>
        </div>
        {error ? <div className="err">{error}</div> : null}
      </form>
    </div>
  )
}
