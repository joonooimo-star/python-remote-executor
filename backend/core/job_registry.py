"""
Job Registry — jobs/ 폴더의 Python 파일을 스캔하여 메타데이터를 관리합니다.
파일을 추가/수정/삭제하면 자동으로 반영됩니다 (watchdog 연동).
"""
import importlib.util
import logging
import re
import sys
from pathlib import Path
from typing import Any

from backend.config import JOBS_DIR

logger = logging.getLogger(__name__)

# 메모리 내 레지스트리  {job_id: job_meta_dict}
_registry: dict[str, dict] = {}


def _file_to_job_id(path: Path) -> str:
    """파일명(확장자 제외)을 job_id로 사용"""
    return path.stem


def _load_job(path: Path) -> dict | None:
    """단일 .py 파일을 동적 import해 메타데이터를 추출한다."""
    job_id = _file_to_job_id(path)

    # __로 시작하는 파일(템플릿 등) 무시
    if job_id.startswith("__"):
        return None

    try:
        spec = importlib.util.spec_from_file_location(f"jobs.{job_id}", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        meta = {
            "id":          job_id,
            "name":        getattr(module, "JOB_NAME",        job_id),
            "description": getattr(module, "JOB_DESCRIPTION", ""),
            "tags":        getattr(module, "JOB_TAGS",        []),
            "params":      getattr(module, "JOB_PARAMS",      []),
            "timeout":     getattr(module, "JOB_TIMEOUT",     0),
            "max_concurrent": getattr(module, "JOB_MAX_CONCURRENT", 5),
            "file":        str(path),
        }
        return meta
    except Exception as exc:
        logger.error("Job 로드 실패 [%s]: %s", path.name, exc)
        return None


def scan_all() -> None:
    """jobs/ 폴더를 전체 스캔하여 레지스트리를 갱신한다."""
    global _registry
    new_registry: dict[str, dict] = {}

    for py_file in sorted(JOBS_DIR.glob("*.py")):
        meta = _load_job(py_file)
        if meta:
            new_registry[meta["id"]] = meta
            logger.info("Job 등록: %s (%s)", meta["id"], meta["name"])

    _registry = new_registry
    logger.info("Job Registry 스캔 완료 — %d개 등록", len(_registry))


def register(path: Path) -> None:
    meta = _load_job(path)
    if meta:
        _registry[meta["id"]] = meta
        logger.info("Job 재등록: %s", meta["id"])


def unregister(path: Path) -> None:
    job_id = _file_to_job_id(path)
    _registry.pop(job_id, None)
    logger.info("Job 제거: %s", job_id)


def get_all() -> list[dict]:
    return list(_registry.values())


def get(job_id: str) -> dict | None:
    return _registry.get(job_id)
