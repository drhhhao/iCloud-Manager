"use client"

import { useRef, useState } from "react"

export function ImportPanel({
  importing,
  onImport,
  onLog,
  onToast,
}: {
  importing: boolean
  onImport: (text: string) => Promise<boolean | undefined>
  onLog: (message: string) => void
  onToast: (message: string, type?: "ok" | "error" | "warn" | "success") => void
}) {
  const [text, setText] = useState("")
  const [fileName, setFileName] = useState("未选择文件")
  const fileRef = useRef<HTMLInputElement>(null)

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    try {
      const content = await file.text()
      setText(content)
      onLog(`已载入文件：${file.name}`)
    } catch (err) {
      onLog(`读取文件失败：${(err as Error).message}`)
      onToast("读取文件失败", "error")
    }
  }

  const submit = async () => {
    const ok = await onImport(text)
    if (ok) setText("")
  }

  return (
    <details className="box fold">
      <summary>批量导入</summary>
      <div className="foldBody">
        <div className="uploadBox">
          <input
            ref={fileRef}
            className="srFile"
            id="file-input"
            type="file"
            accept=".txt,text/plain"
            onChange={onFile}
          />
          <label className="filePick" htmlFor="file-input">
            <span className="fileCode">TXT</span>
            <span>选择文件</span>
          </label>
          <span className="fileName">{fileName}</span>
        </div>
        <textarea
          spellCheck={false}
          placeholder="name@icloud.com----http://example.com/show/.../name@icloud.com"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="toolbar">
          <button
            type="button"
            onClick={submit}
            disabled={importing}
            className={importing ? "isBusy" : ""}
          >
            {importing ? "导入中" : "导入邮箱"}
          </button>
        </div>
      </div>
    </details>
  )
}
