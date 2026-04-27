"""
Python Remote Executor — FastAPI 메인 앱
"""
import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from backend.config import STATIC_DIR, JOBS_DIR
from backend.database import init_db
from backend.core import job_registry as jr
from backend.core import process_manager as pm
from backend.core.file_watcher import start_watcher
from backend.routers import jobs, processes, history
from backend.websocket.log_ws import router as ws_router

# ─── 로깅 설정 ───────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


# ─── Lifespan (시작/종료 훅) ─────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # 시작
    logger.info("=== Python Remote Executor 시작 ===")
    JOBS_DIR.mkdir(parents=True, exist_ok=True)
    await init_db()
    jr.scan_all()
    pm.set_event_loop(asyncio.get_event_loop())
    watcher = start_watcher()

    yield

    # 종료
    watcher.stop()
    watcher.join()
    logger.info("=== Python Remote Executor 종료 ===")


# ─── FastAPI 앱 ───────────────────────────────────────────────────────
app = FastAPI(
    title="Python Remote Executor",
    description="Python 스크립트를 웹에서 원격 실행·모니터링·종료하는 플랫폼",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── 라우터 등록 ─────────────────────────────────────────────────────
app.include_router(jobs.router)
app.include_router(processes.router)
app.include_router(history.router)
app.include_router(ws_router)


# ─── 헬스체크 ─────────────────────────────────────────────────────────
@app.get("/api/health", tags=["system"])
async def health():
    return {"status": "ok", "jobs": len(jr.get_all()), "active": len(pm.active_runs())}


# ─── Static 파일 서빙 (SPA) ───────────────────────────────────────────
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

    @app.get("/", include_in_schema=False)
    async def serve_index():
        return FileResponse(str(STATIC_DIR / "index.html"))

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        file_path = STATIC_DIR / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(STATIC_DIR / "index.html"))
