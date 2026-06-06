import { $ } from "./dom.js";

export async function api(path, options = {}) {
  const init = {
    method: options.method || "GET",
    headers: {"Content-Type": "application/json"},
    credentials: "same-origin"
  };
  if (options.body) init.body = JSON.stringify(options.body);
  const res = await fetch(path, init);
  const data = await res.json().catch(() => ({ok: false, error: "响应解析失败"}));
  if (res.status === 401) {
    $("login-screen").classList.add("show");
    throw new Error("未登录");
  }
  if (!res.ok || data.ok === false) throw new Error(data.error || `请求失败 ${res.status}`);
  return data;
}

export async function sessionStatus() {
  const res = await fetch("/api/session", {credentials: "same-origin"});
  return res.json();
}

