"""
History Router
  GET    /api/history             — 전체 실행 이력 (페이징)
  GET    /api/history/{run_id}    — 특정 실행 상세 + 로그
  DELETE /api/history/{run_id}    — 이력 삭제
"""
import logging

from fastapi import APIRouter, HTTPException, Query

from backend.database import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/history", tags=["history"])


@router.get("")
async def list_history(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    job_id: str | None = None,
    status: str | None = None,
):
    offset = (page - 1) * size
    filters = []
    values: list = []
    if job_id:
        filters.append("job_id = ?")
        values.append(job_id)
    if status:
        filters.append("status = ?")
        values.append(status.upper())

    where = ("WHERE " + " AND ".join(filters)) if filters else ""

    async with await get_db() as db:
        async with db.execute(
            f"SELECT COUNT(*) FROM run_history {where}", values
        ) as cur:
            total = (await cur.fetchone())[0]

        async with db.execute(
            f"""SELECT id, job_id, job_name, params, status, pid,
                       exit_code, started_at, finished_at
                FROM run_history {where}
                ORDER BY started_at DESC
                LIMIT ? OFFSET ?""",
            [*values, size, offset],
        ) as cur:
            rows = await cur.fetchall()

    items = [dict(r) for r in rows]
    return {
        "items": items,
        "total": total,
        "page":  page,
        "size":  size,
        "pages": (total + size - 1) // size,
    }


@router.get("/{run_id}")
async def get_history(run_id: str):
    async with await get_db() as db:
        async with db.execute(
            "SELECT * FROM run_history WHERE id=?", (run_id,)
        ) as cur:
            row = await cur.fetchone()
    if row is None:
        raise HTTPException(404, f"run_id '{run_id}'을(를) 찾을 수 없습니다.")
    return dict(row)


@router.delete("/{run_id}")
async def delete_history(run_id: str):
    async with await get_db() as db:
        async with db.execute(
            "SELECT id FROM run_history WHERE id=?", (run_id,)
        ) as cur:
            row = await cur.fetchone()
        if row is None:
            raise HTTPException(404, f"run_id '{run_id}'을(를) 찾을 수 없습니다.")
        await db.execute("DELETE FROM run_history WHERE id=?", (run_id,))
        await db.commit()
    return {"message": f"run_id '{run_id}' 삭제 완료"}
