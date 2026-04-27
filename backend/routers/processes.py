"""
Processes Router
  GET    /api/processes           — 현재 실행 중인 프로세스 목록
  GET    /api/processes/{run_id}  — 특정 run 상태 조회
  DELETE /api/processes/{run_id}  — 강제 종료
"""
import logging

from fastapi import APIRouter, HTTPException

from backend.core import process_manager as pm
from backend.database import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/processes", tags=["processes"])


def _safe(run: dict) -> dict:
    """내부 _proc 객체 등 직렬화 불가 키를 제거한다."""
    return {k: v for k, v in run.items() if not k.startswith("_") and k != "log_buffer"}


@router.get("")
async def list_processes():
    active = pm.active_runs()
    return {"processes": [_safe(r) for r in active], "total": len(active)}


@router.get("/{run_id}")
async def get_process(run_id: str):
    run = pm.get_run(run_id)
    if run is None:
        raise HTTPException(404, f"run_id '{run_id}'을(를) 찾을 수 없습니다.")
    return _safe(run)


@router.delete("/{run_id}")
async def kill_process(run_id: str):
    run = pm.get_run(run_id)
    if run is None:
        raise HTTPException(404, f"run_id '{run_id}'을(를) 찾을 수 없습니다.")
    if run["status"] != "RUNNING":
        raise HTTPException(400, f"이미 종료된 프로세스입니다. (상태: {run['status']})")

    async with await get_db() as db:
        await pm.kill_run(run_id, db)

    return {"message": f"run_id '{run_id}' 강제 종료 완료", "run_id": run_id}
