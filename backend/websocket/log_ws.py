"""
WebSocket 엔드포인트 — 실행 중인 Job의 로그를 실시간 스트리밍합니다.
연결 경로: /ws/logs/{run_id}
"""
import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.core import process_manager as pm

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws/logs/{run_id}")
async def ws_logs(websocket: WebSocket, run_id: str):
    await websocket.accept()
    logger.info("WS 연결: run_id=%s", run_id)

    run = pm.get_run(run_id)
    if run is None:
        # DB에서 이력 로그를 가져와 한 번에 전송
        from backend.database import get_db
        async with await get_db() as db:
            async with db.execute(
                "SELECT log_output, status FROM run_history WHERE id=?", (run_id,)
            ) as cur:
                row = await cur.fetchone()
        if row:
            for line in (row["log_output"] or "").splitlines():
                await websocket.send_json({"type": "log", "line": line})
            await websocket.send_json({"type": "done", "status": row["status"]})
        else:
            await websocket.send_json({"type": "error", "message": "run_id를 찾을 수 없습니다."})
        await websocket.close()
        return

    # 이미 종료된 run이면 버퍼만 전송
    if run["status"] != "RUNNING":
        for line in run.get("log_buffer", []):
            await websocket.send_json({"type": "log", "line": line})
        await websocket.send_json({"type": "done", "status": run["status"]})
        await websocket.close()
        return

    # 실행 중: 기존 버퍼 먼저 전송 후 실시간 구독
    for line in list(run.get("log_buffer", [])):
        await websocket.send_json({"type": "log", "line": line})

    q = pm.subscribe_logs(run_id)
    try:
        while True:
            try:
                msg = await asyncio.wait_for(q.get(), timeout=30)
            except asyncio.TimeoutError:
                # heartbeat
                await websocket.send_json({"type": "ping"})
                continue

            await websocket.send_json(msg)
            if msg.get("type") == "done":
                break
    except WebSocketDisconnect:
        logger.info("WS 클라이언트 연결 해제: run_id=%s", run_id)
    finally:
        pm.unsubscribe_logs(run_id, q)
        logger.info("WS 종료: run_id=%s", run_id)
