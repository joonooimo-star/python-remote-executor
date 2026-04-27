"""
File Watcher — jobs/ 폴더 변경 감지 시 Job Registry를 자동 갱신합니다.
"""
import logging
from pathlib import Path

from watchdog.events import FileSystemEventHandler, FileSystemEvent
from watchdog.observers import Observer

from backend.config import JOBS_DIR
from backend.core import job_registry as jr

logger = logging.getLogger(__name__)


class _JobsHandler(FileSystemEventHandler):
    def _is_job_file(self, path: str) -> bool:
        p = Path(path)
        return p.suffix == ".py" and p.parent == JOBS_DIR

    def on_created(self, event: FileSystemEvent):
        if not event.is_directory and self._is_job_file(event.src_path):
            logger.info("새 Job 파일 감지: %s", event.src_path)
            jr.register(Path(event.src_path))

    def on_modified(self, event: FileSystemEvent):
        if not event.is_directory and self._is_job_file(event.src_path):
            logger.info("Job 파일 수정 감지: %s", event.src_path)
            jr.register(Path(event.src_path))

    def on_deleted(self, event: FileSystemEvent):
        if not event.is_directory and self._is_job_file(event.src_path):
            logger.info("Job 파일 삭제 감지: %s", event.src_path)
            jr.unregister(Path(event.src_path))

    def on_moved(self, event: FileSystemEvent):
        if not event.is_directory:
            if self._is_job_file(event.src_path):
                jr.unregister(Path(event.src_path))
            if self._is_job_file(event.dest_path):
                jr.register(Path(event.dest_path))


def start_watcher() -> Observer:
    observer = Observer()
    observer.schedule(_JobsHandler(), str(JOBS_DIR), recursive=False)
    observer.start()
    logger.info("File Watcher 시작: %s", JOBS_DIR)
    return observer
