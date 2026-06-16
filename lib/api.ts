export class ApiError extends Error {}

interface ApiOptions {
  method?: string
  body?: unknown
}

export async function api<T = any>(path: string, options: ApiOptions = {}): Promise<T> {
  const init: RequestInit = {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
  }
  if (options.body !== undefined) init.body = JSON.stringify(options.body)

  let res: Response
  try {
    res = await fetch(path, init)
  } catch {
    throw new ApiError("无法连接后端服务，请确认 Python 面板已在本地运行")
  }

  const data = await res.json().catch(() => ({ ok: false, error: "响应解析失败" }))
  if (res.status === 401) {
    throw new ApiError("未登录")
  }
  if (!res.ok || data?.ok === false) {
    throw new ApiError(data?.error || `请求失败 ${res.status}`)
  }
  return data as T
}

export async function sessionStatus(): Promise<{ ok: boolean; authenticated: boolean }> {
  try {
    const res = await fetch("/api/session", { credentials: "same-origin" })
    return res.json()
  } catch {
    return { ok: false, authenticated: false }
  }
}
