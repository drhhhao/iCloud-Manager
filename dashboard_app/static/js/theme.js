import { $ } from "./dom.js";

export function setupTheme() {
  const savedTheme = localStorage.getItem("icloud-panel-theme") || "";
  const savedVisual = localStorage.getItem("icloud-panel-visual") || "moyu";
  if (savedTheme) document.documentElement.setAttribute("data-theme", savedTheme);
  document.documentElement.setAttribute("data-visual", savedVisual);
  syncButtons();

  $("themeToggle").addEventListener("click", () => {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    if (isDark) {
      document.documentElement.removeAttribute("data-theme");
      localStorage.removeItem("icloud-panel-theme");
    } else {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("icloud-panel-theme", "dark");
    }
    syncButtons();
  });

  $("visualToggle").addEventListener("click", () => {
    const isMinimal = document.documentElement.getAttribute("data-visual") === "minimal";
    const next = isMinimal ? "moyu" : "minimal";
    document.documentElement.setAttribute("data-visual", next);
    localStorage.setItem("icloud-panel-visual", next);
    syncButtons();
  });
}

function syncButtons() {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const isMinimal = document.documentElement.getAttribute("data-visual") === "minimal";
  $("themeToggle").textContent = isDark ? "浅色" : "深色";
  $("visualToggle").textContent = isMinimal ? "手绘模式" : "极简模式";
}


