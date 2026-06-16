from __future__ import annotations

import secrets
import threading
import time
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from typing import Any

from dashboard_app.config import settings
from dashboard_app.services.accounts import load_accounts
from dashboard_app.services.mail_fetcher import fetch_mail_for_account
from dashboard_app.services.time_utils import now_iso


_LOCK = threading.RLock()
_CURRENT_JOB: dict[str, Any] | None = None
_ACTIVE_STATUSES = {"running", "retry_waiting", "cancelling"}


def start_scan(account_ids: list[str], reason: str = "manual") -> dict[str, Any]:
    clean_ids = _unique_ids(account_ids)
    with _LOCK:
        if not clean_ids:
            return scan_status()
        running = _CURRENT_JOB if _CURRENT_JOB and _CURRENT_JOB.get("status") in _ACTIVE_STATUSES else None
        if running:
            if running.get("status") == "cancelling":
                return _public_job_locked(running)
            added = _append_ids_locked(running, clean_ids)
            if added:
                _log_locked(running, f"追加 {added} 个邮箱到当前扫描任务")
            return _public_job_locked(running)

        job = _new_job(clean_ids, reason)
        globals()["_CURRENT_JOB"] = job
        _log_locked(job, f"开始扫描 {job['total']} 个邮箱")
        threading.Thread(target=_run_with_retry_phases, args=(job["id"],), daemon=True).start()
        return _public_job_locked(job)


def start_scan_all(reason: str = "manual_all") -> dict[str, Any]:
    account_ids = [str(item.get("id") or "") for item in load_accounts() if item.get("source_url")]
    return start_scan(account_ids, reason=reason)


def retry_failed() -> dict[str, Any]:
    """Retry only accounts that failed in the last completed job."""
    with _LOCK:
        job = _CURRENT_JOB
        if job and job.get("status") in _ACTIVE_STATUSES:
            return {"ok": False, "error": "扫描正在运行中"}
        failed_ids = list((job or {}).get("failed_ids") or set())
    if not failed_ids:
        # fallback: retry all accounts with last_error set
        failed_ids = [
            str(item.get("id") or "")
            for item in load_accounts()
            if item.get("last_error") and item.get("source_url")
        ]
    if not failed_ids:
        return {"ok": False, "error": "没有需要重试的失败账号"}
    return {"ok": True, "scan": start_scan(failed_ids, reason="retry_failed")}


def cancel_scan() -> dict[str, Any]:
    """Cancel the currently running scan."""
    with _LOCK:
        job = _CURRENT_JOB
        if not job or job.get("status") not in _ACTIVE_STATUSES:
            return {"ok": False, "error": "没有正在运行的扫描"}
        job["cancelled"] = True
        job["status"] = "cancelling"
        _log_locked(job, "正在取消扫描…")
    return {"ok": True, "scan": _public_job_locked(job)}


def scan_status() -> dict[str, Any]:
    with _LOCK:
        if not _CURRENT_JOB:
            return _empty_status()
        return _public_job_locked(_CURRENT_JOB)


def scan_failed_ids() -> list[str]:
    """Return list of account IDs that failed in the most recent job."""
    with _LOCK:
        job = _CURRENT_JOB
        if not job:
            return []
        failed_ids = list(job.get("failed_ids") or set())
        # also include errors from the completed job
        for err in job.get("errors") or []:
            aid = err.get("account_id")
            if aid and aid not in failed_ids:
                failed_ids.append(aid)
        return failed_ids


# ── internal ──

def _new_job(account_ids: list[str], reason: str) -> dict[str, Any]:
    job: dict[str, Any] = {
        "id": secrets.token_hex(8),
        "status": "running",
        "reason": reason,
        "created_at": now_iso(),
        "started_at": now_iso(),
        "finished_at": "",
        "total": 0,
        "done": 0,
        "success": 0,
        "failed": 0,
        "message_count": 0,
        "current": "",
        "pending_ids": [],
        "seen_ids": set(),
        "failed_ids": set(),
        "errors": [],
        "logs": [],
        "cancelled": False,
        "retry_phase": 0,
    }
    _append_ids_locked(job, account_ids)
    return job


def _run_with_retry_phases(job_id: str) -> None:
    """Run the main scan, then auto-retry failures in subsequent phases."""
    for phase in range(settings.max_retry_passes):
        with _LOCK:
            job = _CURRENT_JOB
            if not job or job.get("id") != job_id:
                return
            if job.get("cancelled"):
                _finish_cancelled_locked(job)
                return
            job["retry_phase"] = phase
            # move failed_ids to pending for retry
            if phase > 0:
                retry_set = set(job["failed_ids"])
                job["failed_ids"] = set()
                _queue_retry_ids_locked(job, list(retry_set))
                job["status"] = "running"
                _log_locked(job, f"第 {phase + 1} 轮重试：{len(retry_set)} 个失败账号")

        _run_single_pass(job_id)

        with _LOCK:
            job = _CURRENT_JOB
            if not job or job.get("id") != job_id:
                return
            if job.get("cancelled"):
                _finish_cancelled_locked(job)
                return
            if not job["failed_ids"]:
                job["status"] = "done"
                job["finished_at"] = now_iso()
                job["current"] = ""
                _log_locked(job, f"扫描全部完成：成功 {job['success']}，仍失败 0，邮件 {job['message_count']} 封")
                return

            # more retry phases ahead?
            if phase + 1 < settings.max_retry_passes:
                _log_locked(
                    job,
                    f"第 {phase + 1} 轮完成，{len(job['failed_ids'])} 个仍失败，"
                    f"{settings.retry_pass_delay} 秒后重试…",
                )
                job["status"] = "retry_waiting"
                job["current"] = f"等待 {settings.retry_pass_delay} 秒后重试 {len(job['failed_ids'])} 个…"

        # wait outside the lock
        _sleep_interruptible(settings.retry_pass_delay, job_id)

    with _LOCK:
        job = _CURRENT_JOB
        if not job or job.get("id") != job_id:
            return
        if job.get("cancelled"):
            _finish_cancelled_locked(job)
            return
        job["status"] = "done"
        job["finished_at"] = now_iso()
        job["current"] = ""
        _log_locked(job, f"扫描结束（已达最大重试轮数）：成功 {job['success']}，仍失败 {len(job['failed_ids'])}，邮件 {job['message_count']} 封")


def _run_single_pass(job_id: str) -> None:
    active: dict[Any, str] = {}
    with ThreadPoolExecutor(max_workers=settings.scan_workers) as executor:
        while True:
            with _LOCK:
                job = _CURRENT_JOB
                if not job or job.get("id") != job_id:
                    return
                if job.get("cancelled"):
                    job["pending_ids"] = []
                    return
                while job["pending_ids"] and len(active) < settings.scan_workers:
                    account_id = job["pending_ids"].pop(0)
                    active[executor.submit(fetch_mail_for_account, account_id, False)] = account_id
                if active:
                    job["current"] = f"{len(active)} 个邮箱扫描中"
                elif not job["pending_ids"]:
                    job["current"] = ""
                    return

            done, _ = wait(active.keys(), timeout=0.3, return_when=FIRST_COMPLETED)
            for future in done:
                account_id = active.pop(future)
                try:
                    result = future.result()
                except Exception as exc:
                    result = {"ok": False, "error": str(exc)}
                _record_result(job_id, account_id, result)


def _record_result(job_id: str, account_id: str, result: dict[str, Any]) -> None:
    with _LOCK:
        job = _CURRENT_JOB
        if not job or job.get("id") != job_id:
            return
        job["done"] += 1
        if result.get("ok"):
            cache = result.get("cache") or {}
            count = int(cache.get("message_count") or 0)
            account = result.get("account") or {}
            email = account.get("email") or account_id
            job["success"] += 1
            job["message_count"] += count
            # remove from failed_ids if it was there before
            job["failed_ids"].discard(account_id)
            if cache.get("no_history"):
                _log_locked(job, f"{email} 无历史邮件")
                return
            _log_locked(job, f"{email} 扫描完成，{count} 封")
            return

        job["failed"] += 1
        job["failed_ids"].add(account_id)
        error = str(result.get("error") or "扫描失败")
        label = result.get("email") or account_id
        job["errors"].insert(0, {"account_id": account_id, "email": label, "error": error, "at": now_iso()})
        # keep last 100 errors
        while len(job["errors"]) > 100:
            job["errors"].pop()
        _log_locked(job, f"{label} 扫描失败：{error}")


def _sleep_interruptible(seconds: float, job_id: str) -> None:
    """Sleep in small chunks, checking for cancellation."""
    chunk = 0.5
    elapsed = 0.0
    while elapsed < seconds:
        time.sleep(min(chunk, seconds - elapsed))
        elapsed += chunk
        with _LOCK:
            job = _CURRENT_JOB
            if not job or job.get("id") != job_id or job.get("cancelled"):
                return


def _append_ids_locked(job: dict[str, Any], account_ids: list[str]) -> int:
    added = 0
    seen: set[str] = job["seen_ids"]
    for account_id in account_ids:
        if not account_id or account_id in seen:
            continue
        seen.add(account_id)
        job["pending_ids"].append(account_id)
        job["total"] += 1
        added += 1
    return added


def _queue_retry_ids_locked(job: dict[str, Any], account_ids: list[str]) -> int:
    added = 0
    pending = set(job["pending_ids"])
    for account_id in _unique_ids(account_ids):
        if not account_id or account_id in pending:
            continue
        job["pending_ids"].append(account_id)
        job["total"] += 1
        pending.add(account_id)
        added += 1
    return added


def _finish_cancelled_locked(job: dict[str, Any]) -> None:
    if job.get("status") == "cancelled":
        return
    job["status"] = "cancelled"
    job["finished_at"] = now_iso()
    job["current"] = ""
    job["pending_ids"] = []
    _log_locked(job, f"扫描已取消：成功 {job['success']}，仍失败 {len(job['failed_ids'])}，邮件 {job['message_count']} 封")


def _unique_ids(account_ids: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for raw in account_ids:
        account_id = str(raw or "").strip()
        if account_id and account_id not in seen:
            seen.add(account_id)
            out.append(account_id)
    return out


def _log_locked(job: dict[str, Any], message: str) -> None:
    job["logs"].insert(0, {"at": now_iso(), "message": message})
    while len(job["logs"]) > 100:
        job["logs"].pop()


def _empty_status() -> dict[str, Any]:
    return {
        "id": "",
        "status": "idle",
        "reason": "",
        "created_at": "",
        "started_at": "",
        "finished_at": "",
        "total": 0,
        "done": 0,
        "success": 0,
        "failed": 0,
        "message_count": 0,
        "current": "",
        "errors": [],
        "logs": [],
        "retry_phase": 0,
    }


def _public_job_locked(job: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": job.get("id", ""),
        "status": job.get("status", "idle"),
        "reason": job.get("reason", ""),
        "created_at": job.get("created_at", ""),
        "started_at": job.get("started_at", ""),
        "finished_at": job.get("finished_at", ""),
        "total": int(job.get("total") or 0),
        "done": int(job.get("done") or 0),
        "success": int(job.get("success") or 0),
        "failed": len(job.get("failed_ids") or set()),
        "message_count": int(job.get("message_count") or 0),
        "current": job.get("current", ""),
        "errors": list(job.get("errors") or []),
        "logs": list(job.get("logs") or []),
        "retry_phase": int(job.get("retry_phase") or 0),
        "failed_count": len(job.get("failed_ids") or set()),
    }
