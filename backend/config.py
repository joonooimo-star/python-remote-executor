import os
from pathlib import Path

# Base directories
BASE_DIR   = Path(__file__).parent.parent
JOBS_DIR   = BASE_DIR / "jobs"
DATA_DIR   = BASE_DIR / "data"
STATIC_DIR = BASE_DIR / "frontend"

# DB
DB_PATH = DATA_DIR / "executor.db"

# Server
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", 8000))

# Limits
MAX_LOG_BYTES   = 10 * 1024 * 1024   # 10 MB per run
DEFAULT_TIMEOUT = 0                   # 0 = no timeout
MAX_CONCURRENT  = 10                  # max simultaneous processes
