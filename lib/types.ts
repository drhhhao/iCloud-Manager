export interface Account {
  id: string
  email: string
  has_source?: boolean
  cached?: boolean
  no_history?: boolean
  last_error?: string
  last_message_count?: number
  last_fetch_at?: string
  source_url?: string
}

export interface Stats {
  total?: number
  with_source?: number
  cached?: number
  messages?: number
  errors?: number
}

export interface SourceSnapshot {
  content_type: string
  parse_mode: string
  raw_response: string
  source_url: string
}

export interface MailMessage {
  id: string
  subject?: string
  from?: string
  to?: string
  date?: string
  body?: string
  html?: string
  base_url?: string
  verification_code?: string
  source_snapshot?: Partial<SourceSnapshot> | null
  [key: string]: unknown
}

export interface MailCache {
  messages?: MailMessage[]
  message_count?: number
  no_history?: boolean
  fetched_at?: string
  content_type?: string
  parse_mode?: string
  raw_response?: string
  source_url?: string
  account_source_url?: string
}

export type ScanStatus =
  | "idle"
  | "running"
  | "retry_waiting"
  | "cancelling"
  | "cancelled"
  | "done"

export interface ScanLogItem {
  message?: string
}

export interface Scan {
  status?: ScanStatus
  total?: number
  done?: number
  success?: number
  failed?: number
  message_count?: number
  failed_count?: number
  retry_phase?: number
  current?: string
  logs?: ScanLogItem[]
}

export interface StateResponse {
  ok: boolean
  stats?: Stats
  accounts?: Account[]
  scan?: Scan
}

export type AccountFilter = "all" | "error" | "no_history" | "cached" | "has_mail"
