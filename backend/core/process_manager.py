"""
Process Manager — subprocess 생명주기를 관리합니다.
실행 / 상태 조회 / 강제 종료 / 로그 큐 관리
"""
import asyncio
import datetime
import json
import logging
import signal
import subprocess
import sys
import threading
import uuid
from typing import Any

from backend.config import MAX_CONCURRENT

logger = logging.getLogger(__name__)

# 실행 중인 프로세스 저장소  {run_id: RunRecord}
_runs: dict[str, dict] = {}


def _now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def _make_run_id() -> str:
    return str(uuid.uuid4())


def active_runs() -> list[dict]:
    return [r for r in _runs.values() if r["status"] == "RUNNING"]


def get_run(run_id: str) -> dict | None:
    return _runs.get(run_id)


def all_runs() -> list[dict]:
    return list(_runs.values())


# ─── 로그 큐 브로드캐스트 ─────────────────────────────────────────────
# run_id → list of asyncio.Queue  (WebSocket 핸들러가 subscribe)
_log_queues: dict[str, list[asyncio.Queue]] = {}


def subscribe_logs(run_id: str) -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue()
    _log_queues.setdefault(run_id, []).append(q)
    return q


def unsubscribe_logs(run_id: str, q: asyncio.Queue) -> None:
    queues = _log_queues.get(run_id, [])
    if q in queues:
        queues.remove(q)


def _broadcast(run_id: str, message: dict) -> None:
    """백그라운드 스레드에서 호출 — thread-safe하게 큐에 push."""
    loop = _get_loop()
    if loop is None:
        return
    for q in list(_log_queues.get(run_id, [])):
        loop.call_soon_threadsafe(q.put_nowait, message)


_main_loop: asyncio.AbstractEventLoop | None = None


def set_event_loop(loop: asyncio.AbstractEventLoop) -> None:
    global _main_loop
    _main_loop = loop


def _get_loop() -> asyncio.AbstractEventLoop | None:
    return _main_loop


# ─── 실행 ────────────────────────────────────────────────────────────

async def start_run(job_meta: dict, params: dict, db) -> dict:
    """Job을 새 subprocess로 실행하고 run 레코드를 반환한다."""
    if len(active_runs()) >= MAX_CONCURRENT:
        raise RuntimeError(f"최대 동시 실행 수({MAX_CONCURRENT})를 초과했습니다.")

    run_id    = _make_run_id()
    job_id    = job_meta["id"]
    job_name  = job_meta["name"]
    job_file  = job_meta["file"]
    timeout   = job_meta.get("timeout", 0)
    params_json = json.dumps(params, ensure_ascii=False)
    started_at  = _now_iso()

    # subprocess 시작
    proc = subprocess.Popen(
        [sys.executable, job_file, params_json],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,  # stderr를 stdout으로 합침
        text=True,
        bufsize=1,
    )

    run = {
        "id":         run_id,
        "job_id":     job_id,
        "job_name":   job_name,
        "params":     params,
        "status":     "RUNNING",
        "pid":        proc.pid,
        "exit_code":  None,
        "started_at": started_at,
        "finished_at": None,
        "log_buffer": [],   # 메모리 내 임시 버퍼
        "_proc":      proc,
    }
    _runs[run_id] = run

    # DB INSERT
    await db.execute(
        """INSERT INTO run_history
           (id, job_id, job_name, params, status, pid, started_at)
           VALUES (?,?,?,?,?,?,?)""",
        (run_id, job_id, job_name, params_json, "RUNNING", proc.pid, started_at),
    )
    await db.commit()

    # 로그 수집 스레드 시작
    t = threading.Thread(
        target=_collect_logs,
        args=(run_id, proc, timeout),
        daemon=True,
    )
    t.start()

    logger.info("프로세스 시작: run_id=%s pid=%s job=%s", run_id, proc.pid, job_id)
    return run


def _collect_logs(run_id: str, proc: subprocess.Popen, timeout: float) -> None:
    """백그라운드 스레드: stdout을 한 줄씩 읽어 큐에 broadcast."""
    run = _runs.get(run_id)
    if run is None:
        return

    try:
        for line in proc.stdout:
            line = line.rstrip("\n")
            run["log_buffer"].append(line)
            _broadcast(run_id, {"type": "log", "line": line})

        proc.wait()
    except Exception as exc:
        logger.error("로그 수집 오류 [%s]: %s", run_id, exc)
    finally:
        exit_code = proc.returncode
        finished_at = _now_iso()

        if run["status"] == "RUNNING":
            run["status"]      = "COMPLETED" if exit_code == 0 else "FAILED"
            run["exit_code"]   = exit_code
            run["finished_at"] = finished_at

        _broadcast(run_id, {
            "type":      "done",
            "status":    run["status"],
            "exit_code": exit_code,
        })

        # DB 업데이트는 이벤트 루프를 통해 처리
        loop = _get_loop()
        if loop and loop.is_running():
            asyncio.run_coroutine_threadsafe(_persist_finish(run_id), loop)

        logger.info("프로세스 종료: run_id=%s exit=%s status=%s",
                    run_id, exit_code, run["status"])


async def _persist_finish(run_id: str) -> None:
    """종료 시 DB 업데이트 (비동기)."""
    from backend.database import get_db
    run = _runs.get(run_id)
    if run is None:
        return
    log_text = "\n".join(run["log_buffer"])
    async with await get_db() as db:
        await db.execute(
            """UPDATE run_history
               SET status=?, exit_code=?, finished_at=?, log_output=?
               WHERE id=?""",
            (run["status"], run["exit_code"], run["finished_at"], log_text, run_id),
        )
        await db.commit()


# ─── 강제 종료 ────────────────────────────────────────────────────────

async def kill_run(run_id: str, db) -> bool:
    run = _runs.get(run_id)
    if run is None or run["status"] != "RUNNING":
        return False

    proc: subprocess.Popen = run["_proc"]
    run["status"] = "KILLED"
    run["finished_at"] = _now_iso()

    try:
        proc.terminate()
        try:
            proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=2)
    except Exception as exc:
        logger.error("프로세스 종료 실패 [%s]: %s", run_id, exc)

    # 프로세스 종료 후 남은 stdout을 flush
    try:
        remaining = proc.stdout.read()
        if remaining:
            for line in remaining.splitlines():
                line = line.strip()
                if line:
                    run["log_buffer"].append(line)
    except Exception:
        pass

    log_text = "\n".join(run["log_buffer"])
    await db.execute(
        """UPDATE run_history
           SET status='KILLED', finished_at=?, log_output=?
           WHERE id=?""",
        (run["finished_at"], log_text, run_id),
    )
    await db.commit()

    _broadcast(run_id, {"type": "done", "status": "KILLED", "exit_code": None})
    logger.info("프로세스 강제종료: run_id=%s", run_id)
    return True
