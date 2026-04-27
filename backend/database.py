"""
SQLite database — async access via aiosqlite.
"""
import aiosqlite
from backend.config import DB_PATH

DB_PATH.parent.mkdir(parents=True, exist_ok=True)

CREATE_DDL = """
CREATE TABLE IF NOT EXISTS run_history (
    id          TEXT PRIMARY KEY,
    job_id      TEXT NOT NULL,
    job_name    TEXT NOT NULL,
    params      TEXT,
    status      TEXT NOT NULL DEFAULT 'PENDING',
    pid         INTEGER,
    exit_code   INTEGER,
    started_at  TEXT NOT NULL,
    finished_at TEXT,
    log_output  TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_rh_job    ON run_history(job_id);
CREATE INDEX IF NOT EXISTS idx_rh_status ON run_history(status);
CREATE INDEX IF NOT EXISTS idx_rh_start  ON run_history(started_at DESC);
"""


class _DbContextManager:
    """aiosqlite.connect()를 async context manager로 감싸 매번 새 연결을 반환한다."""
    def __init__(self):
        self._conn: aiosqlite.Connection | None = None

    def __await__(self):
        # `async with await get_db()` 패턴을 지원하기 위해 self를 반환
        async def _noop():
            return self
        return _noop().__await__()

    async def __aenter__(self) -> aiosqlite.Connection:
        self._conn = await aiosqlite.connect(DB_PATH)
        self._conn.row_factory = aiosqlite.Row
        return self._conn

    async def __aexit__(self, *args):
        if self._conn:
            await self._conn.close()
            self._conn = None


def get_db() -> _DbContextManager:
    """사용법: async with await get_db() as db: ..."""
    return _DbContextManager()


async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executescript(CREATE_DDL)
        await db.commit()
