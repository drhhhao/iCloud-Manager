"use client"

import { useEffect, useState } from "react"

export function ThemeControls() {
  const [isDark, setIsDark] = useState(false)
  const [isMinimal, setIsMinimal] = useState(false)

  useEffect(() => {
    const root = document.documentElement
    setIsDark(root.getAttribute("data-theme") === "dark")
    setIsMinimal(root.getAttribute("data-visual") === "minimal")
  }, [])

  const toggleTheme = () => {
    const root = document.documentElement
    const dark = root.getAttribute("data-theme") === "dark"
    if (dark) {
      root.removeAttribute("data-theme")
      localStorage.removeItem("icloud-panel-theme")
    } else {
      root.setAttribute("data-theme", "dark")
      localStorage.setItem("icloud-panel-theme", "dark")
    }
    setIsDark(!dark)
  }

  const toggleVisual = () => {
    const root = document.documentElement
    const minimal = root.getAttribute("data-visual") === "minimal"
    const next = minimal ? "moyu" : "minimal"
    root.setAttribute("data-visual", next)
    localStorage.setItem("icloud-panel-visual", next)
    setIsMinimal(!minimal)
  }

  return (
    <>
      <button className="secondary" type="button" onClick={toggleTheme}>
        {isDark ? "浅色" : "深色"}
      </button>
      <button className="secondary" type="button" onClick={toggleVisual}>
        {isMinimal ? "手绘模式" : "极简模式"}
      </button>
    </>
  )
}
