# 🐍 Python Remote Executor

> 내가 짠 Python 로직을 **웹 브라우저에서 원격 실행 · 실시간 모니터링 · 강제 종료**할 수 있는 플랫폼

![Python](https://img.shields.io/badge/Python-3.10%2B-blue)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111-green)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## ✨ 주요 기능

| 기능 | 설명 |
|------|------|
| **▶ 원격 실행** | 웹 UI에서 등록된 Python Job을 파라미터와 함께 즉시 실행 |
| **📡 실시간 로그** | `print()` 출력이 WebSocket으로 브라우저에 실시간 스트리밍 |
| **⏹ 강제 종료** | 실행 중인 프로세스를 웹에서 클릭 한 번으로 즉시 Kill |
| **🔌 플러그인 확장** | `jobs/` 폴더에 `.py` 파일만 추가하면 자동으로 UI에 등록 |
| **📜 실행 이력** | 과거 실행 결과(로그, 상태, 소요 시간) 영구 보관 및 조회 |
| **🔄 자동 재로드** | `jobs/` 폴더 변경 감지 → 서버 재시작 없이 자동 반영 |

---

## 🚀 빠른 시작

### 1. 의존성 설치

```bash
pip install -r requirements.txt
```

### 2. 서버 실행

```bash
PYTHONPATH=. python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. 브라우저 접속

```
http://localhost:8000
```

---

## 🔌 나만의 Job 추가하기

`jobs/` 폴더에 Python 파일을 만들기만 하면 됩니다.

```python
# jobs/my_job.py

JOB_NAME        = "내 첫 번째 Job"
JOB_DESCRIPTION = "이 Job이 하는 일을 설명합니다."
JOB_TAGS        = ["my-tag"]
JOB_PARAMS = [
    {"name": "target", "type": "string", "default": "world", "label": "대상"},
    {"name": "count",  "type": "int",    "default": 5,       "label": "횟수"},
]

import time

def run(params: dict):
    target = params.get("target", "world")
    count  = int(params.get("count", 5))

    print(f"[시작] target={target}, count={count}")
    for i in range(count):
        print(f"  처리 중... {i+1}/{count}")
        time.sleep(1)
    print("[완료]")

if __name__ == "__main__":
    import json, sys
    run(json.loads(sys.argv[1]) if len(sys.argv) > 1 else {})
```

**파일 저장 즉시** Web UI에 자동으로 나타납니다. (서버 재시작 불필요)

---

## 📁 프로젝트 구조

```
python-remote-executor/
├── backend/
│   ├── main.py               # FastAPI 앱 진입점
│   ├── config.py             # 환경 설정
│   ├── database.py           # SQLite (aiosqlite)
│   ├── core/
│   │   ├── job_registry.py   # Job 플러그인 스캔 & 등록
│   │   ├── process_manager.py# subprocess 실행/종료/로그
│   │   └── file_watcher.py   # jobs/ 폴더 자동 감지 (watchdog)
│   ├── routers/
│   │   ├── jobs.py           # GET/POST /api/jobs
│   │   ├── processes.py      # GET/DELETE /api/processes
│   │   └── history.py        # GET/DELETE /api/history
│   └── websocket/
│       └── log_ws.py         # WS /ws/logs/{run_id}
├── jobs/                     # ✨ 여기에 .py 파일 추가
│   ├── __job_template__.py   # 새 Job 작성 템플릿
│   ├── example_hello.py
│   ├── example_counter.py
│   ├── example_data_pipeline.py
│   └── example_error_demo.py
├── frontend/
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── data/
│   └── executor.db           # SQLite DB (자동 생성)
├── requirements.txt
├── DESIGN.md                 # 상세 설계 문서
└── README.md
```

---

## 🌐 API 엔드포인트

| Method | Endpoint | 설명 |
|--------|----------|------|
| `GET` | `/api/jobs` | Job 목록 조회 |
| `POST` | `/api/jobs/{job_id}/run` | Job 실행 |
| `GET` | `/api/processes` | 실행 중인 프로세스 목록 |
| `DELETE` | `/api/processes/{run_id}` | 프로세스 강제 종료 |
| `GET` | `/api/history` | 실행 이력 조회 (페이징) |
| `GET` | `/api/history/{run_id}` | 특정 실행 로그 조회 |
| `WS` | `/ws/logs/{run_id}` | 실시간 로그 스트리밍 |
| `GET` | `/docs` | Swagger API 문서 |

---

## 🛠 기술 스택

- **Backend**: FastAPI + uvicorn + aiosqlite + watchdog
- **Frontend**: Vanilla JS + CSS (빌드 불필요)
- **DB**: SQLite
- **통신**: REST API + WebSocket

---

## 📄 라이선스

MIT License
