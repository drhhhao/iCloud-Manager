import type { Metadata, Viewport } from "next"
import type { ReactNode } from "react"
import "./globals.css"

export const metadata: Metadata = {
  title: "iCloud邮箱管理面板",
  description: "批量归档 · 快速选箱 · 历史邮件取阅",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#efe7d6",
}

const themeInit = `(function(){try{
  var t=localStorage.getItem("icloud-panel-theme")||"";
  var v=localStorage.getItem("icloud-panel-visual")||"moyu";
  if(t)document.documentElement.setAttribute("data-theme",t);
  document.documentElement.setAttribute("data-visual",v);
}catch(e){document.documentElement.setAttribute("data-visual","moyu");}})();`

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" data-visual="moyu" className="bg-background" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
