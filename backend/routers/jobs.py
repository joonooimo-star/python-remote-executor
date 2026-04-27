"""
Jobs Router
  GET  /api/jobs              — 전체 Job 목록
  GET  /api/jobs/{job_id}     — Job 상세 정보
  POST /api/jobs/{job_id}/run — Job 실행
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.core import job_registry as jr
from backend.core import process_manager as pm
from backend.database import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/jobs", tags=["jobs"])


class RunRequest(BaseModel):
    params: dict = {}


@router.get("")
async def list_jobs():
    jobs = jr.get_all()
    return {"jobs": jobs, "total": len(jobs)}


@router.get("/{job_id}")
async def get_job(job_id: str):
    meta = jr.get(job_id)
    if meta is None:
        raise HTTPException(404, f"Job '{job_id}'을(를) 찾을 수 없습니다.")
    return meta


@router.post("/{job_id}/run")
async def run_job(job_id: str, body: RunRequest):
    meta = jr.get(job_id)
    if meta is None:
        raise HTTPException(404, f"Job '{job_id}'을(를) 찾을 수 없습니다.")

    # 동시 실행 수 확인
    running = [r for r in pm.active_runs() if r["job_id"] == job_id]
    if len(running) >= meta.get("max_concurrent", 5):
        raise HTTPException(429, f"Job '{job_id}'의 최대 동시 실행 수를 초과했습니다.")

    async with await get_db() as db:
        run = await pm.start_run(meta, body.params, db)

    return {
        "run_id":     run["id"],
        "job_id":     run["job_id"],
        "job_name":   run["job_name"],
        "status":     run["status"],
        "pid":        run["pid"],
        "started_at": run["started_at"],
    }
